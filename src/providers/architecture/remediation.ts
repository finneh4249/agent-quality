import { RemediationRecommendation, ActionableFinding } from '../../types.js';
import { DuplicationCluster, AmplificationReport, RuleViolationItem, ComponentItem } from './types.js';
import { DependencyCycle } from './cycles.js';
import { getSubsystem } from './amplification.js';

export function evaluateRemediationStrategies({
  subsystem,
  components,
  duplicationClusters,
  amplification,
  cycles,
  ruleViolations
}: {
  subsystem: string;
  components: ComponentItem[];
  duplicationClusters: DuplicationCluster[];
  amplification: AmplificationReport;
  cycles: DependencyCycle[];
  ruleViolations: RuleViolationItem[];
}): RemediationRecommendation[] {
  const recommendations: RemediationRecommendation[] = [];

  const matchesSubsystem = (relPath: string) => {
    if (subsystem === 'all' || !subsystem || subsystem === 'none') return true;
    return getSubsystem(relPath) === subsystem || relPath.includes(subsystem) || relPath.startsWith(subsystem);
  };

  // 1. Check for Razing & Rebuild Signal:
  // Signals: High duplication across many components in the same subsystem, coupled with cycles or severe dispersion
  const subsystemComponents = components.filter((c) => matchesSubsystem(c.relativePath));
  const relatedClusters = duplicationClusters.filter((c) =>
    c.components.some((p) => matchesSubsystem(p))
  );

  const hasHighDuplicationSprawl = relatedClusters.length >= 2 || (relatedClusters.length >= 1 && relatedClusters[0].components.length >= 4);
  const hasDependencyCycles = cycles.length > 0;
  const hasSevereAmplification = amplification.dispersionRatio >= 0.35 && amplification.totalChangedFiles >= 6;

  if (hasHighDuplicationSprawl && (hasDependencyCycles || hasSevereAmplification)) {
    // Recommend Raze and Rebuild
    const affectedFiles = relatedClusters.flatMap((c) => c.components);
    recommendations.push({
      strategy: 'raze_and_rebuild',
      target: subsystem === 'all' ? 'repetitive component layer' : subsystem,
      why: `Subsystem exhibits structural exhaustion: ${relatedClusters.length} duplication cluster(s) covering ${affectedFiles.length} components, coupled with ${cycles.length} dependency cycle(s) and ${Math.round(amplification.dispersionRatio * 100)}% change dispersion. Incremental refactoring would preserve accidental complexity indefinitely.`,
      whatShouldSurvive: [
        'Domain data models, schemas, and content collections',
        'Public behavioral contracts, route expectations, and figure captions',
        'End-to-end and integration test suites'
      ],
      whatShouldDisappear: [
        'Single-use wrapper component sprawl and hardcoded boilerplate templates',
        'Circular import bridges and ad-hoc compatibility adapters',
        'Duplicate markup skeletons differing only by text literals'
      ],
      replacementStrategy: 'Parallel replacement: author a clean, data-driven replacement primitive, migrate consumer views to pass structured data, and then cleanly raze the obsolete wrapper files.',
      risks: [
        'Potential layout regressions if individual wrappers contain undocumented CSS overrides',
        'Broken imports in third-party or untested content files'
      ]
    });
  } else if (relatedClusters.length > 0 || ruleViolations.some((v) => v.severity === 'warning')) {
    // Recommend Refactor
    recommendations.push({
      strategy: 'refactor',
      target: subsystem === 'all' ? 'components layer' : subsystem,
      why: 'Architecture is structurally salvageable but exhibits component duplication or reuse friction. Consolidating repeated templates into parameterized abstractions will lower ongoing maintenance overhead.',
      whatShouldSurvive: [
        'Existing component props and export signatures',
        'Visual hierarchy and responsive layout behavior'
      ],
      whatShouldDisappear: [
        'Near-identical template AST structures'
      ],
      replacementStrategy: 'Incremental refactoring: parameterize shared component props and replace duplicate templates in-place.',
      risks: [
        'Minor visual regression during prop unification'
      ]
    });
  } else {
    // Recommend Repair
    recommendations.push({
      strategy: 'repair',
      target: subsystem === 'all' ? 'codebase' : subsystem,
      why: 'Architecture is fundamentally sound. Boundaries are respected, change dispersion is low, and no destructive replacement is justified.',
      whatShouldSurvive: ['Entire existing architecture and directory boundaries'],
      whatShouldDisappear: ['Local defects and individual code anomalies'],
      replacementStrategy: 'Targeted bug repair with local unit regression tests.',
      risks: ['Negligible architectural risk']
    });
  }

  return recommendations;
}

export function createRemediationFindings(recommendations: RemediationRecommendation[]): ActionableFinding[] {
  const findings: ActionableFinding[] = [];

  for (const rec of recommendations) {
    if (rec.strategy === 'raze_and_rebuild') {
      findings.push({
        id: 'arch-remediation-raze-and-rebuild',
        title: `Architectural Recommendation: Consider Razing and Rebuilding [${rec.target}]`,
        category: 'architecture',
        severity: 'warning', // Advisory, never fails build
        score: 70,
        evidenceType: 'advisory',
        description: rec.why,
        explanation: `Strategy: ${rec.replacementStrategy}. What should survive: ${rec.whatShouldSurvive.join(', ')}.`,
        element: rec.target,
        details: [rec]
      });
    } else if (rec.strategy === 'refactor') {
      findings.push({
        id: 'arch-remediation-refactor',
        title: `Architectural Recommendation: Refactor and Consolidate [${rec.target}]`,
        category: 'architecture',
        severity: 'info',
        score: 90,
        evidenceType: 'advisory',
        description: rec.why,
        explanation: `Strategy: ${rec.replacementStrategy}`,
        element: rec.target,
        details: [rec]
      });
    }
  }

  return findings;
}
