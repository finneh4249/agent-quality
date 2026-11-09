import { ProviderObservation, RegressionItem } from '../types.js';

export function calculateRegressions(
  observations: ProviderObservation[],
  baselineObservations: ProviderObservation[] = []
): RegressionItem[] {
  const regressions: RegressionItem[] = [];

  for (const obs of observations) {
    const baseObs = baselineObservations.find(
      (b) => b.providerId === obs.providerId && b.target === obs.target && b.profile === obs.profile
    );
    if (!baseObs) continue;

    for (const [metricKey, currentValue] of Object.entries(obs.metrics)) {
      const baseValue = baseObs.metrics[metricKey];
      if (typeof baseValue === 'number' && currentValue < baseValue) {
        const drop = baseValue - currentValue;
        // Only report noticeable regressions (drop >= 1.0)
        if (drop >= 1.0) {
          regressions.push({
            route: obs.target,
            profile: obs.profile || 'default',
            category: metricKey,
            baselineScore: baseValue,
            currentScore: currentValue,
            drop
          });
        }
      }
    }
  }

  regressions.sort((a, b) => b.drop - a.drop);
  return regressions;
}
