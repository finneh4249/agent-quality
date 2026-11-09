# Architecture Health Provider (`architecture-health`)

An architectural change and structural health provider for **Agent Quality Gate (AQG)** that prevents the recurring failure in AI-assisted development where an agent removes technical debt, only to recreate it while implementing subsequent features.

---

## 1. Motivation: The AI Debt Recreation Cycle

Autonomous coding agents (e.g. Claude Code, Gemini CLI, OpenCode, Codex) excel at refactoring code and completing feature requests. However, when instructed to implement multi-page features or design systems, agents consistently exhibit a common set of structural antipatterns:

1. **Proliferation of Single-Use Components**: Rather than composing reusable primitives or driving views with data, agents write dozens of bespoke, one-off component files.
2. **Structural Duplication**: Components differ only by hardcoded string literals or column arrays, sharing 90%+ identical AST/DOM templates.
3. **Change Amplification**: A localized feature request forces modifications to global layouts, error routes, build scripts, and style sheets.
4. **Bypassing Architectural Boundaries**: Components import directly from forbidden layers (e.g. UI widgets importing from pages, or core engines importing view templates).
5. **Hardcoding Derived Metadata**: Repeating titles, dates, or tags in component code that already exist in content collections or data models.

### Real-World Case Study: `finneh.xyz`
During the Phase 2 visual system overhaul in `finneh.xyz` (commit `f12023a`):
- **24 visual components** were added to `src/components/case/`.
- Concurrently, **5 genuine modular abstractions** were authored (`CaseFigure.astro`, `ComparisonGrid.astro`, `FlowDiagram.astro`, `LayerStack.astro`, `StateTrack.astro`).
- However, 19 single-use wrapper components were created (such as `AometryBoundary.astro` and `UndergroundBoundary.astro`), which exhibited identical `<CaseFigure><ComparisonGrid /></CaseFigure>` skeletons.
- Changes amplified across **87 files**, including error templates (`src/pages/403.astro`), global styling (`src/styles/global.css`), and resume routes.
- Linters and tests were green because the code was syntactically valid and passed accessibility gates, yet structural maintenance costs increased significantly.

A naive gate that penalises "lines of code" or "number of files added" would incorrectly fail the extraction of reusable abstractions. AQG's Architecture Health provider solves this by measuring architectural change **relative to a Git baseline** and distinguishing **facts**, **heuristics**, and **declared rule violations**.

---

## 2. Three-Tier Epistemic Classification

To prevent subjective, flaky, or hallucinated quality failures, AQG categorizes all findings into three strict epistemic tiers:

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

| Tier | Category | Verifiability | Policy Impact | Examples |
|---|---|---|---|---|
| **Tier 1** | **Observed Facts** | Mathematical / AST deterministic | Info / Facts | Added/deleted components, fan-in reuse count, dependency manifest diff. |
| **Tier 2** | **Structural Heuristics** | Algorithmic thresholds & pattern matching | Advisory Warning (Exit 0) | Structural duplication (>85% matching skeleton), change amplification (>25% dispersion), hardcoded metadata matches. |
| **Tier 3** | **Advisory AI Judgements** | Natural language / LLM semantic review | Advisory Info/Warn (Exit 0) | Intent analysis, suggestions for data modeling vs component extraction. |

### The Core Gating Invariant
> **Only objectively verifiable violations of declared project architecture rules can trigger gate failures (`severity: 'failure'`).**
> Heuristics, component counts, or proliferation metrics produce warnings and evidence, but **never** fail a build on their own.

---

## 3. Configuration & Architecture Rules

Add an optional `architecture` block to your `agent-quality.config.js` or `.agentqualityrc.json`:

```javascript
// agent-quality.config.js
export default {
  architecture: {
    // Git baseline ref (defaults to working-tree vs HEAD, or HEAD vs HEAD~1)
    baselineRef: "origin/main",

    // 1. Layer boundaries & allowed dependency directions
    layers: [
      {
        name: "pages",
        pattern: "src/pages/**",
        allowedDependencies: ["components", "layouts", "styles", "data"]
      },
      {
        name: "components",
        pattern: "src/components/**",
        forbiddenDependencies: ["pages"] // UI components must never import pages
      },
      {
        name: "data",
        pattern: "src/data/**",
        allowedDependencies: [] // Pure data layer
      }
    ],

    // 2. Protected modules (cannot be touched without explicit exception)
    protectedModules: [
      "src/styles/global.css",
      "astro.config.*",
      "public/_headers"
    ],

    // 3. Component reuse expectations
    componentReuseExpectations: {
      warnOnSingleUseDirectory: ["src/components/case/**"],
      minConsumersForExtraction: 2
    },

    // 4. Explicit exceptions with mandatory rationale
    exceptions: [
      {
        ruleId: "protected-module",
        target: "src/styles/global.css",
        reason: "Design token alignment for Phase 2 visual release"
      },
      {
        ruleId: "layer-boundary:components->pages",
        target: "src/components/SpecialMigration.astro",
        reason: "Temporary bridge during router refactoring"
      }
    ]
  }
};
```

---

## 4. Key Analyser Capabilities

