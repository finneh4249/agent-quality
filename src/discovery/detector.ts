import fs from 'node:fs';
import path from 'node:path';
import { ProjectFrameworkType } from '../types.js';

export interface FrameworkDescriptor {
  name: string;
  defaultPort: number;
  defaultPreviewCommand: string | null;
  defaultBuildCommand: string | null;
  outputDir: string;
}

export const FRAMEWORKS: Record<string, FrameworkDescriptor> = {
  astro: {
    name: 'Astro',
    defaultPort: 4321,
    defaultPreviewCommand: 'npm run preview',
    defaultBuildCommand: 'npm run build',
    outputDir: 'dist'
  },
  vite: {
    name: 'Vite',
    defaultPort: 4173,
    defaultPreviewCommand: 'npm run preview',
    defaultBuildCommand: 'npm run build',
    outputDir: 'dist'
  },
  next: {
    name: 'Next.js',
    defaultPort: 3000,
    defaultPreviewCommand: 'npm run start',
    defaultBuildCommand: 'npm run build',
    outputDir: '.next'
  },
  nuxt: {
    name: 'Nuxt',
    defaultPort: 3000,
    defaultPreviewCommand: 'npm run preview',
    defaultBuildCommand: 'npm run build',
    outputDir: '.output/public'
  },
  sveltekit: {
    name: 'SvelteKit',
    defaultPort: 4173,
    defaultPreviewCommand: 'npm run preview',
    defaultBuildCommand: 'npm run build',
    outputDir: 'build'
  },
  static: {
    name: 'Static HTML',
    defaultPort: 8080,
    defaultPreviewCommand: null,
    defaultBuildCommand: null,
    outputDir: '.'
  }
};

export interface DetectedProject {
  type: ProjectFrameworkType;
  framework: FrameworkDescriptor | null;
  isWeb: boolean;
  reason?: string;
  hasPreviewScript: boolean;
  hasBuildScript: boolean;
  isMonorepo: boolean;
  workspaceGlobs: string[];
}

export function detectMonorepo(projectRoot: string): { isMonorepo: boolean; workspaceGlobs: string[] } {
  const pnpmWorkspace = path.join(projectRoot, 'pnpm-workspace.yaml');
  const turboJson = path.join(projectRoot, 'turbo.json');
  const lernaJson = path.join(projectRoot, 'lerna.json');
  const pkgJsonPath = path.join(projectRoot, 'package.json');

  let isMonorepo = false;
  const workspaceGlobs: string[] = [];

  if (fs.existsSync(pnpmWorkspace)) {
    isMonorepo = true;
    try {
      const content = fs.readFileSync(pnpmWorkspace, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-')) {
          workspaceGlobs.push(trimmed.replace(/^-\s*['"]?/, '').replace(/['"]?$/, ''));
        }
      }
    } catch {}
  } else if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.workspaces) {
        isMonorepo = true;
        const pkgs = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
        workspaceGlobs.push(...pkgs);
      }
    } catch {}
  } else if (fs.existsSync(turboJson) || fs.existsSync(lernaJson)) {
    isMonorepo = true;
  }

  return { isMonorepo, workspaceGlobs };
}

