import fs from 'node:fs';
import path from 'node:path';
import { ComponentItem } from './types.js';
import { GitDiffState } from './git-diff.js';

const COMPONENT_EXTENSIONS = new Set(['.astro', '.tsx', '.jsx', '.svelte', '.vue']);
const SCAN_EXTENSIONS = new Set(['.astro', '.tsx', '.jsx', '.svelte', '.vue', '.mdx', '.md', '.ts', '.js', '.mjs']);

export function scanComponentFiles(projectRoot: string): string[] {
  const components: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.lighthouseci') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (COMPONENT_EXTENSIONS.has(ext)) {
          components.push(path.relative(projectRoot, full));
        }
      }
    }
  }

  // Scan src/ or root
  const srcDir = path.join(projectRoot, 'src');
  if (fs.existsSync(srcDir)) {
    walk(srcDir);
  } else {
    walk(projectRoot);
  }

  return components;
}

export function buildComponentGraph(
  projectRoot: string,
  gitDiff: GitDiffState
): {
  allComponents: ComponentItem[];
  added: ComponentItem[];
  deleted: ComponentItem[];
  modified: ComponentItem[];
  modularAbstractions: ComponentItem[];
  singleUse: ComponentItem[];
} {
  const changedMap = new Map(gitDiff.changedFiles.map((c) => [c.relativePath, c.status]));
  const componentPaths = new Set(scanComponentFiles(projectRoot));

  // Also include deleted components from git diff
  for (const changed of gitDiff.changedFiles) {
    if (changed.status === 'D') {
      const ext = path.extname(changed.relativePath);
      if (COMPONENT_EXTENSIONS.has(ext)) {
        componentPaths.add(changed.relativePath);
      }
    }
  }

  // Collect all consumer candidate files
  const consumerFiles: Array<{ relPath: string; content: string }> = [];
  function walkConsumers(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkConsumers(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SCAN_EXTENSIONS.has(ext)) {
          try {
            consumerFiles.push({
              relPath: path.relative(projectRoot, full),
              content: fs.readFileSync(full, 'utf8')
            });
          } catch {}
        }
      }
    }
  }
  walkConsumers(projectRoot);

  const componentItems: ComponentItem[] = [];

  for (const compRel of componentPaths) {
    const status = changedMap.get(compRel);
    const isNew = status === 'A';
    const isDeleted = status === 'D';
    const isModified = status === 'M' || status === 'R';
    const baseName = path.basename(compRel, path.extname(compRel));
    const ext = path.extname(compRel);

    const consumers = new Set<string>();

    if (!isDeleted) {
      for (const consumer of consumerFiles) {
        if (consumer.relPath === compRel) continue; // Skip self

        // Match import statements referencing this component filename or relative path
        const importRegex = new RegExp(
          `from\\s+['"][^'"]*\\/${baseName}(?:\\.[a-zA-Z]+)?['"]|import\\s+['"][^'"]*\\/${baseName}(?:\\.[a-zA-Z]+)?['"]`,
          'g'
        );

        if (importRegex.test(consumer.content)) {
          consumers.add(consumer.relPath);
        } else if (consumer.relPath.endsWith('.mdx') || consumer.relPath.endsWith('.md')) {
          // In MDX, components can also be referenced as tags if imported or auto-imported
          const tagRegex = new RegExp(`<${baseName}\\b`);
          if (tagRegex.test(consumer.content) && consumer.content.includes(baseName)) {
            consumers.add(consumer.relPath);
          }
        }
      }
    }

    const fanIn = consumers.size;
    const isModularAbstraction = isNew && fanIn >= 2;

    componentItems.push({
      path: path.join(projectRoot, compRel),
      relativePath: compRel,
      extension: ext,
      isNew,
      isDeleted,
      isModified,
      fanIn,
      consumers: Array.from(consumers),
      isModularAbstraction
    });
  }

  const added = componentItems.filter((c) => c.isNew);
  const deleted = componentItems.filter((c) => c.isDeleted);
  const modified = componentItems.filter((c) => c.isModified);
  const modularAbstractions = added.filter((c) => c.isModularAbstraction);
  const singleUse = added.filter((c) => !c.isModularAbstraction && c.fanIn === 1);

  return {
    allComponents: componentItems,
    added,
    deleted,
    modified,
    modularAbstractions,
    singleUse
  };
}