### A. Modularity Counterexamples vs Single-Use Proliferation
AQG constructs a component consumption graph by scanning imports across the workspace:
- **Modular Abstraction (Positive)**: When a newly added component is imported by $\ge 2$ consumers (e.g. `CaseFigure.astro`), AQG highlights this as a maintainability improvement.
- **Single-Use Component (Observed)**: When a component has only 1 consumer (e.g. `AometryBoundary.astro`).
- **Reuse Ratio**: Percentage of project components that are actively reused across views.

### B. Structural Duplication Engine
Extracts normalized structural skeletons by stripping Astro frontmatter, script tags, style blocks, text nodes, and HTML comments.
- Calculates Jaccard similarity across structural tokens.
- Clusters components with $\ge 85\%$ structural match.
- Emits evidence with shared skeleton: `<CaseFigure > ComparisonGrid>`.

### C. Change Amplification (Subsystem Dispersion)
Partitions changed files into architectural subsystems (`components:case`, `pages`, `styles`, `data`, `config`, etc.).
- Identifies the primary feature cluster.
- Measures the **dispersion ratio**:
  $$\text{Dispersion Ratio} = \frac{\text{Changed files outside primary subsystem}}{\text{Total changed files}}$$
- Emits advisory warnings when dispersion exceeds $25\%$ on non-trivial diffs.

### D. Hardcoded Collection Metadata Detection
Scans Astro content collections (`src/content/**`) and data schemas for canonical entity values (titles, dates, tags).
- Searches newly created components for duplicate string literals ($\ge 8$ chars).
- Directs agents to bind to props or query collections via `getCollection()` rather than hardcoding duplicates.

### E. Dependency Manifest Diffing
Compares `dependencies` and `devDependencies` in `package.json` against the Git baseline.
- Flags added packages, removals, and major/minor version increments.

### F. Dependency Cycle Detection
Builds a directed module graph $G = (V, E)$ across the codebase.
- Applies Depth-First Search with recursion stack tracking.
- Identifies circular module imports (`A → B → C → A`), which break tree-shaking and complicate refactoring.

### G. Orphaned Code & Dead Component Detection
Discovers unreferenced components and modules where consumer fan-in is 0 (`fanIn === 0`):
- **Entrypoint Protection:** Protects routed page views (`src/pages/**`, `routes/**`, `app/**`), root files (`index`, `cli`, `main`, `server`), content collection configs, and test suites from being falsely flagged as orphans.
- **Diff Attribution:** Distinguishes newly authored orphans (`newOrphaned`) created during the current change from pre-existing repository debt (`orphaned`).
- **Targeted Removal:** Automatically injects detected orphans into the `whatShouldDisappear` remediation pillar for refactoring or subsystem razing.

### H. Architecture Health Budgets
Allows repositories to define advisory change budgets in `architecture.budgets`:
- `singleUseComponentGrowth`: Flags bursts of unshared components.
- `duplicationGrowth`: Flags new structural template duplication clusters.
- `dependencyCycleGrowth`: Flags newly created circular dependencies.
- `dispersionGrowth`: Flags cross-subsystem change leakage exceeding ratio thresholds.
- `orphanedCodeGrowth`: Flags newly introduced unreferenced/dead components.

---

## 5. Architectural Razing & Replacement Recommendations

> **Do not be afraid to recommend a razing.**
> *Technical debt is not inherently worth preserving merely because it already exists.*
> Existing code is evidence of previous decisions, not proof that those decisions remain correct.
> Preserve what is valuable, improve what is salvageable, and replace what is fundamentally unsound.

AQG identifies situations where incremental refactoring is counterproductive:
- Multiple layers of compatibility adapters exist solely to support obsolete decisions.
- High modification friction: simple fixes require edits across 6+ unrelated files.
- The comprehension tax of understanding legacy code exceeds clean rebuild costs.
- Subsystem duplicates functionality already provided by modern platforms or libraries.
- Knotted dependency cycles and repeated debt recreation.

### Remediation Strategy Comparison

| Strategy | Appropriate When | Key Indicators | Action |
|---|---|---|---|
| **Repair** | Architecture is fundamentally sound; defects are local. | Clear boundaries, low dispersion, passes tests with minor fixes. | Fix bug directly with local unit regression tests. |
| **Refactor** | Architecture is salvageable but requires structural improvement. | Leaky abstractions, component duplication, or reuse friction. | Consolidate templates, parameterize props, preserve contracts. |
| **Raze and Rebuild** | Preserving the existing implementation creates more ongoing complexity than replacement. | Knotted cycles, multiple wrapper layers, high duplication sprawl, $>35\%$ dispersion. | Cleanly raze subsystem, author data-driven replacement primitive, migrate views. |

### The Six Pillars of a Razing Proposal
1. **What should be replaced**: Clearly bounded component or subsystem.
2. **Why**: Objective structural failure evidence (e.g. 19 single-use wrappers, 92% structural duplication, dependency cycles).
3. **What should survive**: Behavioral contracts, domain knowledge, tests, schemas, interfaces.
4. **What should disappear**: Redundant layers, obsolete compatibility, boilerplate duplication.
5. **Replacement strategy**: Parallel replacement, clean rebuild, or incremental migration.
6. **Risks & Mitigations**: Integration dependencies, behavioural regression risks, data migration limits.

