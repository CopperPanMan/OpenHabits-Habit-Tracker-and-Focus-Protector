# API map

This repository now routes web-app traffic through `doPost(e)` in `Main.gs`.

## Entrypoint
- `doPost(e)` is the supported web app entrypoint.
- It expects a JSON body containing optional `data`, plus a `key` and shared secret (`secret` or `openHabitsSecret`) supplied either in the JSON body or URL query params.
- `doGet(e)` returns an unsupported-method message so old query-string clients fail closed.

## Key dispatch pattern
- POST bodies are parsed once, validated against `OPENHABITS_SECRET`, and then routed by `key`.
- Habits V2 keys and Lockouts V2 keys still use the existing helper functions after request validation.

## Security
- Store the shared secret in Script Properties as `OPENHABITS_SECRET`.
- Clients may send `OpenHabits-Secret` as an HTTP header, but Apps Script cannot read custom headers in `doPost(e)`, so authentication must use the JSON body and/or URL query params instead.
