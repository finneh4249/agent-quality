import {
  QualityProvider,
  ProviderCapabilities,
  ProviderObservation,
  AuditPlan,
  TargetPlan,
  ExecutionContext,
  ArchitectureConfig
} from '../../types.js';
import { runArchitectureAnalysis } from './analyser.js';
import { ArchitectureAnalysisResult } from './types.js';
import { loadConfig } from '../../config.js';

export class ArchitectureHealthProvider implements QualityProvider {
  id = 'architecture-health';
  name = 'Architecture Health & Structural Change Provider';
  version = '1.0.0';
  private config?: ArchitectureConfig;

  constructor(config?: ArchitectureConfig) {
    this.config = config;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsMobile: false,
      supportsDesktop: true,
      supportsMultiRun: false,
      requiresBrowser: false,
      requiresServer: false,
      scope: 'project'
    };
  }

  isApplicable(plan: AuditPlan): boolean {
    // Applicable across web and non-web projects
    return true;
  }

  async execute(target: TargetPlan, context: ExecutionContext): Promise<ProviderObservation[]> {
    const startTime = Date.now();

    let archConfig = this.config;
    if (!archConfig && context.projectRoot) {
      try {
        const loaded = await loadConfig(context.projectRoot);
        archConfig = loaded.config.architecture;
      } catch {}
    }

    const result: ArchitectureAnalysisResult = runArchitectureAnalysis(
      context.projectRoot,
      archConfig || {}
    );

    const allFindings = [
      ...result.ruleFindings,
      ...result.heuristics,
      ...result.facts
    ];

    const observation: ProviderObservation = {
      providerId: this.id,
      providerVersion: this.version,
      target: target.route || '__architecture__',
      profile: 'desktop',
      metrics: {
        'architecture-rules': result.score.ruleScore,
        'structural-health': result.score.structuralHealth
      },
      findings: allFindings,
      issues: result.ruleViolations.map((v) => ({
        id: `issue-${v.ruleId}`,
        title: `Architecture Rule Violation: ${v.ruleType}`,
        description: v.message,
        score: v.severity === 'failure' ? 0 : 50
      })),
      durationMs: Date.now() - startTime
    };

    return [observation];
  }
}
