import { GitDiffState } from './git-diff.js';
import { DependencyDiffItem } from './types.js';

export function analyzeDependencyManifests(gitDiff: GitDiffState): DependencyDiffItem[] {
  const diffItems: DependencyDiffItem[] = [];

  const baselineRaw = gitDiff.getFileAtBaseline('package.json');
  const currentRaw = gitDiff.getFileAtCurrent('package.json');

  if (!currentRaw) return [];

  let baselinePkg: any = {};
  let currentPkg: any = {};

  try {
    if (baselineRaw) baselinePkg = JSON.parse(baselineRaw);
  } catch {}

  try {
    currentPkg = JSON.parse(currentRaw);
  } catch {
    return [];
  }

  // Check dependencies
  const baseDeps: Record<string, string> = baselinePkg.dependencies || {};
  const currDeps: Record<string, string> = currentPkg.dependencies || {};

  for (const [dep, version] of Object.entries(currDeps)) {
    if (!baseDeps[dep]) {
      diffItems.push({
        name: dep,
        type: 'dependency',
        changeType: 'added',
        currentVersion: version
      });
    } else if (baseDeps[dep] !== version) {
      diffItems.push({
        name: dep,
        type: 'dependency',
        changeType: 'changed',
        baselineVersion: baseDeps[dep],
        currentVersion: version
      });
    }
  }

  for (const [dep, version] of Object.entries(baseDeps)) {
    if (!currDeps[dep]) {
      diffItems.push({
        name: dep,
        type: 'dependency',
        changeType: 'removed',
        baselineVersion: version
      });
    }
  }

  // Check devDependencies
  const baseDevDeps: Record<string, string> = baselinePkg.devDependencies || {};
  const currDevDeps: Record<string, string> = currentPkg.devDependencies || {};

  for (const [dep, version] of Object.entries(currDevDeps)) {
    if (!baseDevDeps[dep]) {
      diffItems.push({
        name: dep,
        type: 'devDependency',
        changeType: 'added',
        currentVersion: version
      });
    } else if (baseDevDeps[dep] !== version) {
      diffItems.push({
        name: dep,
        type: 'devDependency',
        changeType: 'changed',
        baselineVersion: baseDevDeps[dep],
        currentVersion: version
      });
    }
  }

  for (const [dep, version] of Object.entries(baseDevDeps)) {
    if (!currDevDeps[dep]) {
      diffItems.push({
        name: dep,
        type: 'devDependency',
        changeType: 'removed',
        baselineVersion: version
      });
    }
  }

  return diffItems;
}
