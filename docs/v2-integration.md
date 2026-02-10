# V2 Integration Contract (Habits V2 ↔ Lockouts V2)

**File:** `docs/v2-integration.md`  
**Scope:** Defines the *shared contracts* and *shared sources of truth* between **Habits V2** and **Lockouts V2**, including:  
- what Lockouts is allowed to read from Habits,  
- what Habits is allowed to write that Lockouts depends on,  
- the canonical “today” and day-boundary logic,  
- the shared sheet schema assumptions for referenced values,  
- error/validation behavior at the integration boundary.

This doc intentionally avoids implementation details and focuses on deterministic interfaces.

---

## 1) Principles

### 1.1 Source of truth
- **Google Sheets is the source of truth** for all values Lockouts reads (habit completion, timestamps, screentime counters).
- Notion is an **optional mirror** for Habits and is never used as truth for Lockouts decisions.

### 1.2 Read-only guarantee (Lockouts)
- The Lockouts V2 endpoint (`app_closer`) is strictly **read-only**:
  - it **must not write** to Sheets, Notion, Calendar, Drive, Script Properties, or anywhere else.
  - it may only return a JSON decision payload + debug info.

### 1.3 Non-regression requirement (V1 safety)
- All V2 logic must be routed behind new keys / new internal functions.
- Existing V1 keys must remain behavior-identical unless explicitly stated in a V1 change log.

---

## 2) Shared “Today” and Day Boundary Rules

### 2.1 Timezone authority
- The Apps Script project timezone is authoritative for:
  - determining “today”
  - resolving time windows (`times.beg/end`)
  - formatting end times (`endTimeISO`, human time strings)

### 2.2 Day boundary offset (if used)
If the system supports a “new day offset” (e.g., treating `00:00–03:00` as the prior day), it must be centralized and applied consistently in BOTH:
- Habits: determining which date column is “active”
- Lockouts: evaluating timestamps / habit completion “today”

**Contract:** both subsystems call the same helper (conceptually):
- `resolveToday_(now)` → `{ dayKey, dayStartISO, dayEndISO, activeColumnIndex }`

If day boundary offset is **not** used, `dayStart` is local midnight.

### 2.3 Active column definition
- The “active column” in Tracking Data represents the resolved “today” date (per the rule above).
- All “is this habit complete today?” checks default to the active column unless a specific date is requested.

---

## 3) Shared Data Sources in Sheets

Lockouts depends on the existence of certain rows and IDs in the **Tracking Data** sheet.

### 3.1 Tracking Data sheet (authoritative)
- Sheet name is configurable (e.g., `trackingSheetName`).
- Rows are identified by `taskID` (unique string).
- Columns represent calendar days (date keys), with the active column being “today.”

**Contract:** any value Lockouts references via `taskID` or `screenTimeID` must exist as a row in Tracking Data.

### 3.2 Types of values Lockouts may read
Lockouts may read the following value categories from Tracking Data:

1) **Habit completion values**
- For `task_block` checks: completion is defined by the Habits V2 completion rule (see §4).
- Typically: “cell is non-empty in today’s column.”

2) **Timestamps**
- For `firstXMinutesAfterTimestamp_block`: Lockouts reads a timestamp row (e.g., `wake_up_timestamp`).
- Timestamp format must be stable and parseable (see §5).

3) **Cumulative screentime counters**
- For `duration_block`: Lockouts reads `usedMinutes` from a row keyed by `screenTimeID`.
- Examples:
  - per-block counters (recommended if you want block-specific duration caps)
  - global counters like `cumulativeScreentime` (if you want “max per day” behavior)

**Important:** how these counters get updated is outside Lockouts; they are maintained by a separate logging mechanism (existing V1, Habits V2 logging, or client-side logging + webhook).

---

## 4) Integration Endpoint: `habit_status`

Lockouts must not re-implement habit completion logic ad hoc. It should call a single shared function / key.

### 4.1 Behavior
`habit_status` returns whether a habit/task is considered complete on a given date (default today).

