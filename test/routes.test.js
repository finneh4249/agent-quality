import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanStaticRoutes, selectRepresentativeSample, mapChangedFilesToRoutes } from '../dist/discovery/routes.js';

describe('Discovery Routes', () => {
  test('scans static HTML files to URLs', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-test-dist-'));
    fs.writeFileSync(path.join(tmp, 'index.html'), 'home');
    fs.mkdirSync(path.join(tmp, 'about'));
    fs.writeFileSync(path.join(tmp, 'about', 'index.html'), 'about');
    fs.mkdirSync(path.join(tmp, 'blog'));
    fs.writeFileSync(path.join(tmp, 'blog', 'post-1.html'), 'post 1');

    const routes = scanStaticRoutes(tmp);
    assert.deepEqual(routes.sort(), ['/', '/about/', '/blog/post-1'].sort());
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('selects representative sample prioritizing root /', () => {
    const routes = ['/services', '/', '/contact', '/about', '/blog/1', '/blog/2'];
    const sample = selectRepresentativeSample(routes, 3);
    assert.equal(sample.length, 3);
    assert.equal(sample.includes('/'), true);
  });

  test('maps changed component or layout files to root', () => {
    const changed = ['src/components/Header.astro', 'src/styles/global.css'];
    const mapped = mapChangedFilesToRoutes(changed, ['/', '/about', '/contact']);
    assert.equal(mapped.includes('/'), true);
  });
});
