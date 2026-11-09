import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isRecursiveExecution } from '../dist/adapters/hook-guard.js';

describe('Hook Guard & Deduplication', () => {
  test('detects recursive execution when environment flag is active', () => {
    delete process.env.AGENT_QUALITY_RUNNING;
    assert.equal(isRecursiveExecution(), false);

    process.env.AGENT_QUALITY_RUNNING = '1';
    assert.equal(isRecursiveExecution(), true);

    delete process.env.AGENT_QUALITY_RUNNING;
  });
});
