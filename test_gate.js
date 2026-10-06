/**
 * tests/test_gate.js
 * Unit tests for the unified execution gate (I-4).
 * Uses an in-memory SQLite database. No network.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { execute } = require('../mission_chain');

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

function openTempDb() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'test17_schema.sql'), 'utf8');
  // Use a unique temp file so concurrent runs don't clash
  const tmp = path.join('/tmp', `cos-gate-test-${process.pid}-${Date.now()}.db`);
  const db = new DatabaseSync(tmp);
  db.exec(schema);
  // Clean up on process exit
  process.on('exit', () => { try { fs.unlinkSync(tmp); } catch {} });
  return db;
}

function seedMission(db, id) {
  db.prepare(`INSERT INTO missions (id, request_text, status, risk_tier, created_at) VALUES (?, ?, 'PROPOSED', 'low', ?)`)
    .run(id, 'test objective', new Date().toISOString());
}

function addDecision(db, missionId, status, rationale = status) {
  db.prepare(`INSERT INTO decisions (mission_id, status, rationale, created_at) VALUES (?, ?, ?, ?)`)
    .run(missionId, status, rationale, new Date().toISOString());
}

console.log('test_gate.js');

test('execute refuses when no APPROVED row exists', () => {
  const db = openTempDb();
  const id = 'm-no-approve';
  seedMission(db, id);
  addDecision(db, id, 'PROPOSED');
  addDecision(db, id, 'AWAITING_APPROVAL');
  assert.throws(() => execute(db, id), /BOUNDARY VIOLATION BLOCKED/);
  const execs = db.prepare(`SELECT COUNT(*) AS n FROM execution_log WHERE mission_id = ?`).get(id).n;
  assert.equal(execs, 0);
  db.close();
});

test('execute succeeds with a genuine APPROVED row', () => {
  const db = openTempDb();
  const id = 'm-approved';
  seedMission(db, id);
  addDecision(db, id, 'PROPOSED');
  addDecision(db, id, 'AWAITING_APPROVAL');
  addDecision(db, id, 'APPROVED', 'operator approved');
  execute(db, id);
  const execs = db.prepare(`SELECT COUNT(*) AS n FROM execution_log WHERE mission_id = ?`).get(id).n;
  assert.equal(execs, 1);
  const statuses = db.prepare(`SELECT status FROM decisions WHERE mission_id = ? ORDER BY id`).all(id).map(r => r.status);
  assert.ok(statuses.includes('EXECUTED'));
  assert.ok(statuses.includes('COMPLETED'));
  db.close();
});

test('execute refuses when REJECTED appears after APPROVED', () => {
  const db = openTempDb();
  const id = 'm-later-reject';
  seedMission(db, id);
  addDecision(db, id, 'PROPOSED');
  addDecision(db, id, 'APPROVED', 'operator approved');
  addDecision(db, id, 'REJECTED', 'operator changed mind');
  assert.throws(() => execute(db, id), /rejected after approval/);
  const execs = db.prepare(`SELECT COUNT(*) AS n FROM execution_log WHERE mission_id = ?`).get(id).n;
  assert.equal(execs, 0);
  db.close();
});

test('append-only triggers block UPDATE on decisions', () => {
  const db = openTempDb();
  const id = 'm-append';
  seedMission(db, id);
  addDecision(db, id, 'PROPOSED');
  const row = db.prepare(`SELECT id FROM decisions WHERE mission_id = ?`).get(id);
  assert.throws(() => {
    db.prepare(`UPDATE decisions SET status = 'HACKED' WHERE id = ?`).run(row.id);
  }, /I-6 VIOLATION/);
  db.close();
});

test('append-only triggers block DELETE on decisions', () => {
  const db = openTempDb();
  const id = 'm-delete';
  seedMission(db, id);
  addDecision(db, id, 'PROPOSED');
  const row = db.prepare(`SELECT id FROM decisions WHERE mission_id = ?`).get(id);
  assert.throws(() => {
    db.prepare(`DELETE FROM decisions WHERE id = ?`).run(row.id);
  }, /I-6 VIOLATION/);
  db.close();
});

console.log(process.exitCode ? '\nSome gate tests failed.' : '\nAll gate tests passed.');
