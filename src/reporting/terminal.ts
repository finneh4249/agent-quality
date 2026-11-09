import pc from 'picocolors';
import { NormalisedResult } from '../types.js';

function formatScore(score: number, target: number, failureMode: 'failure' | 'warning' = 'failure'): string {
  const formatted = score.toFixed(1).padStart(5);
  const text = `${formatted} / ${target}`;
  if (score >= target) {
    return pc.green(`✓ ${text}`);
  }
  if (failureMode === 'warning') {
    return pc.yellow(`▲ ${text}`);
  }
  return pc.red(`✗ ${text}`);
}

export function printTerminalReport(result: NormalisedResult): void {
  console.log('\n' + pc.bold('━'.repeat(64)));
  console.log(pc.bold('  QUALITY GATE: ') + pc.cyan(result.projectName));
  console.log(pc.bold('━'.repeat(64)));

  if (result.status === 'not_applicable') {
    console.log(pc.yellow('\n  STATUS: NOT APPLICABLE'));
    console.log(pc.dim(`  ${result.reason || 'Non-web project: no frontend web interfaces detected.'}\n`));
    console.log(pc.bold('━'.repeat(64)) + '\n');
    return;
  }

  if (result.status === 'skipped_unchanged') {
    console.log(pc.green('\n  STATUS: SKIPPED (UNCHANGED)'));
    console.log(pc.dim('  No changes detected in working tree since the last passing quality audit.\n'));
    console.log(pc.bold('━'.repeat(64)) + '\n');
    return;
  }

  if (result.status === 'execution_failure' || result.status === 'missing_dependency' || result.status === 'not_configured') {
    console.log(pc.red(`\n  STATUS: ${result.status.toUpperCase().replace('_', ' ')}`));
    console.log(pc.red(`  ${result.reason || 'Quality audit execution failed.'}\n`));
    console.log(pc.bold('━'.repeat(64)) + '\n');
    return;
  }

  const routes = result.plan.targets.map((t) => t.route);
  console.log(`\n  ${pc.bold('Routes Tested:')} ${routes.map((r) => pc.cyan(r)).join(', ')}\n`);

  if (result.evaluation) {
    for (const routeSum of result.evaluation.routeSummaries) {
      console.log(`  ${pc.bold('Route:')} ${pc.underline(routeSum.route)}`);

      for (const [profile, categories] of Object.entries(routeSum.profiles)) {
        const perf = categories.performance
          ? formatScore(categories.performance.score, categories.performance.target, categories.performance.failureMode)
          : 'N/A';
        const a11y = categories.accessibility
          ? formatScore(categories.accessibility.score, categories.accessibility.target, categories.accessibility.failureMode)
          : 'N/A';
        const bp = categories['best-practices']
          ? formatScore(categories['best-practices'].score, categories['best-practices'].target, categories['best-practices'].failureMode)
          : 'N/A';
        const seo = categories.seo
          ? formatScore(categories.seo.score, categories.seo.target, categories.seo.failureMode)
          : 'N/A';

        console.log(`    ${pc.dim(profile.padEnd(8))} Perf: ${perf} | A11y: ${a11y} | BP: ${bp} | SEO: ${seo}`);
      }
      console.log('');
    }

    if (result.evaluation.regressions && result.evaluation.regressions.length > 0) {
      console.log(pc.bold(pc.yellow('  Largest Regressions (vs Baseline):')));
      for (const reg of result.evaluation.regressions.slice(0, 3)) {
        console.log(
          `    ${pc.yellow('▼')} ${reg.route} (${reg.profile}) ${reg.category}: ${reg.baselineScore.toFixed(1)} → ${reg.currentScore.toFixed(1)} (-${reg.drop.toFixed(1)})`
        );
      }
      console.log('');
    }
  }

  if (result.topIssues && result.topIssues.length > 0) {
    console.log(pc.bold('  Highest-Impact Actionable Issues:'));
    for (const issue of result.topIssues.slice(0, 4)) {
      console.log(`    ${pc.red('•')} ${pc.bold(issue.title)}${issue.displayValue ? ` (${pc.dim(issue.displayValue)})` : ''}`);
      if (issue.description) {
        const firstSentence = issue.description.split('.')[0] + '.';
        console.log(`      ${pc.dim(firstSentence)}`);
      }
    }
    console.log('');
  }

  if (result.reportPaths.htmlPaths && Object.keys(result.reportPaths.htmlPaths).length > 0) {
    console.log(pc.bold('  Local HTML Reports:'));
    for (const [key, filePath] of Object.entries(result.reportPaths.htmlPaths)) {
      console.log(`    ${pc.dim('→')} ${key}: file://${filePath}`);
    }
    console.log('');
  }

  if (result.reportPaths.jsonPath) {
    console.log(`  ${pc.dim('JSON Report:')} file://${result.reportPaths.jsonPath}`);
  }
  if (result.baselinePath) {
    console.log(`  ${pc.dim('Baseline:')}    file://${result.baselinePath}`);
  }

  console.log('\n' + pc.bold('━'.repeat(64)));
  if (result.status === 'passed') {
    if (result.evaluation?.hasWarning) {
      console.log(pc.bold(pc.yellow('  GATE VERDICT: PASSED WITH WARNINGS (Exit 0)')));
    } else {
      console.log(pc.bold(pc.green('  GATE VERDICT: PASSED (Exit 0)')));
    }
  } else {
    console.log(pc.bold(pc.red('  GATE VERDICT: FAILED (Exit 1)')));
    if (result.evaluation?.failures) {
      for (const fail of result.evaluation.failures) {
        console.log(
          pc.red(`    ✗ ${fail.route} [${fail.profile}] ${fail.category}: ${fail.score.toFixed(1)} < ${fail.target}`)
        );
      }
    }
  }
  console.log(pc.bold('━'.repeat(64)) + '\n');
}
