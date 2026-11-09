---
name: change-containment
description: Minimize change amplification while avoiding brittle workarounds. Balance local containment with legitimate architectural refactoring.
version: 1.0.0
triggers:
  - modifying shared code
  - touching global styles
  - editing configurations
---

# Change Containment

When implementing a feature or bug fix, aim to keep changes focused within the primary subsystem without resorting to dirty workarounds.

---

## 1. Principles of Containment

1. **Localize by Default**:
   If a feature request concerns a specific route (e.g. `/work/signal`), modifications should primarily reside in `src/content/work/signal.mdx` or dedicated case components. Avoid touching global layouts, site-wide headers, or unrelated 404 templates.

2. **Calculate the Dispersion Ratio**:
   $$\text{Dispersion Ratio} = \frac{\text{Touched files outside primary subsystem}}{\text{Total touched files}}$$
   - A dispersion ratio $> 25\%$ on non-trivial diffs is an indicator of **change amplification**.
   - Check if you are accidentally coupling the feature to global state or shared styles.

3. **No Brittle Local Hacks to Avoid Shared Modules**:
   *Do not introduce hacky inline styles, monkey-patched globals, or copy-pasted utility functions merely to keep the diff small.*
   - A legitimate cross-cutting improvement (e.g., updating a shared token or enhancing a utility function) is vastly preferable to an architecturally incorrect local workaround.
   - If touching a shared module is the right engineering decision, do it cleanly and update all affected tests.

4. **Respect Protected Modules**:
   If a change touches a protected module (`src/styles/global.css`, `public/_headers`, `astro.config.mjs`):
   - Confirm whether the change is essential.
   - If essential, record an explicit rationale in project exceptions or commit message.
