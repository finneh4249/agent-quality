# ADR-001: Modular Architecture for Agent Quality Gate (AQG)

## Status
Accepted

## Context
Software development agents (such as Claude Code, Gemini CLI, OpenCode, Codex) execute autonomous tasks across multiple projects. While they can run ad-hoc tests, there has been no standardized, cross-project, cross-agent quality gate verifying that web applications meet baseline Lighthouse performance, accessibility, SEO, and best-practice thresholds prior to task completion.

While Lighthouse is the initial provider for v0.1, real-world quality gates require multiple dimensions of verification: accessibility audits (axe-core), end-to-end user journeys (Playwright), static analysis (TypeScript/ESLint), dependency security audits, API contracts, and bundle budgets.

Directly coupling Lighthouse execution, server startup, git detection, agent hook protocols, and pass/fail thresholds into a single script would make adding future providers or agent adapters fragile and require rewrite.

## Decision

We establish six explicit architectural seams that decouple measurement, environment, policy, discovery, agent lifecycle, and reporting:

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
│             (Local preview server, Headless Chrome, Timeouts)           │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │ prepares ExecutionContext      │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       Quality Provider (v0.1)        │  │  Future Provider (e.g. axe)  │
│        LighthouseProvider            │  │        AxeCoreProvider       │
│   (3-run median, mobile/desktop)     │  │   (Automated WCAG 2.2 AA)    │
└───────────────────┬──────────────────┘  └──────────────┬───────────────┘
                    │ observations                       │ observations
                    └─────────────────┬──────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                             Policy Engine                              │
│       (Measurements vs Thresholds: Pass, Warn, Fail, Regressions)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ produces NormalisedResult
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Reporters & Evidence Store                         │
│         (Terminal summary, JSON v1, Markdown, HTML, ~/.agent-quality)   │
└────────────────────────────────────────────────────────────────────────┘
```

### Seam 1: Quality Provider Contract
Providers implement a uniform lifecycle contract:
- `id`: Unique identifier (e.g., `'lighthouse'`).
- `name`, `version`: Provider metadata.
- `isApplicable(plan, context)`: Evaluates whether this provider can run against the target.
- `execute(target, context)`: Runs checks against a prepared target and returns raw `ProviderObservation`.
- **Key rule**: Providers produce *observations* (measurements, metric scores, raw issues, evidence artifacts); they do **not** decide whether an audit passed or failed.

### Seam 2: Execution Environment & Context
Environment management (starting preview servers, locating and launching headless Chrome, configuring ports, cleanup on exit/SIGINT) is managed outside providers. Providers receive a prepared `ExecutionContext` containing:
- `baseUrl`: Responsive preview URL.
- `chrome`: Active headless Chrome endpoint (CDP port / websocket).
- `projectRoot`: Root directory of the audited project.
- `tempDir`: Sandbox directory for ephemeral files.
- `timeouts`: Configured timeouts.

### Seam 3: Project Discovery & Audit Plan
Discovery inspects project files (`package.json`, `astro.config.*`, `vite.config.*`, etc.) and produces an explicit, inspectable `AuditPlan`:
- Discovered framework and target type (`astro`, `vite`, `next`, `static`, or `non_web`).
- Routes to audit (`sample`, `changed`, or `all`).
- Applicable quality providers.
If a project has no web frontend (`non_web`), the plan marks the audit as `not_applicable`, returning exit code 0 without executing unnecessary web server infrastructure.

### Seam 4: Policy Engine (Measurement vs Policy)
The Policy Engine receives `ProviderObservation[]` and evaluates them against configured rules:
- Category thresholds (Performance >= 90 warning; A11y >= 95 failure; Best Practices >= 95 failure; SEO >= 95 failure).
- Comparisons are strictly mathematical with no upward rounding (e.g., 94.9 fails a 95 threshold).
- Baseline regression calculation against stored baseline artifacts.
- Distinction between `passed`, `warning`, `threshold_failure`, `execution_failure`, `missing_dependency`, and `not_applicable`.

### Seam 5: Normalized Result Schema (`aqg.result.v1.json`)
A versioned data structure captures all findings, scores, regressions, metadata (timestamps, commit sha, node version, chrome version), and artifact paths. Reporters consume this schema without knowledge of provider implementation details.

### Seam 6: Agent Adapters
Agent adapters translate agent hooks into CLI invocations:
- Claude Code: `Stop` hook.
- Gemini CLI: `AfterAgent` hook.
- Codex: `Stop` hook.
- OpenCode: `session.idle` event plugin.
- Fallback: Manual CLI / CI script (`agent-quality audit`).
All adapters share common guards:
- Recursion guard (`AGENT_QUALITY_RUNNING=1`).
- Deduplication guard (skips audit if git tree is identical to the last passed run).

## Provider Contract Definition

```typescript
export interface ProviderObservation {
  providerId: string;
  providerVersion: string;
  target: string; // e.g. route or target path
  profile?: 'mobile' | 'desktop';
  metrics: Record<string, number>; // e.g. { performance: 92.0, accessibility: 98.0 }
  issues: ActionableIssue[];
  rawArtifacts?: Record<string, string>; // path to HTML / JSON reports
  durationMs: number;
}

