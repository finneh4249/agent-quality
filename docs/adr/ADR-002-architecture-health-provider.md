# ADR-002: Architecture Health Provider for Agent Quality Gate

## Status
Accepted

## Context

A recurring failure mode in AI-assisted software development is the **cyclical accumulation of technical debt**: an autonomous agent successfully cleans up existing technical debt or establishes an architectural refactor, and then proceeds to recreate identical structural debt while implementing subsequent feature requests.

During feature implementation, autonomous agents tend to:
1. **Replicate components rather than parameterise or model data**: Creating dozens of single-use components with nearly identical structural templates instead of composing reusable primitives or passing data schemas.
2. **Scatter modifications widely (change amplification)**: Touching files across global layouts, error pages, server headers, and disparate styling files when implementing a localized feature.
3. **Bypass architectural layer boundaries**: Importing from forbidden layers (e.g. UI components importing directly from pages or data stores importing presentation layouts).
4. **Duplicate collection metadata as hardcoded literals**: Hardcoding values into markup that already exist in content collections, database schemas, or central configuration.
5. **Silently inflate dependencies**: Adding heavy or redundant runtime dependencies to package manifests.

### The `finneh.xyz` Real-World Case Study
In the `finneh.xyz` portfolio overhaul (Phase 2 / Human Systems), an autonomous agent was tasked with adding visual explanations to eight case studies. In a single commit (`f12023a`), the agent:
- Created 24 case visual components in `src/components/case/`.
- Concurrently authored 5 genuine reusable primitives (`CaseFigure.astro`, `FlowDiagram.astro`, `ComparisonGrid.astro`, `LayerStack.astro`, `StateTrack.astro`).
- Introduced 19 single-use visual components (e.g., `AometryBoundary.astro`, `UndergroundBoundary.astro`, `TransportPrivacyBoundary.astro`), many of which exhibited near-identical DOM/AST skeletons (e.g. `<CaseFigure><ComparisonGrid columns={columns} /></CaseFigure>`) differing only by hardcoded array contents.
- Modified 87 files spanning global CSS (`src/styles/global.css`), error routes (`src/pages/403.astro`, `src/pages/404.astro`), resume pages, and contact layouts—introducing significant change amplification outside the primary content area.
- Maintained a dedicated acceptance script (`scripts/check-case-visuals.mjs`) verifying figure captions, responsive layouts, and axe-core accessibility.

Traditional linters and test suites passed because the code was syntactically valid, accessible, and fast. However, architectural maintenance cost increased significantly.

A naive quality gate that simply flags "more than 10 components added" or "lines of code increased" would fail genuine modularization (such as extracting `CaseFigure` or `FlowDiagram`). Conversely, ignoring architectural regressions allows AI agents to entrench maintenance debt before it is noticed.

## Decision

We introduce an **Architecture Health Provider** (`architecture-health`) within Agent Quality Gate (AQG) that evaluates structural changes relative to a Git baseline.

### 1. Unified Quality Provider Integration (Seam 1 & 4)
The Architecture Health provider implements the standard AQG `QualityProvider` interface. It produces standard `ProviderObservation` items with metrics, actionable findings, and raw artifacts. It does not introduce a parallel quality or reporting silo.

To accommodate project-level structural analysis alongside route-level audits (like Lighthouse), the `ProviderCapabilities` contract is extended with:
- `scope: 'project' | 'route'` (defaulting to `'route'`).
- `requiresBrowser: boolean` (Architecture Health is `false`; Lighthouse is `true`).
- `requiresServer: boolean` (Architecture Health is `false`; Lighthouse is `true`).

When only project-level static providers execute, AQG avoids launching headless Chrome or preview servers.

### 2. Relative Git Delta Measurement (Never Arbitrary Absolute Scores)
Architecture quality is measured **relative to a Git baseline** (e.g. working tree diff against `HEAD`, or feature branch against merge-base with `main`), rather than applying opaque, arbitrary absolute cyclomatic complexity thresholds.

By analyzing the delta between the baseline and current revision, the provider answers:
- What structural changes did *this specific task* introduce?
- Did this task expand or contract architectural boundaries?
- Did this task increase or decrease component duplication?

