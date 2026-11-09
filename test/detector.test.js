import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectFramework, detectMonorepo } from '../dist/discovery/detector.js';

describe('Discovery Detector', () => {
  test('detects Astro framework project', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-test-astro-'));
    fs.writeFileSync(path.join(tmp, 'astro.config.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'my-astro-site', scripts: { preview: 'astro preview' } }));

    const res = detectFramework(tmp);
    assert.equal(res.isWeb, true);
    assert.equal(res.type, 'astro');
    assert.equal(res.hasPreviewScript, true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('detects Vite framework project', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-test-vite-'));
    fs.writeFileSync(path.join(tmp, 'vite.config.ts'), 'export default {};');
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'my-vite-app', dependencies: { react: '^18.0.0' }, scripts: { preview: 'vite preview' } }));

    const res = detectFramework(tmp);
    assert.equal(res.isWeb, true);
    assert.equal(res.type, 'vite');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('detects static HTML project', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-test-static-'));
    fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><html><body>Hello</body></html>');

    const res = detectFramework(tmp);
    assert.equal(res.isWeb, true);
    assert.equal(res.type, 'static');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('detects non-web CLI or backend project as not_applicable', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-test-nonweb-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      name: 'my-cli-tool',
      main: 'cli.js',
      dependencies: { commander: '^12.0.0', hono: '^4.0.0' }
    }));

    const res = detectFramework(tmp);
    assert.equal(res.isWeb, false);
    assert.equal(res.type, 'non_web');
    assert.match(res.reason || '', /no frontend web/i);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('detects monorepo workspaces via pnpm-workspace.yaml', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-test-mono-'));
    fs.writeFileSync(path.join(tmp, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n  - "packages/*"\n');

    const mono = detectMonorepo(tmp);
    assert.equal(mono.isMonorepo, true);
    assert.equal(mono.workspaceGlobs.includes('apps/*'), true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
