import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { getProjectIdentifier, loadRunState, saveRunState } from '../storage.js';

export function computeGitState(projectRoot) {
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

export function shouldSkipUnchanged(projectRoot) {
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

export function recordRunCompletion(projectRoot, status, auditSummary = {}) {
  const currentGitState = computeGitState(projectRoot);
  const projectId = getProjectIdentifier(projectRoot);

  saveRunState(projectId, {
    gitState: currentGitState,
    status,
    summary: auditSummary
  });
}