### 3. Three-Tier Epistemic Classification
To prevent hallucinated or subjective quality failures, all evidence is strictly partitioned into three epistemic tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Tier 1: Observed Facts                          │
│   (Objectively verifiable: added/deleted files, import edges, diffs)   │
├────────────────────────────────────────────────────────────────────────┤
│                       Tier 2: Structural Heuristics                    │
│     (Similarity ratios, dispersion metrics, duplication clusters)       │
├────────────────────────────────────────────────────────────────────────┤
│                       Tier 3: Advisory AI Judgements                   │
│         (Optional, non-blocking semantic and intent assessments)       │
└────────────────────────────────────────────────────────────────────────┘
```

- **Tier 1 (Observed Facts)**: Deterministic, verifiable measurements:
  - Added, deleted, and modified components (`.astro`, `.tsx`, `.vue`, etc.).
  - Dependency additions, removals, and upgrades in `package.json`.
  - Component fan-in (number of consumers importing each component).
  - Import graph edges violating declared architecture rules.
- **Tier 2 (Structural Heuristics)**: Algorithmic indicators of potential debt:
  - Structural duplication ratio (>85% matching normalized AST/tag skeleton).
  - Change amplification ratio (dispersion of modified files across distinct subsystems).
  - High proportion of single-use components in a feature directory.
  - Hardcoded string values duplicating derived content collection metadata.
- **Tier 3 (Advisory AI Judgements)**: Optional, transparent explanations generated by language models when configured. AI judgements are strictly advisory and can never fail a build.

### 4. Policy Gating: Only Declared Rules Can Fail the Gate
A fundamental design constraint is that **only objectively verifiable violations of declared project rules can trigger gate failures** (`severity: 'failure'`).

- Adding components, writing code, or triggering structural heuristics produces `warning` or `info` findings.
- Gate failures occur **only** when an explicitly declared architecture rule is breached, including:
  - **Layer boundaries**: An import statement crosses a declared forbidden boundary (e.g., `src/components/` importing from `src/pages/`).
  - **Protected modules**: A protected path (e.g., `src/core/**` or `src/styles/global.css`) was modified without an explicit exception.
  - **Undeclared exceptions**: Exceptions must declare `ruleId`, `target`, and `reason` in project configuration.

### 5. Distinguishing Modularity from Proliferation
The provider calculates component reuse via fan-in analysis:
- **Modular Abstraction (Positive)**: A newly added component imported by 2 or more consumers (e.g., `CaseFigure.astro` imported across 8 case studies). The report highlights this as an architectural improvement.
- **Single-Use Component (Neutral/Observed)**: A newly added component imported by only 1 consumer.
- **Structural Duplication Cluster (Advisory Warning)**: Multiple single-use components sharing >= 85% structural skeleton. The report provides evidence and suggests parameterization.

### 6. Multi-Ecosystem Seam
While the first milestone implements a deterministic analyser for TypeScript/Astro projects, the provider architecture decouples language-specific extraction from rule evaluation and reporting. Future analyzers for Python, Rust, and Go can plug directly into the provider's normalization layer.

## Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Git Working Tree / Delta                        │
│          (Baseline commit vs current tree, porcelain status)           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ files & diffs
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Architecture Health Provider                         │
│                                                                        │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌────────────────┐ │
│  │ Component & Fan-In   │  │  Manifest Diffing   │  │ Amplification  │ │
│  │ (New/Del/Reuse Graph)│  │  (package.json diff)│  │ (Dispersion)   │ │
│  └──────────┬───────────┘  └──────────┬──────────┘  └────────┬───────┘ │
│             │                         │                      │         │
│  ┌──────────┴───────────┐  ┌──────────┴──────────┐  ┌────────┴───────┐ │
│  │ Structural AST Match │  │ Metadata Duplicate  │  │ Rule Engine    │ │
│  │ (Normalized skeleton)│  │ (Collection diff)   │  │ (Layers/Perms) │ │
│  └──────────┬───────────┘  └──────────┬──────────┘  └────────┬───────┘ │
└─────────────┼─────────────────────────┼──────────────────────┼─────────┘
              │                         │                      │
              ▼                         ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Normalised Observation (`providerId`: 'architecture')    │
│           - Facts: Component counts, dependency diffs, fan-in          │
│           - Heuristics: Duplication clusters, amplification ratio      │
│           - Policy Findings: Rule violations [FAIL], Advisories [WARN] │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        AQG Policy Engine & Reports                     │
│               - Terminal Summary & Markdown Reports                    │
│               - Strict rule-based pass/fail evaluation                 │
└────────────────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive
- Autonomous agents receive immediate, actionable feedback on whether their implementation is increasing architectural dispersion or structural duplication.
- Legitimate modular abstractions (extracting reusable components) are celebrated rather than penalized.
- Only verifiable project rules block execution, avoiding false-positive build interruptions.
- Extends AQG's existing contract without introducing parallel infrastructure.

### Negative & Limitations
- Structural AST normalization is syntactic and cannot infer deep semantic equivalence (e.g. two completely different algorithms achieving the same outcome).
- Complex monorepo symlinks or dynamic imports require explicit configuration.