export interface QualityProvider {
  id: string;
  name: string;
  version: string;
  isApplicable(plan: AuditPlan, context: ExecutionContext): Promise<boolean> | boolean;
  execute(target: TargetPlan, context: ExecutionContext): Promise<ProviderObservation[]>;
}
```

## Example: Adding a Second Provider (e.g., AxeCoreProvider)

Adding a second provider (such as `@axe-core/puppeteer`) requires zero changes to `LighthouseProvider` or the server runner:

```typescript
// src/providers/axe-core.ts (Hypothetical future provider)
import { QualityProvider, ProviderObservation, TargetPlan, ExecutionContext } from '../core/types.js';

export class AxeCoreProvider implements QualityProvider {
  id = 'axe-core';
  name = 'axe-core Accessibility Engine';
  version = '4.10.0';

  isApplicable(plan: AuditPlan): boolean {
    return plan.projectType !== 'non_web';
  }

  async execute(target: TargetPlan, context: ExecutionContext): Promise<ProviderObservation[]> {
    const url = new URL(target.route, context.baseUrl).href;
    // Connect to context.chrome via CDP/Puppeteer, run axe analysis...
    const results = await runAxeAnalysis(url, context.chrome.port);
    
    return [{
      providerId: this.id,
      providerVersion: this.version,
      target: target.route,
      metrics: {
        violations: results.violations.length,
        passes: results.passes.length
      },
      issues: results.violations.map(v => ({
        id: v.id,
        title: v.help,
        description: v.description,
        score: v.impact === 'critical' ? 0 : 50
      })),
      durationMs: 1200
    }];
  }
}
```
The Policy Engine evaluates `violations === 0` against policy thresholds without Lighthouse knowing or caring about axe-core.

## Roadmap

### v0.1 (This Implementation)
1. Standalone TypeScript CLI (`agent-quality`).
2. Lighthouse quality provider (Performance, A11y, SEO, Best Practices).
3. Local preview server management with automatic fallback to zero-config static server.
4. Route discovery (representative sample, `--changed` git diff, `--all-routes`).
5. Mobile & Desktop profiles with 3-run median scoring.
6. Exact threshold comparisons (no upward rounding).
7. External storage in `~/.agent-quality/` (reports, baselines, cache).
8. Agent adapters for Claude Code, Gemini CLI, Codex, and OpenCode with recursion and deduplication guards.
9. Non-web project explicit handling (`not_applicable`, exit 0).
10. Terminal summary, JSON/HTML reports, and baseline regression detection.

### Near-Term Enhancements
1. `axe-core` provider for deep WCAG 2.2 contrast and ARIA tree auditing.
2. ESLint / TypeScript provider for static analysis gating.
3. Vitest test results provider.
4. GitHub Actions CI action / SARIF export.

### Speculative / Future Possibilities
1. Web visual regression (Playwright).
2. Remote preview environment auditing.
3. Centralized team dashboard and trend tracking across repos.

## Consequences
- Clean separation of concerns allows adding providers in the future with zero modifications to existing providers.
- Projects audited by AQG have zero dependencies injected into their repositories; all artifacts and caches live in `~/.agent-quality/`.
- Clear exit codes enable safe automated blocking in agent hooks without unpredictable hanging.
