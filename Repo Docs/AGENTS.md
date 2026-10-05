# AGENTS.md

## Purpose
This file defines guardrails for work in this repository, with special emphasis on Lockouts V2.

## Coding + Safety Guardrails
- Do not change behavior of existing keys unless explicitly instructed.
- All Lockouts V2 work must be implemented behind new code paths and/or versioned keys.
- Prefer adding new helpers rather than editing old ones.
- No writes to Sheets in Lockouts V2 endpoint.
- Avoid hidden breaking changes: preserve the current JSON POST contract and shared-secret validation. `doGet(e)` intentionally rejects legacy GET calls; do not restore obsolete query-based logging as part of cleanup.
- When adding new request fields, treat them as optional unless the task explicitly authorizes a contract change.

## Scope Notes
- Preserve currently supported behavior by default. Historical V1 requirements are design history, not a promise that retired endpoints still work.
