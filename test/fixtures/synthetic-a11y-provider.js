export class SyntheticA11yProvider {
  id = 'synthetic-a11y';
  name = 'Synthetic Accessibility Provider (Verification Seam)';
  version = '1.0.0';

  getCapabilities() {
    return {
      supportsMobile: false,
      supportsDesktop: true,
      supportsMultiRun: false
    };
  }

  isApplicable(plan) {
    return Boolean(plan.isWeb && plan.projectType !== 'non_web');
  }

  async execute(target, context) {
    const startTime = Date.now();

    if (!context.baseUrl) {
      throw new Error('ExecutionContext missing baseUrl');
    }

    return [
      {
        providerId: this.id,
        providerVersion: this.version,
        target: target.route,
        profile: 'desktop',
        metrics: {
          'color-contrast-ratio': 98.0,
          'heading-order': 100.0
        },
        findings: [
          {
            id: 'synthetic-heading-check',
            title: 'Synthetic Heading Structure',
            category: 'accessibility',
            severity: 'info',
            score: 100,
            weight: 2,
            description: 'Headings are logically ordered H1 through H6.',
            explanation: 'Document structure satisfies accessibility contract.'
          }
        ],
        issues: [],
        durationMs: Date.now() - startTime
      }
    ];
  }
}
