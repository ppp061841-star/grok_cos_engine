# Grok COS — Format Specification (condensed)

**Version:** 1.0 (aligned with full COS_FORMAT_SPECIFICATION)

## Core rule

> **The engine is code. A format is data.**

A format is a declarative JSON manifest. It never contains executable logic,  
never names the control chain, and can only make the engine *stricter*.

## What a format may configure

| Field | Bound |
|-------|-------|
| `identity` (id, name, version, description) | Unique; version increments |
| `specialists` | Must declare `base_role`. Roster must include ≥1 Researcher-based and exactly 1 Critic-based |
| `mission_types` | Chains, input schemas, risk_floor, action_classes |
| `risk_policy` | Restrict-only: escalate only |
| `approval_policy` | May lower threshold for human review, raise approver count, shorten expiry |
| `evidence_policy` | More sources, freshness, domain allow/deny |
| `verification_extras` | Additional checks only |
| `tools_requested` | Request list; granted only by engine up to base-role ceiling |
| `priorities`, `terminology`, `presentation`, `defaults` | Free (cosmetic / ranking) |

## What a format may never change

- Order or existence of: Evidence → Risk → Approval → Execution gate → Verification → Audit
- Ability to auto-approve medium/high
- Ability to lower a risk tier
- Credentials, provider selection for control decisions, or execution targets
- Any executable code, hooks, or expressions inside the control path

## Base roles (ceilings)

| Base role | Ceiling |
|-----------|---------|
| Researcher | Read-only external access. Produces grounded claims. No execution. |
| Analyst | Turns claims into recommendation. No external access. No execution. |
| Creator | Versioned artifacts. Never overwrites prior version. No external access. |
| Critic | Can only escalate risk or halt for human. Cannot approve or terminate. |

## CrewAI-style teams under this model

You may define a roster that looks like a CrewAI crew (researcher, analyst, writer, critic).  
The difference:

- Selection of the chain is deterministic (template + optional validated proposals).
- The Critic is always last before the control gate.
- Risk and approval are engine-owned.
- The format cannot grant a role permissions beyond its base-role ceiling.

This gives the ergonomic “team of specialists” without giving the team the keys to the vault.

## Loading rules

- Unknown keys → reject manifest
- Forbidden effects (`allow`, `skip`, `auto_approve`, `de_escalate`, `override`) → reject
- Chain missing Critic or placing steps after the gate → reject
- Manifest changes themselves are medium-or-higher risk actions and are audited with hash + diff
