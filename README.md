# Agent Quality Gate (`agent-quality`)

A reusable, cross-project quality audit tool and autonomous agent quality gate that enforces Lighthouse performance, accessibility, SEO, and best-practice thresholds at task completion.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Agent Lifecycle Adapters                        │
│            (Claude Code Stop, Gemini AfterAgent, Codex, OpenCode)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ triggers
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Project Discovery & Audit Plan                     │
│        (Framework detection, Monorepo targets, Route selection)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ generates AuditPlan
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Environment & Context Runner                      │
│        (Dual-stack preview server, Headless Chrome, Port resolver)     │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │ prepares ExecutionContext      │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       Web Quality Provider           │  │  Architecture Health Provider│
│        LighthouseProvider            │  │   ArchitectureHealthProvider │
│   (3-run median, mobile/desktop)     │  │ (Delta, AST duplication, etc)│
└───────────────────┬──────────────────┘  └──────────────┬───────────────┘
                    │ observations                       │ observations
                    └─────────────────┬──────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                             Policy Engine                              │
│       (Exact comparisons, no upward rounding: Pass, Warn, Fail)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ produces NormalisedResult
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Reporters & Evidence Store                         │
│         (Terminal summary, JSON v1, Markdown, HTML, ~/.agent-quality)   │
└────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Cross-Framework Support**: Auto-detects Astro, Vite (React, Vue, Svelte), Next.js, Nuxt, SvelteKit, and static HTML.
- **Zero In-Repo Bloat**: Reports, baselines, and execution caches are persisted outside client projects in `~/.agent-quality/`.
- **Exact Quality Gates**:
  - **Performance**: 90/100 (advisory warning; does not fail gate)
  - **Accessibility**: 95/100 (blocking failure)
  - **SEO**: 95/100 (blocking failure)
  - **Best Practices**: 95/100 (blocking failure)
  - *No upward rounding*: A score of 94.9 fails a 95.0 threshold.
- **Dual Profiles & Multi-Run**: 3 runs per selected route for both Mobile (emulated 412x823) and Desktop (1350x940) profiles, reporting exact medians.
- **Explicit Non-Web Handling**: Pure CLI tools, libraries, and backend workers are recognized as `not_applicable` and cleanly exit 0.
- **Agent Lifecycle Integration**: Works with Claude Code, Gemini CLI, Codex, and OpenCode with built-in recursion prevention (`AGENT_QUALITY_RUNNING`) and git change deduplication.

## Global Installation

```bash
# Clone the repository
git clone https://github.com/finneh4249/agent-quality.git ~/Documents/Coding/agent-quality
cd ~/Documents/Coding/agent-quality

# Install dependencies and build
npm install
npm run build

# Link globally into your system PATH
npm link
# or symlink directly into ~/.local/bin
ln -sf $(pwd)/bin/agent-quality.js ~/.local/bin/agent-quality
```

Verify your installation:

```bash
agent-quality doctor
```

## CLI Usage

### Audit Current Project
```bash
# Representative sample routes (default)
agent-quality audit

# Audit only routes modified in git diff
agent-quality audit --changed

# Audit all discovered routes exhaustively
agent-quality audit --all-routes

# Target a specific project directory
agent-quality audit -p /path/to/project
```

### Architecture Governance & Health

```bash
# Inspect declared layers, protected modules, and budgets
agent-quality architecture inspect

# Evaluate architectural delta of current changes vs Git baseline
agent-quality architecture diff

# View longitudinal health trends across successive commits
agent-quality architecture history

# Explain a specific finding with evidence and Repair/Refactor/Raze remediation options
agent-quality architecture explain arch-change-amplification
```

### Agent Skills Library (`npx skills` compatible)

AQG includes a vendor-neutral library of progressive-disclosure skills (`skills/`) discoverable by any agent environment.

```bash
# Add skills via npx skills
npx skills add . --list
npx skills use . --skill architecture-inspection

# Or install directly into agent directories
agent-quality skills list
agent-quality skills install --agent all
```

