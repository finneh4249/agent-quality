import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { runArchitectureAnalysis } from '../dist/providers/architecture/analyser.js';
import { detectDependencyCycles } from '../dist/providers/architecture/cycles.js';
import { evaluateRemediationStrategies } from '../dist/providers/architecture/remediation.js';
import {
  analyzeLongitudinalTrends,
  saveHistoricalSnapshot,
  loadHistoricalSnapshots
} from '../dist/providers/architecture/history.js';
import { runQualityAudit } from '../dist/engine.js';

describe('AQG Self-Governance & 10 Architectural Scenarios Suite', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-governance-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Tester"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "tester@example.com"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 1: Previous audit-plan initialization failure
  test('Scenario 1: Audit-plan initialization succeeds without reference error', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-scenario-1' }));
    const result = await runQualityAudit({ projectRoot: tmpDir });
    assert.ok(result.plan);
    assert.equal(result.plan.projectName, path.basename(tmpDir));
    assert.equal(result.status, 'passed');
  });

  // Scenario 2: Clean, modular implementation
  test('Scenario 2: Clean, modular implementation recognized with high reuse and no violations', () => {
    fs.mkdirSync(path.join(tmpDir, 'src/components/ui'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src/pages'), { recursive: true });

    // Base commit
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'modular-app' }));
    fs.writeFileSync(path.join(tmpDir, 'src/pages/page1.astro'), '<div>Page 1</div>');
    fs.writeFileSync(path.join(tmpDir, 'src/pages/page2.astro'), '<div>Page 2</div>');
    execSync('git add . && git commit -m "chore: base"', { cwd: tmpDir, stdio: 'ignore' });

    // Add modular abstraction
    fs.writeFileSync(
      path.join(tmpDir, 'src/components/ui/Button.astro'),
      '---\nconst { label } = Astro.props;\n---\n<button>{label}</button>'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src/pages/page1.astro'),
      '---\nimport Button from "../components/ui/Button.astro";\n---\n<Button label="A" />'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src/pages/page2.astro'),
      '---\nimport Button from "../components/ui/Button.astro";\n---\n<Button label="B" />'
    );

    const result = runArchitectureAnalysis(tmpDir);
    assert.equal(result.components.modularAbstractions.length, 1);
    assert.equal(result.components.modularAbstractions[0].fanIn, 2);
    assert.equal(result.ruleViolations.length, 0);
    assert.equal(result.score.ruleScore, 100);
  });

  // Scenario 3: Unnecessary single-use component proliferation exceeding budget
  test('Scenario 3: Single-use component proliferation triggers advisory budget warning without failing build', () => {
    fs.mkdirSync(path.join(tmpDir, 'src/components/case'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src/pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'sprawl-app' }));
    execSync('git add . && git commit -m "chore: base"', { cwd: tmpDir, stdio: 'ignore' });

    // Add 6 single-use components
    for (let i = 1; i <= 6; i++) {
      fs.writeFileSync(path.join(tmpDir, `src/components/case/Comp${i}.astro`), `<div>Component ${i}</div>`);
      fs.writeFileSync(
        path.join(tmpDir, `src/pages/page${i}.astro`),
        `---\nimport Comp${i} from "../components/case/Comp${i}.astro";\n---\n<Comp${i} />`
      );
    }

    const archConfig = {
      budgets: {
        singleUseComponentGrowth: { warningThreshold: 4 }
      }
    };

    const result = runArchitectureAnalysis(tmpDir, archConfig);
    assert.ok(result.components.singleUse.length >= 6);

    const budgetFinding = result.heuristics.find((h) => h.id === 'arch-budget-single-use-growth');
    assert.ok(budgetFinding, 'Emits single-use growth advisory finding');
    assert.equal(budgetFinding.severity, 'warning');
    // Build does not fail on heuristic budget
    assert.equal(result.score.ruleScore, 100);
  });

  // Scenario 4: Legitimate single-use domain components
  test('Scenario 4: Legitimate single-use domain components with distinct skeletons do not trigger false duplication', () => {
    fs.mkdirSync(path.join(tmpDir, 'src/components/viz'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'viz-app' }));
    execSync('git add . && git commit -m "chore: base"', { cwd: tmpDir, stdio: 'ignore' });

    // Add two completely different visualizations: one SVG canvas, one table ledger
    fs.writeFileSync(
      path.join(tmpDir, 'src/components/viz/SvgMap.astro'),
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/><path d="M10 10"/></svg>'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src/components/viz/MetricsLedger.astro'),
      '<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'
    );

    const result = runArchitectureAnalysis(tmpDir);
    assert.equal(result.duplicationClusters.length, 0, 'No false-positive duplication between distinct domain components');
  });

  // Scenario 5: Structural duplication across multiple commits (Longitudinal drift)
  test('Scenario 5: Longitudinal analysis tracks cumulative duplication across commits', () => {
    const history = [
      {
        schemaVersion: 'aqg.arch.snapshot.v1',
        projectId: 'test-p',
        commitSha: 'c1',
        timestamp: '2026-11-01T00:00:00Z',
        analyserVersion: '1.0.0',
        configFingerprint: 'f1',
        baselineRef: 'c0',
        metrics: {
          componentsTotal: 10,
          componentsAdded: 2,
          componentsDeleted: 0,
          singleUseComponents: 1,
          modularAbstractions: 1,
          structuralDuplicationRatio: 0.1,
          dependencyCycles: 0,
          dispersionRatio: 0.1,
          ruleViolations: 0
        },
        evidenceSummary: { addedComponents: [], duplicationClustersCount: 0, outOfScopeFilesCount: 0 }
      }
    ];

    const currentSnapshot = {
      schemaVersion: 'aqg.arch.snapshot.v1',
      projectId: 'test-p',
      commitSha: 'c2',
      timestamp: '2026-11-02T00:00:00Z',
      analyserVersion: '1.0.0',
      configFingerprint: 'f1',
      baselineRef: 'c1',
      metrics: {
        componentsTotal: 25,
        componentsAdded: 15,
        componentsDeleted: 0,
        singleUseComponents: 14,
        modularAbstractions: 1,
        structuralDuplicationRatio: 0.85,
        dependencyCycles: 2,
        dispersionRatio: 0.45,
        ruleViolations: 0
      },
      evidenceSummary: { addedComponents: [], duplicationClustersCount: 3, outOfScopeFilesCount: 5 }
    };

    const trends = analyzeLongitudinalTrends({
      currentSnapshot,
      history,
      observationWindow: 5
    });

    assert.equal(trends.isComparable, true);
    assert.equal(trends.trends.structuralDuplication.direction, 'degrading');
    assert.equal(trends.trends.dependencyCycles.direction, 'degrading');
    assert.equal(trends.currentChangeContribution.componentsAdded, 15);
    assert.equal(trends.existingDebt.baselineDuplication, 0.1);
  });

  // Scenario 6: Legitimate changes to shared infrastructure with declared exception
  test('Scenario 6: Legitimate changes to protected module pass with declared exception and rationale', () => {
    fs.mkdirSync(path.join(tmpDir, 'src/styles'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'infra-app' }));
    fs.writeFileSync(path.join(tmpDir, 'src/styles/global.css'), 'body { background: white; }');
    execSync('git add . && git commit -m "chore: base"', { cwd: tmpDir, stdio: 'ignore' });

    // Modify protected file
    fs.writeFileSync(path.join(tmpDir, 'src/styles/global.css'), 'body { background: black; }');

    const archConfig = {
      protectedModules: ['src/styles/global.css'],
      exceptions: [
        {
          ruleId: 'protected-module',
          target: 'src/styles/global.css',
          reason: 'Brand theme update approved in RFC-42'
        }
      ]
    };

    const result = runArchitectureAnalysis(tmpDir, archConfig);
    const failures = result.ruleViolations.filter((v) => v.severity === 'failure');
    assert.equal(failures.length, 0);
    assert.equal(result.score.ruleScore, 100);
  });

  // Scenario 7: Real architectural boundary violations
  test('Scenario 7: Forbidden cross-layer import triggers blocking failure', () => {
    fs.mkdirSync(path.join(tmpDir, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src/pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'layer-app' }));
    fs.writeFileSync(path.join(tmpDir, 'src/pages/admin.astro'), '<div>Admin</div>');
    execSync('git add . && git commit -m "chore: base"', { cwd: tmpDir, stdio: 'ignore' });

    // Violate boundary: component imports page
    fs.writeFileSync(
      path.join(tmpDir, 'src/components/Widget.astro'),
      '---\nimport Admin from "../pages/admin.astro";\n---\n<div>Widget</div>'
    );

    const archConfig = {
      layers: [
        {
          name: 'components',
          pattern: 'src/components/**',
          forbiddenDependencies: ['pages']
        },
        {
          name: 'pages',
          pattern: 'src/pages/**'
        }
      ]
    };

    const result = runArchitectureAnalysis(tmpDir, archConfig);
    const failure = result.ruleViolations.find((v) => v.severity === 'failure');
    assert.ok(failure);
    assert.equal(failure.ruleType, 'layer-boundary');
    assert.equal(result.score.ruleScore, 0);
  });

  // Scenario 8: Missing Git history
  test('Scenario 8: Non-git directory falls back gracefully without crashing', () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-nongit-'));
    fs.mkdirSync(path.join(nonGit, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(nonGit, 'package.json'), JSON.stringify({ name: 'nongit-app' }));
    fs.writeFileSync(path.join(nonGit, 'src/components/Card.astro'), '<div>Card</div>');

    const result = runArchitectureAnalysis(nonGit);
    assert.equal(result.baselineRef, 'none');
    assert.equal(result.currentRef, 'working-tree');
    assert.ok(result.components.added.length >= 0);

    fs.rmSync(nonGit, { recursive: true, force: true });
  });

  // Scenario 9: Incompatible historical measurements
  test('Scenario 9: Incompatible historical snapshot triggers explicit comparability warning', () => {
    const history = [
      {
        schemaVersion: 'aqg.arch.snapshot.v1',
        projectId: 'test-p',
        commitSha: 'c0',
        timestamp: '2026-10-01T00:00:00Z',
        analyserVersion: '0.9.0', // Older analyzer version!
        configFingerprint: 'old-fingerprint',
        baselineRef: 'none',
        metrics: {
          componentsTotal: 5,
          componentsAdded: 0,
          componentsDeleted: 0,
          singleUseComponents: 0,
          modularAbstractions: 0,
          structuralDuplicationRatio: 0,
          dependencyCycles: 0,
          dispersionRatio: 0,
          ruleViolations: 0
        },
        evidenceSummary: { addedComponents: [], duplicationClustersCount: 0, outOfScopeFilesCount: 0 }
      }
    ];

    const currentSnapshot = {
      schemaVersion: 'aqg.arch.snapshot.v1',
      projectId: 'test-p',
      commitSha: 'c1',
      timestamp: '2026-11-01T00:00:00Z',
      analyserVersion: '1.0.0',
      configFingerprint: 'new-fingerprint',
      baselineRef: 'c0',
      metrics: {
        componentsTotal: 10,
        componentsAdded: 5,
        componentsDeleted: 0,
        singleUseComponents: 2,
        modularAbstractions: 2,
        structuralDuplicationRatio: 0.1,
        dependencyCycles: 0,
        dispersionRatio: 0.2,
        ruleViolations: 0
      },
      evidenceSummary: { addedComponents: [], duplicationClustersCount: 0, outOfScopeFilesCount: 0 }
    };

    const trends = analyzeLongitudinalTrends({
      currentSnapshot,
      history,
      observationWindow: 5
    });

    assert.equal(trends.isComparable, false);
    assert.ok(trends.comparabilityWarning);
    assert.match(trends.comparabilityWarning, /version mismatch/i);
  });

  // Scenario 10: Provider failures and partial analysis results
  test('Scenario 10: Provider executes and captures observation metrics and raw artifacts without throwing', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'partial-app' }));
    fs.writeFileSync(path.join(tmpDir, 'src/components/A.astro'), '<div>A</div>');
    execSync('git add . && git commit -m "chore: base"', { cwd: tmpDir, stdio: 'ignore' });

    const auditResult = await runQualityAudit({ projectRoot: tmpDir });
    assert.ok(auditResult);
    assert.equal(auditResult.status, 'passed');
    assert.ok(auditResult.observations.length >= 1);
    const archObs = auditResult.observations.find((o) => o.providerId === 'architecture-health');
    assert.ok(archObs);
    assert.ok(archObs.metrics['architecture-rules'] !== undefined);
  });

  // Scenario 11: Architectural Razing & Replacement Recommendations (Section 14)
  test('Scenario 11: Recommends Raze and Rebuild when subsystem exhibits high duplication, cycles, and dispersion', () => {
    const mockComponents = [
      { path: 'src/components/case/A.astro', relativePath: 'src/components/case/A.astro', extension: '.astro', isNew: true, isDeleted: false, isModified: false, fanIn: 1, consumers: ['p1'], isModularAbstraction: false },
      { path: 'src/components/case/B.astro', relativePath: 'src/components/case/B.astro', extension: '.astro', isNew: true, isDeleted: false, isModified: false, fanIn: 1, consumers: ['p2'], isModularAbstraction: false },
      { path: 'src/components/case/C.astro', relativePath: 'src/components/case/C.astro', extension: '.astro', isNew: true, isDeleted: false, isModified: false, fanIn: 1, consumers: ['p3'], isModularAbstraction: false },
      { path: 'src/components/case/D.astro', relativePath: 'src/components/case/D.astro', extension: '.astro', isNew: true, isDeleted: false, isModified: false, fanIn: 1, consumers: ['p4'], isModularAbstraction: false }
    ];

    const mockClusters = [
      {
        similarity: 0.95,
        sharedSkeleton: 'CaseFigure > ComparisonGrid',
        components: ['src/components/case/A.astro', 'src/components/case/B.astro', 'src/components/case/C.astro', 'src/components/case/D.astro'],
        suggestion: 'Consolidate wrapper templates'
      }
    ];

    const mockAmplification = {
      primarySubsystem: 'components:case',
      totalChangedFiles: 10,
      outOfScopeFiles: ['src/styles/global.css', 'src/pages/403.astro', 'src/pages/resume.astro', 'public/_headers'],
      dispersionRatio: 0.4,
      subsystemBreakdown: { 'components:case': 6, styles: 1, pages: 2, public: 1 }
    };

    const mockCycles = [
      { path: ['src/components/case/A.astro', 'src/components/case/B.astro', 'src/components/case/A.astro'], description: 'A → B → A' }
    ];

    const recs = evaluateRemediationStrategies({
      subsystem: 'components:case',
      components: mockComponents,
      duplicationClusters: mockClusters,
      amplification: mockAmplification,
      cycles: mockCycles,
      ruleViolations: []
    });

    assert.equal(recs.length, 1);
    const rec = recs[0];
    assert.equal(rec.strategy, 'raze_and_rebuild');
    assert.match(rec.why, /structural exhaustion/i);
    assert.ok(rec.whatShouldSurvive.length >= 2);
    assert.ok(rec.whatShouldDisappear.length >= 2);
    assert.ok(rec.risks.length >= 1);
    assert.match(rec.replacementStrategy, /Parallel replacement/i);
  });

  // Scenario 12: Orphaned code detection & entrypoint protection
  test('Scenario 12: Detects unreferenced / orphaned code while preserving routed entrypoints', () => {
    fs.mkdirSync(path.join(tmpDir, 'src/components/orphan'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src/pages'), { recursive: true });

    // Base commit
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'orphan-test' }));
    fs.writeFileSync(path.join(tmpDir, 'src/pages/index.astro'), '<div>Home Page Entrypoint</div>');
    execSync('git add . && git commit -m "chore: base"', { cwd: tmpDir, stdio: 'ignore' });

    // Add orphaned component that is never imported
    fs.writeFileSync(
      path.join(tmpDir, 'src/components/orphan/ForgottenCard.astro'),
      '<div>Forgotten Card</div>'
    );
    // Add another routed page (should be recognized as entrypoint, not orphan)
    fs.writeFileSync(
      path.join(tmpDir, 'src/pages/about.astro'),
      '<div>About Page Entrypoint</div>'
    );

    const result = runArchitectureAnalysis(tmpDir, {
      budgets: {
        orphanedCodeGrowth: { warningThreshold: 1 }
      }
    });

    // 1. ForgottenCard is orphaned
    assert.equal(result.components.orphaned.length, 1);
    assert.equal(result.components.newOrphaned.length, 1);
    assert.equal(result.components.newOrphaned[0].relativePath, 'src/components/orphan/ForgottenCard.astro');
    assert.equal(result.components.newOrphaned[0].isOrphaned, true);

    // 2. Fact finding emitted
    const orphanFact = result.facts.find((f) => f.id === 'arch-new-orphaned-components');
    assert.ok(orphanFact);
    assert.match(orphanFact.description, /ForgottenCard\.astro/);
    assert.equal(orphanFact.severity, 'warning');

    // 3. Budget heuristic finding emitted
    const budgetFinding = result.heuristics.find((f) => f.id === 'arch-budget-orphaned-growth');
    assert.ok(budgetFinding);

    // 4. Snapshot tracks orphaned components
    assert.equal(result.snapshot.metrics.orphanedComponents, 1);

    // 5. Entrypoints (pages/index.astro and pages/about.astro) are NOT orphaned
    const indexComp = result.components.added.find((c) => c.relativePath === 'src/pages/about.astro');
    assert.ok(indexComp);
    assert.equal(indexComp.isOrphaned, false);
  });
});
