import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { runArchitectureAnalysis } from '../dist/providers/architecture/analyser.js';
import { ArchitectureHealthProvider } from '../dist/providers/architecture/provider.js';
import { PolicyEngine } from '../dist/policy/engine.js';
import { DEFAULT_THRESHOLDS } from '../dist/config.js';
import { printTerminalReport } from '../dist/reporting/terminal.js';
import { createMarkdownReport } from '../dist/reporting/markdown.js';

describe('Architecture Health Provider — finneh.xyz Case Study & Structural Analyser', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-arch-fixture-'));

    // Initialize a git repo for delta measurement
    execSync('git init', { cwd: fixtureDir, stdio: 'ignore' });
    execSync('git config user.name "Tester"', { cwd: fixtureDir, stdio: 'ignore' });
    execSync('git config user.email "tester@example.com"', { cwd: fixtureDir, stdio: 'ignore' });

    // 1. Initial Baseline Commit (before visual proliferation)
    fs.mkdirSync(path.join(fixtureDir, 'src/content/work'), { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, 'src/pages'), { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, 'src/styles'), { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, 'src/components/case'), { recursive: true });

    // package.json at baseline
    fs.writeFileSync(
      path.join(fixtureDir, 'package.json'),
      JSON.stringify(
        {
          name: 'finnehxyz-case-fixture',
          version: '1.0.0',
          dependencies: {
            astro: '^7.0.0',
            '@astrojs/mdx': '^8.0.0'
          },
          devDependencies: {
            typescript: '^5.0.0'
          }
        },
        null,
        2
      )
    );

    // Baseline content files
    fs.writeFileSync(
      path.join(fixtureDir, 'src/content/work/transport.mdx'),
      `---
title: "Transport Inequality Engine"
summary: "GTFS analysis and access scoring"
order: 1
---

## Initial Transport case study
`
    );

    fs.writeFileSync(
      path.join(fixtureDir, 'src/content/work/signal.mdx'),
      `---
title: "Signal Editorial Engine"
summary: "Publication path with visible failure"
order: 2
---

## Initial Signal case study
`
    );

    fs.writeFileSync(
      path.join(fixtureDir, 'src/styles/global.css'),
      `:root { --color-bg: #fff; }`
    );

    fs.writeFileSync(
      path.join(fixtureDir, 'src/pages/index.astro'),
      `---
---
<html><body>Home</body></html>`
    );

    execSync('git add .', { cwd: fixtureDir, stdio: 'ignore' });
    execSync('git commit -m "chore: baseline commit before visual system"', { cwd: fixtureDir, stdio: 'ignore' });

    // 2. Feature Implementation (Phase 2 Case Study Visual System):
    // Add shared modular primitives (CaseFigure, ComparisonGrid, FlowDiagram)
    fs.writeFileSync(
      path.join(fixtureDir, 'src/components/case/CaseFigure.astro'),
      `---
const { eyebrow, title, caption } = Astro.props;
---
<figure class="case-figure">
  <figcaption>{title}</figcaption>
  <slot />
</figure>`
    );

    fs.writeFileSync(
      path.join(fixtureDir, 'src/components/case/ComparisonGrid.astro'),
      `---
const { columns } = Astro.props;
---
<div class="comparison-grid">
  {columns && columns.map(c => <div>{c.title}</div>)}
</div>`
    );

    fs.writeFileSync(
      path.join(fixtureDir, 'src/components/case/FlowDiagram.astro'),
      `---
const { steps } = Astro.props;
---
<ol class="flow-diagram">
  {steps && steps.map(s => <li>{s}</li>)}
</ol>`
    );

    // Add single-use bespoke components with structural duplication
    fs.writeFileSync(
      path.join(fixtureDir, 'src/components/case/AometryBoundary.astro'),
      `---
import CaseFigure from "./CaseFigure.astro";
import ComparisonGrid from "./ComparisonGrid.astro";
const columns = [{ title: "Core" }, { title: "Modules" }];
---
<CaseFigure eyebrow="Aometry" title="Platform">
  <ComparisonGrid columns={columns} />
</CaseFigure>`
    );

    fs.writeFileSync(
      path.join(fixtureDir, 'src/components/case/UndergroundBoundary.astro'),
      `---
import CaseFigure from "./CaseFigure.astro";
import ComparisonGrid from "./ComparisonGrid.astro";
const columns = [{ title: "Library" }, { title: "Theme" }];
---
<CaseFigure eyebrow="Underground" title="CRM">
  <ComparisonGrid columns={columns} />
</CaseFigure>`
    );

    // Component with hardcoded collection metadata
    fs.writeFileSync(
      path.join(fixtureDir, 'src/components/case/TransportAccessModel.astro'),
      `---
import CaseFigure from "./CaseFigure.astro";
---
<CaseFigure title="Transport Inequality Engine">
  <p>Static GTFS coverage visual</p>
</CaseFigure>`
    );

    // Update MDX consumers to establish fan-in
    fs.writeFileSync(
      path.join(fixtureDir, 'src/content/work/transport.mdx'),
      `---
title: "Transport Inequality Engine"
summary: "GTFS analysis and access scoring"
order: 1
---
import CaseFigure from "../../components/case/CaseFigure.astro";
import FlowDiagram from "../../components/case/FlowDiagram.astro";
import TransportAccessModel from "../../components/case/TransportAccessModel.astro";

<CaseFigure title="Overview" />
<FlowDiagram />
<TransportAccessModel />`
    );

    fs.writeFileSync(
      path.join(fixtureDir, 'src/content/work/signal.mdx'),
      `---
title: "Signal Editorial Engine"
summary: "Publication path with visible failure"
order: 2
---
import CaseFigure from "../../components/case/CaseFigure.astro";
import FlowDiagram from "../../components/case/FlowDiagram.astro";

<CaseFigure title="Signal publication" />
<FlowDiagram />`
    );

    // Add consumers for single-use components
    fs.writeFileSync(
      path.join(fixtureDir, 'src/content/work/aometry.mdx'),
      `---
title: "Aometry"
---
import AometryBoundary from "../../components/case/AometryBoundary.astro";
<AometryBoundary />`
    );

    fs.writeFileSync(
      path.join(fixtureDir, 'src/content/work/underground.mdx'),
      `---
title: "Underground"
---
import UndergroundBoundary from "../../components/case/UndergroundBoundary.astro";
<UndergroundBoundary />`
    );

    // Change Amplification: touch unrelated files in other subsystems
    fs.writeFileSync(path.join(fixtureDir, 'src/pages/403.astro'), '<html><body>403</body></html>');
    fs.writeFileSync(path.join(fixtureDir, 'src/pages/resume.astro'), '<html><body>Resume</body></html>');
    fs.writeFileSync(path.join(fixtureDir, 'src/styles/global.css'), ':root { --color-bg: #000; --padding: 10px; }');

    // Dependency update in package.json
    fs.writeFileSync(
      path.join(fixtureDir, 'package.json'),
      JSON.stringify(
        {
          name: 'finnehxyz-case-fixture',
          version: '1.0.0',
          dependencies: {
            astro: '^7.4.7',
            '@astrojs/mdx': '^8.1.3',
            tailwindcss: '^4.0.0'
          },
          devDependencies: {
            typescript: '^6.0.0'
          }
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  test('identifies component delta and distinguishes modular abstractions from single-use proliferation', () => {
    const result = runArchitectureAnalysis(fixtureDir);

    // 1. Observed facts: newly added components
    assert.ok(result.components.added.length >= 5);
    const addedNames = result.components.added.map((c) => path.basename(c.relativePath));
    assert.ok(addedNames.includes('CaseFigure.astro'));
    assert.ok(addedNames.includes('ComparisonGrid.astro'));
    assert.ok(addedNames.includes('AometryBoundary.astro'));

    // 2. Modularity counterexample: CaseFigure and FlowDiagram have fan-in >= 2
    const modularNames = result.components.modularAbstractions.map((c) => path.basename(c.relativePath));
    assert.ok(
      modularNames.includes('CaseFigure.astro'),
      'CaseFigure is recognized as a reusable modular abstraction (fanIn >= 2)'
    );
    assert.ok(
      modularNames.includes('ComparisonGrid.astro'),
      'ComparisonGrid is recognized as a reusable modular abstraction'
    );

    // 3. Single-use components are identified without failing the build
    const singleUseNames = result.components.singleUse.map((c) => path.basename(c.relativePath));
    assert.ok(singleUseNames.includes('AometryBoundary.astro'));
    assert.ok(singleUseNames.includes('UndergroundBoundary.astro'));

    // Verify facts finding is emitted
    const factFinding = result.facts.find((f) => f.id === 'arch-modular-abstractions');
    assert.ok(factFinding, 'Emits factual finding highlighting modular abstraction');
  });

  test('detects structural duplication between repetitive component templates', () => {
    const result = runArchitectureAnalysis(fixtureDir);

    assert.ok(result.duplicationClusters.length > 0, 'Detects structural duplication');
    const cluster = result.duplicationClusters[0];

    const clusterFiles = cluster.components.map((c) => path.basename(c));
    assert.ok(clusterFiles.includes('AometryBoundary.astro'));
    assert.ok(clusterFiles.includes('UndergroundBoundary.astro'));
    assert.ok(cluster.similarity >= 0.85);

    // Heuristic finding emitted
    const dupFinding = result.heuristics.find((h) => h.id === 'arch-structural-duplication');
    assert.ok(dupFinding);
    assert.equal(dupFinding.severity, 'warning');
    assert.equal(dupFinding.evidenceType, 'heuristic');
  });

  test('detects change amplification across disparate subsystems', () => {
    const result = runArchitectureAnalysis(fixtureDir);

    assert.ok(result.amplification.totalChangedFiles >= 5);
    assert.ok(result.amplification.outOfScopeFiles.length > 0);
    assert.ok(result.amplification.dispersionRatio > 0.2);

    const ampFinding = result.heuristics.find((h) => h.id === 'arch-change-amplification');
    assert.ok(ampFinding, 'Emits change amplification heuristic finding');
    assert.equal(ampFinding.severity, 'warning');
  });

  test('detects hardcoded values duplicating content collection metadata', () => {
    const result = runArchitectureAnalysis(fixtureDir);

    assert.ok(result.metadataDuplicates.length > 0);
    const match = result.metadataDuplicates.find((m) => m.literalValue === 'Transport Inequality Engine');
    assert.ok(match, 'Finds hardcoded title duplicating collection metadata');
    assert.equal(path.basename(match.file), 'TransportAccessModel.astro');

    const metaFinding = result.heuristics.find((h) => h.id === 'arch-hardcoded-metadata');
    assert.ok(metaFinding);
    assert.equal(metaFinding.severity, 'warning');
  });

  test('detects package dependency manifest changes', () => {
    const result = runArchitectureAnalysis(fixtureDir);

    assert.ok(result.dependencies.length > 0);
    const addedTailwind = result.dependencies.find((d) => d.name === 'tailwindcss');
    assert.ok(addedTailwind);
    assert.equal(addedTailwind.changeType, 'added');

    const upgradedAstro = result.dependencies.find((d) => d.name === 'astro');
    assert.ok(upgradedAstro);
    assert.equal(upgradedAstro.changeType, 'changed');
  });

  test('enforces declared architecture rules: layer boundaries and protected modules', () => {
    // 1. Violate layer boundary: have a component import from src/pages
    fs.writeFileSync(
      path.join(fixtureDir, 'src/components/case/InvalidBoundary.astro'),
      `---
import Home from "../../pages/index.astro";
---
<div>Invalid</div>`
    );

    const archConfig = {
      layers: [
        {
          name: 'pages',
          pattern: 'src/pages/**',
          allowedDependencies: ['components', 'styles']
        },
        {
          name: 'components',
          pattern: 'src/components/**',
          forbiddenDependencies: ['pages'] // Components cannot import from pages
        }
      ],
      protectedModules: ['src/styles/global.css']
    };

    const result = runArchitectureAnalysis(fixtureDir, archConfig);

    // Two rule violations:
    // 1. InvalidBoundary imports from pages (layer-boundary)
    // 2. src/styles/global.css was modified (protected-module)
    assert.ok(result.ruleViolations.length >= 2);

    const layerViolation = result.ruleViolations.find((v) => v.ruleType === 'layer-boundary');
    assert.ok(layerViolation);
    assert.equal(layerViolation.severity, 'failure');

    const protectedViolation = result.ruleViolations.find((v) => v.ruleType === 'protected-module');
    assert.ok(protectedViolation);
    assert.equal(protectedViolation.severity, 'failure');
    assert.equal(result.score.ruleScore, 0);
  });

  test('honours explicit exceptions with rationale for architecture rules', () => {
    fs.writeFileSync(
      path.join(fixtureDir, 'src/components/case/PermittedException.astro'),
      `---
import Home from "../../pages/index.astro";
---
<div>Permitted</div>`
    );

    const archConfig = {
      layers: [
        {
          name: 'components',
          pattern: 'src/components/**',
          forbiddenDependencies: ['pages']
        }
      ],
      protectedModules: ['src/styles/global.css'],
      exceptions: [
        {
          ruleId: 'protected-module',
          target: 'src/styles/global.css',
          reason: 'Brand palette update for Phase 2 visual release'
        },
        {
          ruleId: 'layer-boundary',
          target: 'src/components/case/PermittedException.astro',
          reason: 'Legacy bridge during component migration'
        }
      ]
    };

    const result = runArchitectureAnalysis(fixtureDir, archConfig);
    const failures = result.ruleViolations.filter((v) => v.severity === 'failure');
    assert.equal(failures.length, 0, 'No blocking failures when exceptions with rationale are declared');
    assert.equal(result.score.ruleScore, 100);
  });

  test('Quality Gate Integration: Passes when no declared rules are violated despite heuristics and proliferation', async () => {
    const provider = new ArchitectureHealthProvider();
    const mockContext = {
      projectRoot: fixtureDir,
      baseUrl: '',
      chrome: { port: 0, kill: async () => {} },
      tempDir: os.tmpdir(),
      auth: { headers: {}, cookies: [] },
      env: {},
      timeouts: { serverStartMs: 5000, auditTimeoutMs: 5000 }
    };

    const target = { route: '__architecture__', profiles: ['desktop'], runs: 1 };
    const observations = await provider.execute(target, mockContext);

    assert.equal(observations.length, 1);
    const obs = observations[0];
    assert.equal(obs.providerId, 'architecture-health');
    assert.equal(obs.metrics['architecture-rules'], 100);

    // Evaluate in Policy Engine
    const policyEngine = new PolicyEngine({
      thresholds: DEFAULT_THRESHOLDS,
      allowedExclusions: []
    });

    const evalResult = policyEngine.evaluate(observations);
    // Even though 20 components were added and duplication was detected,
    // the build DOES NOT fail because no declared rules were violated!
    assert.equal(evalResult.passed, true);
    assert.notEqual(evalResult.status, 'threshold_failure');
  });

  test('generates evidence-backed terminal and markdown reports', () => {
    const result = runArchitectureAnalysis(fixtureDir);
    const allFindings = [...result.ruleFindings, ...result.heuristics, ...result.facts];

    const mockNormalized = {
      schemaVersion: 'aqg.result.v1',
      timestamp: new Date().toISOString(),
      projectId: 'test-project',
      projectName: 'finnehxyz-case-fixture',
      projectRoot: fixtureDir,
      status: 'passed',
      plan: {
        projectId: 'test',
        projectName: 'test',
        projectRoot: fixtureDir,
        projectType: 'astro',
        isWeb: true,
        targets: [{ route: '__architecture__', profiles: ['desktop'], runs: 1 }],
        applicableProviders: ['architecture-health']
      },
      observations: [],
      findings: allFindings,
      topIssues: [],
      reportPaths: { jsonPath: '/tmp/report.json' },
      environment: { nodeVersion: process.version, platform: process.platform }
    };

    const markdown = createMarkdownReport(mockNormalized);
    assert.ok(markdown.includes('## Architecture Health & Structural Delta'));
    assert.ok(markdown.includes('FACT'));
    assert.ok(markdown.includes('HEURISTIC'));
    assert.ok(markdown.includes('Components Delta'));

    // Verify terminal reporter runs without crashing
    let stdoutBuffer = '';
    const origLog = console.log;
    console.log = (msg) => { stdoutBuffer += (msg || '') + '\n'; };
    try {
      printTerminalReport(mockNormalized);
    } finally {
      console.log = origLog;
    }

    assert.ok(stdoutBuffer.includes('Architecture Health & Structural Delta'));
    assert.ok(stdoutBuffer.includes('[FACT]'));
    assert.ok(stdoutBuffer.includes('[HEURISTIC]'));
  });
});