### Record Quality Baseline
Records baseline measurements for regression tracking:
```bash
agent-quality baseline
```
Future audits will automatically compute score regressions against this baseline and highlight drops in the summary report.

### System Diagnostics
```bash
agent-quality doctor
```

## Agent Integrations

Run `agent-quality install-hooks` for detailed snippets.

### 1. Claude Code
Add to `~/.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "agent-quality hook claude",
            "timeout": 180,
            "statusMessage": "Running agent quality gate"
          }
        ]
      }
    ]
  }
}
```

### 2. Gemini CLI
Add to `~/.gemini/settings.json`:
```json
{
  "hooks": {
    "AfterAgent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "agent-quality hook gemini",
            "timeout": 180000
          }
        ]
      }
    ]
  }
}
```

### 3. Codex
Add to `~/.codex/hooks.json`:
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "agent-quality hook codex",
            "timeout": 180
          }
        ]
      }
    ]
  }
}
```

### 4. OpenCode
Create `~/.config/opencode/plugins/agent-quality.js`:
```javascript
import { exec } from "node:child_process";

export default {
  id: "agent-quality",
  setup: async () => {},
  server: async () => ({
    event: async ({ event }) => {
      if (event && event.type === "session.idle") {
        exec("agent-quality hook opencode", (err, stdout, stderr) => {
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
        });
      }
    }
  })
};
```

### Non-Hook Fallback (CI / Manual)
Add to `.git/hooks/pre-commit`:
```bash
#!/bin/sh
exec agent-quality audit --changed
```

## Optional Configuration

Create an optional `agent-quality.config.js` or `.agentqualityrc.json` in your project root:

```javascript
// agent-quality.config.js
export default {
  // Custom preview server command and URL
  previewCommand: "npm run preview",
  previewUrl: "http://localhost:4321",

  // Custom routes to audit
  routes: ["/", "/about", "/pricing"],

  // Exclude routes (glob patterns supported)
  excludeRoutes: ["/secret/*", "/internal/*"],

  // Custom quality thresholds
  thresholds: {
    performance: { threshold: 90, failureMode: "warning" },
    accessibility: { threshold: 95, failureMode: "failure" },
    "best-practices": { threshold: 95, failureMode: "failure" },
    seo: { threshold: 95, failureMode: "failure" },
    "architecture-rules": { threshold: 100, failureMode: "failure" }
  },

  // Architecture Health & Structural Delta rules
  architecture: {
    baselineRef: "origin/main",
    layers: [
      { name: "pages", pattern: "src/pages/**", allowedDependencies: ["components", "layouts", "styles"] },
      { name: "components", pattern: "src/components/**", forbiddenDependencies: ["pages"] }
    ],
    protectedModules: ["src/styles/global.css", "astro.config.*"],
    componentReuseExpectations: { warnOnSingleUseDirectory: ["src/components/case/**"] },
    exceptions: [
      { ruleId: "protected-module", target: "src/styles/global.css", reason: "Brand update" }
    ]
  },

  // Number of runs per route profile
  runs: 3
};
```

## Exit Codes

| Exit Code | Status | Meaning |
|---|---|---|
| `0` | `passed` | All mandatory quality gates met (Performance warnings allowed). |
| `0` | `not_applicable` | Project has no web frontend (CLI, backend, library). |
| `0` | `skipped_unchanged` | Working tree unchanged since previous passing audit. |
| `1` | `threshold_failure` | One or more mandatory category thresholds were not met. |
| `1` | `execution_failure` | Preview server crashed, build failed, or timeout exceeded. |
| `1` | `missing_dependency` | Chrome or required system dependency is missing. |
| `1` | `not_configured` | Web app detected but preview/build cannot be determined. |

## Safety & Scope

- **Never deploys an application.**
- **Never changes production settings.**
- **Never transmits credentials to third parties.**
- **Never modifies application code to manipulate scores.**
- **Zero runtime dependencies added to audited repositories.**

## License

MIT © Ethan Cornwill
