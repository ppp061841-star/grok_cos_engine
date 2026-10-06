/**
 * tests/test_format_loader.js
 * Unit tests for the restrict-only format loader.
 * No network, no API keys required.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  loadFormat,
  loadDefaultFormat,
  validateAndNormalize,
  applyRiskFloor,
  FORBIDDEN_KEYS,
} = require('../format_loader');

const EXAMPLE = path.join(__dirname, '..', 'formats', 'example_marketing.json');

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('test_format_loader.js');

// Positive path
test('loads example_marketing.json successfully', () => {
  const info = loadFormat(EXAMPLE);
  assert.equal(info.id, 'marketing-cos');
  assert.equal(info.version, '1.0.0');
  assert.ok(info.hash && info.hash.length === 64);
  assert.equal(info.format.specialists.length, 4);
  assert.equal(info.format.risk_policy.floor, 'low');
});

test('default format loads without error', () => {
  const info = loadDefaultFormat(path.join(__dirname, '..'));
  assert.ok(info.id);
  assert.ok(info.hash);
});

test('applyRiskFloor is escalate-only', () => {
  const fmt = { risk_policy: { floor: 'medium' } };
  assert.equal(applyRiskFloor('low', fmt), 'medium');
  assert.equal(applyRiskFloor('medium', fmt), 'medium');
  assert.equal(applyRiskFloor('high', fmt), 'high');
});

// Negative paths — must reject
test('rejects auto_approve key', () => {
  assert.throws(() => validateAndNormalize({
    identity: { id: 'bad', version: '1' },
    specialists: [
      { base_role: 'researcher' }, { base_role: 'analyst' },
      { base_role: 'creator' }, { base_role: 'critic' },
    ],
    approval_policy: { auto_approve: true },
  }), /FORMAT REJECTED/);
});

test('rejects skip / bypass language in values', () => {
  assert.throws(() => validateAndNormalize({
    identity: { id: 'bad', version: '1' },
    specialists: [
      { base_role: 'researcher' }, { base_role: 'analyst' },
      { base_role: 'creator' }, { base_role: 'critic' },
    ],
    defaults: { note: 'this will bypass approval' },
  }), /FORMAT REJECTED/);
});

test('rejects missing Critic', () => {
  assert.throws(() => validateAndNormalize({
    identity: { id: 'bad', version: '1' },
    specialists: [
      { base_role: 'researcher' }, { base_role: 'analyst' }, { base_role: 'creator' },
    ],
  }), /exactly one Critic/);
});

test('rejects two Critics', () => {
  assert.throws(() => validateAndNormalize({
    identity: { id: 'bad', version: '1' },
    specialists: [
      { base_role: 'researcher' }, { base_role: 'analyst' },
      { base_role: 'creator' }, { base_role: 'critic' }, { base_role: 'critic' },
    ],
  }), /exactly one Critic/);
});

test('rejects missing Researcher', () => {
  assert.throws(() => validateAndNormalize({
    identity: { id: 'bad', version: '1' },
    specialists: [
      { base_role: 'analyst' }, { base_role: 'creator' }, { base_role: 'critic' },
    ],
  }), /Researcher/);
});

test('rejects unknown / executable keys', () => {
  assert.throws(() => validateAndNormalize({
    identity: { id: 'bad', version: '1' },
    specialists: [
      { base_role: 'researcher' }, { base_role: 'analyst' },
      { base_role: 'creator' }, { base_role: 'critic' },
    ],
    hooks: { on_approve: 'evil()' },
  }), /FORMAT REJECTED/);
});

test('FORBIDDEN_KEYS set is non-empty', () => {
  assert.ok(FORBIDDEN_KEYS.size > 5);
});

console.log(process.exitCode ? '\nSome tests failed.' : '\nAll format-loader tests passed.');
