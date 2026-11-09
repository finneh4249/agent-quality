---
name: implementation-planning
description: Plan architectural changes, identify touched subsystems, verify reuse, and anticipate regressions before writing code.
version: 1.0.0
triggers:
  - planning a feature
  - designing a refactor
  - mapping code modifications
---

# Implementation Planning

Plan modifications proportionately to the task complexity. A 5-line bug fix requires no formal plan; a multi-component feature or structural migration demands an explicit architectural plan.

---

## 1. Proportional Planning Checklist

For non-trivial features, articulate the following before editing files:

1. **Desired User-Visible Outcome**:
   What exact behaviour, UI render, or data contract should exist upon completion?

2. **Existing Abstractions to Leverage**:
   Which existing components, layouts, or schemas should be reused?
   *Never generate new components without first verifying whether existing primitives suffice.*

3. **Subsystem Boundary & Expected Blast Radius**:
   - Primary subsystem (e.g., `src/content/work` or `src/components/case`).
   - Expected touched files.
   - Will this change bleed into global CSS, error pages, or server headers? If so, why?

4. **Necessity of New Components**:
   - Is a new component genuinely needed, or can existing components accept structured data?
   - If a new component is needed: Is it a **domain boundary** (e.g. an interactive visualization) or an **unnecessary wrapper**?

5. **Test & Contract Extension**:
   Which existing tests, fixtures, or acceptance checks should be updated or added?

6. **Architectural Risks**:
   - Could this introduce circular dependencies?
   - Does this modify protected modules? If yes, prepare an explicit rationale for the exception.

---

## 2. Planning Heuristic: Data vs Code

When asked to implement similar features across multiple views (e.g., visual explanations for 8 case studies, or 6 product cards):

| Approach | Maintenance Impact | Recommendation |
|---|---|---|
| **Author 1 component per view** (e.g. `ProductA.astro`, `ProductB.astro`) | High maintenance debt, structural duplication, change amplification. | ⛔ Avoid |
| **Extract reusable primitive + pass structured data** (e.g. `ProductCard.astro` with schema) | Clean modularity, single point of change, testable in isolation. | ✅ Preferred |
| **Bespoke component for unique domain logic** (e.g. `TopologyMap.astro`) | Legitimate single-use component with high domain value. | ✅ Permitted |
