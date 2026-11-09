import {
  ProviderObservation,
  QualityPolicy,
  PolicyEvaluationResult,
  GateFailure
} from '../types.js';
import { calculateRegressions } from './baseline.js';

export class PolicyEngine {
  policy: QualityPolicy;

  constructor(policy: QualityPolicy) {
    this.policy = policy;
  }

  evaluate(
    observations: ProviderObservation[],
    baselineObservations: ProviderObservation[] = []
  ): PolicyEvaluationResult {
    let hasFailure = false;
    let hasWarning = false;
    const failures: GateFailure[] = [];
    const warnings: GateFailure[] = [];

    // Group observations by route
    const routesMap = new Map<string, ProviderObservation[]>();
    for (const obs of observations) {
      if (!routesMap.has(obs.target)) {
        routesMap.set(obs.target, []);
      }
      routesMap.get(obs.target)!.push(obs);
    }

    const routeSummaries: PolicyEvaluationResult['routeSummaries'] = [];

    for (const [route, obsList] of routesMap.entries()) {
      let routePassed = true;
      const profilesSummary: Record<string, any> = {};

      for (const obs of obsList) {
        const profile = obs.profile || 'default';
        profilesSummary[profile] = {};

        for (const [category, thresholdCfg] of Object.entries(this.policy.thresholds)) {
          const score = obs.metrics[category] ?? 0;
          const target = thresholdCfg.threshold;
          const failureMode = thresholdCfg.failureMode;

          // Strict comparison: no upward rounding
          const passed = score >= target;

          if (!passed) {
            const gap = target - score;
            const item: GateFailure = {
              route,
              profile,
              category,
              score,
              target,
              gap
            };

            if (failureMode === 'warning') {
              hasWarning = true;
              warnings.push(item);
            } else {
              hasFailure = true;
              routePassed = false;
              failures.push(item);
            }
          }

          profilesSummary[profile][category] = {
            score,
            target,
            passed,
            failureMode
          };
        }
      }

      routeSummaries.push({
        route,
        passed: routePassed,
        profiles: profilesSummary
      });
    }

    const regressions = calculateRegressions(observations, baselineObservations);

    return {
      passed: !hasFailure,
      hasWarning,
      status: hasFailure ? 'threshold_failure' : 'passed',
      failures,
      warnings,
      regressions,
      routeSummaries
    };
  }
}
