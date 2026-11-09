---
name: architecture-validation
description: Run AQG architecture commands, interpret factual vs heuristic findings, verify layer boundaries, and check budgets.
version: 1.0.0
triggers:
  - validating changes
  - running quality gate
  - checking architectural health
---

# Architecture Validation

Validate your implementation using Agent Quality Gate before declaring a task complete. Passing functional tests does not guarantee architectural health.

---

## 1. Validation Commands

Run the appropriate AQG architecture commands during development:

```bash
# 1. Inspect architectural overview and declared rules
agent-quality architecture inspect

# 2. Check the architectural impact of your git diff
agent-quality architecture diff

# 3. View longitudinal maintainability trends across commits
agent-quality architecture history

# 4. Explain a specific finding with remediation options
agent-quality architecture explain <finding-id>

# 5. Full quality gate audit (Lighthouse + Architecture Health)
agent-quality audit --changed
```

---

## 2. Interpreting the Epistemic Tiers

AQG partitions all findings into three distinct tiers:

- **`[FACT]` (Tier 1)**: Objectively verifiable measurements (e.g. +8 components added, dependency bumped in `package.json`, component fan-in = 3).
  *Fact findings are informational unless they violate an explicit declared rule.*
- **`[HEURISTIC]` (Tier 2)**: Structural signals requiring interpretation (e.g. 90% structural template similarity, 35% change dispersion).
  *Heuristic findings are advisory warnings (`Exit 0`). They guide review but do not fail builds.*
- **`[RULE]` (Declared Rule Violation)**: Breaches of explicit project invariants (e.g. layer boundary violations, unauthorized edits to protected modules).
  *Rule violations trigger blocking failures (`severity: 'failure'`, `Exit 1`). Must be resolved or explicitly excepted.*

---

## 3. Resolving Findings

1. **If a Rule Violation occurs (`[RULE]` [FAIL])**:
   - Check the import statement at the flagged file and line.
   - Remove the forbidden import, or inject dependencies through inversion of control.
   - If the edit to a protected module was intended, add an exception with rationale to `agent-quality.config.js`.

2. **If Structural Duplication is flagged (`[HEURISTIC]` [WARN])**:
   - Inspect the flagged files.
   - If they are near-identical wrapper components, consolidate them by passing props to a single shared component.
   - If they represent independent, intentional domain concepts, keep them and proceed.
