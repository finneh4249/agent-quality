import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runQualityAudit } from '../dist/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_CLI = path.join(ROOT_DIR, 'bin', 'agent-quality.js');

describe('Engine & Provider Initialization Regression Suite', () => {
  test('regression: plan is fully initialized before provider filtering and execution', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-engine-reg-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'test-reg-pkg' }));

    // Executing runQualityAudit directly against the engine must never throw "Cannot access 'plan' before initialization"
    const result = await runQualityAudit({
      projectRoot: tmp
    });

    assert.ok(result);
    assert.equal(result.schemaVersion, 'aqg.result.v1');
    assert.ok(result.plan);
    assert.equal(result.plan.projectName, path.basename(tmp));
    assert.ok(Array.isArray(result.plan.applicableProviders));
    assert.ok(result.plan.applicableProviders.includes('architecture-health'));
    assert.equal(result.status, 'passed');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('regression: CLI audit executes end-to-end successfully with real engine', () => {
    // Run the actual CLI binary via node subprocess
    const stdout = execSync(`node "${BIN_CLI}" audit`, {
      cwd: ROOT_DIR,
      encoding: 'utf8'
    });

    assert.match(stdout, /QUALITY GATE: agent-quality/i);
    assert.match(stdout, /GATE VERDICT: PASSED/i);
    assert.match(stdout, /JSON Report:/i);
  });
});
