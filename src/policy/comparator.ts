import {
  NormalisedResult,
  ActionableFinding
} from '../types.js';

export type ComparisonStatus = 'new' | 'existing' | 'resolved' | 'worsened' | 'improved' | 'inconclusive';

export interface FindingDiff {
  id: string;
  title: string;
  category: string;
  route: string;
  profile: string;
  status: ComparisonStatus;
  baseScore: number | null;
  currentScore: number | null;
  element?: string;
  explanation?: string;
}

export interface MetricDiff {
  route: string;
  profile: string;
  category: string;
  baseScore: number;
  currentScore: number;
  delta: number;
  status: 'improved' | 'worsened' | 'inconclusive' | 'unchanged';
}

export interface ComprehensiveComparison {
  baseMetadata: {
    timestamp: string;
    gitRevision?: string;
    isDirty?: boolean;
    projectName: string;
  };
  currentMetadata: {
    timestamp: string;
    gitRevision?: string;
    isDirty?: boolean;
    projectName: string;
  };
  metricDiffs: MetricDiff[];
  findingDiffs: FindingDiff[];
  hasRegressions: boolean;
  regressionsCount: number;
  improvementsCount: number;
  resolvedCount: number;
  summaryText: string;
}

const PERFORMANCE_NOISE_TOLERANCE = 3.0;

export function compareAudits(
  baseResult: NormalisedResult,
  currentResult: NormalisedResult
): ComprehensiveComparison {
  const metricDiffs: MetricDiff[] = [];
  const findingDiffs: FindingDiff[] = [];

  // 1. Metric Comparisons (with noise tolerances)
  const baseRoutes = baseResult.evaluation?.routeSummaries || [];
  const currentRoutes = currentResult.evaluation?.routeSummaries || [];

  for (const currRoute of currentRoutes) {
    const baseRoute = baseRoutes.find((r) => r.route === currRoute.route);
    if (!baseRoute) continue;

    for (const [profile, currCats] of Object.entries(currRoute.profiles)) {
      const baseCats = baseRoute.profiles[profile];
      if (!baseCats) continue;

      for (const [category, currData] of Object.entries<any>(currCats)) {
        const baseData = (baseCats as any)[category];
        if (!baseData) continue;

        const currScore = currData.score;
        const baseScore = baseData.score;
        const delta = currScore - baseScore;

        let status: MetricDiff['status'] = 'unchanged';
        if (category === 'performance') {
          if (delta < -PERFORMANCE_NOISE_TOLERANCE) {
            status = 'worsened';
          } else if (delta > PERFORMANCE_NOISE_TOLERANCE) {
            status = 'improved';
          } else if (Math.abs(delta) > 0) {
            status = 'inconclusive'; // Within noise tolerance
          }
        } else {
          // Deterministic categories (a11y, seo, best-practices)
          if (delta < -0.1) {
            status = 'worsened';
          } else if (delta > 0.1) {
            status = 'improved';
          }
        }

        metricDiffs.push({
          route: currRoute.route,
          profile,
          category,
          baseScore,
          currentScore: currScore,
          delta,
          status
        });
      }
    }
  }

  // 2. Individual Finding Attribution (Deterministic audit ID comparisons)
  const baseFindingsByRoute = new Map<string, ActionableFinding[]>();
  for (const obs of baseResult.observations || []) {
    const key = `${obs.target}::${obs.profile || 'default'}`;
    const list = baseFindingsByRoute.get(key) || [];
    list.push(...(obs.findings || []));
    baseFindingsByRoute.set(key, list);
  }

  const currentFindingsByRoute = new Map<string, ActionableFinding[]>();
  for (const obs of currentResult.observations || []) {
    const key = `${obs.target}::${obs.profile || 'default'}`;
    const list = currentFindingsByRoute.get(key) || [];
    list.push(...(obs.findings || []));
    currentFindingsByRoute.set(key, list);
  }

  // Check all current findings against base
  for (const [key, currList] of currentFindingsByRoute.entries()) {
    const [route, profile] = key.split('::');
    const baseList = baseFindingsByRoute.get(key) || [];

    for (const currF of currList) {
      const baseMatch = baseList.find((b) => b.id === currF.id);

      if (!baseMatch) {
        findingDiffs.push({
          id: currF.id,
          title: currF.title,
          category: currF.category,
          route,
          profile,
          status: 'new', // Regression: Introduced!
          baseScore: 100,
          currentScore: currF.score,
          element: currF.element,
          explanation: currF.explanation
        });
      } else {
        const baseScore = baseMatch.score ?? 0;
        const currScore = currF.score ?? 0;
        let status: ComparisonStatus = 'existing';

        if (currScore < baseScore) {
          status = 'worsened';
        } else if (currScore > baseScore) {
          status = 'improved';
        }

        findingDiffs.push({
          id: currF.id,
          title: currF.title,
          category: currF.category,
          route,
          profile,
          status,
          baseScore,
          currentScore: currScore,
          element: currF.element || baseMatch.element,
          explanation: currF.explanation || baseMatch.explanation
        });
      }
    }

    // Check for resolved findings (in base, absent in current)
    for (const baseF of baseList) {
      const currMatch = currList.find((c) => c.id === baseF.id);
      if (!currMatch) {
        findingDiffs.push({
          id: baseF.id,
          title: baseF.title,
          category: baseF.category,
          route,
          profile,
          status: 'resolved', // Fixed!
          baseScore: baseF.score,
          currentScore: 100,
          element: baseF.element,
          explanation: baseF.explanation
        });
      }
    }
  }

  const regressions = findingDiffs.filter((f) => f.status === 'new' || f.status === 'worsened');
  const improvements = findingDiffs.filter((f) => f.status === 'improved');
  const resolved = findingDiffs.filter((f) => f.status === 'resolved');

  const metricRegressions = metricDiffs.filter((m) => m.status === 'worsened');
  const hasRegressions = regressions.length > 0 || metricRegressions.length > 0;

  return {
    baseMetadata: {
      timestamp: baseResult.timestamp,
      gitRevision: (baseResult.environment as any)?.gitSha || (baseResult.environment as any)?.gitRevision,
      isDirty: (baseResult.environment as any)?.isDirty,
      projectName: baseResult.projectName
    },
    currentMetadata: {
      timestamp: currentResult.timestamp,
      gitRevision: (currentResult.environment as any)?.gitSha || (currentResult.environment as any)?.gitRevision,
      isDirty: (currentResult.environment as any)?.isDirty,
      projectName: currentResult.projectName
    },
    metricDiffs,
    findingDiffs,
    hasRegressions,
    regressionsCount: regressions.length,
    improvementsCount: improvements.length,
    resolvedCount: resolved.length,
    summaryText: hasRegressions
      ? `Found ${regressions.length} new or worsened findings and ${metricRegressions.length} score regressions.`
      : `No regressions detected (${resolved.length} resolved, ${improvements.length} improved).`
  };
}
