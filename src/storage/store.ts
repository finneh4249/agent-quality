import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const AGENT_QUALITY_DIR = process.env.AGENT_QUALITY_HOME || path.join(os.homedir(), '.agent-quality');
export const REPORTS_DIR = path.join(AGENT_QUALITY_DIR, 'reports');
export const BASELINES_DIR = path.join(AGENT_QUALITY_DIR, 'baselines');
export const CACHE_DIR = path.join(AGENT_QUALITY_DIR, 'cache');

export function ensureDirectories(): void {
  fs.mkdirSync(AGENT_QUALITY_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(BASELINES_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function getProjectIdentifier(projectRoot: string): string {
  const normalized = path.resolve(projectRoot);
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  const basename = path.basename(normalized).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${basename}-${hash}`;
}

export function saveReport(
  projectId: string,
  reportData: unknown,
  htmlReports: Record<string, string> = {}
): { jsonPath: string; latestJsonPath: string; htmlPaths: Record<string, string> } {
  ensureDirectories();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const projectReportsDir = path.join(REPORTS_DIR, projectId);
  fs.mkdirSync(projectReportsDir, { recursive: true });

  const jsonFilename = `report-${timestamp}.json`;
  const jsonPath = path.join(projectReportsDir, jsonFilename);
  fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf8');

  const latestJsonPath = path.join(projectReportsDir, 'latest.json');
  fs.copyFileSync(jsonPath, latestJsonPath);

  const savedHtmlPaths: Record<string, string> = {};
  for (const [routeName, htmlContent] of Object.entries(htmlReports)) {
    const safeRoute = routeName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'index';
    const htmlFilename = `report-${timestamp}-${safeRoute}.html`;
    const htmlPath = path.join(projectReportsDir, htmlFilename);
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    savedHtmlPaths[routeName] = htmlPath;
  }

  return {
    jsonPath,
    latestJsonPath,
    htmlPaths: savedHtmlPaths
  };
}

export function saveBaseline(projectId: string, baselineData: unknown): string {
  ensureDirectories();
  const baselinePath = path.join(BASELINES_DIR, `${projectId}.json`);
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        ...(typeof baselineData === 'object' && baselineData !== null ? baselineData : {})
      },
      null,
      2
    ),
    'utf8'
  );
  return baselinePath;
}

export function loadBaseline(projectId: string): any {
  ensureDirectories();
  const baselinePath = path.join(BASELINES_DIR, `${projectId}.json`);
  if (!fs.existsSync(baselinePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch {
    return null;
  }
}

export function loadRunState(projectId: string): any {
  ensureDirectories();
  const cachePath = path.join(CACHE_DIR, `${projectId}.json`);
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

export function saveRunState(projectId: string, state: unknown): string {
  ensureDirectories();
  const cachePath = path.join(CACHE_DIR, `${projectId}.json`);
  fs.writeFileSync(
    cachePath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        ...(typeof state === 'object' && state !== null ? state : {})
      },
      null,
      2
    ),
    'utf8'
  );
  return cachePath;
}
