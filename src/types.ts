/**
 * Agent Quality Gate (AQG) — Core Domain Types and Contracts
 */

export type ProjectFrameworkType = 'astro' | 'vite' | 'next' | 'nuxt' | 'sveltekit' | 'static' | 'generic_web' | 'non_web';

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
}

export interface ProviderObservation {
  providerId: string;
  providerVersion: string;
  target: string;
  profile?: 'mobile' | 'desktop';
  metrics: Record<string, number>; // e.g. { performance: 92.0, accessibility: 98.0 }
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
  };
}
