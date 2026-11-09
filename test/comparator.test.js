import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareAudits } from '../dist/policy/comparator.js';

describe('Regression Attribution & Comparator', () => {
  const baseResult = {
    schemaVersion: 'aqg.result.v1',
    timestamp: '2026-11-01T00:00:00.000Z',
    projectId: 'test-app',
    projectName: 'test-app',
    projectRoot: '/test',
    status: 'passed',
    plan: { targets: [{ route: '/' }] },
    observations: [
      {
        providerId: 'lighthouse',
        providerVersion: '13.0.0',
        target: '/',
        profile: 'mobile',
        metrics: { performance: 95, accessibility: 100, seo: 100, 'best-practices': 100 },
        findings: [],
        issues: [],
        durationMs: 500
      }
    ],
    evaluation: {
      routeSummaries: [
        {
          route: '/',
          profiles: {
            mobile: {
              performance: { score: 95 },
              accessibility: { score: 100 },
              seo: { score: 100 },
              'best-practices': { score: 100 }
            }
          }
        }
      ]
    },
    topIssues: [],
    findings: [],
    reportPaths: {},
    environment: { gitRevision: 'abc1234', isDirty: false }
  };

  test('identifies new finding as regression', () => {
    const currentResult = {
      ...baseResult,
      timestamp: '2026-11-02T00:00:00.000Z',
      observations: [
        {
          ...baseResult.observations[0],
          metrics: { performance: 95, accessibility: 100, seo: 66, 'best-practices': 100 },
          findings: [
            {
              id: 'is-crawlable',
              title: 'Page is blocked from indexing',
              category: 'seo',
              severity: 'failure',
              score: 0,
              weight: 10,
              description: 'Blocked from indexing',
              element: '<meta name="robots" content="noindex" />'
            }
          ]
        }
      ],
      evaluation: {
        routeSummaries: [
          {
            route: '/',
            profiles: {
              mobile: {
                performance: { score: 95 },
                accessibility: { score: 100 },
                seo: { score: 66 },
                'best-practices': { score: 100 }
              }
            }
          }
        ]
      }
    };

    const comp = compareAudits(baseResult, currentResult);
    assert.equal(comp.hasRegressions, true);
    assert.equal(comp.regressionsCount, 1);
    const newFinding = comp.findingDiffs.find((f) => f.id === 'is-crawlable');
    assert.ok(newFinding);
    assert.equal(newFinding.status, 'new');
  });

  test('respects performance noise tolerance of 3 points as inconclusive', () => {
    const currentResult = {
      ...baseResult,
      observations: [
        {
          ...baseResult.observations[0],
          metrics: { performance: 93, accessibility: 100, seo: 100, 'best-practices': 100 } // Drop of 2 pts (< 3.0 tolerance)
        }
      ],
      evaluation: {
        routeSummaries: [
          {
            route: '/',
            profiles: {
              mobile: {
                performance: { score: 93 },
                accessibility: { score: 100 },
                seo: { score: 100 },
                'best-practices': { score: 100 }
              }
            }
          }
        ]
      }
    };

    const comp = compareAudits(baseResult, currentResult);
    const perfDiff = comp.metricDiffs.find((m) => m.category === 'performance');
    assert.ok(perfDiff);
    assert.equal(perfDiff.status, 'inconclusive');
    assert.equal(comp.hasRegressions, false);
  });
});
