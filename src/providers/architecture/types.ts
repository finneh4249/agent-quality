import {
  ActionableFinding,
  ActionableIssue,
  ArchitectureEvidenceType,
  ArchitectureConfig
} from '../../types.js';

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
  };
  dependencies: DependencyDiffItem[];
  amplification: AmplificationReport;
  duplicationClusters: DuplicationCluster[];
  ruleViolations: RuleViolationItem[];
  metadataDuplicates: MetadataDuplicateItem[];
  facts: ActionableFinding[];
  heuristics: ActionableFinding[];
  ruleFindings: ActionableFinding[];
  score: {
    ruleScore: number; // 100 if no rule violations, 0 if violations exist
    structuralHealth: number; // 0-100 advisory score
  };
}
