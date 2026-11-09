import { NormalisedResult } from '../types.js';

export function createMarkdownReport(result: NormalisedResult): string {
  const lines: string[] = [];

  lines.push(`# Quality Gate Report: ${result.projectName}`);
  lines.push('');
  lines.push(`- **Status**: ${result.status.toUpperCase()}`);
  lines.push(`- **Timestamp**: ${result.timestamp}`);
  lines.push(`- **Project Root**: \`${result.projectRoot}\``);
  lines.push('');

  if (result.status === 'not_applicable') {
    lines.push(`> [!NOTE]\n> Quality gate not applicable: ${result.reason || 'No frontend web interface detected.'}`);
    return lines.join('\n');
  }

  if (result.status === 'skipped_unchanged') {
    lines.push(`> [!NOTE]\n> Skipped: No changes detected since last passed audit.`);
    return lines.join('\n');
  }

  if (result.evaluation) {
    lines.push('## Scores Summary');
    lines.push('');
    lines.push('| Route | Profile | Performance | Accessibility | Best Practices | SEO | Status |');
    lines.push('|---|---|---|---|---|---|---|');

    for (const routeSum of result.evaluation.routeSummaries) {
      for (const [profile, cats] of Object.entries(routeSum.profiles)) {
        const perf = cats.performance ? `${cats.performance.score.toFixed(1)} / ${cats.performance.target}` : '-';
        const a11y = cats.accessibility ? `${cats.accessibility.score.toFixed(1)} / ${cats.accessibility.target}` : '-';
        const bp = cats['best-practices'] ? `${cats['best-practices'].score.toFixed(1)} / ${cats['best-practices'].target}` : '-';
        const seo = cats.seo ? `${cats.seo.score.toFixed(1)} / ${cats.seo.target}` : '-';
        const pass = Object.values(cats).every((c: any) => c.passed || c.failureMode === 'warning');
        lines.push(`| \`${routeSum.route}\` | ${profile} | ${perf} | ${a11y} | ${bp} | ${seo} | ${pass ? 'PASSED' : 'FAILED'} |`);
      }
    }
    lines.push('');

    if (result.evaluation.regressions && result.evaluation.regressions.length > 0) {
      lines.push('## Regressions (vs Baseline)');
      lines.push('');
      for (const reg of result.evaluation.regressions) {
        lines.push(`- **${reg.route}** (${reg.profile}) ${reg.category}: ${reg.baselineScore.toFixed(1)} → ${reg.currentScore.toFixed(1)} (-${reg.drop.toFixed(1)})`);
      }
      lines.push('');
    }
  }

  if (result.findings && result.findings.length > 0) {
    lines.push('## Actionable Findings');
    lines.push('');
    for (const f of result.findings) {
      lines.push(`### [${f.severity.toUpperCase()}] ${f.title} (${f.category})`);
      if (f.score !== null) lines.push(`- **Score**: ${f.score}/100 (Weight: ${f.weight || 0})`);
      if (f.element) lines.push(`- **Element**: \`${f.element}\``);
      if (f.url) lines.push(`- **URL**: \`${f.url}\``);
      if (f.explanation) lines.push(`- **Explanation**: ${f.explanation}`);
      lines.push('');
    }
  } else if (result.topIssues && result.topIssues.length > 0) {
    lines.push('## Actionable Issues');
    lines.push('');
    for (const issue of result.topIssues) {
      lines.push(`- **${issue.title}**${issue.displayValue ? ` (${issue.displayValue})` : ''}`);
      if (issue.description) {
        lines.push(`  ${issue.description}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
