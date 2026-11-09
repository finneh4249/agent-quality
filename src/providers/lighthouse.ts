import lighthouse from 'lighthouse';
import {
  QualityProvider,
  ProviderCapabilities,
  ProviderObservation,
  ActionableIssue,
  ActionableFinding,
  FindingSeverity,
  AuditPlan,
  TargetPlan,
  ExecutionContext
} from '../types.js';

export function calculateMedian(numbers: number[]): number {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function extractActionableFindings(lhr: any): ActionableFinding[] {
  const findings: ActionableFinding[] = [];
  const audits = lhr.audits || {};
  const categories = lhr.categories || {};

  // Build auditId -> category & weight mapping
  const auditMeta = new Map<string, { category: string; weight: number }>();
  for (const [catKey, catObj] of Object.entries<any>(categories)) {
    for (const ref of catObj.auditRefs || []) {
      auditMeta.set(ref.id, {
        category: catKey,
        weight: typeof ref.weight === 'number' ? ref.weight : 1
      });
    }
  }

  for (const [id, audit] of Object.entries<any>(audits)) {
    if (
      audit.score !== null &&
      audit.score < 1 &&
      audit.scoreDisplayMode !== 'notApplicable' &&
      audit.scoreDisplayMode !== 'informative'
    ) {
      const meta = auditMeta.get(id) || { category: 'other', weight: 0 };
      const scoreNum = Math.round((audit.score || 0) * 100);

      let severity: FindingSeverity = 'warning';
      if (audit.score === 0 && meta.weight > 0) {
        severity = 'failure';
      } else if (meta.weight === 0 || audit.scoreDisplayMode === 'informative') {
        severity = 'info';
      }

      // Extract DOM element snippet/selector if present
      let element: string | undefined;
      let url: string | undefined;
      const items = Array.isArray(audit.details?.items) ? audit.details.items : [];
      for (const item of items) {
        if (!element && item.node) {
          element = item.node.snippet || item.node.selector || item.node.nodeLabel;
        }
        if (!url && item.url) {
          url = item.url;
        }
      }

      const explanation = audit.description ? audit.description.split('.')[0] + '.' : undefined;

      findings.push({
        id,
        title: audit.title,
        category: meta.category,
        severity,
        score: scoreNum,
        weight: meta.weight,
        description: audit.description || '',
        explanation,
        element,
        url,
        savings: audit.numericValue || 0,
        displayValue: audit.displayValue || '',
        details: items.slice(0, 5)
      });
    }
  }

  // Sort: failures first, then highest weight / savings
  findings.sort((a, b) => {
    if (a.severity === 'failure' && b.severity !== 'failure') return -1;
    if (b.severity === 'failure' && a.severity !== 'failure') return 1;
    if ((b.weight || 0) !== (a.weight || 0)) return (b.weight || 0) - (a.weight || 0);
    return (a.score || 0) - (b.score || 0);
  });

  return findings;
}

export function extractActionableIssues(lhr: any): ActionableIssue[] {
  const issues: ActionableIssue[] = [];
  const audits = lhr.audits || {};

  for (const [id, audit] of Object.entries<any>(audits)) {
    if (
      audit.score !== null &&
      audit.score < 1 &&
      audit.scoreDisplayMode !== 'notApplicable' &&
      audit.scoreDisplayMode !== 'informative'
    ) {
      const numericSavings = audit.numericValue || 0;
      issues.push({
        id,
        title: audit.title,
        description: audit.description,
        score: Math.round((audit.score || 0) * 100),
        displayValue: audit.displayValue || '',
        savings: numericSavings,
        details: Array.isArray(audit.details?.items) ? audit.details.items.slice(0, 3) : []
      });
    }
  }

  issues.sort((a, b) => {
    if (a.savings && b.savings) return b.savings - a.savings;
    return a.score - b.score;
  });

  return issues.slice(0, 6);
}

export class LighthouseProvider implements QualityProvider {
  id = 'lighthouse';
  name = 'Google Lighthouse Quality Provider';
  version = '13.0.0';

  getCapabilities(): ProviderCapabilities {
    return {
      supportsMobile: true,
      supportsDesktop: true,
      supportsMultiRun: true
    };
  }

  isApplicable(plan: AuditPlan): boolean {
    return plan.isWeb && plan.projectType !== 'non_web';
  }

  async runSingleAudit({
    url,
    profile,
    port,
    headers = {}
  }: {
    url: string;
    profile: 'mobile' | 'desktop';
    port: number;
    headers?: Record<string, string>;
  }): Promise<{
    scores: Record<string, number>;
    lhr: any;
    htmlReport: string;
    rawJsonReport: string;
    findings: ActionableFinding[];
    issues: ActionableIssue[];
  }> {
    const isDesktop = profile === 'desktop';

    const desktopConfig = {
      extends: 'lighthouse:default',
      settings: {
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false
        },
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0
        },
        emulatedUserAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 agent-quality/1.0',
        output: ['json', 'html'],
        extraHeaders: headers
      }
    };

    const mobileConfig = {
      extends: 'lighthouse:default',
      settings: {
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 2.625,
          disabled: false
        },
        output: ['json', 'html'],
        extraHeaders: headers
      }
    };

    const config: any = isDesktop ? desktopConfig : mobileConfig;

    const runnerResult = await lighthouse(
      url,
      {
        port,
        logLevel: 'silent',
        output: ['json', 'html']
      },
      config
    );

    if (!runnerResult) {
      throw new Error(`Lighthouse failed to audit ${url} (${profile})`);
    }

    const lhr = runnerResult.lhr;
    const categories = lhr.categories || {};

    const scores = {
      performance: (categories.performance?.score || 0) * 100,
      accessibility: (categories.accessibility?.score || 0) * 100,
      'best-practices': (categories['best-practices']?.score || 0) * 100,
      seo: (categories.seo?.score || 0) * 100
    };

    const htmlReport = Array.isArray(runnerResult.report)
      ? runnerResult.report.find((r) => r.startsWith('<!doctype') || r.startsWith('<html')) || ''
      : runnerResult.report || '';

    const rawJsonReport = typeof runnerResult.report === 'string' && runnerResult.report.startsWith('{')
      ? runnerResult.report
      : JSON.stringify(lhr);

    return {
      scores,
      lhr,
      htmlReport,
      rawJsonReport,
      findings: extractActionableFindings(lhr),
      issues: extractActionableIssues(lhr)
    };
  }

  async execute(target: TargetPlan, context: ExecutionContext): Promise<ProviderObservation[]> {
    const fullUrl = new URL(target.route, context.baseUrl).href;
    const observations: ProviderObservation[] = [];

    for (const profile of target.profiles) {
      const startTime = Date.now();
      const runScores: Record<string, number[]> = {
        performance: [],
        accessibility: [],
        'best-practices': [],
        seo: []
      };

      let bestHtmlReport = '';
      let bestJsonReport = '';
      let topIssues: ActionableIssue[] = [];
      let topFindings: ActionableFinding[] = [];

      for (let i = 0; i < target.runs; i++) {
        const runRes = await this.runSingleAudit({
          url: fullUrl,
          profile,
          port: context.chrome.port,
          headers: context.auth.headers
        });

        for (const [cat, val] of Object.entries(runRes.scores)) {
          runScores[cat].push(val);
        }

        if (i === Math.floor(target.runs / 2) || !bestHtmlReport) {
          bestHtmlReport = runRes.htmlReport;
          bestJsonReport = runRes.rawJsonReport;
          topIssues = runRes.issues;
          topFindings = runRes.findings;
        }
      }

      const medians: Record<string, number> = {
        performance: calculateMedian(runScores.performance),
        accessibility: calculateMedian(runScores.accessibility),
        'best-practices': calculateMedian(runScores['best-practices']),
        seo: calculateMedian(runScores.seo)
      };

      observations.push({
        providerId: this.id,
        providerVersion: this.version,
        target: target.route,
        profile,
        metrics: medians,
        findings: topFindings,
        issues: topIssues,
        rawArtifacts: {
          html: bestHtmlReport,
          json: bestJsonReport
        },
        durationMs: Date.now() - startTime
      });
    }

    return observations;
  }
}
