---
name: component-reuse
description: Distinguish appropriate reuse, new abstractions, legitimate single-use components, and structural duplication.
version: 1.0.0
triggers:
  - creating new components
  - extracting components
  - refactoring UI elements
---

# Component Reuse & Abstraction

Avoid simplistic dogmas like "every component must be reused twice" or "every repeated tag sequence must be an abstraction." Both premature abstraction and thoughtless duplication degrade codebase quality.

---

## 1. Component Taxonomy

When designing or reviewing components, classify them accurately:

| Category | Definition | Example | Action |
|---|---|---|---|
| **Reusable Primitive** | Shared layout, UI control, or presentation wrapper used across distinct views. | `CaseFigure.astro`, `Button.tsx`, `ComparisonGrid.astro` | ✅ Build cleanly, keep domain-neutral, document props. |
| **Legitimate Single-Use** | Component with unique, highly complex domain logic, bespoke interactive canvas, or dedicated layout boundary. | `SignalArchitectureMap.astro`, `CheckoutStepper.tsx` | ✅ Keep isolated, avoid premature generalisation. |
| **Unnecessary Wrapper** | Component that merely passes hardcoded arrays or strings into an existing primitive. | `AometryBoundary.astro` (renders `<CaseFigure><ComparisonGrid columns={col}/></CaseFigure>`) | ⛔ Eliminate: pass data directly from MDX, schema, or parent view. |
| **Structural Duplication** | Multiple components sharing $>85\%$ identical AST/DOM templates differing only by text literals. | 5 case diagram components with identical div/flex structures. | ⚠️ Consolidate into a parameterized component. |
| **Premature Abstraction** | An abstraction introduced before requirements are understood, weighed down by 15 boolean flags. | `UniversalCardWith20Props.tsx` | ⛔ Prefer duplication over the wrong abstraction. |

---

## 2. Decision Tree for New Components

```
Do you need to display new UI?
├── Does an existing component render this exact structure?
│   └── YES → Reuse the existing component with appropriate props.
└── NO
    ├── Is the markup repeated across 2 or more views?
    │   ├── YES → Extract a parameterized component accepting structured data.
    │   └── NO (Single view only)
    │       ├── Is the component complex, interactive, or a distinct domain boundary?
    │       │   └── YES → Author a focused, legitimate single-use component.
    │       └── NO (Simple template markup with static text)
    │           └── Inline it directly in the page or content template. Do not create a single-use wrapper file.
```
