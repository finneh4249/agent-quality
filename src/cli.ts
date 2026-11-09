import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import pc from 'picocolors';
import { runQualityAudit } from './engine.js';
import { printTerminalReport } from './reporting/terminal.js';
import { createNormalisedResultJson } from './reporting/json.js';
import { createMarkdownReport } from './reporting/markdown.js';
import { findChrome } from './environment/chrome.js';
import { ADAPTERS, fallbackGuide } from './adapters/index.js';

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

  // Command: baseline
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

  return program;
}
