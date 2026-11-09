import path from 'node:path';
import fs from 'node:fs';
import { ArchitectureConfig } from '../../types.js';
import { GitDiffState } from './git-diff.js';
import { ComponentItem, RuleViolationItem } from './types.js';

export function matchPattern(pattern: string, filePath: string): boolean {
  const normPattern = pattern.replace(/\\/g, '/');
  const normPath = filePath.replace(/\\/g, '/');

  if (normPattern === normPath) return true;

  // Convert simple glob pattern to RegExp
  let regexStr = normPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape special regex chars except * and ?
    .replace(/\*\*/g, '.*')               // ** matches anything across slashes
    .replace(/(?<!\.)\*/g, '[^/]*')       // * matches anything within path segment
    .replace(/\?/g, '[^/]');

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normPath);
}

export function extractImports(content: string, filePath: string, projectRoot: string): Array<{ raw: string; resolvedRelPath: string; line: number }> {
  const results: Array<{ raw: string; resolvedRelPath: string; line: number }> = [];
  const lines = content.split('\n');
  const fileDir = path.dirname(path.join(projectRoot, filePath));

  const importRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?|require\(\s*)['"]([^'"]+)['"]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    importRegex.lastIndex = 0;

    while ((match = importRegex.exec(line)) !== null) {
      const importPath = match[1];

      // Handle relative imports
      if (importPath.startsWith('.')) {
        const absTarget = path.resolve(fileDir, importPath);
        const relTarget = path.relative(projectRoot, absTarget).replace(/\\/g, '/');
        results.push({
          raw: importPath,
          resolvedRelPath: relTarget,
          line: i + 1
        });
      } else if (importPath.startsWith('@/')) {
        // Alias @/ -> src/
        const relTarget = importPath.replace(/^@\//, 'src/').replace(/\\/g, '/');
        results.push({
          raw: importPath,
          resolvedRelPath: relTarget,
          line: i + 1
        });
      }
    }
  }

  return results;
}

export function evaluateArchitectureRules(
  projectRoot: string,
  gitDiff: GitDiffState,
  config: ArchitectureConfig,
  components: ComponentItem[]
): RuleViolationItem[] {
  const violations: RuleViolationItem[] = [];
  const exceptions = config.exceptions || [];

  const hasException = (ruleId: string, filePath: string): { allowed: boolean; reason?: string } => {
    for (const exc of exceptions) {
      if ((exc.ruleId === ruleId || exc.ruleId === '*') && matchPattern(exc.target, filePath)) {
        if (exc.reason && exc.reason.trim().length > 0) {
          return { allowed: true, reason: exc.reason };
        }
      }
    }
    return { allowed: false };
  };

  // 1. Protected Modules Rule
  if (config.protectedModules && config.protectedModules.length > 0) {
    for (const changed of gitDiff.changedFiles) {
      for (const item of config.protectedModules) {
        const pattern = typeof item === 'string' ? item : item.pattern;
        const description = typeof item === 'string' ? 'Protected module modification restricted' : (item.reason || 'Protected module modification restricted');

        if (matchPattern(pattern, changed.relativePath)) {
          const exc = hasException('protected-module', changed.relativePath);
          if (!exc.allowed) {
            violations.push({
              ruleId: 'protected-module',
              ruleType: 'protected-module',
              severity: 'failure',
              file: changed.relativePath,
              message: `Modification of protected path '${changed.relativePath}' violates rule: ${description}. Must provide explicit exception with rationale.`
            });
          }
        }
      }
    }
  }

  // 2. Layer Boundaries & Allowed Dependency Directions
  if (config.layers && config.layers.length > 0) {
    const layers = config.layers;

    // Evaluate imports in changed files
    for (const changed of gitDiff.changedFiles) {
      if (changed.status === 'D') continue;
      const content = gitDiff.getFileAtCurrent(changed.relativePath);
      if (!content) continue;

      // Find which layer this changed file belongs to
      const fileLayer = layers.find((l) => matchPattern(l.pattern, changed.relativePath));
      if (!fileLayer) continue;

      const imports = extractImports(content, changed.relativePath, projectRoot);

      for (const imp of imports) {
        // Find which layer the imported file belongs to
        const targetLayer = layers.find((l) => matchPattern(l.pattern, imp.resolvedRelPath));
        if (!targetLayer) continue;

        // Skip same-layer dependencies
        if (targetLayer.name === fileLayer.name) continue;

        let isForbidden = false;
        let reason = '';

        if (fileLayer.forbiddenDependencies && fileLayer.forbiddenDependencies.includes(targetLayer.name)) {
          isForbidden = true;
          reason = `Layer '${fileLayer.name}' explicitly forbids importing from layer '${targetLayer.name}'`;
        } else if (fileLayer.allowedDependencies && !fileLayer.allowedDependencies.includes(targetLayer.name)) {
          isForbidden = true;
          reason = `Layer '${fileLayer.name}' only allows imports from [${fileLayer.allowedDependencies.join(', ')}], but imports '${targetLayer.name}'`;
        }

        if (isForbidden) {
          const exc = hasException('layer-boundary', changed.relativePath) || hasException(fileLayer.name, changed.relativePath);
          if (!exc.allowed) {
            violations.push({
              ruleId: `layer-boundary:${fileLayer.name}->${targetLayer.name}`,
              ruleType: 'layer-boundary',
              severity: 'failure',
              file: changed.relativePath,
              line: imp.line,
              imported: imp.raw,
              message: `Layer boundary violation at line ${imp.line}: ${reason} (target: '${imp.resolvedRelPath}').`
            });
          }
        }
      }
    }
  }

  // 3. Component Reuse Expectations (Advisory warning only, never failure)
  if (config.componentReuseExpectations?.warnOnSingleUseDirectory) {
    const targetDirs = config.componentReuseExpectations.warnOnSingleUseDirectory;
    for (const comp of components) {
      if (comp.isNew && comp.fanIn === 1) {
        const matchesDir = targetDirs.some((dir) => matchPattern(dir, comp.relativePath));
        if (matchesDir) {
          violations.push({
            ruleId: 'reuse-expectation',
            ruleType: 'reuse-expectation',
            severity: 'warning',
            file: comp.relativePath,
            message: `Single-use component added in '${comp.relativePath}'. Reuse expectations suggest components in this directory should be shared across multiple views or parameterized.`
          });
        }
      }
    }
  }

  return violations;
}
