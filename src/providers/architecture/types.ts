import {
  ActionableFinding,
  ActionableIssue,
  ArchitectureEvidenceType,
  ArchitectureConfig,
  RemediationRecommendation,
  ArchitectureSnapshot,
  LongitudinalTrend
} from '../../types.js';
import { DependencyCycle } from './cycles.js';

export interface ComponentItem {
  path: string;
  relativePath: string;
  extension: string;
  isNew: boolean;
  isDeleted: boolean;
  isModified: boolean;
  fanIn: number;
  consumers: string[];
  isModularAbstraction: boolean;
  isOrphaned: boolean;
}

export interface DependencyDiffItem {
  name: string;
  type: 'dependency' | 'devDependency';
  changeType: 'added' | 'removed' | 'changed';
  baselineVersion?: string;
  currentVersion?: string;
}

export interface DuplicationCluster {
  similarity: number;
  sharedSkeleton: string;
  components: string[];
  suggestion: string;
}

export interface AmplificationReport {
  primarySubsystem: string;
  totalChangedFiles: number;
  outOfScopeFiles: string[];
  dispersionRatio: number;
  subsystemBreakdown: Record<string, number>;
}

export interface RuleViolationItem {
  ruleId: string;
  ruleType: 'layer-boundary' | 'protected-module' | 'reuse-expectation';
  severity: 'failure' | 'warning';
  file: string;
  line?: number;
  imported?: string;
  message: string;
  exceptionAllowed?: boolean;
  exceptionRationale?: string;
}

export interface MetadataDuplicateItem {
  file: string;
  line?: number;
  literalValue: string;
  collection: string;
  collectionFile: string;
  fieldName: string;
}

export interface ArchitectureAnalysisResult {
  baselineRef: string;
  currentRef: string;
  components: {
    added: ComponentItem[];
    deleted: ComponentItem[];
    modified: ComponentItem[];
    modularAbstractions: ComponentItem[];
    singleUse: ComponentItem[];
    orphaned: ComponentItem[];
    newOrphaned: ComponentItem[];
  };
  dependencies: DependencyDiffItem[];
  amplification: AmplificationReport;
  duplicationClusters: DuplicationCluster[];
  cycles: DependencyCycle[];
  ruleViolations: RuleViolationItem[];
  metadataDuplicates: MetadataDuplicateItem[];
  remediations: RemediationRecommendation[];
  snapshot: ArchitectureSnapshot;
  trends?: LongitudinalTrend;
  facts: ActionableFinding[];
  heuristics: ActionableFinding[];
  ruleFindings: ActionableFinding[];
  score: {
    ruleScore: number; // 100 if no rule violations, 0 if violations exist
    structuralHealth: number; // 0-100 advisory score
  };
}
