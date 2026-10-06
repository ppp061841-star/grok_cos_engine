# Grok COS Engine

**Chief of Staff — Safety-first orchestration for LLM specialists**

> Engine is code. Format is data.  
> The model never controls the control chain.

This is a hardened, Grok/xAI-aligned evolution of the original COS package.  
It keeps the four-specialist pipeline (Researcher → Analyst → Creator → Critic)  
but enforces the immutable control chain and restrict-only format model so that  
“CrewAI-style multi-agent teams” cannot loosen safety.

**Current version:** `1.1.0-grok`

---

## Core invariants (non-negotiable)

```
Evidence → Risk classification → Approval → Execution gate → Verification → Audit
```

| ID  | Invariant | Enforcement |
|-----|-----------|-------------|
| I-1 | Claims must be grounded in real fetched content | Code check: non-empty snippet ≥ 12 chars (or format min) must appear in fetched bytes |
| I-2 | Risk tier is software-classified, monotonic | Deterministic classifier; LLM self-tier is advisory only; format floor is escalate-only |
| I-3 | Medium/High require human approval from token identity | Backend decision route, transaction-checked |
| I-4 | Nothing executes without a genuine APPROVED row (and no later REJECTED) | Unified gate in both `mission_chain.js` and `cos_backend.js` |
| I-5 | Independent verification after (or at) the critic stage | Critic can only escalate / halt |
| I-6 | Audit is append-only | SQLite triggers block UPDATE/DELETE on decisions, critic_reviews, execution_log |

No format, prompt, or specialist output can reorder, skip, or weaken these steps.

---

## What’s new in 1.1.0-grok

- Real **format loader** (`format_loader.js`) with strict validation
- Organized directories: `formats/`, `prompts/`, `tests/`
- Stronger unit tests for the loader and the execution gate
- Cleaner risk-tier update path
- Example marketing format ready to use

See `CHANGELOG.md` for full details.

---

## Quick start

```bash
# Requires Node 22.5+ (node:sqlite)
cp test17_schema.sql /tmp/cos.db.sql   # or use npm run init-db

# Unit tests (no API keys needed)
npm test
npm run test:format
npm run test:gate

# Live mission (needs keys)
export GEMINI_API_KEY=...
export COS_TOKEN=$(openssl rand -hex 24)
node tests/test19_live_mission.js
```

Environment:

- `GEMINI_API_KEY` (primary)
- `GROQ_API_KEY` (optional fallback)
- `COS_TOKEN` / `COS_TOKENS` (approver identity)
- `COS_DB` (path to SQLite file)
- `COS_FORMAT` (optional path to a format JSON)

Backend:

```bash
node cos_backend.js
# Dashboard: open chief_of_staff_dashboard.html (or served at /)
```

---

## Directory layout

```
cos-grok-engine/
├── mission_chain.js          # Specialist pipeline + unified gate
├── cos_backend.js            # Approval / execution HTTP API
├── provider_fallback.js      # Gemini primary, Groq fallback
├── format_loader.js          # Restrict-only format validation & loading
├── test17_schema.sql         # Schema + format columns + append-only triggers
├── formats/                  # Declarative format manifests (data only)
│   └── example_marketing.json
├── prompts/                  # Specialist instruction files
├── tests/                    # All test scripts
├── SECURITY_BOUNDARIES.md
├── FORMAT_SPEC.md
├── CHANGELOG.md
└── README.md
```

---

## Formats (restrict-only)

A format is a JSON manifest. It can:

- Raise risk floors
- Demand more sources / longer snippets
- Require extra approvers
- Specialize terminology and presentation

It can **never**:

- Auto-approve medium/high
- Lower a risk tier
- Skip the Critic or the approval gate
- Inject executable code or hooks

See `FORMAT_SPEC.md` and `formats/example_marketing.json`.

```js
const { loadFormat, loadDefaultFormat } = require('./format_loader');
const info = loadFormat('./formats/example_marketing.json');
// info.format, info.hash, info.id, info.version
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
