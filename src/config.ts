import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { QualityPolicy, CategoryThreshold, ArchitectureConfig } from './types.js';

export const DEFAULT_THRESHOLDS: Record<string, CategoryThreshold> = {
  performance: {
    threshold: 90,
    failureMode: 'warning'
  },
  accessibility: {
    threshold: 95,
    failureMode: 'failure'
  },
  'best-practices': {
    threshold: 95,
    failureMode: 'failure'
  },
  seo: {
    threshold: 95,
    failureMode: 'failure'
  },
  'architecture-rules': {
    threshold: 100,
    failureMode: 'failure'
  }
};

export interface AgentQualityConfig {
  previewCommand?: string | null;
  previewUrl?: string | null;
  buildCommand?: string | null;
  appDir?: string;
  outputDir?: string;
  routes?: string[];
  sampleRoutes?: string[] | null;
  excludeRoutes?: string[];
  runs?: number;
  profiles?: Array<'mobile' | 'desktop'>;
  thresholds?: Record<string, Partial<CategoryThreshold>>;
  auth?: {
    headers?: Record<string, string>;
    cookies?: unknown[];
  };
  allowedExclusions?: string[];
  env?: Record<string, string>;
  architecture?: ArchitectureConfig;
  _source?: string;
}

const CONFIG_FILENAMES = [
  'agent-quality.config.js',
  'agent-quality.config.mjs',
  'agent-quality.config.json',
  '.agentqualityrc',
  '.agentqualityrc.json'
];

export async function loadConfig(
  projectRoot = process.cwd(),
  inlineOverrides: Partial<AgentQualityConfig> = {}
): Promise<{
  config: AgentQualityConfig;
  policy: QualityPolicy;
}> {
  let fileConfig: AgentQualityConfig = {};

  for (const filename of CONFIG_FILENAMES) {
    const filePath = path.join(projectRoot, filename);
    if (fs.existsSync(filePath)) {
      if (filename.endsWith('.json') || filename.startsWith('.agentqualityrc')) {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          fileConfig = JSON.parse(raw);
          fileConfig._source = filename;
          break;
        } catch (err: any) {
          throw new Error(`Failed to parse configuration file ${filename}: ${err.message}`);
        }
      } else {
        try {
          const fileUrl = pathToFileURL(filePath).href;
          const imported = await import(fileUrl);
          fileConfig = imported.default || imported;
          fileConfig._source = filename;
          break;
        } catch (err: any) {
          throw new Error(`Failed to load configuration file ${filename}: ${err.message}`);
        }
      }
    }
  }

  if (!fileConfig._source) {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.agentQuality) {
          fileConfig = pkg.agentQuality;
          fileConfig._source = 'package.json#agentQuality';
        }
      } catch {}
    }
  }

  const mergedConfig: AgentQualityConfig = {
    previewCommand: null,
    previewUrl: null,
    buildCommand: null,
    appDir: '.',
    routes: [],
    sampleRoutes: null,
    excludeRoutes: [],
    runs: 3,
    profiles: ['mobile', 'desktop'],
    allowedExclusions: [],
    env: {},
    ...fileConfig,
    ...inlineOverrides,
    auth: {
      headers: {},
      cookies: [],
      ...(fileConfig.auth || {}),
      ...(inlineOverrides.auth || {})
    }
  };

  const finalThresholds: Record<string, CategoryThreshold> = {
    performance: {
      ...DEFAULT_THRESHOLDS.performance,
      ...(fileConfig.thresholds?.performance || {}),
      ...(inlineOverrides.thresholds?.performance || {})
    },
    accessibility: {
      ...DEFAULT_THRESHOLDS.accessibility,
      ...(fileConfig.thresholds?.accessibility || {}),
      ...(inlineOverrides.thresholds?.accessibility || {})
    },
    'best-practices': {
      ...DEFAULT_THRESHOLDS['best-practices'],
      ...(fileConfig.thresholds?.['best-practices'] || (fileConfig.thresholds as any)?.bestPractices || {}),
      ...(inlineOverrides.thresholds?.['best-practices'] || (inlineOverrides.thresholds as any)?.bestPractices || {})
    },
    seo: {
      ...DEFAULT_THRESHOLDS.seo,
      ...(fileConfig.thresholds?.seo || {}),
      ...(inlineOverrides.thresholds?.seo || {})
    }
  };

  const policy: QualityPolicy = {
    thresholds: finalThresholds,
    allowedExclusions: mergedConfig.allowedExclusions || []
  };

  return { config: mergedConfig, policy };
}
