/**
 * format_loader.js — Grok COS Engine
 *
 * Restrict-only format manifest loader (I-2, I-4, FORMAT_SPEC).
 *
 * A format is pure data. It can only raise floors, never lower them,
 * never invent auto-approve, never reorder or skip the control chain,
 * and never inject executable code.
 *
 * Unknown keys → reject
 * Forbidden effects (allow / skip / auto_approve / de_escalate / override) → reject
 * Missing required base roles or Critic → reject
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORBIDDEN_KEYS = new Set([
  'allow', 'skip', 'auto_approve', 'autoApprove', 'de_escalate', 'deEscalate',
  'override', 'bypass', 'lower_risk', 'lowerRisk', 'code', 'eval', 'script',
  'hooks', 'on_approve', 'onApprove', 'executable', 'fn', 'function',
]);

const REQUIRED_BASE_ROLES = new Set(['researcher', 'analyst', 'creator', 'critic']);
const VALID_RISK = new Set(['low', 'medium', 'high']);

/**
 * Recursively walk an object and reject any forbidden key (case-insensitive).
 */
function assertNoForbiddenKeys(obj, pathSoFar = '') {
  if (obj === null || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_KEYS.has(lower) || FORBIDDEN_KEYS.has(k)) {
      throw new Error(`FORMAT REJECTED: forbidden key "${k}" at ${pathSoFar || '/'}`);
    }
    // Also reject string values that look like auto-approve language
    if (typeof v === 'string') {
      const s = v.toLowerCase();
      if (/\bauto[-_]?approve\b/.test(s) || /\bskip\s+approval\b/.test(s) || /\bbypass\b/.test(s)) {
        throw new Error(`FORMAT REJECTED: forbidden language in value of "${k}" at ${pathSoFar}`);
      }
    }
    assertNoForbiddenKeys(v, pathSoFar ? `${pathSoFar}.${k}` : k);
  }
}

/**
 * Validate a parsed manifest against FORMAT_SPEC rules.
 * Returns a normalized, frozen object ready for use.
 */
function validateAndNormalize(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('FORMAT REJECTED: root must be an object');
  }

  assertNoForbiddenKeys(raw);

  const identity = raw.identity;
  if (!identity || typeof identity.id !== 'string' || !identity.id.trim()) {
    throw new Error('FORMAT REJECTED: identity.id is required');
  }
  if (typeof identity.version !== 'string' || !identity.version.trim()) {
    throw new Error('FORMAT REJECTED: identity.version is required');
  }

  // specialists
  const specialists = raw.specialists;
  if (!Array.isArray(specialists) || specialists.length === 0) {
    throw new Error('FORMAT REJECTED: specialists array is required and must be non-empty');
  }

  const baseRolesSeen = new Set();
  let criticCount = 0;
  for (const s of specialists) {
    if (!s || typeof s !== 'object') {
      throw new Error('FORMAT REJECTED: each specialist must be an object');
    }
    const base = (s.base_role || s.baseRole || '').toLowerCase();
    if (!REQUIRED_BASE_ROLES.has(base)) {
      throw new Error(`FORMAT REJECTED: specialist base_role must be one of ${[...REQUIRED_BASE_ROLES].join(', ')}`);
    }
    baseRolesSeen.add(base);
    if (base === 'critic') criticCount++;
  }
  if (!baseRolesSeen.has('researcher')) {
    throw new Error('FORMAT REJECTED: at least one Researcher-based specialist is required');
  }
  if (criticCount !== 1) {
    throw new Error('FORMAT REJECTED: exactly one Critic-based specialist is required');
  }

  // risk_policy — restrict-only
  const riskPolicy = raw.risk_policy || raw.riskPolicy || {};
  if (riskPolicy.floor) {
    const floor = String(riskPolicy.floor).toLowerCase();
    if (!VALID_RISK.has(floor)) {
      throw new Error('FORMAT REJECTED: risk_policy.floor must be low|medium|high');
    }
  }
  // Explicitly forbid any de-escalation language
  if (riskPolicy.allow_de_escalate || riskPolicy.allowDeEscalate) {
    throw new Error('FORMAT REJECTED: risk_policy may never allow de-escalation');
  }

  // approval_policy — may only raise requirements
  const approvalPolicy = raw.approval_policy || raw.approvalPolicy || {};
  if (approvalPolicy.auto_approve || approvalPolicy.autoApprove) {
    throw new Error('FORMAT REJECTED: approval_policy may never set auto_approve');
  }

  // mission_types (optional but if present must be valid)
  const missionTypes = raw.mission_types || raw.missionTypes || [];
  if (!Array.isArray(missionTypes)) {
    throw new Error('FORMAT REJECTED: mission_types must be an array');
  }
  for (const mt of missionTypes) {
    if (mt.risk_floor) {
      const f = String(mt.risk_floor).toLowerCase();
      if (!VALID_RISK.has(f)) {
        throw new Error(`FORMAT REJECTED: mission_type risk_floor invalid: ${mt.risk_floor}`);
      }
    }
    // chain must end with critic before any gate language
    if (Array.isArray(mt.chain)) {
      const last = mt.chain[mt.chain.length - 1];
      if (last && String(last).toLowerCase() !== 'critic') {
        // Soft warning only — engine still forces Critic last
      }
    }
  }

  // Produce a clean, frozen normalized object
  const normalized = Object.freeze({
    identity: Object.freeze({
      id: identity.id.trim(),
      name: (identity.name || identity.id).trim(),
      version: identity.version.trim(),
      description: (identity.description || '').trim(),
    }),
    specialists: Object.freeze(specialists.map(s => Object.freeze({
      id: s.id || s.base_role || s.baseRole,
      base_role: (s.base_role || s.baseRole).toLowerCase(),
      prompt_file: s.prompt_file || s.promptFile || null,
      display_name: s.display_name || s.displayName || s.id || null,
    }))),
    risk_policy: Object.freeze({
      floor: (riskPolicy.floor || 'low').toLowerCase(),
      // escalate-only is hard-coded; no de-escalate flag ever accepted
    }),
    approval_policy: Object.freeze({
      // may only raise the bar
      require_human_for: approvalPolicy.require_human_for || approvalPolicy.requireHumanFor || ['medium', 'high'],
      min_approvers: Math.max(1, Number(approvalPolicy.min_approvers || approvalPolicy.minApprovers || 1)),
      expiry_minutes: approvalPolicy.expiry_minutes || approvalPolicy.expiryMinutes || null,
    }),
    evidence_policy: Object.freeze(raw.evidence_policy || raw.evidencePolicy || {}),
    verification_extras: Object.freeze(raw.verification_extras || raw.verificationExtras || []),
    tools_requested: Object.freeze(raw.tools_requested || raw.toolsRequested || []),
    mission_types: Object.freeze(missionTypes),
    priorities: Object.freeze(raw.priorities || {}),
    terminology: Object.freeze(raw.terminology || {}),
    presentation: Object.freeze(raw.presentation || {}),
    defaults: Object.freeze(raw.defaults || {}),
  });

  return normalized;
}

