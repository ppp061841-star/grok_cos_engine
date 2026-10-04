# Changelog — Grok COS Engine

## 1.0.0-grok (2026-10-04)

### Fixed
- **F1 Grounding**: empty or too-short evidence_snippet no longer counts as grounded. Requires trimmed length ≥ 12 and actual containment in fetched content.
- **F3 Unified gate**: `execute()` in mission_chain.js now matches `gateExecute` — refuses if a REJECTED decision appears after the APPROVED row.
- **I-6 Append-only**: SQLite triggers block UPDATE and DELETE on `decisions`, `critic_reviews`, and `execution_log`.

### Added
- Format tracking columns on `missions` (format_id, format_version, format_manifest_hash).
- `formats/` directory with example Marketing CoS manifest.
- `FORMAT_SPEC.md` — condensed rules for declarative, restrict-only formats.
- Explicit treatment of CrewAI-style role teams under the immutable control chain.
- Grok/xAI-aligned README and design stance.

### Philosophy
Engine is code. Format is data. The model is a specialist inside a cage it cannot open.
