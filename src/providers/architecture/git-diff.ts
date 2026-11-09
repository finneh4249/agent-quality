import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface ChangedFile {
  relativePath: string;
  absolutePath: string;
  status: 'A' | 'M' | 'D' | 'R' | 'U';
}

export interface GitDiffState {
  isGit: boolean;
  baselineRef: string;
  currentRef: string;
  changedFiles: ChangedFile[];
  getFileAtBaseline: (relPath: string) => string | null;
  getFileAtCurrent: (relPath: string) => string | null;
}

export function resolveGitDiffState(
  projectRoot: string,
  preferredBaselineRef?: string
): GitDiffState {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    // Non-git environment fallback
    return {
      isGit: false,
      baselineRef: 'none',
      currentRef: 'working-tree',
      changedFiles: [],
      getFileAtBaseline: () => null,
      getFileAtCurrent: (relPath: string) => {
        const full = path.join(projectRoot, relPath);
        return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
      }
    };
  }

  const statusOutput = execSync('git status --porcelain', {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
  const isDirty = statusOutput.length > 0;

  let baselineRef = preferredBaselineRef;
  let currentRef = isDirty ? 'working-tree' : 'HEAD';

  if (!baselineRef) {
    if (isDirty) {
      baselineRef = 'HEAD';
    } else {
      // Check if HEAD~1 exists
      try {
        execSync('git rev-parse HEAD~1', {
          cwd: projectRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        baselineRef = 'HEAD~1';
      } catch {
        // Only one commit exists
        baselineRef = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // Git empty tree SHA
      }
    }
  }

  // Get changed files
  const changedFilesMap = new Map<string, ChangedFile>();

  try {
    let diffCommand: string;
    if (isDirty && baselineRef === 'HEAD') {
      diffCommand = 'git status --porcelain -uall';
      const lines = execSync(diffCommand, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const statusCode = line.slice(0, 2).trim();
        const rawFile = line.slice(3).trim();
        const relPath = rawFile.replace(/^"|"$/g, '');
        let status: ChangedFile['status'] = 'M';
        if (statusCode.includes('?') || statusCode === 'A') status = 'A';
        else if (statusCode === 'D') status = 'D';
        else if (statusCode === 'R') status = 'R';

        changedFilesMap.set(relPath, {
          relativePath: relPath,
          absolutePath: path.join(projectRoot, relPath),
          status
        });
      }
    } else {
      diffCommand = `git diff --name-status ${baselineRef} ${currentRef === 'working-tree' ? '' : currentRef}`.trim();
      const lines = execSync(diffCommand, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const parts = line.split('\t');
        const statusCode = parts[0].trim()[0];
        const relPath = parts[parts.length - 1].trim().replace(/^"|"$/g, '');
        let status: ChangedFile['status'] = 'M';
        if (statusCode === 'A') status = 'A';
        else if (statusCode === 'D') status = 'D';
        else if (statusCode === 'R') status = 'R';

        changedFilesMap.set(relPath, {
          relativePath: relPath,
          absolutePath: path.join(projectRoot, relPath),
          status
        });
      }
    }
  } catch {}

  const getFileAtBaseline = (relPath: string): string | null => {
    try {
      const output = execSync(`git show ${baselineRef}:"${relPath}"`, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return output;
    } catch {
      return null;
    }
  };

  const getFileAtCurrent = (relPath: string): string | null => {
    const full = path.join(projectRoot, relPath);
    if (fs.existsSync(full)) {
      try {
        return fs.readFileSync(full, 'utf8');
      } catch {
        return null;
      }
    }
    return null;
  };

  return {
    isGit: true,
    baselineRef,
    currentRef,
    changedFiles: Array.from(changedFilesMap.values()),
    getFileAtBaseline,
    getFileAtCurrent
  };
}