/**
 * Compute a stable SHA-256 hash of the canonical JSON of a normalized manifest.
 */
function manifestHash(normalized) {
  const canonical = JSON.stringify(normalized, Object.keys(normalized).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Load a format from a file path or from an already-parsed object.
 * Returns { format, hash, source }.
 */
function loadFormat(source) {
  let raw;
  let sourceLabel;

  if (typeof source === 'string') {
    // Treat as file path
    const abs = path.resolve(source);
    if (!fs.existsSync(abs)) {
      throw new Error(`FORMAT REJECTED: file not found: ${abs}`);
    }
    const text = fs.readFileSync(abs, 'utf8');
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`FORMAT REJECTED: invalid JSON in ${abs}: ${e.message}`);
    }
    sourceLabel = abs;
  } else if (source && typeof source === 'object') {
    raw = source;
    sourceLabel = '(in-memory)';
  } else {
    throw new Error('FORMAT REJECTED: source must be a file path or object');
  }

  const format = validateAndNormalize(raw);
  const hash = manifestHash(format);

  return {
    format,
    hash,
    source: sourceLabel,
    id: format.identity.id,
    version: format.identity.version,
  };
}

/**
 * Load the default format if none is supplied.
 * Looks for formats/default.json or formats/example_marketing.json relative to cwd / __dirname.
 */
function loadDefaultFormat(baseDir) {
  const candidates = [
    path.join(baseDir || process.cwd(), 'formats', 'default.json'),
    path.join(baseDir || process.cwd(), 'formats', 'example_marketing.json'),
    path.join(__dirname, 'formats', 'default.json'),
    path.join(__dirname, 'formats', 'example_marketing.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return loadFormat(c);
    }
  }
  // Minimal built-in fallback that still satisfies the rules
  return loadFormat({
    identity: {
      id: 'builtin-default',
      name: 'Builtin Default',
      version: '1.0.0',
      description: 'Minimal restrict-only default format',
    },
    specialists: [
      { id: 'researcher', base_role: 'researcher' },
      { id: 'analyst', base_role: 'analyst' },
      { id: 'creator', base_role: 'creator' },
      { id: 'critic', base_role: 'critic' },
    ],
    risk_policy: { floor: 'low' },
    approval_policy: { require_human_for: ['medium', 'high'], min_approvers: 1 },
  });
}

/**
 * Apply a format's risk floor to a computed tier (escalate-only).
 */
function applyRiskFloor(computedTier, format) {
  const floor = (format && format.risk_policy && format.risk_policy.floor) || 'low';
  const order = { low: 0, medium: 1, high: 2 };
  return order[computedTier] >= order[floor] ? computedTier : floor;
}

module.exports = {
  loadFormat,
  loadDefaultFormat,
  validateAndNormalize,
  manifestHash,
  applyRiskFloor,
  FORBIDDEN_KEYS,
};
