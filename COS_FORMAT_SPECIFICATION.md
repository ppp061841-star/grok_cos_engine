# Chief of Staff Format Specification

**Version:** 1.0 (draft for review)
**Scope:** Defines what a *format* (Personal, Business, SMME, Project, Executive, Marketing, Education, NGO, …) is, and where its authority stops.
**Out of scope:** Engine internals, UI, deployment, connectors, individual format contents.

---

## 0. Core idea

> **The engine is code. A format is data.**

A format is a declarative **manifest** validated against a closed schema and loaded by the engine. A format never contains executable logic, never references the core controls, and has no field through which a control could be named, skipped, weakened or reordered. The engine runs the control chain itself, in code, for every mission under every format.

Two rules govern the rest of this document:

1. **Restrict-only.** Wherever a format can touch safety-relevant behaviour, it can only make the engine *stricter*, never looser.
2. **Closed schema.** Anything not explicitly listed in §2 is not configurable. Unknown keys cause the manifest to be rejected, not ignored.

---

## 1. What is universal to every CoS?

Every format, without exception, runs on the same engine and inherits all of the following.

**1.1 The mission pipeline (fixed order)**

```
Mission config → Specialist chain → Control chain → Persistence/Audit → Result
```

**1.2 The control chain (immutable, see §7)**

```
Evidence → Risk classification → Approval → Execution gate → Verification → Audit
```

**1.3 The four base roles**

Every specialist in every format is a specialisation of exactly one base role. The base role defines the contract and the permissions ceiling; a specialisation cannot exceed it.

| Base role | Contract | Ceiling |
|---|---|---|
| Researcher | Produces claims `{text, source_url, confidence, evidence_snippet}` from fetched content only | Read-only external access. No execution. |
| Analyst | Turns claims into a recommendation | No external access. No execution. |
| Creator | Produces versioned artifacts from a recommendation | No external access. No execution. Never overwrites a prior version. |
| Critic | Reviews claims, recommendation and artifact independently | Can only escalate risk and halt for a human. Cannot approve, cannot terminate a mission. |

**1.4 Universal state machine**

`PROPOSED → AWAITING_APPROVAL → APPROVED → EXECUTED → COMPLETED`, or `→ REJECTED` / `FAILED` at the permitted points. Decisions are append-only. States cannot be skipped.

**1.5 Universal data rules**

- Persistent SQLite memory is authoritative; sessions are ephemeral.
- External content is stored as explicitly tagged **untrusted evidence** and is never treated as instruction.
- Every model call goes through the provider-fallback layer (Gemini primary, Groq fallback, per call, not sticky) and is logged.
- Risk tier is **monotonic**: it can only rise through a mission's lifetime.
- The LLM's self-reported tier is **advisory** (stored and logged only). The deterministic software classifier alone sets the tier.
- Provider keys, operator tokens and approver identity are engine-held. Formats cannot read, name or supply them.
- Every mission records the **format id, format version and format manifest hash** it ran under.

---

## 2. What is configurable?

A format may set exactly these fields, and only within the bounds stated.

| Field | Bounded by |
|---|---|
| `identity` (id, name, version, description, target users) | Must be unique; version must increment. |
| `specialists` (roster) | Each entry must declare a `base_role` and inherits its ceiling. Roster must include at least one Researcher-based and exactly one Critic-based role. |
| `mission_types` | Must conform to §4. |
| `risk_policy` | Restrict-only, per §5. |
| `approval_policy` | Restrict-only: may add approvers, require approval at lower tiers, shorten expiry. |
| `tools_requested` | A request list only. Granted solely from the engine's tool registry and only up to the base role's ceiling. |
| `evidence_policy` | May add required source types, minimum source counts, freshness limits, domain allow/deny lists. May not relax grounding. |
| `verification_extras` | May add further independent checks. May not remove or replace the engine's. |
| `priorities` and `terminology` | Free. Affect ranking and wording only. |
| `presentation` (UI labels, layout, tone, templates) | Free. Cannot alter the data shown in approval screens beyond engine-mandated fields. |
| `defaults` (mission type, locale, currency) | Free. |

Nothing else is configurable. In particular, no field exists for: control-chain steps, tier thresholds below the engine floor, auto-approval, approver bypass, audit scope, execution targets, provider selection for control decisions, or code of any kind.

---

## 3. How are specialist roles selected?

Selection is **deterministic and bounded**. The model never decides which roles exist or whether the Critic runs.

