import { ActionableFinding, ArchitectureConfig } from '../../types.js';
import { resolveGitDiffState } from './git-diff.js';
import { buildComponentGraph } from './component-graph.js';
import { analyzeDependencyManifests } from './manifest.js';
import { analyzeChangeAmplification } from './amplification.js';
import { detectStructuralDuplication } from './structural-duplication.js';
import { evaluateArchitectureRules } from './import-rules.js';
import { detectHardcodedCollectionMetadata } from './metadata-detector.js';
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

  // --- Tier 2: Heuristics ---
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
  if (amplification.dispersionRatio > 0.3) structuralHealth -= 10;
  structuralHealth -= metadataDuplicates.length * 3;
  structuralHealth -= ruleWarnings.length * 5;
  structuralHealth = Math.max(20, Math.min(100, structuralHealth));

  return {
    baselineRef: gitDiff.baselineRef,
    currentRef: gitDiff.currentRef,
    components: {
      added: componentGraph.added,
      deleted: componentGraph.deleted,
      modified: componentGraph.modified,
      modularAbstractions: componentGraph.modularAbstractions,
      singleUse: componentGraph.singleUse
    },
    dependencies,
    amplification,
    duplicationClusters,
    ruleViolations,
    metadataDuplicates,
    facts,
    heuristics,
    ruleFindings,
    score: {
      ruleScore,
      structuralHealth
    }
  };
}
