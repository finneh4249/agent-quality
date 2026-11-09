import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../dist/policy/engine.js';
import { DEFAULT_THRESHOLDS } from '../dist/config.js';

describe('Policy Engine', () => {
  const policy = {
    thresholds: DEFAULT_THRESHOLDS,
    allowedExclusions: []
  };

  test('passes when all scores meet or exceed thresholds', () => {
    const engine = new PolicyEngine(policy);
    const observations = [
      {
        providerId: 'lighthouse',
        providerVersion: '13.0.0',
        target: '/',
        profile: 'mobile',
        metrics: {
          performance: 92,
          accessibility: 98,
          'best-practices': 96,
          seo: 100
        },
        issues: [],
        durationMs: 1000
      }
    ];

    const result = engine.evaluate(observations);
    assert.equal(result.passed, true);
    assert.equal(result.status, 'passed');
    assert.equal(result.failures.length, 0);
  });

  test('strict threshold comparison without upward rounding (94.9 fails 95.0)', () => {
    const engine = new PolicyEngine(policy);
    const observations = [
      {
        providerId: 'lighthouse',
        providerVersion: '13.0.0',
        target: '/',
        profile: 'mobile',
        metrics: {
          performance: 95,
          accessibility: 94.9, // Must fail 95.0!
          'best-practices': 96,
          seo: 100
        },
        issues: [],
        durationMs: 1000
      }
    ];

    const result = engine.evaluate(observations);
    assert.equal(result.passed, false);
    assert.equal(result.status, 'threshold_failure');
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].category, 'accessibility');
    assert.equal(result.failures[0].score, 94.9);
  });

  test('performance below 90 triggers warning but does not fail gate', () => {
    const engine = new PolicyEngine(policy);
    const observations = [
      {
        providerId: 'lighthouse',
        providerVersion: '13.0.0',
        target: '/',
        profile: 'desktop',
        metrics: {
          performance: 82, // Warning mode
          accessibility: 98,
          'best-practices': 96,
          seo: 98
        },
        issues: [],
        durationMs: 1000
      }
    ];

    const result = engine.evaluate(observations);
    assert.equal(result.passed, true); // Still passes gate!
    assert.equal(result.hasWarning, true);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].category, 'performance');
  });

  test('calculates score regressions against baseline', () => {
    const engine = new PolicyEngine(policy);
    const baseline = [
      {
        providerId: 'lighthouse',
        providerVersion: '13.0.0',
        target: '/',
        profile: 'mobile',
        metrics: {
          performance: 96,
          accessibility: 100,
          'best-practices': 100,
          seo: 100
        },
        issues: [],
        durationMs: 1000
      }
    ];

    const current = [
      {
        providerId: 'lighthouse',
        providerVersion: '13.0.0',
        target: '/',
        profile: 'mobile',
        metrics: {
          performance: 91, // Dropped by 5
          accessibility: 98, // Dropped by 2
          'best-practices': 100,
          seo: 100
        },
        issues: [],
        durationMs: 1000
      }
    ];

    const result = engine.evaluate(current, baseline);
    assert.equal(result.regressions.length, 2);
    assert.equal(result.regressions[0].category, 'performance');
    assert.equal(result.regressions[0].drop, 5);
    assert.equal(result.regressions[1].category, 'accessibility');
    assert.equal(result.regressions[1].drop, 2);
  });
});
