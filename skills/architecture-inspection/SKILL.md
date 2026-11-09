---
name: architecture-inspection
description: Inspect and understand existing architecture, layer boundaries, canonical data sources, and protected modules before modifying code.
version: 1.0.0
triggers:
  - exploring project architecture
  - understanding codebase boundaries
  - checking layer rules
  - inspecting dependencies
---

# Architecture Inspection

Before implementing non-trivial changes, inspect the project's architectural structure to understand its design invariants and avoid introducing accidental technical debt.

> **Core Philosophy:**
> *Existing code is evidence of previous decisions, not proof that those decisions remain correct.*
> Preserve what is valuable, improve what is salvageable, and replace what is fundamentally unsound.

---

## 1. Focused Exploration Protocol

Do **not** wander aimlessly through unrelated directories. Follow this structured inspection workflow:

1. **Check Declared Architecture Rules**:
   Inspect `agent-quality.config.js`, `.agentqualityrc.json`, or run:
   ```bash
   agent-quality architecture inspect
   ```
   Identify:
   - Defined **layer boundaries** (e.g. `components`, `pages`, `data`).
   - Forbidden dependency directions (e.g. `components` must never import from `pages`).
   - **Protected modules** (e.g. `src/styles/global.css`, `public/_headers`, core routing).

2. **Discover Existing Reusable Abstractions**:
   Before creating a new UI component, utility function, or helper, scan existing shared modules:
   - Look in `src/components/ui/`, `src/components/common/`, or `src/utils/`.
   - In Astro/React projects, check if shared wrappers (e.g. `CaseFigure`, `ComparisonGrid`, `Card`, `Modal`) already exist.
   - Check if an existing component can be parameterized with props or structured data rather than copied.

3. **Locate Canonical Sources of Data & Metadata**:
   - For Astro/content-driven sites, check `src/content/` collections or `src/data/`.
   - Never hardcode string literals (titles, slugs, dates, client names) in component markup if they already exist in content schemas.

4. **Identify Prior Implementations of Similar Requirements**:
   - Search git history or sibling modules for established idioms.
   - Observe naming conventions, prop contracts, and file colocation patterns.

---

## 2. Recognizing Architectural Smells During Inspection

As you inspect the code, watch for warning signs:
- **Wrapper proliferation**: Components that do nothing except wrap a child component with hardcoded values.
- **Deep nesting / Passthrough props**: Passing properties through 5 layers of components without modification.
- **Boundary bypasses**: UI widgets importing directly from database models or server-only endpoints.

If you observe these patterns in existing code, do not replicate them. Note them as potential refactoring opportunities.
