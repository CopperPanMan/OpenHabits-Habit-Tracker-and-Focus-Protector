# AGENTS.md

## Purpose
This file defines guardrails for work in this repository, with special emphasis on Lockouts V2.

## Coding + Safety Guardrails
- Do not change behavior of existing keys unless explicitly instructed.
- All Lockouts V2 work must be implemented behind new code paths and/or versioned keys.
- Prefer adding new helpers rather than editing old ones.
- No writes to Sheets in Lockouts V2 endpoint.
- Avoid hidden breaking changes: keep `doGet(e)` signature and existing `e.parameters.key` / `e.parameters.metrics` behavior.
- When adding new query params, treat them as optional.

## Scope Notes
- Preserve V1 behavior by default.
- Keep Lockouts V2 development isolated so V1 callers continue to work unchanged.
