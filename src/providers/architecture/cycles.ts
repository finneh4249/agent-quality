import path from 'node:path';
import fs from 'node:fs';
import { extractImports } from './import-rules.js';

export interface DependencyCycle {
  path: string[];
  description: string;
}

export function detectDependencyCycles(
  projectRoot: string,
  filesToScan?: string[]
): DependencyCycle[] {
  const fileList: string[] = [];

  if (filesToScan && filesToScan.length > 0) {
    fileList.push(...filesToScan);
  } else {
    // Scan src directory
    const srcDir = path.join(projectRoot, 'src');
    if (!fs.existsSync(srcDir)) return [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|js|mjs|tsx|jsx|astro)$/.test(entry.name)) {
          fileList.push(path.relative(projectRoot, full));
        }
      }
    };
    walk(srcDir);
  }

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const file of fileList) {
    adj.set(file, []);
    const fullPath = path.join(projectRoot, file);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const imports = extractImports(content, file, projectRoot);

      for (const imp of imports) {
        let target = imp.resolvedRelPath;
        // Try resolving extensions if omitted (.ts, .js, .astro, /index.ts)
        if (!fs.existsSync(path.join(projectRoot, target))) {
          const candidates = [
            `${target}.ts`,
            `${target}.js`,
            `${target}.astro`,
            path.join(target, 'index.ts'),
            path.join(target, 'index.js')
          ];
          for (const cand of candidates) {
            if (fs.existsSync(path.join(projectRoot, cand))) {
              target = cand;
              break;
            }
          }
        }
        adj.get(file)!.push(target);
      }
    } catch {}
  }

  const cycles: DependencyCycle[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const currentPath: string[] = [];
  const seenCycles = new Set<string>();

  function dfs(node: string) {
    visited.add(node);
    recStack.add(node);
    currentPath.push(node);

    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // Cycle detected
        const cycleStartIndex = currentPath.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycleNodes = currentPath.slice(cycleStartIndex);
          cycleNodes.push(neighbor); // Close the cycle

          // Canonical signature to avoid duplicates
          const sig = [...cycleNodes].sort().join('::');
          if (!seenCycles.has(sig)) {
            seenCycles.add(sig);
            cycles.push({
              path: cycleNodes,
              description: cycleNodes.join(' → ')
            });
          }
        }
      }
    }

    currentPath.pop();
    recStack.delete(node);
  }

  for (const file of adj.keys()) {
    if (!visited.has(file)) {
      dfs(file);
    }
  }

  return cycles;
}
