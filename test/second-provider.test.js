import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SyntheticA11yProvider } from './fixtures/synthetic-a11y-provider.js';
import { PolicyEngine } from '../dist/policy/engine.js';
import { DEFAULT_THRESHOLDS } from '../dist/config.js';

describe('Provider Architecture Seam (Second Provider Validation)', () => {
  const provider = new SyntheticA11yProvider();

  test('declares applicability and capabilities correctly', () => {
    assert.equal(provider.id, 'synthetic-a11y');
    assert.equal(provider.getCapabilities().supportsDesktop, true);
    assert.equal(provider.getCapabilities().supportsMobile, false);

    const webPlan = { isWeb: true, projectType: 'astro' };
    const nonWebPlan = { isWeb: false, projectType: 'non_web' };

    assert.equal(provider.isApplicable(webPlan), true);
    assert.equal(provider.isApplicable(nonWebPlan), false);
  });

  test('executes against prepared execution context and returns observations', async () => {
    const mockContext = {
      projectRoot: '/test',
      baseUrl: 'http://localhost:3000',
      chrome: { port: 9222, kill: async () => {} },
      tempDir: '/tmp',
      auth: { headers: {}, cookies: [] },
      env: {},
      timeouts: { serverStartMs: 5000, auditTimeoutMs: 5000 }
    };

    const target = { route: '/', profiles: ['desktop'], runs: 1 };
    const observations = await provider.execute(target, mockContext);

    assert.equal(observations.length, 1);
    const obs = observations[0];
    assert.equal(obs.providerId, 'synthetic-a11y');
    assert.equal(obs.metrics['color-contrast-ratio'], 98.0);
    assert.equal(obs.findings.length, 1);
    assert.equal(obs.findings[0].id, 'synthetic-heading-check');
  });

  test('participates in policy evaluation without changes to Lighthouse provider', async () => {
    const customPolicy = {
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        'color-contrast-ratio': { threshold: 95, failureMode: 'failure' }
      },
      allowedExclusions: []
    };

    const engine = new PolicyEngine(customPolicy);

    // Combine Lighthouse observations with Synthetic observations
    const combinedObservations = [
      {
        providerId: 'lighthouse',
        providerVersion: '13.0.0',
        target: '/',
        profile: 'desktop',
        metrics: { performance: 95, accessibility: 98, seo: 100, 'best-practices': 96 },
        findings: [],
        issues: [],
        durationMs: 400
      },
      {
        providerId: 'synthetic-a11y',
        providerVersion: '1.0.0',
        target: '/',
        profile: 'desktop',
        metrics: { 'color-contrast-ratio': 98.0 },
        findings: [],
        issues: [],
        durationMs: 50
      }
    ];

    const result = engine.evaluate(combinedObservations);
    assert.equal(result.passed, true);
    assert.equal(result.status, 'passed');

    const profileSummary = result.routeSummaries[0].profiles.desktop;
    assert.equal(profileSummary['color-contrast-ratio'].passed, true);
    assert.equal(profileSummary['performance'].passed, true);
  });
});