export function detectFramework(projectRoot: string): DetectedProject {
  const monorepo = detectMonorepo(projectRoot);
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  let pkg: any = null;

  if (fs.existsSync(pkgJsonPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    } catch {}
  }

  // 1. Check Astro
  const hasAstroConfig = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts'].some((f) =>
    fs.existsSync(path.join(projectRoot, f))
  );
  if (hasAstroConfig || pkg?.dependencies?.astro || pkg?.devDependencies?.astro) {
    return {
      type: 'astro',
      framework: FRAMEWORKS.astro,
      isWeb: true,
      hasPreviewScript: Boolean(pkg?.scripts?.preview),
      hasBuildScript: Boolean(pkg?.scripts?.build),
      ...monorepo
    };
  }

  // 2. Check Next.js
  const hasNextConfig = ['next.config.js', 'next.config.mjs', 'next.config.ts'].some((f) =>
    fs.existsSync(path.join(projectRoot, f))
  );
  if (hasNextConfig || pkg?.dependencies?.next || pkg?.devDependencies?.next) {
    return {
      type: 'next',
      framework: FRAMEWORKS.next,
      isWeb: true,
      hasPreviewScript: Boolean(pkg?.scripts?.start || pkg?.scripts?.preview),
      hasBuildScript: Boolean(pkg?.scripts?.build),
      ...monorepo
    };
  }

  // 3. Check Nuxt
  const hasNuxtConfig = ['nuxt.config.js', 'nuxt.config.ts'].some((f) =>
    fs.existsSync(path.join(projectRoot, f))
  );
  if (hasNuxtConfig || pkg?.dependencies?.nuxt || pkg?.devDependencies?.nuxt) {
    return {
      type: 'nuxt',
      framework: FRAMEWORKS.nuxt,
      isWeb: true,
      hasPreviewScript: Boolean(pkg?.scripts?.preview),
      hasBuildScript: Boolean(pkg?.scripts?.build),
      ...monorepo
    };
  }

  // 4. Check SvelteKit
  const hasSvelteConfig = ['svelte.config.js'].some((f) => fs.existsSync(path.join(projectRoot, f)));
  if ((hasSvelteConfig && pkg?.devDependencies?.['@sveltejs/kit']) || pkg?.dependencies?.['@sveltejs/kit']) {
    return {
      type: 'sveltekit',
      framework: FRAMEWORKS.sveltekit,
      isWeb: true,
      hasPreviewScript: Boolean(pkg?.scripts?.preview),
      hasBuildScript: Boolean(pkg?.scripts?.build),
      ...monorepo
    };
  }

  // 5. Check Vite
  const hasViteConfig = ['vite.config.js', 'vite.config.mjs', 'vite.config.ts'].some((f) =>
    fs.existsSync(path.join(projectRoot, f))
  );
  if (hasViteConfig || pkg?.dependencies?.vite || pkg?.devDependencies?.vite) {
    return {
      type: 'vite',
      framework: FRAMEWORKS.vite,
      isWeb: true,
      hasPreviewScript: Boolean(pkg?.scripts?.preview),
      hasBuildScript: Boolean(pkg?.scripts?.build),
      ...monorepo
    };
  }

  // 6. Check static HTML files
  const hasRootIndex = fs.existsSync(path.join(projectRoot, 'index.html'));
  const hasPublicIndex = fs.existsSync(path.join(projectRoot, 'public', 'index.html'));

  if (hasRootIndex || hasPublicIndex) {
    const outputDir = hasPublicIndex && !hasRootIndex ? 'public' : '.';
    return {
      type: 'static',
      framework: {
        ...FRAMEWORKS.static,
        outputDir
      },
      isWeb: true,
      hasPreviewScript: Boolean(pkg?.scripts?.preview || pkg?.scripts?.start || pkg?.scripts?.serve),
      hasBuildScript: Boolean(pkg?.scripts?.build),
      ...monorepo
    };
  }

  // 7. Check if non-web project (CLI, backend worker, library, python, rust, or no web interface)
  const isBackendOrCli = Boolean(
    pkg &&
    !pkg.dependencies?.react &&
    !pkg.dependencies?.vue &&
    !pkg.dependencies?.svelte &&
    !pkg.devDependencies?.react &&
    !pkg.devDependencies?.vue &&
    !pkg.devDependencies?.svelte &&
    (pkg.main || pkg.bin || pkg.dependencies?.hono || pkg.dependencies?.express || pkg.dependencies?.wrangler || pkg.devDependencies?.wrangler)
  );

  const hasNoWebFiles = !fs.existsSync(path.join(projectRoot, 'index.html')) &&
                        !fs.existsSync(path.join(projectRoot, 'public', 'index.html')) &&
                        !fs.existsSync(path.join(projectRoot, 'src', 'index.html')) &&
                        !fs.existsSync(path.join(projectRoot, 'pages')) &&
                        !fs.existsSync(path.join(projectRoot, 'src', 'pages'));

  const hasNoWebDeps = !pkg?.dependencies?.react &&
                       !pkg?.dependencies?.vue &&
                       !pkg?.dependencies?.svelte &&
                       !pkg?.devDependencies?.react &&
                       !pkg?.devDependencies?.vue &&
                       !pkg?.devDependencies?.svelte;

  const hasNoPreviewScripts = !pkg?.scripts?.preview && !pkg?.scripts?.start && !pkg?.scripts?.serve;

  if (!pkg || isBackendOrCli || (hasNoWebFiles && hasNoWebDeps && hasNoPreviewScripts)) {
    return {
      type: 'non_web',
      framework: null,
      isWeb: false,
      reason: 'No frontend web framework, HTML templates or web interface detected in repository',
      hasPreviewScript: false,
      hasBuildScript: false,
      ...monorepo
    };
  }

  // Generic web app fallback
  return {
    type: 'generic_web',
    framework: FRAMEWORKS.static,
    isWeb: true,
    hasPreviewScript: Boolean(pkg?.scripts?.preview || pkg?.scripts?.start || pkg?.scripts?.serve),
    hasBuildScript: Boolean(pkg?.scripts?.build),
    ...monorepo
  };
}
