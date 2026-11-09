import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { runQualityAudit } from './engine.js';
import { printTerminalReport } from './reporting/terminal.js';
import { createNormalisedResultJson } from './reporting/json.js';
import { createMarkdownReport } from './reporting/markdown.js';
import { findChrome } from './environment/chrome.js';
import { ADAPTERS, fallbackGuide } from './adapters/index.js';
import { createIsolatedWorktree } from './environment/git.js';
import { compareAudits } from './policy/comparator.js';
import { printComparisonReport } from './reporting/comparison.js';
import { loadBaseline, getProjectIdentifier } from './storage/store.js';
import { loadConfig } from './config.js';
import { runArchitectureAnalysis } from './providers/architecture/analyser.js';
import { loadHistoricalSnapshots, analyzeLongitudinalTrends } from './providers/architecture/history.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('agent-quality')
    .description('Cross-project quality gate and Lighthouse audit runner for agents and developers')
    .version('1.0.0');

  // Command: audit
  program
    .command('audit')
    .description('Run quality audit on the specified project or current directory')
    .option('--changed', 'Audit only routes affected by git changes')
    .option('--all-routes', 'Audit all discovered routes exhaustively')
    .option('-p, --project <path>', 'Path to project root directory', process.cwd())
    .option('-r, --runs <number>', 'Number of audit runs per route profile', '3')
    .option('--json', 'Output machine-readable JSON to stdout')
    .option('--markdown', 'Output Markdown report to stdout')
    .action(async (options) => {
      const mode = options.allRoutes ? 'all' : options.changed ? 'changed' : 'sample';
      const projectRoot = path.resolve(options.project);
      const runs = parseInt(options.runs, 10) || 3;

      const result = await runQualityAudit({
        projectRoot,
        mode,
        inlineConfig: { runs }
      });

      if (options.json) {
        console.log(createNormalisedResultJson(result));
      } else if (options.markdown) {
        console.log(createMarkdownReport(result));
      } else {
        printTerminalReport(result);
      }

      const isPassing =
        result.status === 'passed' ||
        result.status === 'not_applicable' ||
        result.status === 'skipped_unchanged';

      process.exit(isPassing ? 0 : 1);
    });

  // Command: compare
  program
    .command('compare [rev1] [rev2]')
    .description('Compare quality findings and scores between revisions or against a saved baseline')
    .option('-p, --project <path>', 'Path to project root directory', process.cwd())
    .option('-r, --runs <number>', 'Number of audit runs per route profile', '1')
    .action(async (rev1, rev2, options) => {
      const projectRoot = path.resolve(options.project);
      const runs = parseInt(options.runs, 10) || 1;

      console.log(pc.cyan(`\nInitiating quality gate comparison for ${projectRoot}...`));

      if (rev1 && rev2) {
        // Compare two revisions
        console.log(pc.dim(`Preparing isolated checkouts for ${rev1} and ${rev2}...`));
        const wt1 = createIsolatedWorktree(projectRoot, rev1);
        let res1: any = null;
        let res2: any = null;
        try {
          res1 = await runQualityAudit({ projectRoot: wt1.worktreePath, inlineConfig: { runs } });
        } finally {
          wt1.cleanup();
        }

        const wt2 = createIsolatedWorktree(projectRoot, rev2);
        try {
          res2 = await runQualityAudit({ projectRoot: wt2.worktreePath, inlineConfig: { runs } });
        } finally {
          wt2.cleanup();
        }

        const comparison = compareAudits(res1, res2);
        printComparisonReport(comparison);
        process.exit(comparison.hasRegressions ? 1 : 0);
      } else if (rev1) {
        // Compare working tree against rev1
        console.log(pc.dim(`Auditing current working tree...`));
        const currentRes = await runQualityAudit({ projectRoot, inlineConfig: { runs } });

        console.log(pc.dim(`Preparing isolated checkout for revision ${rev1}...`));
        const wt = createIsolatedWorktree(projectRoot, rev1);
        let baseRes: any = null;
        try {
          baseRes = await runQualityAudit({ projectRoot: wt.worktreePath, inlineConfig: { runs } });
        } finally {
          wt.cleanup();
        }

        const comparison = compareAudits(baseRes, currentRes);
        printComparisonReport(comparison);
        process.exit(comparison.hasRegressions ? 1 : 0);
      } else {
        // Compare current working tree against saved baseline
        console.log(pc.dim(`Auditing current working tree...`));
        const currentRes = await runQualityAudit({ projectRoot, inlineConfig: { runs } });

        const { getProjectIdentifier } = await import('./storage/store.js');
        const projectId = getProjectIdentifier(projectRoot);
        const savedBaseline = loadBaseline(projectId);

        if (!savedBaseline) {
          console.error(pc.yellow(`\nNo baseline found for ${projectRoot}. Run 'agent-quality baseline' first.\n`));
          process.exit(1);
        }

        // Convert stored baseline into minimal NormalisedResult for comparison
        const baseResult: any = {
          schemaVersion: 'aqg.result.v1',
          timestamp: savedBaseline.timestamp,
          projectId,
          projectName: path.basename(projectRoot),
          projectRoot,
          status: 'passed',
          plan: savedBaseline.plan || currentRes.plan,
          observations: savedBaseline.observations || [],
          evaluation: {
            routeSummaries: (savedBaseline.observations || []).map((o: any) => ({
              route: o.target,
              profiles: {
                [o.profile || 'mobile']: Object.fromEntries(
                  Object.entries(o.metrics || {}).map(([k, v]) => [k, { score: v }])
                )
              }
            }))
          },
          findings: (savedBaseline.observations || []).flatMap((o: any) => o.findings || []),
          topIssues: [],
          reportPaths: {},
          environment: {}
        };

        const comparison = compareAudits(baseResult, currentRes);
        printComparisonReport(comparison);
        process.exit(comparison.hasRegressions ? 1 : 0);
      }
    });
  program
    .command('baseline')
    .description('Run audit and record current scores as the project baseline')
    .option('-p, --project <path>', 'Path to project root directory', process.cwd())
    .option('--all-routes', 'Include all routes in baseline')
    .option('-r, --runs <number>', 'Number of audit runs per route profile', '3')
    .action(async (options) => {
      const mode = options.allRoutes ? 'all' : 'sample';
      const projectRoot = path.resolve(options.project);
      const runs = parseInt(options.runs, 10) || 3;

      console.log(pc.cyan(`\nRecording baseline for project at ${projectRoot}...`));

      const result = await runQualityAudit({
        projectRoot,
        mode,
        recordBaseline: true,
        inlineConfig: { runs }
      });

      printTerminalReport(result);

      if (result.baselinePath) {
        console.log(pc.green(`✓ Baseline successfully saved to: ${result.baselinePath}\n`));
      }

      const isPassing =
        result.status === 'passed' ||
        result.status === 'not_applicable' ||
        result.status === 'skipped_unchanged';

      process.exit(isPassing ? 0 : 1);
    });

  // Command: hook
  program
    .command('hook <agent>')
    .description('Run quality gate as an agent completion hook (Claude Code, Gemini CLI, Codex, OpenCode)')
    .option('-p, --project <path>', 'Project directory')
    .action(async (agentName, options) => {
      const adapter = ADAPTERS[agentName.toLowerCase()];
      const projectRoot = options.project
        ? path.resolve(options.project)
        : adapter?.resolveProjectRoot() || process.cwd();

      const result = await runQualityAudit({
        projectRoot,
        mode: 'sample',
        isHookExecution: true,
        agentName
      });

      printTerminalReport(result);

      const isPassing =
        result.status === 'passed' ||
        result.status === 'not_applicable' ||
        result.status === 'skipped_unchanged';

      process.exit(isPassing ? 0 : 1);
    });

  // Command: doctor
  program
    .command('doctor')
    .description('Diagnose environment, Chrome installation, and agent hook readiness')
    .action(async () => {
      console.log('\n' + pc.bold('━'.repeat(60)));
      console.log(pc.bold('  AGENT QUALITY GATE — SYSTEM DOCTOR'));
      console.log(pc.bold('━'.repeat(60)) + '\n');

      // 1. Node.js
      console.log(`  ${pc.green('✓')} Node.js: ${process.version} (${process.platform}-${process.arch})`);

      // 2. Headless Chrome
      const chrome = findChrome();
      if (chrome) {
        console.log(`  ${pc.green('✓')} Headless Chrome: ${chrome.path} (via ${chrome.source})`);
      } else {
        console.log(`  ${pc.red('✗')} Headless Chrome: NOT FOUND`);
        console.log(pc.yellow('    Install Google Chrome or set CHROME_PATH environment variable.'));
      }

      // 3. Storage directories
      const homeQualityDir = path.join(process.env.HOME || '', '.agent-quality');
      console.log(`  ${pc.green('✓')} External Data Store: ${homeQualityDir}`);

      // 4. Agent hook configurations
      console.log('\n  ' + pc.bold('Agent Hook Readiness:'));
      for (const [name, adapter] of Object.entries(ADAPTERS)) {
        const hookConfig = adapter.getHookConfiguration();
        console.log(`    ${pc.cyan('•')} ${adapter.description}`);
        console.log(`      Target Config: ${hookConfig.configFile || hookConfig.pluginFile}`);
      }

      console.log('\n' + pc.bold('━'.repeat(60)) + '\n');
    });

  // Command: install-hooks
  program
    .command('install-hooks')
    .description('Print setup instructions and configuration snippets for agent completion hooks')
    .action(() => {
      console.log('\n' + pc.bold('━'.repeat(64)));
      console.log(pc.bold('  AGENT QUALITY GATE — HOOK SETUP GUIDE'));
      console.log(pc.bold('━'.repeat(64)) + '\n');

      for (const [name, adapter] of Object.entries(ADAPTERS)) {
        const hookConfig = adapter.getHookConfiguration('agent-quality');
        console.log(pc.bold(pc.cyan(`\n### ${adapter.name.toUpperCase()} (${adapter.description})`)));
        console.log(`File: ${pc.underline(hookConfig.configFile || hookConfig.pluginFile)}`);
        console.log(`Enforcement Level: ${hookConfig.enforcementLevel || 'advisory'}`);
        if (hookConfig.configSnippet) {
          console.log('\nAdd to your configuration:');
          console.log(pc.dim(JSON.stringify(hookConfig.configSnippet, null, 2)));
        } else if (hookConfig.pluginTemplate) {
          console.log('\nSave plugin file to ~/.config/opencode/plugins/agent-quality.js:');
          console.log(pc.dim(hookConfig.pluginTemplate));
        }
      }

      console.log(pc.bold('\n' + '━'.repeat(64)));
      console.log(pc.bold('Fallback for Non-Hook Environments:'));
      console.log(fallbackGuide.instructions);
      console.log(pc.bold('━'.repeat(64)) + '\n');
    });

  // Command Group: architecture
  const arch = program
    .command('architecture')
    .description('Inspect, diff, track longitudinal history, and explain architectural health');

  // architecture inspect
  arch
    .command('inspect')
    .description('Inspect declared architecture layers, protected modules, budgets, and boundaries')
    .option('-p, --project <path>', 'Path to project root directory', process.cwd())
    .option('--json', 'Output machine-readable JSON to stdout')
    .action(async (options) => {
      const projectRoot = path.resolve(options.project);
      const { config } = await loadConfig(projectRoot);
      const archConfig = config.architecture || {};

      if (options.json) {
        console.log(JSON.stringify(archConfig, null, 2));
        return;
      }

      console.log('\n' + pc.bold('━'.repeat(64)));
      console.log(pc.bold('  ARCHITECTURE INSPECTION: ') + pc.cyan(path.basename(projectRoot)));
      console.log(pc.bold('━'.repeat(64)) + '\n');

      console.log(pc.bold('  Configured Layers:'));
      if (archConfig.layers && archConfig.layers.length > 0) {
        for (const l of archConfig.layers) {
          const allowed = l.allowedDependencies?.join(', ') || 'none';
          const forbidden = l.forbiddenDependencies?.join(', ') || 'none';
          console.log(`    ${pc.cyan('•')} ${pc.bold(l.name)} (${l.pattern})`);
          console.log(`      ${pc.dim('Allowed:')}   ${allowed}`);
          if (l.forbiddenDependencies) {
            console.log(`      ${pc.dim('Forbidden:')} ${pc.red(forbidden)}`);
          }
        }
      } else {
        console.log(pc.dim('    No explicit layer boundaries configured.'));
      }

      console.log(pc.bold('\n  Protected Modules:'));
      if (archConfig.protectedModules && archConfig.protectedModules.length > 0) {
        for (const p of archConfig.protectedModules) {
          const pattern = typeof p === 'string' ? p : p.pattern;
          console.log(`    ${pc.yellow('⚑')} ${pattern}`);
        }
      } else {
        console.log(pc.dim('    No protected modules configured.'));
      }

      console.log(pc.bold('\n  Architecture Budgets:'));
      if (archConfig.budgets) {
        for (const [k, v] of Object.entries(archConfig.budgets)) {
          console.log(`    ${pc.magenta('◆')} ${k}: threshold = ${(v as any).warningThreshold}`);
        }
      } else {
        console.log(pc.dim('    No advisory budgets configured.'));
      }

      console.log(pc.bold('\n  Configured Exceptions:'));
      if (archConfig.exceptions && archConfig.exceptions.length > 0) {
        for (const exc of archConfig.exceptions) {
          console.log(`    ${pc.green('✓')} [${exc.ruleId}] ${exc.target}: "${exc.reason}"`);
        }
      } else {
        console.log(pc.dim('    No exceptions declared.'));
      }

      console.log('\n' + pc.bold('━'.repeat(64)) + '\n');
    });

  // architecture diff
  arch
    .command('diff')
    .description('Evaluate architectural impact of current changes relative to Git baseline')
    .option('-p, --project <path>', 'Path to project root directory', process.cwd())
    .option('-b, --baseline <ref>', 'Baseline Git reference')
    .option('--json', 'Output machine-readable JSON to stdout')
    .action(async (options) => {
      const projectRoot = path.resolve(options.project);
      const { config } = await loadConfig(projectRoot);
      const archConfig = {
        ...(config.architecture || {}),
        ...(options.baseline ? { baselineRef: options.baseline } : {})
      };

      const result = runArchitectureAnalysis(projectRoot, archConfig);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log('\n' + pc.bold('━'.repeat(64)));
      console.log(pc.bold('  ARCHITECTURE DIFF (vs ') + pc.cyan(result.baselineRef) + pc.bold(')'));
      console.log(pc.bold('━'.repeat(64)) + '\n');

      console.log(`  Components: +${result.components.added.length} added, -${result.components.deleted.length} deleted`);
      if (result.components.modularAbstractions.length > 0) {
        console.log(`  ${pc.green('Modular Abstractions (fan-in ≥ 2):')} ${result.components.modularAbstractions.map((c) => c.relativePath).join(', ')}`);
      }
      if (result.components.singleUse.length > 0) {
        console.log(`  ${pc.dim('Single-Use Components:')} ${result.components.singleUse.length}`);
      }
      if (result.components.newOrphaned && result.components.newOrphaned.length > 0) {
        console.log(`  ${pc.yellow('Orphaned Components (New):')} ${result.components.newOrphaned.map((c) => c.relativePath).join(', ')}`);
      } else if (result.components.orphaned && result.components.orphaned.length > 0) {
        console.log(`  ${pc.dim('Orphaned Components (Total):')} ${result.components.orphaned.length}`);
      }
      console.log(`  Dependency Changes: ${result.dependencies.length}`);
      console.log(`  Dependency Cycles: ${result.cycles.length}`);
      console.log(`  Subsystem Dispersion: ${Math.round(result.amplification.dispersionRatio * 100)}% (${result.amplification.outOfScopeFiles.length} out of primary scope)`);

      if (result.ruleViolations.length > 0) {
        console.log(pc.bold(pc.red('\n  Rule Violations:')));
        for (const v of result.ruleViolations) {
          console.log(`    ${pc.red('✗')} [${v.ruleType}] ${v.message}`);
        }
      }

      if (result.remediations.length > 0) {
        console.log(pc.bold(pc.cyan('\n  Remediation Advice:')));
        for (const rec of result.remediations) {
          console.log(`    ${pc.cyan('Strategy:')} ${pc.bold(rec.strategy.toUpperCase())} (${rec.target})`);
          console.log(`    ${pc.dim('Why:')} ${rec.why}`);
          console.log(`    ${pc.dim('Action:')} ${rec.replacementStrategy}`);
        }
      }

      console.log('\n' + pc.bold('━'.repeat(64)) + '\n');
    });

  // architecture history
  arch
    .command('history')
    .description('Show longitudinal architectural health trends across successive commits')
    .option('-p, --project <path>', 'Path to project root directory', process.cwd())
    .option('-w, --window <number>', 'Number of commits in observation window', '10')
    .option('--json', 'Output machine-readable JSON to stdout')
    .action(async (options) => {
      const projectRoot = path.resolve(options.project);
      const projectId = getProjectIdentifier(projectRoot);
      const history = loadHistoricalSnapshots(projectId);
      const windowSize = parseInt(options.window, 10) || 10;

      if (history.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'No history snapshots found. Run audits or diffs first.' }));
        } else {
          console.log(pc.yellow(`\nNo historical snapshots recorded for ${path.basename(projectRoot)}. Run audits first to accumulate history.\n`));
        }
        return;
      }

      const latest = history[history.length - 1];
      const trends = analyzeLongitudinalTrends({
        currentSnapshot: latest,
        history,
        observationWindow: windowSize
      });

      if (options.json) {
        console.log(JSON.stringify({ snapshots: history.slice(-windowSize), trends }, null, 2));
        return;
      }

      console.log('\n' + pc.bold('━'.repeat(64)));
      console.log(pc.bold('  LONGITUDINAL ARCHITECTURAL HEALTH (Window: ') + pc.cyan(String(trends.snapshotsCount)) + pc.bold(' snapshots)'));
      console.log(pc.bold('━'.repeat(64)) + '\n');

      if (!trends.isComparable) {
        console.log(pc.yellow(`  ⚠ Comparability Warning: ${trends.comparabilityWarning}\n`));
      }

      console.log(pc.bold('  Metric Trajectory:'));
      for (const [metric, data] of Object.entries(trends.trends)) {
        const arrow = data.direction === 'improving' ? pc.green('▼') : data.direction === 'degrading' ? pc.red('▲') : pc.dim('■');
        const sign = data.delta > 0 ? '+' : '';
        console.log(`    ${arrow} ${pc.bold(metric.padEnd(24))} Base: ${String(data.baseline).padEnd(6)} → Current: ${String(data.current).padEnd(6)} (${sign}${data.delta})`);
      }

      console.log(pc.bold('\n  Current Change vs Pre-Existing Debt:'));
      console.log(`    Components Added (This Change): ${trends.currentChangeContribution.componentsAdded}`);
      console.log(`    Components Deleted (This Change): ${trends.currentChangeContribution.componentsDeleted}`);
      console.log(`    Pre-Existing Duplication: ${trends.existingDebt.baselineDuplication}`);
      console.log(`    Pre-Existing Single-Use: ${trends.existingDebt.baselineSingleUse}`);

      console.log('\n' + pc.bold('━'.repeat(64)) + '\n');
    });

  // architecture explain [findingId]
  arch
    .command('explain [findingId]')
    .description('Provide actionable evidence and remediation options (Repair vs Refactor vs Raze) for a finding')
    .option('-p, --project <path>', 'Path to project root directory', process.cwd())
    .option('--json', 'Output machine-readable JSON to stdout')
    .action(async (findingId, options) => {
      const projectRoot = path.resolve(options.project);
      const { config } = await loadConfig(projectRoot);
      const result = runArchitectureAnalysis(projectRoot, config.architecture || {});

      const allFindings = [...result.ruleFindings, ...result.heuristics, ...result.facts];
      const match = findingId ? allFindings.find((f) => f.id === findingId || f.id.includes(findingId)) : allFindings[0];

      if (!match) {
        console.log(pc.yellow(`\nNo matching finding for '${findingId || ''}'. Available findings:`));
        for (const f of allFindings) {
          console.log(`  - ${f.id} (${f.title})`);
        }
        return;
      }

      const explanationData = {
        finding: match,
        remediationOptions: result.remediations,
        supportingEvidence: match.details || []
      };

      if (options.json) {
        console.log(JSON.stringify(explanationData, null, 2));
        return;
      }

      console.log('\n' + pc.bold('━'.repeat(64)));
      console.log(pc.bold('  FINDING EXPLANATION: ') + pc.cyan(match.id));
      console.log(pc.bold('━'.repeat(64)) + '\n');

      console.log(`  ${pc.bold('Title:')}       ${match.title}`);
      console.log(`  ${pc.bold('Severity:')}    ${match.severity.toUpperCase()} (${match.evidenceType?.toUpperCase() || 'INFO'})`);
      console.log(`  ${pc.bold('Target:')}      ${match.element || 'Subsystem'}`);
      console.log(`  ${pc.bold('Description:')} ${match.description}`);
      if (match.explanation) {
        console.log(`  ${pc.bold('Context:')}     ${match.explanation}`);
      }

      console.log(pc.bold('\n  Actionable Remediation Options:'));
      for (const rec of result.remediations) {
        console.log(`    ${pc.cyan('•')} ${pc.bold(rec.strategy.toUpperCase())}: ${rec.why}`);
        console.log(`      ${pc.dim('Strategy:')} ${rec.replacementStrategy}`);
        console.log(`      ${pc.dim('What should survive:')} ${rec.whatShouldSurvive.join('; ')}`);
        console.log(`      ${pc.dim('Risks:')} ${rec.risks.join('; ')}`);
      }

      console.log('\n' + pc.bold('━'.repeat(64)) + '\n');
    });

  // Command Group: skills
  const skillsCmd = program
    .command('skills')
    .description('Manage, inspect, and install portable architecture skills for coding agents');

  skillsCmd
    .command('list')
    .description('List available architecture skills')
    .option('--json', 'Output as machine-readable JSON')
    .action(async (options) => {
      const skillsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');
      const skills: any[] = [];

      if (fs.existsSync(skillsDir)) {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
            if (fs.existsSync(skillFile)) {
              const content = fs.readFileSync(skillFile, 'utf8');
              const nameMatch = content.match(/name:\s*([^\n]+)/);
              const descMatch = content.match(/description:\s*([^\n]+)/);
              skills.push({
                name: nameMatch ? nameMatch[1].trim() : entry.name,
                description: descMatch ? descMatch[1].trim() : '',
                path: skillFile
              });
            }
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify(skills, null, 2));
        return;
      }

      console.log('\n' + pc.bold('━'.repeat(64)));
      console.log(pc.bold('  AQG PORTABLE AGENT SKILLS'));
      console.log(pc.bold('━'.repeat(64)) + '\n');

      for (const s of skills) {
        console.log(`  ${pc.bold(pc.cyan(s.name))}`);
        console.log(`    ${pc.dim(s.description)}\n`);
      }
      console.log(pc.dim(`Use 'npx skills add .' or 'agent-quality skills install' to link skills.\n`));
      console.log(pc.bold('━'.repeat(64)) + '\n');
    });

  skillsCmd
    .command('install')
    .description('Install AQG skills to coding agent environments (claude, gemini, opencode, codex)')
    .option('-a, --agent <agent>', 'Agent environment (claude, gemini, opencode, codex, all)', 'all')
    .option('--local', 'Install locally into current workspace (.skills/)')
    .action(async (options) => {
      const srcSkillsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');
      if (!fs.existsSync(srcSkillsDir)) {
        console.error(pc.red('Skills directory not found.'));
        return;
      }

      const targets: Record<string, string> = {
        claude: path.join(os.homedir(), '.claude', 'skills'),
        gemini: path.join(os.homedir(), '.gemini', 'skills'),
        opencode: path.join(os.homedir(), '.config', 'opencode', 'skills'),
        codex: path.join(os.homedir(), '.codex', 'skills')
      };

      if (options.local) {
        targets.local = path.join(process.cwd(), '.skills');
      }

      const agentsToInstall = options.agent === 'all' ? Object.keys(targets) : [options.agent];

      console.log('\n' + pc.bold('━'.repeat(64)));
      console.log(pc.bold('  INSTALLING AGENT SKILLS'));
      console.log(pc.bold('━'.repeat(64)) + '\n');

      const skillDirs = fs.readdirSync(srcSkillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());

      for (const agent of agentsToInstall) {
        const destBase = targets[agent];
        if (!destBase) continue;

        fs.mkdirSync(destBase, { recursive: true });
        for (const dir of skillDirs) {
          const srcPath = path.join(srcSkillsDir, dir.name);
          const destPath = path.join(destBase, dir.name);

          try {
            if (!fs.existsSync(destPath)) {
              fs.cpSync(srcPath, destPath, { recursive: true });
              console.log(`  ${pc.green('✓')} [${agent}] Installed skill: ${dir.name}`);
            } else {
              console.log(`  ${pc.dim('•')} [${agent}] Skill already present: ${dir.name}`);
            }
          } catch (e: any) {
            console.log(`  ${pc.yellow('▲')} [${agent}] Could not install ${dir.name}: ${e.message}`);
          }
        }
      }

      console.log('\n' + pc.bold('━'.repeat(64)) + '\n');
    });

  return program;
}
