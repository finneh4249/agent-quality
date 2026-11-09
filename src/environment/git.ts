import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export interface GitMetadata {
  revision: string;
  shortRevision: string;
  branch: string;
  isDirty: boolean;
  author: string;
  date: string;
  message: string;
}

export function getGitMetadata(projectRoot: string): GitMetadata | null {
  try {
    const revision = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const shortRevision = revision.slice(0, 7);

    let branch = 'HEAD';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {}

    const statusOutput = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const isDirty = statusOutput.length > 0;

    let author = '';
    let date = '';
    let message = '';
    try {
      author = execSync('git log -1 --format="%an <%ae>"', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      date = execSync('git log -1 --format="%cd" --date=iso', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      message = execSync('git log -1 --format="%s"', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {}

    return {
      revision,
      shortRevision,
      branch,
      isDirty,
      author,
      date,
      message
    };
  } catch {
    return null;
  }
}

export function createIsolatedWorktree(
  projectRoot: string,
  revision: string
): { worktreePath: string; cleanup: () => void } {
  // Resolve revision to full commit hash
  const commitSha = execSync(`git rev-parse ${revision}^{commit}`, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

  const tempWorktree = path.join(os.tmpdir(), `aqg-wt-${commitSha.slice(0, 8)}-${Date.now()}`);

  execSync(`git worktree add --detach "${tempWorktree}" ${commitSha}`, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return {
    worktreePath: tempWorktree,
    cleanup: () => {
      try {
        execSync(`git worktree remove --force "${tempWorktree}"`, {
          cwd: projectRoot,
          stdio: ['ignore', 'pipe', 'ignore']
        });
      } catch {
        fs.rmSync(tempWorktree, { recursive: true, force: true });
      }
    }
  };
}
