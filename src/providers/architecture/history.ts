import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ArchitectureSnapshot, LongitudinalTrend, ArchitectureConfig } from '../../types.js';

export function computeConfigFingerprint(config: ArchitectureConfig): string {
  const content = JSON.stringify({
    layers: config.layers || [],
    protected: config.protectedModules || [],
    budgets: config.budgets || {}
  });
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

export function getHistoryFilePath(projectId: string): string {
  const dir = path.join(os.homedir(), '.agent-quality', 'history');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${projectId}.json`);
}

export function loadHistoricalSnapshots(projectId: string): ArchitectureSnapshot[] {
  const file = getHistoryFilePath(projectId);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistoricalSnapshot(
  projectId: string,
  snapshot: ArchitectureSnapshot,
  maxWindow = 20
): void {
  const file = getHistoryFilePath(projectId);
  const snapshots = loadHistoricalSnapshots(projectId);

  // Avoid duplicate commit entries
  const existingIdx = snapshots.findIndex((s) => s.commitSha === snapshot.commitSha && s.commitSha !== 'unknown');
  if (existingIdx !== -1) {
    snapshots[existingIdx] = snapshot;
  } else {
    snapshots.push(snapshot);
  }

  // Keep within observation window
  const trimmed = snapshots.slice(-maxWindow);
  fs.writeFileSync(file, JSON.stringify(trimmed, null, 2));
}

export function analyzeLongitudinalTrends({
  currentSnapshot,
  history,
  observationWindow = 10
}: {
  currentSnapshot: ArchitectureSnapshot;
  history: ArchitectureSnapshot[];
  observationWindow?: number;
}): LongitudinalTrend {
  const windowSnapshots = history.slice(-observationWindow);
  const baselineSnapshot = windowSnapshots.length > 0 ? windowSnapshots[0] : null;

  let isComparable = true;
  let comparabilityWarning: string | undefined;

  if (baselineSnapshot) {
    if (baselineSnapshot.analyserVersion !== currentSnapshot.analyserVersion) {
      isComparable = false;
      comparabilityWarning = `Analyser version mismatch (${baselineSnapshot.analyserVersion} vs ${currentSnapshot.analyserVersion}). Trend measurements may reflect algorithm adjustments rather than true code drift.`;
    } else if (baselineSnapshot.configFingerprint !== currentSnapshot.configFingerprint) {
      isComparable = false;
      comparabilityWarning = 'Architecture rules configuration changed between baseline and current commit. Metric comparisons may be skewed.';
    }
  }

  const computeDelta = (curr: number, prev: number) => {
    const delta = curr - prev;
    let direction: 'improving' | 'degrading' | 'stable' = 'stable';
    if (delta > 0.05) direction = 'degrading';
    else if (delta < -0.05) direction = 'improving';
    return { current: curr, baseline: prev, delta: Math.round(delta * 100) / 100, direction };
  };

  const baseMetrics = baselineSnapshot ? baselineSnapshot.metrics : currentSnapshot.metrics;

  const trends: LongitudinalTrend['trends'] = {
    structuralDuplication: computeDelta(
      currentSnapshot.metrics.structuralDuplicationRatio,
      baseMetrics.structuralDuplicationRatio
    ),
    singleUseComponents: computeDelta(
      currentSnapshot.metrics.singleUseComponents,
      baseMetrics.singleUseComponents
    ),
    dependencyCycles: computeDelta(
      currentSnapshot.metrics.dependencyCycles,
      baseMetrics.dependencyCycles
    ),
    dispersionRatio: computeDelta(
      currentSnapshot.metrics.dispersionRatio,
      baseMetrics.dispersionRatio
    ),
    ruleViolations: computeDelta(
      currentSnapshot.metrics.ruleViolations,
      baseMetrics.ruleViolations
    )
  };

  // Differentiate:
  // 1. Current Change Contribution (what this PR/commit added)
  // 2. Existing Debt (what was already present before this commit)
  const currentChangeContribution: Record<string, number> = {
    componentsAdded: currentSnapshot.metrics.componentsAdded,
    componentsDeleted: currentSnapshot.metrics.componentsDeleted,
    deltaDuplication: trends.structuralDuplication.delta,
    deltaCycles: trends.dependencyCycles.delta
  };

  const existingDebt: Record<string, number> = {
    baselineDuplication: baseMetrics.structuralDuplicationRatio,
    baselineSingleUse: baseMetrics.singleUseComponents,
    baselineCycles: baseMetrics.dependencyCycles
  };

  return {
    observationWindow,
    isComparable,
    comparabilityWarning,
    snapshotsCount: windowSnapshots.length + 1,
    trends,
    currentChangeContribution,
    existingDebt
  };
}
