/**
 * Agent Quality Gate (AQG) — Core Domain Types and Contracts
 */

export type ProjectFrameworkType = 'astro' | 'vite' | 'next' | 'nuxt' | 'sveltekit' | 'static' | 'generic_web' | 'non_web';

export type FindingSeverity = 'failure' | 'warning' | 'info';

export type ArchitectureEvidenceType = 'fact' | 'heuristic' | 'advisory';

export interface ArchitectureRuleException {
  ruleId: string;
  target: string;
  reason: string;
}

export interface ArchitectureLayerRule {
  name: string;
  pattern: string;
  allowedDependencies?: string[];
  forbiddenDependencies?: string[];
  description?: string;
}

export interface ProtectedModuleRule {
  pattern: string;
  reason?: string;
}

export interface ArchitectureBudgetThreshold {
  warningThreshold: number;
}

export interface ArchitectureBudgetsConfig {
  singleUseComponentGrowth?: ArchitectureBudgetThreshold;
  duplicationGrowth?: ArchitectureBudgetThreshold;
  dependencyCycleGrowth?: ArchitectureBudgetThreshold;
  dispersionGrowth?: ArchitectureBudgetThreshold;
}

export type RemediationStrategy = 'repair' | 'refactor' | 'raze_and_rebuild';

export interface RemediationRecommendation {
  strategy: RemediationStrategy;
  target: string;
  why: string;
  whatShouldSurvive: string[];
  whatShouldDisappear: string[];
  replacementStrategy: string;
  risks: string[];
}

export interface ArchitectureSnapshot {
  schemaVersion: 'aqg.arch.snapshot.v1';
  projectId: string;
  commitSha: string;
  timestamp: string;
  analyserVersion: string;
  configFingerprint: string;
  baselineRef: string;
  metrics: {
    componentsTotal: number;
    componentsAdded: number;
    componentsDeleted: number;
    singleUseComponents: number;
    modularAbstractions: number;
    structuralDuplicationRatio: number;
    dependencyCycles: number;
    dispersionRatio: number;
    ruleViolations: number;
  };
  evidenceSummary: {
    addedComponents: string[];
    duplicationClustersCount: number;
    outOfScopeFilesCount: number;
  };
}

export interface LongitudinalTrend {
  observationWindow: number;
  isComparable: boolean;
  comparabilityWarning?: string;
  snapshotsCount: number;
  trends: Record<string, {
    current: number;
    baseline: number;
    delta: number;
    direction: 'improving' | 'degrading' | 'stable';
  }>;
  currentChangeContribution: Record<string, number>;
  existingDebt: Record<string, number>;
}

export interface ArchitectureConfig {
  baselineRef?: string;
  layers?: ArchitectureLayerRule[];
  protectedModules?: (string | ProtectedModuleRule)[];
  componentReuseExpectations?: {
    warnOnSingleUseDirectory?: string[];
    minConsumersForExtraction?: number;
  };
  budgets?: ArchitectureBudgetsConfig;
  historyWindow?: number;
  exceptions?: ArchitectureRuleException[];
  ignorePaths?: string[];
  enableAiReview?: boolean;
}

export interface ActionableFinding {
  id: string;
  title: string;
  category: string;
  severity: FindingSeverity;
  score: number | null;
  weight?: number;
  description: string;
  explanation?: string;
  element?: string;
  url?: string;
  savings?: number;
  displayValue?: string;
  details?: unknown[];
  evidenceType?: ArchitectureEvidenceType;
  ruleId?: string;
}

export interface ActionableIssue {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue?: string;
  savings?: number;
  details?: unknown[];
}

export interface TargetPlan {
  route: string;
  profiles: Array<'mobile' | 'desktop'>;
  runs: number;
}

export interface AuditPlan {
  projectId: string;
  projectName: string;
  projectRoot: string;
  projectType: ProjectFrameworkType;
  isWeb: boolean;
  notApplicableReason?: string;
  previewCommand?: string | null;
  previewUrl?: string | null;
  outputDir?: string;
  targets: TargetPlan[];
  applicableProviders: string[];
  configSource?: string;
}

export interface ExecutionContext {
  projectRoot: string;
  baseUrl: string;
  chrome: {
    port: number;
    kill: () => Promise<void>;
  };
  tempDir: string;
  auth: {
    headers: Record<string, string>;
    cookies: unknown[];
  };
  env: Record<string, string>;
  timeouts: {
    serverStartMs: number;
    auditTimeoutMs: number;
  };
}

export interface ProviderCapabilities {
  supportsMobile: boolean;
  supportsDesktop: boolean;
  supportsMultiRun: boolean;
  requiresBrowser?: boolean;
  requiresServer?: boolean;
  scope?: 'route' | 'project';
}

export interface ProviderObservation {
  providerId: string;
  providerVersion: string;
  target: string;
  profile?: 'mobile' | 'desktop';
  metrics: Record<string, number>; // e.g. { performance: 92.0, accessibility: 98.0 }
  findings: ActionableFinding[];
  issues: ActionableIssue[];
  rawArtifacts?: Record<string, string>; // path to HTML / JSON reports
  durationMs: number;
}

export interface QualityProvider {
  id: string;
  name: string;
  version: string;
  getCapabilities(): ProviderCapabilities;
  isApplicable(plan: AuditPlan, context?: ExecutionContext): boolean | Promise<boolean>;
  execute(target: TargetPlan, context: ExecutionContext): Promise<ProviderObservation[]>;
}

export interface CategoryThreshold {
  threshold: number;
  failureMode: 'failure' | 'warning';
}

export interface QualityPolicy {
  thresholds: Record<string, CategoryThreshold>;
  allowedExclusions: string[];
}

export interface GateFailure {
  route: string;
  profile: string;
  category: string;
  score: number;
  target: number;
  gap: number;
}

export interface RegressionItem {
  route: string;
  profile: string;
  category: string;
  baselineScore: number;
  currentScore: number;
  drop: number;
}

export interface PolicyEvaluationResult {
  passed: boolean;
  hasWarning: boolean;
  status: 'passed' | 'threshold_failure' | 'warning';
  failures: GateFailure[];
  warnings: GateFailure[];
  regressions: RegressionItem[];
  routeSummaries: Array<{
    route: string;
    passed: boolean;
    profiles: Record<string, Record<string, {
      score: number;
      target: number;
      passed: boolean;
      failureMode: 'failure' | 'warning';
    }>>;
  }>;
}

export interface NormalisedResult {
  schemaVersion: 'aqg.result.v1';
  timestamp: string;
  projectId: string;
  projectName: string;
  projectRoot: string;
  status: 'passed' | 'warning' | 'threshold_failure' | 'execution_failure' | 'not_applicable' | 'skipped_unchanged' | 'not_configured' | 'missing_dependency';
  reason?: string;
  plan: AuditPlan;
  observations: ProviderObservation[];
  evaluation?: PolicyEvaluationResult;
  topIssues: ActionableIssue[];
  findings: ActionableFinding[];
  reportPaths: {
    jsonPath?: string;
    latestJsonPath?: string;
    htmlPaths?: Record<string, string>;
  };
  baselinePath?: string | null;
  environment: {
    nodeVersion: string;
    platform: string;
    gitSha?: string;
    gitBranch?: string;
    isDirty?: boolean;
  };
}
