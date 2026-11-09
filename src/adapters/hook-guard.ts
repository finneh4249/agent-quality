import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { getProjectIdentifier, loadRunState, saveRunState } from '../storage/store.js';

export function isRecursiveExecution(): boolean {
  return process.env.AGENT_QUALITY_RUNNING === '1';
}

export function computeGitState(projectRoot: string): string | null {
  try {
    let headSha = '';
    try {
      headSha = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {}

    let statusOutput = '';
    try {
      statusOutput = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {}

    const raw = `${headSha}\n${statusOutput}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  } catch {
    return null;
  }
}

export function shouldSkipUnchanged(projectRoot: string): boolean {
  const currentGitState = computeGitState(projectRoot);
  if (!currentGitState) {
    return false;
  }

  const projectId = getProjectIdentifier(projectRoot);
  const previousState = loadRunState(projectId);

  if (previousState && previousState.gitState === currentGitState && previousState.status === 'passed') {
    return true;
  }

  return false;
}

export function recordRunCompletion(projectRoot: string, status: string, summary: unknown = {}): void {
  const currentGitState = computeGitState(projectRoot);
  const projectId = getProjectIdentifier(projectRoot);

  saveRunState(projectId, {
    gitState: currentGitState,
    status,
    summary
  });
}
