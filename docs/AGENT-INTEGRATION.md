# Agent Integration & Hook Compatibility Matrix

This document provides verified integration specifications for AI coding agents connecting to Agent Quality Gate (`agent-quality`).

## Verified Compatibility Matrix

| Agent | Lifecycle Event | Mechanism | Enforcement Level | Verification Status | Notes |
|---|---|---|---|---|---|
| **Claude Code** | `Stop` | Command hook in `~/.claude/settings.json` | **Blocking** | **Verified** | Exits non-zero on failed quality gates; Claude Code reports failure to user/agent. |
| **Codex** | `Stop` | Command hook in `~/.codex/hooks.json` | **Blocking** | **Verified** | Executes synchronously upon turn completion; non-zero exits block session progression. |
| **Gemini CLI** | `AfterAgent` | Hook in `~/.gemini/settings.json` | **Advisory** | **Verified** | Triggers immediately after response generation; dispatches terminal report. |
| **OpenCode** | `session.idle` | Event plugin in `~/.config/opencode/plugins/` | **Advisory** | **Verified** | Listens on server event bus; executes audit when session transitions to idle. |
| **CI / Git Pre-commit** | `pre-commit` | Shell hook in `.git/hooks/pre-commit` | **Blocking** | **Verified** | Pure bash fallback; prevents commits if thresholds are violated. |

---

## Agent Hook Setup Details

### 1. Claude Code
Claude Code evaluates `Stop` hooks when an interaction turn terminates.

**Target File:** `~/.claude/settings.json`

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
            "statusMessage": "Evaluating quality gate"
          }
        ]
      }
    ]
  }
}
```

- **Recursion Prevention:** `agent-quality` exports `AGENT_QUALITY_RUNNING=1` so subprocesses spawned during an audit do not re-trigger hooks.
- **Deduplication:** Computes SHA-256 of `git rev-parse HEAD` and `git status --porcelain`. If unchanged since the previous passing run, exits `0` with `STATUS: SKIPPED (UNCHANGED)`.

---

### 2. Codex
Codex runs hooks configured in `~/.codex/hooks.json`.

**Target File:** `~/.codex/hooks.json`

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

---

### 3. Gemini CLI
Gemini CLI exposes lifecycle events via `~/.gemini/settings.json`.

**Target File:** `~/.gemini/settings.json`

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

---

### 4. OpenCode
OpenCode employs an event-driven plugin architecture where the server communicates lifecycle state changes.

**Target File:** `~/.config/opencode/plugins/agent-quality.js`

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

---

## Non-Hook Fallback Environments

For environments or CI workflows where agent lifecycle hooks are unavailable:

```bash
# In .git/hooks/pre-commit
#!/bin/sh
exec agent-quality audit --changed
```