*Constraint: Razing recommendations are strictly advisory (`[ADVISORY]`). AQG never performs autonomous destruction.*

---

## 6. Longitudinal Architectural Health

Longitudinal health tracks code maintainability trajectory across commits.

### A. Architectural Snapshot Schema (`aqg.arch.snapshot.v1`)
Snapshots capture:
- Repository identifier & commit SHA.
- Timestamp & analyser version.
- Config fingerprint (hash of rules and budgets).
- Aggregated metrics (total components, single-use count, duplication ratio, cycles, dispersion).
- Stored locally in `~/.agent-quality/history/<projectId>.json`.

### B. Trend & Comparability Analysis
- Compares current commit metrics against the historical observation window.
- Identifies whether structural duplication, coupling, or dispersion is **improving**, **degrading**, or **stable**.
- **Comparability Guard**: If the analyser version or configuration changed between snapshots, AQG displays an explicit warning explaining that trend metrics may reflect rule modifications rather than true code drift.
- **Differentiates**:
  1. *Current change contribution*: delta introduced in this specific PR/commit.
  2. *Pre-existing debt*: debt that was already present in the baseline.

---

## 7. Agent Skills Library & `npx skills` Compatibility

AQG includes a vendor-neutral skills library in `skills/`:
- `architecture-inspection`
- `implementation-planning`
- `component-reuse`
- `change-containment`
- `architecture-validation`
- `technical-debt-prevention`

### Standard `npx skills` Discovery
AQG is 100% compatible with the standard `skills` CLI:
```bash
# List available skills
npx skills add . --list

# Use an architecture skill interactively
npx skills use . --skill architecture-inspection

# Add skills to agent environments
npx skills add . --agent claude-code
```

Alternatively, use the built-in AQG skills manager:
```bash
agent-quality skills list
agent-quality skills install --agent all
```

---

## 8. CLI Command Reference

| Command | Purpose |
|---|---|
| `agent-quality architecture inspect` | Inspect declared layers, protected modules, budgets, and exceptions. |
| `agent-quality architecture diff` | Evaluate architectural impact of current git changes relative to baseline. |
| `agent-quality architecture history` | View longitudinal maintainability trajectory across commits. |
| `agent-quality architecture explain <id>` | Provide detailed evidence and Repair vs Refactor vs Raze remediation options. |
| `agent-quality skills list` | List available portable agent skills. |
| `agent-quality skills install` | Install skills into Claude Code, Gemini CLI, OpenCode, Codex, or local workspace. |
| `agent-quality audit` | Full unified quality gate audit (Lighthouse + Architecture Health). |

---

## 9. False-Positive Limitations & Mitigation

Heuristics are by definition probabilistic. AQG explicitly accounts for scenarios where architectural metrics could suggest debt where none exists:

| Scenario | Potential False Positive | AQG Mitigation Strategy |
|---|---|---|
| **Design System Atomics** | Simple buttons or input primitives naturally share small skeletons. | Small skeletons ($< 4$ tags) are ignored; similarity threshold set to $85\%$. |
| **Isomorphic Test Fixtures** | Test mocks often look identical structurally. | Test directories (`test/**`, `tests/**`) are automatically excluded from duplication clusters. |
| **Legitimate Site-Wide Refactors** | Updating a design token legitimately touches `src/styles/global.css` and multiple pages. | Change amplification is strictly advisory; protected modules can be unblocked with a one-line exception and rationale. |
| **Common Vocabulary Strings** | Short words like "Home" or "Documentation" appearing in both metadata and UI. | Minimum string length filter of $\ge 8$ characters, excluding URLs, code tokens, and array delimiters. |
| **Prototyping Spikes** | Adding 10 new experimental components in early feature phases. | Component count never fails the gate. Only declared rule violations block exit. |

---

## 6. Future Roadmap

### Phase 2: Deeper Static Analysis
- **TypeScript Compiler API Integration**:
  - Full type-directed import resolution and symbol tracing.
  - Cycle detection in module graphs ($O(V + E)$ Tarjan's strongly connected components).
  - Taint tracking for unescaped user inputs in component templates.
- **Cross-Language Analyser Seams**:
  - **Python**: AST visitor analyzing `imports`, measuring circular dependencies, and checking layer boundaries via `importlib` and `sys.modules` conventions.
  - **Rust**: AST parsing via `syn` / `cargo metadata` checking module visibility (`pub(crate)`) and dependency tree expansion.

### Phase 3: Optional Advisory AI Review
- **Intent-Aware Architecture Critique**:
  - When enabled (`enableAiReview: true`), AQG generates a contextual summary of the Git diff, structural duplication clusters, and out-of-scope files.
  - An LLM prompt evaluates: *"Is this structural duplication intentional polymorphism or accidental copy-paste?"*
  - The model outputs advisory observations marked `[ADVISORY]`.
  - **Hard constraint**: AI judgements are advisory only and cannot fail the quality gate.
