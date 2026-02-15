# Lockouts V2 server contract

This document captures the finalized server contract for Lockouts V2.

## Endpoint

### `key="app_closer"`

- Optional request `data`:
  - If `data` is a string, treat as preset override.
  - If missing/empty, resolve preset from calendar (or none).
- Endpoint is read-only (no Sheets writes).

## Preset resolution priority

1. Client override (`data` string).
2. Preset calendar event (`presetCalendarName`).
3. None (all blocks are eligible).

## Block selection and evaluation order

1. Resolve preset.
2. Start with configured blocks in declared order.
3. If preset exists, keep only blocks containing preset in `block.presets`.
4. Apply `times` window gate.
5. Apply block-type gate:
   - `task_block`: block when any required metric is incomplete today.
   - `duration_block`: block when `usedMinutes >= allowedNowMinutes`.
   - `firstXMinutesAfterTimestamp_block`: block while `now < timestamp + X minutes`.
6. First applicable blocking block wins.

## Time window semantics

- `beg < end`: same-day window `[beg, end)`.
- `beg > end`: overnight window crossing midnight.
- `beg == end`: 24-hour active window.

## Message and tokens

- For blocked responses, message is selected from `onBlock.message` after token substitution.
- Unknown tokens remain unchanged.
- Supported tokens:
  - `{endTime}`
  - `{screenTimeBar}`
  - `{usedMinutes}` / `{usedHuman}`
  - `{allowedNowMinutes}` / `{allowedNowHuman}`
  - `{maxMinutes}` / `{maxHuman}`
  - `{remainingMinutes}` / `{remainingHuman}`
  - `{rationMarker}`

## Response schema

```json
{
  "status": "blocked",
  "block": {
    "id": "workday_plan_block",
    "type": "task_block",
    "message": "Plan workday at your desk to unlock."
  },
  "ui": {
    "showMessage": true,
    "message": "▓▓▓▓░░░░·░░░░\n27m used, 1h 12m remaining",
    "screenTimeBar": "▓▓▓▓░░░░·░░░░",
    "usedMinutes": 27,
    "maxMinutes": 300,
    "allowedNowMinutes": 72,
    "endTimeISO": "2026-02-05T10:42:00-05:00"
  },
  "shortcut": {
    "name": "Open Notion Plan Workday",
    "input": "..."
  },
  "debug": {
    "preset": "workday_rules",
    "serverTimeISO": "2026-02-05T11:32:10-05:00",
    "errors": []
  }
}
```

## Status values

- `blocked`: a block applied.
- `allowed`: no blocks applied.
- `error`: server could not safely evaluate due to config/runtime issues.

## Validation and fail-open behavior

- Invalid blocks are logged in `debug.errors` and treated as non-applicable.
- Invalid global config that prevents safe evaluation returns `status="error"`.

## Compatibility

- Keep `doGet(e)` and existing key behavior unchanged.
- V2 logic remains isolated behind new helper/module paths until explicitly wired.
