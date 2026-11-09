import { ActionableFinding, ArchitectureConfig, ArchitectureSnapshot } from '../../types.js';
import { resolveGitDiffState } from './git-diff.js';
import { buildComponentGraph } from './component-graph.js';
import { analyzeDependencyManifests } from './manifest.js';
import { analyzeChangeAmplification } from './amplification.js';
import { detectStructuralDuplication } from './structural-duplication.js';
import { evaluateArchitectureRules } from './import-rules.js';
import { detectHardcodedCollectionMetadata } from './metadata-detector.js';
import { detectDependencyCycles } from './cycles.js';
import { evaluateRemediationStrategies, createRemediationFindings } from './remediation.js';
import { computeConfigFingerprint, loadHistoricalSnapshots, analyzeLongitudinalTrends } from './history.js';
import { getProjectIdentifier } from '../../storage/store.js';
import { ArchitectureAnalysisResult } from './types.js';

export function runArchitectureAnalysis(
  projectRoot: string,
  config: ArchitectureConfig = {}
): ArchitectureAnalysisResult {
  // 1. Resolve Git Diff State
  const gitDiff = resolveGitDiffState(projectRoot, config.baselineRef);

  // 2. Build Component Graph & Fan-In
  const componentGraph = buildComponentGraph(projectRoot, gitDiff);

  // 3. Dependency Manifest Diff
  const dependencies = analyzeDependencyManifests(gitDiff);

  // 4. Change Amplification
  const amplification = analyzeChangeAmplification(gitDiff.changedFiles);

  // 5. Structural Duplication
  const duplicationClusters = detectStructuralDuplication(componentGraph.allComponents);

  // 6. Architecture Rules (Layers, Protected Modules, Exceptions)
  const ruleViolations = evaluateArchitectureRules(
    projectRoot,
    gitDiff,
    config,
    componentGraph.allComponents
  );

  // 7. Hardcoded Collection Metadata Detection
  const metadataDuplicates = detectHardcodedCollectionMetadata(
    projectRoot,
    componentGraph.allComponents
  );

  // 8. Dependency Cycles Detection
  const cycles = detectDependencyCycles(projectRoot);

  // 9. Remediation Strategies Evaluation (Repair vs Refactor vs Raze & Rebuild)
  const remediations = evaluateRemediationStrategies({
    subsystem: amplification.primarySubsystem || 'all',
    components: componentGraph.allComponents,
    duplicationClusters,
    amplification,
    cycles,
    ruleViolations
  });

  // Partition into Tier 1 (Facts), Tier 2 (Heuristics), and Rule Findings
  const facts: ActionableFinding[] = [];
  const heuristics: ActionableFinding[] = [];
  const ruleFindings: ActionableFinding[] = [];

  // --- Tier 1: Facts ---
  // A. Component Additions & Deletions
  if (componentGraph.added.length > 0 || componentGraph.deleted.length > 0) {
    facts.push({
      id: 'arch-components-diff',
      title: `Components Delta: +${componentGraph.added.length} added, -${componentGraph.deleted.length} deleted`,
      category: 'architecture',
      severity: 'info',
      score: 100,
      evidenceType: 'fact',
      description: `Discovered ${componentGraph.added.length} newly added component(s) and ${componentGraph.deleted.length} deleted component(s).`,
      details: [
        {
          added: componentGraph.added.map((c) => ({ path: c.relativePath, fanIn: c.fanIn })),
          deleted: componentGraph.deleted.map((c) => c.relativePath)
        }
      ]
    });
  }

  // B. Counterexamples: Modular Abstractions
  if (componentGraph.modularAbstractions.length > 0) {
    facts.push({
      id: 'arch-modular-abstractions',
      title: `Modular Abstraction: ${componentGraph.modularAbstractions.length} reusable component(s) extracted`,
      category: 'architecture',
      severity: 'info',
      score: 100,
      evidenceType: 'fact',
      description: `Newly added components with high reuse (fan-in >= 2): ${componentGraph.modularAbstractions.map((c) => `${c.relativePath} (${c.fanIn} consumers)`).join(', ')}. This improves modularity and maintainability.`,
      details: componentGraph.modularAbstractions.map((c) => ({
        component: c.relativePath,
        fanIn: c.fanIn,
        consumers: c.consumers
      }))
    });
  }

  // C. Dependency Manifest Changes
  if (dependencies.length > 0) {
    facts.push({
      id: 'arch-dependency-manifest-diff',
      title: `Manifest Changes: ${dependencies.length} package dependency change(s)`,
      category: 'architecture',
      severity: 'info',
      score: 100,
      evidenceType: 'fact',
      description: `Dependencies modified in package.json: ${dependencies.map((d) => `${d.name} (${d.changeType}: ${d.currentVersion || d.baselineVersion})`).join(', ')}.`,
      details: dependencies
    });
  }

  // D. Dependency Cycles Fact
  if (cycles.length > 0) {
    heuristics.push({
      id: 'arch-dependency-cycles',
      title: `Dependency Cycles Detected: ${cycles.length} cycle(s)`,
      category: 'architecture',
      severity: 'warning',
      score: 60,
      evidenceType: 'fact',
      description: `Circular module dependencies detected: ${cycles.map((c) => c.description).join(' | ')}. Circular dependencies prevent tree-shaking and complicate refactoring.`,
      element: cycles[0].path[0],
      details: cycles
    });
  }

  // E. Orphaned Code Facts
  if (componentGraph.newOrphaned.length > 0) {
    facts.push({
      id: 'arch-new-orphaned-components',
      title: `Orphaned Code: ${componentGraph.newOrphaned.length} new unreferenced component(s)`,
      category: 'architecture',
      severity: 'warning',
      score: 70,
      evidenceType: 'fact',
      description: `Newly authored components have 0 consumers across the repository and are not entrypoints: ${componentGraph.newOrphaned.map((c) => c.relativePath).join(', ')}.`,
      element: componentGraph.newOrphaned.map((c) => c.relativePath).join(', '),
      details: componentGraph.newOrphaned
    });
  }

  const existingOrphaned = componentGraph.orphaned.filter((c) => !c.isNew);
  if (existingOrphaned.length > 0) {
    facts.push({
      id: 'arch-orphaned-components',
      title: `Orphaned Code: ${existingOrphaned.length} unreferenced component(s)`,
      category: 'architecture',
      severity: 'info',
      score: 85,
      evidenceType: 'fact',
      description: `Repository contains unreferenced components with 0 consumers: ${existingOrphaned.slice(0, 5).map((c) => c.relativePath).join(', ')}${existingOrphaned.length > 5 ? '...' : ''}.`,
      details: existingOrphaned
    });
  }

  // --- Tier 2: Heuristics & Budget Enforcements ---
  // A. Structural Duplication
  for (const cluster of duplicationClusters) {
    heuristics.push({
      id: 'arch-structural-duplication',
      title: `Potential Structural Duplication (${cluster.components.length} components)`,
      category: 'architecture',
      severity: 'warning',
      score: 80,
      evidenceType: 'heuristic',
      description: cluster.suggestion,
      explanation: `Shared Skeleton: <${cluster.sharedSkeleton}>`,
      element: cluster.components.join(', '),
      details: [cluster]
    });
  }

  // B. Change Amplification
  if (amplification.totalChangedFiles >= 4 && amplification.dispersionRatio > 0.25) {
    heuristics.push({
      id: 'arch-change-amplification',
      title: `Change Amplification (${Math.round(amplification.dispersionRatio * 100)}% dispersion outside primary area)`,
      category: 'architecture',
      severity: 'warning',
      score: 80,
      evidenceType: 'heuristic',
      description: `Changes centered around '${amplification.primarySubsystem}', but ${amplification.outOfScopeFiles.length} file(s) across other subsystems were also modified.`,
      explanation: `Out of scope files: ${amplification.outOfScopeFiles.slice(0, 5).join(', ')}${amplification.outOfScopeFiles.length > 5 ? '...' : ''}`,
      details: [amplification]
    });
  }

  // C. Hardcoded Collection Metadata Duplicates
  for (const dup of metadataDuplicates) {
    heuristics.push({
      id: 'arch-hardcoded-metadata',
      title: `Hardcoded collection metadata duplicated in ${dup.file}`,
      category: 'architecture',
      severity: 'warning',
      score: 85,
      evidenceType: 'heuristic',
      description: `String literal "${dup.literalValue}" duplicates '${dup.fieldName}' from ${dup.collectionFile}.`,
      explanation: `Consider deriving this value from the content collection schema or passing it as a component property.`,
      element: `${dup.file}:${dup.line}`,
      details: [dup]
    });
  }

  // D. Architecture Budgets (Advisory warnings)
  if (config.budgets) {
    const budgets = config.budgets;
    if (budgets.singleUseComponentGrowth && componentGraph.singleUse.length >= budgets.singleUseComponentGrowth.warningThreshold) {
      heuristics.push({
        id: 'arch-budget-single-use-growth',
        title: `Architecture Budget Exceeded: Single-Use Components (+${componentGraph.singleUse.length})`,
        category: 'architecture',
        severity: 'warning',
        score: 75,
        evidenceType: 'heuristic',
        description: `Single-use component count (${componentGraph.singleUse.length}) exceeds configured advisory budget threshold of ${budgets.singleUseComponentGrowth.warningThreshold}.`,
        explanation: 'Review newly authored components to verify whether they represent true domain boundaries or could be parameterized.'
      });
    }

    if (budgets.duplicationGrowth && duplicationClusters.length >= budgets.duplicationGrowth.warningThreshold) {
      heuristics.push({
        id: 'arch-budget-duplication-growth',
        title: `Architecture Budget Exceeded: Structural Duplication Clusters (${duplicationClusters.length})`,
        category: 'architecture',
        severity: 'warning',
        score: 75,
        evidenceType: 'heuristic',
        description: `Duplication cluster count (${duplicationClusters.length}) exceeds advisory budget threshold of ${budgets.duplicationGrowth.warningThreshold}.`
      });
    }

    if (budgets.dependencyCycleGrowth && cycles.length > budgets.dependencyCycleGrowth.warningThreshold) {
      heuristics.push({
        id: 'arch-budget-cycle-growth',
        title: `Architecture Budget Exceeded: Dependency Cycles (${cycles.length})`,
        category: 'architecture',
        severity: 'warning',
        score: 65,
        evidenceType: 'heuristic',
        description: `Cycle count (${cycles.length}) exceeds advisory budget of ${budgets.dependencyCycleGrowth.warningThreshold}.`
      });
    }

    if (budgets.dispersionGrowth && amplification.dispersionRatio > budgets.dispersionGrowth.warningThreshold) {
      heuristics.push({
        id: 'arch-budget-dispersion-growth',
        title: `Architecture Budget Exceeded: Subsystem Dispersion (${Math.round(amplification.dispersionRatio * 100)}%)`,
        category: 'architecture',
        severity: 'warning',
        score: 75,
        evidenceType: 'heuristic',
        description: `Dispersion ratio (${amplification.dispersionRatio}) exceeds advisory budget of ${budgets.dispersionGrowth.warningThreshold}.`
      });
    }

    if (budgets.orphanedCodeGrowth && componentGraph.newOrphaned.length >= budgets.orphanedCodeGrowth.warningThreshold) {
      heuristics.push({
        id: 'arch-budget-orphaned-growth',
        title: `Architecture Budget Exceeded: Orphaned Code (+${componentGraph.newOrphaned.length})`,
        category: 'architecture',
        severity: 'warning',
        score: 70,
        evidenceType: 'heuristic',
        description: `Newly introduced unreferenced component count (${componentGraph.newOrphaned.length}) exceeds advisory budget threshold of ${budgets.orphanedCodeGrowth.warningThreshold}.`,
        explanation: 'Verify whether new components are missing import connections or represent dead code.'
      });
    }
  }

  // --- Tier 3: Advisory Remediation Findings (Section 14) ---
  const remediationFindings = createRemediationFindings(remediations);
  heuristics.push(...remediationFindings);

  // --- Declared Rule Violations (Eligible for Gate Failure) ---
  const ruleFailures = ruleViolations.filter((v) => v.severity === 'failure');
  const ruleWarnings = ruleViolations.filter((v) => v.severity === 'warning');

  for (const v of ruleViolations) {
    ruleFindings.push({
      id: `arch-${v.ruleId}`,
      title: `Architecture Rule Violation: [${v.ruleType}]`,
      category: 'architecture',
      severity: v.severity,
      score: v.severity === 'failure' ? 0 : 75,
      evidenceType: 'fact',
      ruleId: v.ruleId,
      description: v.message,
      element: v.line ? `${v.file}:${v.line}` : v.file,
      details: [v]
    });
  }

  const hasBlockingFailures = ruleFailures.length > 0;
  const ruleScore = hasBlockingFailures ? 0 : 100;

  // Calculate advisory structural health
  let structuralHealth = 100;
  structuralHealth -= duplicationClusters.length * 5;
  structuralHealth -= cycles.length * 10;
  structuralHealth -= componentGraph.newOrphaned.length * 5;
  if (amplification.dispersionRatio > 0.3) structuralHealth -= 10;
  structuralHealth -= metadataDuplicates.length * 3;
  structuralHealth -= ruleWarnings.length * 5;
  structuralHealth = Math.max(20, Math.min(100, structuralHealth));

  // Build Snapshot
  const projectId = getProjectIdentifier(projectRoot);
  const snapshot: ArchitectureSnapshot = {
    schemaVersion: 'aqg.arch.snapshot.v1',
    projectId,
    commitSha: gitDiff.currentRef,
    timestamp: new Date().toISOString(),
    analyserVersion: '1.0.0',
    configFingerprint: computeConfigFingerprint(config),
    baselineRef: gitDiff.baselineRef,
    metrics: {
      componentsTotal: componentGraph.allComponents.length,
      componentsAdded: componentGraph.added.length,
      componentsDeleted: componentGraph.deleted.length,
      singleUseComponents: componentGraph.singleUse.length,
      modularAbstractions: componentGraph.modularAbstractions.length,
      orphanedComponents: componentGraph.orphaned.length,
      structuralDuplicationRatio: duplicationClusters.length > 0 ? 0.85 : 0,
      dependencyCycles: cycles.length,
      dispersionRatio: amplification.dispersionRatio,
      ruleViolations: ruleViolations.length
    },
    evidenceSummary: {
      addedComponents: componentGraph.added.map((c) => c.relativePath),
      duplicationClustersCount: duplicationClusters.length,
      outOfScopeFilesCount: amplification.outOfScopeFiles.length
    }
  };

  // Longitudinal Trend Analysis
  const history = loadHistoricalSnapshots(projectId);
  const trends = analyzeLongitudinalTrends({
    currentSnapshot: snapshot,
    history,
    observationWindow: config.historyWindow || 10
  });

  return {
    baselineRef: gitDiff.baselineRef,
    currentRef: gitDiff.currentRef,
    components: {
      added: componentGraph.added,
      deleted: componentGraph.deleted,
      modified: componentGraph.modified,
      modularAbstractions: componentGraph.modularAbstractions,
      singleUse: componentGraph.singleUse,
      orphaned: componentGraph.orphaned,
      newOrphaned: componentGraph.newOrphaned
    },
    dependencies,
    amplification,
    duplicationClusters,
    cycles,
    ruleViolations,
    metadataDuplicates,
    remediations,
    snapshot,
    trends,
    facts,
    heuristics,
    ruleFindings,
    score: {
      ruleScore,
      structuralHealth
    }
  };
}
