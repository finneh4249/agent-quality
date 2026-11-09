import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export function scanStaticRoutes(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) {
    return [];
  }

  const routes = new Set<string>();

  function walk(currentDir: string, baseDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, baseDir);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        const relative = path.relative(baseDir, fullPath);
        let route: string | null = null;
        if (relative === 'index.html') {
          route = '/';
        } else if (relative.endsWith('/index.html')) {
          route = '/' + relative.slice(0, -'/index.html'.length) + '/';
        } else if (relative.endsWith('.html')) {
          route = '/' + relative.slice(0, -'.html'.length);
        }
        if (route) {
          routes.add(route);
        }
      }
    }
  }

  try {
    walk(outputDir, outputDir);
  } catch {}

  return Array.from(routes).sort();
}

export function parseSitemap(sitemapPath: string): string[] {
  if (!fs.existsSync(sitemapPath)) {
    return [];
  }
  try {
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    const routes: string[] = [];
    for (const match of matches) {
      try {
        const parsed = new URL(match[1]);
        routes.push(parsed.pathname);
      } catch {}
    }
    return routes;
  } catch {
    return [];
  }
}

export function getChangedFiles(projectRoot: string): string[] {
  try {
    const statusOutput = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf8' });
    const changed = new Set<string>();
    const lines = statusOutput.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const filePath = trimmed.slice(3).trim();
      changed.add(filePath);
    }

    if (changed.size === 0) {
      const diffOutput = execSync('git diff-tree --no-commit-id --name-only -r HEAD', {
        cwd: projectRoot,
        encoding: 'utf8'
      });
      diffOutput.split('\n').filter(Boolean).forEach((f) => changed.add(f.trim()));
    }

    return Array.from(changed);
  } catch {
    return [];
  }
}

export function mapChangedFilesToRoutes(changedFiles: string[], allRoutes: string[] = []): string[] {
  const matched = new Set<string>();

  for (const file of changedFiles) {
    const normalized = file.toLowerCase();

    if (
      normalized.includes('index.') ||
      normalized.includes('layout') ||
      normalized.includes('header') ||
      normalized.includes('footer') ||
      normalized.includes('nav') ||
      normalized.includes('global.css')
    ) {
      matched.add('/');
    }

    const parts = file.split(/[\\/]/);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].replace(/\.[a-zA-Z0-9]+$/, '');
      if (['pages', 'routes', 'src', 'app', 'components'].includes(part)) continue;
      for (const route of allRoutes) {
        if (route.toLowerCase().includes(part.toLowerCase())) {
          matched.add(route);
        }
      }
    }
  }

  if (matched.size === 0) {
    matched.add('/');
  }

  return Array.from(matched);
}

export function selectRepresentativeSample(routes: string[], limit = 4): string[] {
  if (routes.length <= limit) {
    return routes;
  }

  const selected = new Set<string>();

  if (routes.includes('/')) {
    selected.add('/');
  }

  const topLevel = routes.filter((r) => r !== '/' && r.split('/').filter(Boolean).length === 1);
  for (const r of topLevel) {
    if (selected.size >= limit) break;
    selected.add(r);
  }

  for (const r of routes) {
    if (selected.size >= limit) break;
    selected.add(r);
  }

  return Array.from(selected);
}

export const DEFAULT_EXCLUDE_ROUTES = [
  '/404',
  '/404.html',
  '/404/',
  '/500',
  '/500.html',
  '/500/',
  '/403',
  '/403.html',
  '/403/',
  '/503',
  '/503.html',
  '/503/'
];

export function resolveRoutes({
  configRoutes = [],
  sampleRoutes = null,
  excludeRoutes = [],
  projectRoot,
  outputDir = 'dist',
  mode = 'sample'
}: {
  configRoutes?: string[];
  sampleRoutes?: string[] | null;
  excludeRoutes?: string[];
  projectRoot: string;
  outputDir?: string;
  mode?: 'sample' | 'changed' | 'all';
}): string[] {
  let allDiscovered: string[] = [];

  if (configRoutes && configRoutes.length > 0) {
    allDiscovered = [...configRoutes];
  } else {
    const fullOutputDir = path.isAbsolute(outputDir) ? outputDir : path.join(projectRoot, outputDir || 'dist');
    const scanned = scanStaticRoutes(fullOutputDir);
    if (scanned.length > 0) {
      allDiscovered = scanned;
    }

    const sitemapCandidates = [
      path.join(fullOutputDir, 'sitemap.xml'),
      path.join(fullOutputDir, 'sitemap-0.xml'),
      path.join(fullOutputDir, 'sitemap-index.xml')
    ];
    for (const sm of sitemapCandidates) {
      if (fs.existsSync(sm)) {
        const fromSm = parseSitemap(sm);
        allDiscovered = Array.from(new Set([...allDiscovered, ...fromSm]));
      }
    }
  }

  if (allDiscovered.length === 0) {
    allDiscovered = ['/'];
  }

  const combinedExcludes = [...DEFAULT_EXCLUDE_ROUTES, ...(excludeRoutes || [])];

  const filtered = allDiscovered.filter((r) => {
    return !combinedExcludes.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(r);
      }
      return r === pattern || r === pattern + '/';
    });
  });

  const finalPool = filtered.length > 0 ? filtered : ['/'];

  if (mode === 'all') {
    return finalPool;
  }

  if (mode === 'changed') {
    const changedFiles = getChangedFiles(projectRoot);
    if (changedFiles.length === 0) {
      return selectRepresentativeSample(finalPool, 3);
    }
    const mapped = mapChangedFilesToRoutes(changedFiles, finalPool);
    return mapped.length > 0 ? mapped : selectRepresentativeSample(finalPool, 3);
  }

  if (sampleRoutes && Array.isArray(sampleRoutes) && sampleRoutes.length > 0) {
    return sampleRoutes;
  }

  return selectRepresentativeSample(finalPool, 4);
}
