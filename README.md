# Grok COS Engine

**Chief of Staff — Safety-first orchestration for LLM specialists**

> Engine is code. Format is data.  
> The model never controls the control chain.

This is a hardened, Grok/xAI-aligned evolution of the original COS package.  
It keeps the four-specialist pipeline (Researcher → Analyst → Creator → Critic)  
but enforces the immutable control chain and restrict-only format model so that  
“CrewAI-style multi-agent teams” cannot loosen safety.

---

## Core invariants (non-negotiable)

```
Evidence → Risk classification → Approval → Execution gate → Verification → Audit
```

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| I-1 | Claims must be grounded in real fetched content | Code check: non-empty snippet ≥ 12 chars must appear in fetched bytes |
| I-2 | Risk tier is software-classified, monotonic | Deterministic classifier; LLM self-tier is advisory only |
| I-3 | Medium/High require human approval from token identity | Backend decision route, transaction-checked |
| I-4 | Nothing executes without a genuine APPROVED row (and no later REJECTED) | Unified gate in both `mission_chain.js` and `cos_backend.js` |
| I-5 | Independent verification after (or at) the critic stage | Critic can only escalate / halt |
| I-6 | Audit is append-only | SQLite triggers block UPDATE/DELETE on decisions, critic_reviews, execution_log |

No format, prompt, or specialist output can reorder, skip, or weaken these steps.

---

## Fix for “CrewAI-style multi-agent teams”

CrewAI (and similar role-based frameworks) make it easy to define Researcher / Analyst / Writer / Critic agents.  
The danger is that the *orchestration* becomes model-driven or configuration-driven in ways that can bypass safety.

**Grok COS solution:**

1. **Roles exist only as data inside a closed manifest** (see `formats/`).
2. **Base-role ceilings are hard** — Researcher can only read/fetch; Creator never overwrites; Critic can only escalate.
3. **Chain templates are declared, not discovered** — the engine selects the chain deterministically. The model may *propose* optional roles, but anything outside the template is discarded.
4. **Control chain is never part of the crew** — Evidence / Risk / Approval / Gate live in engine code, not in agent prompts.
5. **Formats are restrict-only** — a format can raise risk floors, demand more sources, or require extra approvers. It can never lower them or invent auto-approve.

Result: you get the pleasant “team of specialists” developer experience while the safety boundary remains under code control.

See `formats/example_marketing.json` and `FORMAT_SPEC.md` for the declarative surface.

---

## What was fixed from the original package

| Finding | Status |
|---------|--------|
| F1 Empty evidence snippet counted as grounded | **Fixed** — requires non-empty trimmed snippet ≥ 12 characters |
| F3 Duplicate / weaker gate in `mission_chain.js` | **Fixed** — now identical to `gateExecute` (checks later REJECTED) |
| I-6 Append-only only by convention | **Hardened** — SQLite triggers raise on UPDATE/DELETE |
| Format id / version / hash on missions | **Added** columns (ready for manifest loader) |

---

## Quick start

```bash
# Requires Node 22.5+ (node:sqlite)
cp test17_schema.sql /tmp/cos.db.sql
# Initialize DB (or let tests do it)
node tests/test19_live_mission.js   # needs GEMINI_API_KEY for live
```

Environment:

- `GEMINI_API_KEY` (primary)
- `GROQ_API_KEY` (optional fallback)
- `COS_TOKEN` / `COS_TOKENS` (approver identity)
- `COS_DB` (path to SQLite file)

Backend:

```bash
node cos_backend.js
# Dashboard: open chief_of_staff_dashboard.html
```

---

## Directory layout

```
cos-grok-engine/
├── mission_chain.js          # Specialist pipeline + unified gate
├── cos_backend.js            # Approval / execution HTTP API
├── provider_fallback.js      # Gemini primary, Groq fallback
├── test17_schema.sql         # Schema + format columns + append-only triggers
├── formats/                  # Declarative format manifests (data only)
├── prompts/                  # Specialist instruction files (referenced by manifest)
├── tests/
├── SECURITY_BOUNDARIES.md
├── GENERAL_CHIEF_OF_STAFF_FINAL_SPEC-1.md
├── FORMAT_SPEC.md            # Condensed format rules
└── README.md
```

---

## Design stance (Grok / xAI)

- Truth-seeking over convenience.
- Safety boundaries are code, not prompts.
- The model is a specialist inside a cage it cannot open.
- Formats let you specialise the *content* of the work without touching the *controls*.
- Prefer explicit state machines and deterministic classifiers over emergent multi-agent chatter.

When in doubt: make the engine stricter, never looser.

---

## License / status

Draft for review. Derived from the original COS package with the hardening fixes above.  
Contributions that preserve or strengthen the invariants are welcome; contributions that weaken them will be rejected.