### 4.2 Input contract
```json
{
  "key": "habit_status",
  "data": {
    "taskID": "plan_workday",
    "dateKey": null
  }
}
taskID (required): string

dateKey (optional): if null/omitted, use active “today” column

dateKey format should match the Tracking Data column header key (see §5.3)

4.3 Output contract
json
Copy code
{
  "status": "ok",
  "taskID": "plan_workday",
  "dateKey": "2026-02-10",
  "isComplete": true,
  "debug": {
    "serverTimeISO": "2026-02-10T11:32:10-05:00",
    "errors": []
  }
}
4.4 Completion rule (default)
Unless a habit type defines otherwise, completion is:

complete if the Tracking Data cell for (taskID, dateKey) is non-empty.

If you want type-specific completion logic (e.g., numbers require > 0, due_by requires on-time, etc.), it must be implemented inside Habits V2 and surfaced through habit_status so Lockouts gets consistent behavior.

5) Shared Formats
5.1 Timestamp format
All timestamps stored in Tracking Data must be parseable consistently.

Recommended canonical format (ISO 8601):

YYYY-MM-DDTHH:mm:ssZZ (with offset), e.g. 2026-02-10T07:42:00-05:00

If an alternate legacy format exists in V1, Habits V2 should normalize to ISO on write, and habit_status / Lockouts helpers should support parsing the legacy format until migration is complete.

5.2 Minutes format
If habits store “minutes” values as mm:ss:

Lockouts should not need to parse this unless a screentime row uses that type.

Screen time counters used by Lockouts duration blocks should be stored as integer minutes (recommended) to avoid format ambiguity.

5.3 Date key format
Define one date key format used for Tracking Data columns and JSON references.

Recommended:

YYYY-MM-DD in script timezone

resolveToday_() and any helper that maps time → column must produce this dateKey.

6) Lockouts Consumption Rules
6.1 task_block integration
A task_block must call habit_status(taskID) (or equivalent internal function) rather than reading cells directly.

If habit_status returns status:error, Lockouts must:

append the error to debug.errors

treat the block as non-applicable (fail-open) unless configured otherwise

6.2 firstXMinutesAfterTimestamp_block integration
Lockouts reads the timestamp row timestampID from Tracking Data (today or last-known depending on spec).

If timestamp is missing/unparseable:

block is treated as non-applicable (fail-open), and error is appended to debug

6.3 duration_block integration
Lockouts reads usedMinutes from the configured screenTimeID row (today’s column).

If missing/unparseable:

treat as usedMinutes = 0 OR fail-open (choose one in Lockouts spec)

append warning/error to debug

7) Error Propagation & Debug Standards
7.1 Debug object consistency
Both Habits and Lockouts outputs should include:

debug.serverTimeISO

debug.errors[] (strings or structured objects)

debug.warnings[] (optional)

7.2 Structured error format (recommended)
Instead of raw strings, use:

json
Copy code
{ "code": "MISSING_TASK_ID_ROW", "message": "taskID row not found: plan_workday", "context": { "taskID": "plan_workday" } }
7.3 Fail-open vs fail-closed
Integration default should be fail-open for safety (avoid bricking access due to misconfig / data issues), unless a global lockouts setting overrides it:

lockouts.validationMode = "fail_open" | "fail_closed"

If fail-closed is enabled, integration failures can cause a block to apply with a “config error” message.

8) Ownership Boundaries
8.1 Habits V2 owns:
Writing habit/task records to Tracking Data

Computing and writing streak/multiplier/points to Summary Metrics

Optional Notion updates

Canonical habit completion logic (habit_status)

8.2 Lockouts V2 owns:
Selecting the active preset (calendar)

Evaluating blocks deterministically

Building UI message payloads (bar, endTime, token substitution)

Returning decision JSON

8.3 Clients (iOS / Chrome extension) own:
Implementing illegal/legitimate unlock UX

Maintaining local timers/state (unlockedUntil, unlockWait)

Any point penalties for illegitimate unlock (via Habits logging key)

Optional “run shortcut on block” actions

9) Integration Acceptance Checks
A minimal integration is considered working when:

Logging a habit in Habits V2 updates Tracking Data, and:

habit_status(taskID) returns true for today

A Lockouts task_block referencing that taskID:

unblocks after completion

A firstXMinutesAfterTimestamp_block referencing a timestampID:

blocks before timestamp + X, unblocks after

A duration_block referencing a screenTimeID:

blocks when usedMinutes reaches allowedSoFar (rationing rules in lockouts spec)

Lockouts app_closer produces no writes (auditable by code inspection)

10) Open Questions (to be resolved in main specs)
Day boundary offset: does it exist and what is the value?

Timestamp row semantics: for timestampID, do we read today’s cell only, or “most recent non-empty”?

ScreenTime counters: are they integer minutes, and what key updates them (existing V1 vs new V2 key)?

If habit_status supports type-specific rules (due_by lateness), what is the exact policy?

If missing data occurs during lockouts evaluation, do we default to 0/non-applicable or enforce fail-closed?
