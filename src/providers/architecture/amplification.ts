import path from 'node:path';
import { ChangedFile } from './git-diff.js';
import { AmplificationReport } from './types.js';

export function getSubsystem(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/');

  if (normalized.startsWith('src/components/case/')) return 'components:case';
  if (normalized.startsWith('src/components/')) return 'components:ui';
  if (normalized.startsWith('src/content/work/')) return 'content:work';
  if (normalized.startsWith('src/content/')) return 'content';
  if (normalized.startsWith('src/pages/')) return 'pages';
  if (normalized.startsWith('src/layouts/')) return 'layouts';
  if (normalized.startsWith('src/styles/')) return 'styles';
  if (normalized.startsWith('src/data/')) return 'data';
  if (normalized.startsWith('functions/')) return 'functions';
  if (normalized.startsWith('scripts/')) return 'scripts';
  if (normalized.startsWith('public/')) return 'public';
  if (normalized.startsWith('docs/')) return 'docs';
  if (normalized.startsWith('test/')) return 'test';
  if (normalized.includes('.config.') || normalized.startsWith('.') || normalized === 'package.json') {
    return 'config';
  }

  // Fallback to top-level directory or file
  const parts = normalized.split('/');
  return parts.length > 1 ? parts[0] : 'root';
}

export function analyzeChangeAmplification(changedFiles: ChangedFile[]): AmplificationReport {
  if (changedFiles.length === 0) {
    return {
      primarySubsystem: 'none',
      totalChangedFiles: 0,
      outOfScopeFiles: [],
      dispersionRatio: 0,
      subsystemBreakdown: {}
    };
  }

  const subsystemCounts: Record<string, number> = {};
  const filesBySubsystem: Record<string, string[]> = {};

  for (const file of changedFiles) {
    const sub = getSubsystem(file.relativePath);
    subsystemCounts[sub] = (subsystemCounts[sub] || 0) + 1;
    if (!filesBySubsystem[sub]) {
      filesBySubsystem[sub] = [];
    }
    filesBySubsystem[sub].push(file.relativePath);
  }

  // Determine primary subsystem (highest file change count)
  let primarySubsystem = 'none';
  let maxCount = -1;

  for (const [sub, count] of Object.entries(subsystemCounts)) {
    if (count > maxCount) {
      maxCount = count;
      primarySubsystem = sub;
    }
  }

  // Out of scope files are those in subsystems other than primary and related content/docs
  const outOfScopeFiles: string[] = [];
  for (const [sub, files] of Object.entries(filesBySubsystem)) {
    if (sub !== primarySubsystem && sub !== 'docs' && sub !== 'test') {
      outOfScopeFiles.push(...files);
    }
  }

  const dispersionRatio = changedFiles.length > 0 ? outOfScopeFiles.length / changedFiles.length : 0;

  return {
    primarySubsystem,
    totalChangedFiles: changedFiles.length,
    outOfScopeFiles,
    dispersionRatio: Math.round(dispersionRatio * 100) / 100,
    subsystemBreakdown: subsystemCounts
  };
}
