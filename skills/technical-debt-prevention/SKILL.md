---
name: technical-debt-prevention
description: Prevent architectural debt accumulation, avoid sunk-cost bias, and evaluate Repair vs Refactor vs Raze and Rebuild decisions.
version: 1.0.0
triggers:
  - evaluating legacy code
  - refactoring decisions
  - technical debt assessment
  - architectural replacement
---

# Technical Debt Prevention & Architectural Replacement

> **Core Philosophy:**
> *Technical debt is not inherently worth preserving merely because it already exists.*
> Do not be afraid to recommend a razing when incremental refactoring is counterproductive.

---

## 1. Avoiding Architectural Sunk-Cost Bias

Agents frequently fall into the trap of preserving flawed architectures simply because:
- "The existing code already works."
- "Preserving it produces a smaller git diff."
- "Deleting code feels destructive."

Equally, agents must not recommend a total rewrite merely because a cleaner theoretical architecture can be imagined.

**The Objective:** The simplest maintainable system that satisfies actual requirements—not the greatest preservation of existing code, and not the smallest codebase.

---

## 2. Recognizing When Incremental Refactoring Is Counterproductive

Investigate replacement when you observe these signals:
1. **Compatibility Layer Accumulation**: Multiple layers of wrappers and adapters exist solely to accommodate obsolete design decisions.
2. **High Modification Friction**: Fixing a simple defect requires coordinated edits across 6+ unrelated files.
3. **Comprehension Tax**: The cognitive cost of modifying the existing implementation consistently exceeds the cost of implementing equivalent behaviour cleanly from scratch.
4. **Obscuring Abstractions**: Layers hide behavior rather than clarify it.
5. **Subsystem Duplication**: A substantial portion of the subsystem duplicates mechanisms already provided by modern platform APIs or core libraries.
6. **Debt Re-accumulation**: The architecture repeatedly recreates the exact same categories of bugs and maintenance regressions.
7. **Obsolete Assumptions**: Fundamental assumptions (e.g. legacy client environments, deprecated protocols) block modern feature requirements.

---

## 3. Remediation Strategy Evaluation

Evaluate the situation using three distinct options:

| Strategy | Appropriate When | Key Indicators | Action |
|---|---|---|---|
| **Repair** | The architecture is fundamentally sound; defects are localized. | Clean boundaries, low change dispersion, tests pass with minor fixes. | Fix bug directly, add regression test. |
| **Refactor** | The architecture is salvageable but requires structural realignment. | Clear domain model, but leaky abstractions or structural duplication. | Reorganize modules, parameterize duplicates, preserve contracts. |
| **Raze and Rebuild** | Preserving the existing implementation creates more ongoing complexity than replacement. | Knotted dependency cycles, multiple legacy wrapper layers, massive dispersion. | Design clean replacement, preserve behavioral contracts, raze legacy baggage. |

---

## 4. Complexity Triage: What Must Survive

When contemplating replacement, categorize complexity carefully:

- **Essential Complexity**: Inherent to the actual business problem (e.g. GTFS timetable routing calculations). **Must be preserved.**
- **Accidental Complexity**: Introduced by the chosen implementation (e.g. 5 layers of event-emitter bridges). **Should be eliminated.**
- **Historical Complexity**: Maintained for legacy compatibility that is no longer required (e.g. polyfills for Internet Explorer). **Should disappear.**

---

## 5. Formulating a Razing Recommendation

AQG and autonomous agents may **strongly recommend** architectural replacement, but **must never perform autonomous destruction without explicit approval**.

Always structure a replacement recommendation with these six pillars:

1. **What should be replaced**: Clearly bounded component, module, or subsystem (e.g. `src/components/case/` wrapper sprawl).
2. **Why**: Evidence demonstrating structural failure (e.g. 19 single-use wrappers, 92% structural duplication, change dispersion of 35%).
3. **What should survive**: Behavioral contracts, domain rules, schemas, test suites, and public interfaces.
4. **What should disappear**: Redundant wrapper layers, dead fallback code, and repetitive boilerplate.
5. **Replacement strategy**:
   - *Parallel replacement*: Implement the new solution alongside the old, migrate consumers, then delete the old.
   - *Clean rebuild*: Replace the subsystem in a single focused PR with comprehensive regression testing.
   - *Incremental migration*: Migrate interface by interface.
6. **Risks & Mitigations**: Integration dependencies, behavioural regression risks, and data migration limits.
