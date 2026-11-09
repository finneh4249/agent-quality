import pc from 'picocolors';
import { ComprehensiveComparison } from '../policy/comparator.js';

export function printComparisonReport(comp: ComprehensiveComparison): void {
  console.log('\n' + pc.bold('━'.repeat(68)));
  console.log(pc.bold('  QUALITY GATE REGRESSION & COMPARISON REPORT'));
  console.log(pc.bold('━'.repeat(68)));

  const baseRev = comp.baseMetadata.gitRevision
    ? `${comp.baseMetadata.gitRevision.slice(0, 7)}${comp.baseMetadata.isDirty ? ' (dirty)' : ''}`
    : 'Stored Baseline';
  const currRev = comp.currentMetadata.gitRevision
    ? `${comp.currentMetadata.gitRevision.slice(0, 7)}${comp.currentMetadata.isDirty ? ' (dirty)' : ''}`
    : 'Current Run';

  console.log(`\n  ${pc.bold('Comparing:')} ${pc.dim(baseRev)} → ${pc.cyan(currRev)}`);
  console.log(`  ${pc.bold('Summary:')}   ${comp.hasRegressions ? pc.red(comp.summaryText) : pc.green(comp.summaryText)}\n`);

  // 1. Metric Diffs
  if (comp.metricDiffs.length > 0) {
    console.log(pc.bold('  Category Score Changes:'));
    for (const m of comp.metricDiffs) {
      if (m.status === 'unchanged') continue;

      let statusIcon = pc.dim('•');
      let deltaStr = `${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)}`;
      if (m.status === 'improved') {
        statusIcon = pc.green('▲');
        deltaStr = pc.green(deltaStr);
      } else if (m.status === 'worsened') {
        statusIcon = pc.red('▼');
        deltaStr = pc.red(deltaStr);
      } else if (m.status === 'inconclusive') {
        statusIcon = pc.yellow('~');
        deltaStr = pc.yellow(`${deltaStr} (noise)`);
      }

      console.log(
        `    ${statusIcon} ${m.route} [${m.profile}] ${m.category.padEnd(14)}: ${m.baseScore.toFixed(1)} → ${m.currentScore.toFixed(1)} (${deltaStr})`
      );
    }
    console.log('');
  }

  // 2. Individual Audit Findings Diffs
  if (comp.findingDiffs.length > 0) {
    console.log(pc.bold('  Attributed Audit Findings:'));
    for (const f of comp.findingDiffs) {
      let badge = pc.dim('[EXISTING]');
      if (f.status === 'new') badge = pc.red(pc.bold('[NEW / REGRESSION]'));
      if (f.status === 'resolved') badge = pc.green(pc.bold('[RESOLVED / FIXED]'));
      if (f.status === 'worsened') badge = pc.red('[WORSENED]');
      if (f.status === 'improved') badge = pc.green('[IMPROVED]');

      console.log(`    ${badge} ${pc.bold(f.title)} ${pc.dim(`(${f.category} on ${f.route})`)}`);
      if (f.element) {
        console.log(`      ${pc.dim('Element:')} ${pc.yellow(f.element.slice(0, 80))}`);
      }
      if (f.explanation) {
        console.log(`      ${pc.dim(f.explanation)}`);
      }
    }
    console.log('');
  }

  console.log(pc.bold('━'.repeat(68)));
  if (comp.hasRegressions) {
    console.log(pc.bold(pc.red(`  VERDICT: REGRESSION DETECTED (${comp.regressionsCount} regressions) (Exit 1)`)));
  } else {
    console.log(pc.bold(pc.green('  VERDICT: NO REGRESSIONS DETECTED (Exit 0)')));
  }
  console.log(pc.bold('━'.repeat(68)) + '\n');
}
