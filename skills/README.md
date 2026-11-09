# Agent Quality Gate — Reusable Agent Skills Library

A vendor-neutral, version-controlled library of skills that guides autonomous coding agents through the complete engineering lifecycle:
**Inspect → Plan → Implement → Validate → Learn**

---

## Skills Catalog

| Skill | Purpose | Key Guidance |
|---|---|---|
| [`architecture-inspection`](./architecture-inspection/SKILL.md) | Inspect codebase before changes | Discover layers, protected modules, canonical data sources. *"Existing code is evidence of previous decisions, not proof that those decisions remain correct."* |
| [`implementation-planning`](./implementation-planning/SKILL.md) | Plan non-trivial features | Map blast radius, identify abstractions, evaluate data vs code tradeoffs. Proportional planning. |
| [`component-reuse`](./component-reuse/SKILL.md) | Component architecture & reuse | Distinguish reusable primitives, legitimate single-use boundaries, unnecessary wrappers, and structural duplication. |
| [`change-containment`](./change-containment/SKILL.md) | Prevent change amplification | Localize feature blast radius, calculate dispersion ratio, avoid brittle workarounds. |
| [`architecture-validation`](./architecture-validation/SKILL.md) | Validate implementation | Run `agent-quality architecture` commands, interpret `[FACT]` vs `[HEURISTIC]` vs `[RULE]`, enforce policy. |
| [`technical-debt-prevention`](./technical-debt-prevention/SKILL.md) | Prevent debt & assess razing | Avoid sunk-cost bias, evaluate **Repair vs Refactor vs Raze & Rebuild**, structure replacement proposals. |

---

## Agent Compatibility & Discovery

The skills in this library adhere to standard Markdown + YAML frontmatter conventions and are discoverable by major coding agent environments:

| Agent Environment | Discovery Mechanism | Installation Target | Compatibility Status |
|---|---|---|---|
| **Claude Code** | Global or local skills directory | `~/.claude/skills/` or `.claude/skills/` | Verified |
| **OpenCode** | OpenCode skills / plugins config | `~/.config/opencode/skills/` | Verified |
| **Codex** | Repository or user skill directories | `.codex/skills/` or `~/.codex/skills/` | Verified |
| **Gemini CLI / Antigravity** | Builtin or user skills folder | `~/.gemini/skills/` | Verified |

---

## Installing Skills

Run the AQG CLI to install or symlink the skills into your desired agent environment without modifying existing instructions:

```bash
# Link skills into Claude Code
agent-quality skills install --agent claude

# Link skills into Gemini CLI
agent-quality skills install --agent gemini

# Link skills into OpenCode
agent-quality skills install --agent opencode

# Link skills into Codex
agent-quality skills install --agent codex

# Install locally into current workspace
agent-quality skills install --local
```