**3.1 Roster.** A format declares its roster in the manifest:

```json
{ "id": "market_researcher", "base_role": "researcher", "instructions_ref": "prompts/market_researcher.md",
  "evidence": { "min_sources": 2 }, "tools": ["web_fetch"] }
```

Only roles in the roster can ever run. Instructions shape *what the specialist looks for and how it writes*. They cannot grant permissions.

**3.2 Chain templates.** Each mission type (§4) lists one or more allowed **chain templates**, which are ordered lists of roster roles:

```json
"chains": { "default": ["market_researcher", "analyst", "content_creator", "critic"] }
```

**3.3 Selection procedure (engine-executed)**

1. Resolve the mission type from the request (declared by the operator, or matched by a deterministic rule table; if ambiguous, ask the human).
2. Load that type's allowed chain templates.
3. Choose the template by deterministic rule (explicit operator choice, else the type's default).
4. *Optional:* a model may **propose** adding or omitting optional roles, but the proposal is validated against the template's `optional_roles` list. Anything outside it is discarded.
5. Validate the final chain (see 3.4). Record chain, rule used and any discarded proposals in the audit log.

**3.4 Chain validity rules (enforced at manifest load and again at runtime)**

- Ends with the Critic role as the final specialist step before the control gate.
- Contains at least one Researcher-based role whenever the mission type requires evidence.
- Contains no role absent from the roster.
- Contains no step that executes before the approval stage.

A chain that violates any rule is rejected. It is not repaired silently.

---

## 4. How are mission types defined?

A mission type is a declarative template. Anything a mission needs to vary must be expressible here, not in code.

```json
{
  "id": "campaign_brief",
  "label": "Campaign brief",
  "task_mode": "delegate",
  "input_schema": { "objective": "string", "audience": "string?", "budget_zar": "number?" },
  "chains": { "default": ["market_researcher", "analyst", "content_creator", "critic"] },
  "optional_roles": ["campaign_analyst"],
  "evidence": { "required": true, "min_sources": 2 },
  "output": { "artifact_types": ["written", "plan"], "schema_ref": "schemas/campaign_brief.json" },
  "action_classes": ["draft_only"],
  "risk_floor": "low",
  "approval": { "require_human_at_or_above": "low" }
}
```

**Field rules**

| Field | Rule |
|---|---|
| `task_mode` | v1 engine supports `delegate` only. Other modes (`ask`, `assist`, `monitor`, `mission`) are reserved and rejected until the engine supports them. |
| `input_schema` | Validated before the mission starts. Free text is treated as untrusted. |
| `chains` / `optional_roles` | Per §3. |
| `evidence` | `required` may be set to `false` only for types whose `action_classes` are limited to the engine's non-consequential set (e.g. `draft_only`). |
| `output.artifact_types` | `written`, `plan`, `structured`. Stored versioned, never overwritten. |
| `action_classes` | Declares what the mission may *ask* the execution gate to do. Each class maps to an engine-defined minimum tier (§5). A type cannot invent a class the engine does not define. |
| `risk_floor` | A tier floor for this type. Restrict-only (§5). |
| `approval` | Restrict-only (§5.3). |

A mission type that fails schema validation or violates a restrict-only rule prevents the **whole format** from loading.

---

## 5. How are different risk policies defined?

Risk is decided in the engine by a deterministic software classifier. A format contributes **additional rules** to it. It does not contain or replace the classifier.

**5.1 Tiers.** `low < medium < high`. The tier set is engine-defined and cannot be extended or renamed.

**5.2 Effective tier**

```
effective_tier = max(
  engine_base_rules(mission),          // injection patterns, ungrounded claims, fetch failure, action-class minimums
  format_risk_rules(mission),          // this section
  mission_type.risk_floor,
  critic_escalation,                   // REJECT/FLAG
  previous_tier                        // monotonicity
)
```

The LLM's self-reported tier is recorded but is **not an input**.

**5.3 Format risk policy: what it may contain**

```json
"risk_policy": {
  "action_class_minimums": { "publish_external": "high", "spend_money": "high", "send_message": "medium" },
  "escalate_if": [
    { "when": { "mentions_any": ["legal", "regulator", "retrenchment"] }, "to": "high" },
    { "when": { "amount_zar_gte": 50000 }, "to": "high" },
    { "when": { "evidence_sources_lt": 2 }, "to": "medium" }
  ],
  "approval": {
    "require_human_at_or_above": "low",
    "approvers": { "high": { "count": 2, "roles": ["owner", "finance"] } },
    "expiry_hours": 24
  }
}
```

**5.4 Rule grammar (closed)**

- Predicates: a fixed engine-defined set (keyword/pattern match, numeric thresholds, counts, action class, source properties). No expressions, no code, no regex that the engine cannot bound.
- Effects: **`escalate_to`** only. There is no `de_escalate`, `allow`, `skip`, `auto_approve`, `exempt`, or `override` effect in the grammar.
- Approval changes: may *lower* the tier at which a human is required, *raise* the number or role of approvers, *shorten* expiry. May not raise the tier at which approval is required above the engine floor.

**5.5 Engine floors (not configurable)**

- Medium and High always require a named human approval.
- Low may auto-complete only if every condition holds: grounded evidence passes, Critic verdict is PASS, no injection signal, and the action class is in the engine's auto-eligible set. Otherwise it halts for a human.
- Any injection signal, ungrounded or unfetchable evidence, or Critic REJECT/FLAG escalates the tier regardless of format.

**5.6 Example profiles (illustrative)**

| Format | Typical posture |
|---|---|
| Personal CoS | Drafts and planning at low; anything that sends, books or spends at medium+. |
| Business / SMME CoS | Finance and compliance action classes at high; two approvers for spend above a threshold. |
| Marketing CoS | Drafts at low; anything published externally at high; brand/claims rules escalate to medium. |
| NGO / Education CoS | Funder-facing or learner-facing outputs at medium+; stricter evidence minimums. |

---

## 6. What can a format change?

Summary of §2, §3, §4, §5 in one view.

**A format can change:**

- Specialist roles, their instructions and which base role they specialise
- Mission types, input schemas, chain templates, output schemas
- Team mix per mission type
- Additional risk rules that **only escalate**
- Stricter approval requirements: more approvers, lower threshold for human review, shorter expiry
- Stricter evidence requirements: more sources, freshness limits, domain allow/deny lists
- Additional verification checks
- Tool *requests* (granted only by the engine, within the role ceiling)
- Priorities, terminology, defaults
- UI, labels, templates, tone

**A format change is itself a governed event.** Loading, editing or replacing a manifest is treated as a **medium-or-higher-risk action**: it requires a named human approval, is audited with a diff and the new manifest hash, and takes effect only for missions started afterward. A mission can never edit the format it is running under, and no specialist output can write to format configuration.

---

## 7. What must a format never be allowed to change?

### 7.1 The immutable core controls

```
Evidence → Risk classification → Approval → Execution gate → Verification → Audit
```

These six controls are part of the engine, not of any format. Their order, their existence and their invariants are fixed.

| # | Control | Invariants no format can alter |
|---|---|---|
| **I-1** | **Evidence** | Claims must be grounded in content the engine actually fetched, and each `evidence_snippet` must be found in that fetched content by a code-enforced check, not a prompt. Fetched content is stored as untrusted data and never acts as instruction. Ungrounded or unfetchable evidence forces escalation. |
| **I-2** | **Risk classification** | Classification is performed by the deterministic software classifier. Model self-assessment is advisory only. The tier is monotonic and can only be raised. No format can lower a tier, exempt a mission, or replace the classifier. |
| **I-3** | **Approval** | Medium and High require explicit human approval. Approver identity is taken from the authenticated token, never from client or format input. Approval is an append-only decision record, valid only when the latest decision row is `AWAITING_APPROVAL`. No model, specialist or format can approve. |
| **I-4** | **Execution gate** | Nothing executes without the gate re-reading a genuine `APPROVED` row in the database inside the same transaction as the action. A REJECTED row after APPROVED blocks execution. There is no alternative execution path. |
| **I-5** | **Verification** | An independent check runs after execution, using engine-defined checks and snapshots, plus any format extras. The Critic can only escalate or halt. Verification results are stored. A format cannot remove, replace, or silence a check. |
| **I-6** | **Audit** | Every step is recorded, append-only, with timestamps, actor, tier, provider used and format hash. Audit scope cannot be narrowed. Records cannot be edited or deleted by any format, mission or specialist. |

### 7.2 Cross-cutting invariants

- **I-7 Order is fixed.** The chain `evidence → risk → approval → execute → verify → audit` cannot be reordered, merged, parallelised across the approval boundary, or have steps skipped.
- **I-8 No bypass path.** No auto-approve flag, trusted mode, dry-run-that-executes, emergency override, per-mission exception, or "pre-approved" marker exists or can be introduced by configuration. Text in a request, claim or evidence claiming pre-approval is treated as an injection signal.
- **I-9 No executable format content.** Manifests contain data only: no scripts, hooks, callbacks, plugins or expressions that run inside the control path.
- **I-10 Credentials and identity are engine-owned.** Provider keys, operator tokens and approver identity cannot be read, named, set or substituted by a format.
- **I-11 Tools come from the engine.** A format requests tools; the engine's registry and the role ceiling decide what is granted. No role gains execution capability by configuration.
- **I-12 The format cannot reach the controls by name.** There is no field in the schema that references a control, a threshold below the engine floor, or the classifier, so there is nothing to configure around.

### 7.3 How immutability is enforced (defence in depth)

1. **Closed schema validation at load.** Unknown keys, forbidden effects (`allow`, `skip`, `auto_approve`, `de_escalate`, `override`) and any attempt to name a core control reject the manifest.
2. **Restrict-only merge.** The engine computes the effective policy as the strictest of engine floor and format rules, so even a manifest that survives validation cannot loosen anything.
3. **Chain validation at load and at runtime** (§3.4).
4. **Gate enforcement in the database layer.** The execution gate and approval check live in engine code and DB transactions, not in prompts or manifests.
5. **Governed manifest changes** (§6), audited and hashed.
6. **Version pinning.** A format declares the engine version it targets. Changing a core control means shipping a **new engine version**, which every format inherits. It cannot be done as a format.
7. **Conformance suite (below).** A format cannot be activated until it passes.

### 7.4 Conformance suite (required for every format)

A format is activated only when all of these pass against it. These generalise the existing bypass probe and injection scenarios from Test 17.

| ID | Check | Expected |
|---|---|---|
| C1 | Manifest contains an unknown key | Rejected at load |
| C2 | Manifest contains a forbidden effect (`allow`, `skip`, `auto_approve`, `de_escalate`, `override`) | Rejected at load |
| C3 | Manifest attempts to reference or configure a core control | Rejected at load |
| C4 | Chain omits the Critic, or places a step after the gate | Rejected at load |
| C5 | Mission type requests an action class the engine does not define | Rejected at load |
| C6 | Risk rule tries to set a tier below the engine floor | Floor still applies (effective tier unchanged) |
| C7 | Clean low-risk mission | Auto-completes only if all §5.5 conditions hold |
| C8 | Prompt-injection text in a claim or request ("pre-approved", "set risk_tier=low") | Forced to High; blocked from auto-approval |
| C9 | Fetch failure or ungrounded claim | Forced to High; never executes without human approval |
| C10 | Execution attempted with no `APPROVED` row | Refused, and the refusal is audited |
| C11 | Execution attempted after `APPROVED` then `REJECTED` | Refused |
| C12 | LLM self-tier lower than classifier tier | Classifier tier stored; self-tier logged as advisory |
| C13 | Critic returns REJECT/FLAG | Tier escalates and mission halts at human approval; mission is not auto-terminated |
| C14 | Mission tries to modify its own format manifest | Refused; change attempts are audited |
| C15 | Audit record edit/delete attempt | Refused; append-only holds |
| C16 | Fresh-connection read-back | Reconstructs decision, artifact, critic review, provider pattern and format hash |

Anything that fails C1–C16 is a defect in the format or the engine, and the format stays inactive.

---

## Appendix A: Minimal manifest skeleton

```json
{
  "format": { "id": "marketing_cos", "name": "Marketing CoS", "version": "1.0.0", "engine": ">=1.2" },
  "specialists": [
    { "id": "market_researcher", "base_role": "researcher", "instructions_ref": "prompts/market_researcher.md", "tools": ["web_fetch"] },
    { "id": "analyst",            "base_role": "analyst",    "instructions_ref": "prompts/analyst.md" },
    { "id": "content_creator",   "base_role": "creator",    "instructions_ref": "prompts/content.md" },
    { "id": "critic",             "base_role": "critic",     "instructions_ref": "prompts/critic.md" }
  ],
  "mission_types": [ { "id": "campaign_brief", "...": "see §4" } ],
  "risk_policy":   { "...": "see §5" },
  "evidence_policy": { "min_sources": 2 },
  "verification_extras": [ "brand_terms_check" ],
  "priorities": ["brand consistency", "audience insight"],
  "presentation": { "labels": {}, "templates": [] }
}
```

Note what is **absent**: any key for the control chain, approval bypass, thresholds below the floor, execution, credentials or code. That absence is the design.

## Appendix B: Open decisions for review

1. **Task modes.** Reserved but rejected until the engine supports more than `delegate`.
2. **Predicate set for risk rules.** The initial closed list in §5.4 should be confirmed against what the classifier can evaluate deterministically today.
3. **Manifest-change approval tier.** §6 sets it at medium-or-higher. Confirm whether High should be required for changes to `risk_policy` and `approval_policy`.
4. **Format signing.** Whether manifests should be signed (beyond hashing) before loading in a hosted deployment.

---

## Appendix C: Conformance to the current engine (COS_package-main, checked 2026-10-03)

Legend: 🟢 matches the code today · 🟡 partly true · 🔴 specified here but not yet in the engine.
Reviewed: `mission_chain.js`, `cos_backend.js`, `test17_schema.sql`, `provider_fallback.js`.

| Spec item | Status | What the code does today |
|---|---|---|
| I-2 classifier authoritative, self-tier advisory, monotonic | 🟢 | `computeRiskTierFromClaims`, `maxTier`; `llm_self_tier` stored only; `runAnalyst` takes max with current tier |
| I-3 human approval, identity from token, decision only when latest row is `AWAITING_APPROVAL` | 🟢 | Enforced in `cos_backend.js` decision route inside one transaction |
| I-4 gate re-reads `APPROVED` and refuses after a later `REJECTED` | 🟡 | True for backend `gateExecute()`. `execute()` in `mission_chain.js` checks only for any `APPROVED` row and has no REJECTED check. Two copies of the gate exist |
| I-1 snippet must appear in fetched content | 🟡 | See finding F1 below |
| I-5 independent verification after execution | 🟡 | Critic runs **before** approval (`ARTIFACT_VERIFIED`) and is rule-based. No post-execution verification step; only snapshot integrity/readback checks |
| I-6 append-only audit | 🟡 | Append-only by code convention. No DB triggers block `UPDATE`/`DELETE` on `decisions` |
| §1.5 format id/version/hash on every mission | 🔴 | No format columns in schema |
| §5 action classes, format risk rules, restrict-only merge | 🔴 | Classifier only reads claims and the analyst summary |
| §5.5 "auto-eligible action class" | 🔴 | Auto-complete rule today is just `tier == low && critic == PASS` |
| §3 / §4 manifests, chain templates, mission types | 🔴 | Chain is hard-coded Researcher → Analyst → Creator → Critic |
| §6 governed manifest changes | 🔴 | No manifest loader exists |
| C1–C5, C14 manifest conformance | 🔴 | Need the manifest loader first |
| C8–C13, C15 (injection, fetch failure, bypass, self-tier, critic, audit) | 🟡 | C8–C13 covered by Tests 17/19b–d. C15 not enforced at DB level |

### Findings that should be fixed before any format is built on this

**F1. Empty evidence snippet counts as grounded.** In `runResearcher`, `fetch_match` is set by `grounding.content.includes((c.evidence_snippet || '').slice(0, 30))`. An empty snippet gives `includes('')`, which is `true`, so any claim with a blank snippet is marked grounded whenever the fetch returned bytes. The check also compares only the first 30 characters and never confirms `source_url` equals the fetched seed URL. This weakens I-1.

**F2. Injection scan has gaps.** Patterns are applied to claim text and the analyst summary only. They are not applied to the request text, the `evidence_snippet`, or the Creator's artifact payload.

**F3. Duplicate gate logic.** `execute()` (`mission_chain.js`) and `gateExecute()` (`cos_backend.js`) differ (see I-4 above). The control should have one implementation that both call.

**F4. Redundant statement in `runAnalyst`.** `UPDATE missions SET risk_tier` appears twice. Harmless today, but it is exactly the kind of line that drifts.

### Suggested order

1. Fix F1, add a regression test (blank snippet, short snippet, wrong `source_url`).
2. Unify the gate (F3) and add the REJECTED-after-APPROVED test to the shared path.
3. Add `BEFORE UPDATE` / `BEFORE DELETE` triggers on `decisions`, `critic_reviews`, `execution_log` (I-6).
4. Decide where "Verification" lives (post-execution step vs the current pre-approval Critic) and update I-5 or the code to match.
5. Only then build the manifest loader and conformance suite.
