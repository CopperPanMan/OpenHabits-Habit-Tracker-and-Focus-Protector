## LOCKOUTS V2 — Codex-Ready Spec (clarified + reorganized, intent-preserving)

### 0) Purpose and scope

- **Lockouts V2** is a **Google Apps Script Web App** (logic) + **Google Sheets** (data source) + **client(s)** (iOS Shortcuts, Chrome extension) system that:
    - Determines whether “bad apps” should be **allowed** or **blocked** at the moment an app is opened.
    - Returns **UI messaging** (allowed/block messages + optional progress bar) and an optional **client shortcut hint**.
    - Integrates with **Habits V2** by reading habit/task completion + screentime metrics from the shared Sheet schema, and by relying on shared endpoints (e.g., `current_metric_status`) and shared metric IDs.
- **Non-scope (server)**:
    - The “illegal_unlock” and “legitimate_unlock” bypass flows are **handled entirely by clients** (Shortcuts / extension). The server does not implement these, beyond supporting normal `app_closer` reads.
    - The Lockouts endpoint is **read-only** (no Sheets writes).

---

## 1) Shared storage spec (Sheets)

### 1.1 Tabs

- **Tracking Data** (USED)
    - Row 1: header row
        - Col A header: `Metric ID`
        - Col B header: `Metric`
    - Column schema:
        - **Col A**: `metricID` (required, unique identifier used by code)
        - **Col B**: human-friendly name
        - **Col C..N**: one column per day (time-series), newest day is the “today” column as defined by the shared Habits/Lockouts rules (see 1.2).
    - Row schema:
        - Each row represents **either**:
            - a user-configured metric (habit/task data, timestamps, screentime counters), **or**
            - a derived/calculated row (streaks/points/etc).
        - **Rows can appear in any order**; code must locate rows by `metricID`.
- **Dashboard Data** (NOT used by this code; may exist)
- **Dashboard Charts** (NOT used by this code; may exist)

### 1.2 “Today column” rule (shared)

- “Today” is defined using the **Apps Script project timezone**.
- The system assumes there is a canonical method (shared with Habits V2) to:
    - Identify the correct “today” date column.
    - Create/advance a new day column (if applicable).
- Lockouts V2 will **only read** from the current “today” column (and from any needed recent columns if the existing shared helpers do that internally).

---

## 2) Apps Script project structure

### 2.1 Files

- **Main.gs**
    - Contains the main request router and feature handlers.
    - Supports older unrelated “keys/features” and must not break them.
    - Adds/uses these keys (features):
        - `record_metric_iOS` (shared with Habits V2; described for completeness)
        - `record_metric_notion` (shared with Habits V2)
        - `positive_push_notification` (shared with Habits V2)
        - `current_metric_status` (shared with Habits V2)
        - **`app_closer`** (Lockouts V2: the lockout decision endpoint)
- **config.gs**
    - Holds all configuration as a dictionary/JSON-like structure (Apps Script `var config = {...}` pattern).
    - Holds:
        - global lockouts variables (bar length, preset calendar name, etc.)
        - the block list (array of block objects)

---

## 3) Server endpoints / “keys” (feature router inputs)

> All requests include a `key` and may include a `data` payload. Many existing keys do not require `data`.
> 

### 3.1 `current_metric_status` (shared)

**Input**

- `data`: an array of metric IDs
    
    Example: `["weightNumber","runDuration"]`
    

**Output**

- An array of booleans in the same order as input:
    - `true` if the **today cell is non-empty**
    - `false` if the **today cell is empty**
    - Note: **`0` counts as a value** (i.e., non-empty)

Example output: `[true, false]`

**Rule**

- Completion check is strictly: “today cell empty vs not empty”, regardless of metric type.

---

### 3.2 `app_closer` (Lockouts V2 primary)

This is the endpoint called by clients when an app is opened.

**Input**

- `key = "app_closer"`
- Optional `data`:
    - If `data` is a string, it is treated as a **preset override** (see Presets section).
    - If `data` is missing/empty, preset resolution comes from calendar (or default behavior).

**Output**

- A JSON object (schema in section 8) indicating:
    - `status`: `"allowed"` | `"blocked"` | `"error"`
    - `ui`: message display directives + optional computed bar fields
    - `block`: applied block info (if blocked)
    - `shortcut`: optional shortcut name/input when blocked
    - `debug`: preset chosen, server time, errors/warnings

---

## 4) Presets

Presets determine which blocks are “in play” for a given day/app-open event.

### 4.1 Preset sources and priority

Preset is resolved using the following precedence:

1. **Client-passed preset override**
    - If the `app_closer` input includes `data = "<presetName>"`, then `<presetName>` is used as the resolved preset.
    - This is intended for app-specific rules (client chooses preset based on the opened app).
2. **Google Calendar preset**
    - Calendar to read: name = `presetCalendarName` (global config variable).
    - A user can create an **all-day** event; if its title matches a configured preset name, that is the day’s preset.
    - If multiple preset events exist:
        - Choose whichever is read first (implementation-defined ordering),
        - Add an error/warning entry into `debug.errors` (or `debug.errors[]`).
3. **No preset**
    - If no preset is passed and no preset event exists: **all blocks apply** (i.e., do not filter by preset membership).

### 4.2 Preset membership filtering

- Each block has `presets: ["workday_rules", ...]`.
- If a preset is resolved:
    - A block is eligible only if `resolvedPreset` is contained in `block.presets`.
- If no preset is resolved:
    - All blocks are eligible.

---

## 5) Lockout block model (config)

### 5.1 Global variables (config.gs)

- `cumulativeScreentimeID: string | null`
    - If set, server may use it to show a 24-hour bar in allowed messages when not inside a duration block message context.
- `barLength: number`
    - Total characters in the progress bar (excluding marker).
- `presetCalendarName: string`
    - Google Calendar name that contains preset events.

### 5.2 Block array

- Config contains an array (0..∞) of block objects (“appBlock” objects).
- **Ordering matters**:
    - If multiple blocks apply simultaneously, **the first applicable blocking block wins**.

### 5.3 Block object schema

Each block object has:

- `id: string`
    - Human-readable identifier for debugging and output.
- `type: "duration_block" | "task_block" | "firstXMinutesAfterTimestamp_block"`
- `presets: string[]`
    - List of preset names for which this block is eligible.
- `times: { beg: "HH:MM", end: "HH:MM" }`
    - Local times in Apps Script timezone.
    - May cross midnight (see Time Window Evaluation).
- `typeSpecific: object`
    - Contains sub-objects for each type. Unused sub-objects may exist but are ignored.
    - **duration**:
        - `maxMinutes: number` (integer; may be 0)
        - `screenTimeID: string` (metricID pointing to a row in Tracking Data holding duration in `HH:MM:SS` or Sheets duration format)
        - `rationing: { isON: boolean, begMinutes: number, endMinutes: number }`
    - **task_block_IDs**:
        - `string[]` list of metricIDs representing required completions
    - **firstXMinutes**:
        - `{ minutes: number, timestampID: string }`
        - timestampID points to a metric row that contains a timestamp for “start moment” (e.g., wake-up timestamp)
- `onBlock: { message: string, shortcutName: string, shortcutInput: string }`
    - `message` supports tokens (section 7).
    - `shortcutName` may be empty string to indicate “no shortcut”.
    - `shortcutInput` may be empty string.

---

## 6) Block evaluation algorithm (server)

When handling `key="app_closer"`:

### 6.1 Steps

1. **Resolve preset**
    - Use preset override or calendar lookup per section 4.
2. **Candidate block list**
    - Start with all blocks in config order.
    - If a preset is resolved, filter to blocks whose `presets` include it.
3. **Time window gate (`times`)**
    - For each candidate block (in order), determine whether `now` is inside the block’s time window (see 6.2).
    - If not inside, block is non-applicable.
4. **Type-specific gate**
    - For remaining candidates (still in order), evaluate based on `type`:
        - `task_block` → blocks if any required metric is incomplete today
        - `duration_block` → blocks if usedMinutes is at/over allowedNowMinutes (with optional rationing)
        - `firstXMinutesAfterTimestamp_block` → blocks if (now < timestamp + X minutes), subject to the `times` gate
5. **Pick first blocking block**
    - If any candidate blocks evaluate to “block now”, choose the first one.
    - Else: allowed.
6. **Generate output JSON**
    - If blocked:
        - `status="blocked"`
        - fill `block`, `ui`, and `shortcut` (if any)
        - apply message token substitution after selecting the block
    - If allowed:
        - `status="allowed"`
        - choose allowed message logic (section 7.3)
    - If configuration errors prevent safe evaluation:
        - `status="error"` and include errors in debug (section 9)

### 6.2 Time window evaluation (`times`)

- Inputs:
    - `beg` and `end` are local times in Apps Script timezone.
- Behavior:
    - If `beg < end`: active window is same-day `[beg, end)`
    - If `beg > end`: window crosses midnight and is active `[beg, 24:00)` OR `[00:00, end)`
    - If `beg == end`: interpret as **24-hour active window** (always active)

---

## 7) Duration, rationing, bars, and messaging

### 7.1 Duration metric parsing

- A duration block uses `typeSpecific.duration.screenTimeID` to locate a sheet row.
- The value read is expected to be a **duration** (e.g., Sheets duration) that can be represented as `HH:MM:SS`.
- Server converts this to:
    - `usedMinutes` (number, may be fractional then rounded as defined by implementation—see assumptions)
    - `usedHuman` (e.g., `27m`, `1h 12m`)

### 7.2 Rationing (duration blocks)

If `rationing.isON == true`, duration blocks apply a time-progressive cap:

- Define:
    - `windowLen = minutes between window start and end` (correctly handling midnight crossing)
    - `t = clamp(now - windowStart, 0..windowLen)` in minutes
    - `rationCap(t) = lerp(begMinutes, endMinutes, t/windowLen)`
    - `allowedSoFar = min(maxMinutes, rationCap(t))`
- Block condition:
    - Block if `usedMinutes >= allowedSoFar`
- Marker behavior:
    - If rationing is ON, bar includes a marker at position corresponding to `allowedSoFar/maxMinutes` (clamped 0..1), unless maxMinutes==0.
    - If rationing is OFF, do not show marker.

### 7.3 ASCII bar generation

- `barLength` determines total bar width.
- Bar communicates:
    - **Fill** proportional to `usedMinutes/maxMinutes` (clamped 0..1) for duration blocks.
    - A marker `·` indicates ration cap position (when rationing is ON).
- If `maxMinutes == 0`, message handling is special-cased (see assumptions).

### 7.4 Message token substitution (block messages)

- `onBlock.message` may include tokens; substitution occurs **after** a blocking block is selected.
- Single-pass replacement; unknown tokens remain unchanged.
- Users cannot escape literal `{token}` sequences; they will be replaced if recognized.

Supported tokens (as per original spec):

- `{endTime}` → formatted local time like `10:42 AM` (context depends on block type; see 7.5)
- `{screenTimeBar}` → ASCII bar string
- `{usedMinutes}` / `{usedHuman}`
- `{allowedNowMinutes}` / `{allowedNowHuman}`
- `{maxMinutes}` / `{maxHuman}`
- `{remainingMinutes}` / `{remainingHuman}`
- `{rationMarker}` (optional; typically not used separately)

### 7.5 `endTime` meaning

- For `firstXMinutesAfterTimestamp_block`:
    - `endTime` = `timestamp + minutes` formatted in local time.
- For other block types:
    - `endTime` may be omitted or left undefined unless otherwise computed (see assumptions).

---

## 7.6 Allowed message rules (server → client UI)

When `status="allowed"`, server decides whether to show a message:

1. **If inside a duration block time window** (and the current decision is still “allowed”):
    - Allowed message format includes progress bar + “used/remaining”:
        - Example:
            - `▓▓▓▓▓▓░░░░·░░░░░░░░░░`
            - `27m used, 1h 12m remaining`
    - The marker represents ration delimiter if rationing is ON for that active duration block.
    - The bar length is configurable (`barLength`).
2. **Else if `cumulativeScreentimeID` is set**:
    - Show a “24-hour” style bar:
        - Bar represents progress through a 24-hour day.
        - Message includes used minutes only:
            - Example:
                - `▓▓▓▓▓▓░░░░·░░░░░░░░░░`
                - `27m used`
3. **Else**
    - Set `ui.showMessage = false`.

> Note: “inside a duration type block” for allowed messaging does not mean “blocked by it”; it means the current time is in its window and it is relevant for showing usage/remaining info.
> 

---

## 8) Disallowed entry rules (blocked behavior)

### 8.1 Blocked entry UX

- If the user opens an app when entry is blocked:
    - Client closes the app.
    - Client displays `blockMessage` (from server output `ui.message` after token substitution).
    - Client may run a shortcut if server returns `shortcut.name`.

### 8.2 Unlock bypass flows (client only)

These do **not** require server changes, and are defined for client implementations:

- **Illegitimate Unlock**
    - Trigger: an all-day or timed calendar event named `illegal_unlock`.
    - Client enforces:
        - 30s wait that resets if user retries early.
        - Point penalty handled by Habits V2 logging:
            - client calls Habits endpoint to record metricID `illegal_unlock`
        - Deletes the calendar event after use.
        - Grants access for 10 minutes by writing `unlockedUntil.txt = now + 10 minutes`.
        - If 10 minutes elapse, unlock attempt expires; if event still exists, client deletes it.
- **Legitimate Unlock**
    - Trigger: calendar event named `legitimate_unlock`.
    - Client enforces:
        - 60s wait that resets if user retries early.
        - Grants access for 20 minutes via `unlockedUntil.txt = now + 20 minutes`.
        - Starts a timer (client-defined).
        - After 20 minutes, access is revoked as if nothing happened.

---

## 9) Configuration validation and failure behavior

### 9.1 Required fields by block type

Even if blocks include all sub-objects, server must validate required fields based on `type`:

- `duration_block` requires:
    - `times`
    - `typeSpecific.duration.maxMinutes` (non-null number)
    - `typeSpecific.duration.screenTimeID` (non-null string)
    - `typeSpecific.duration.rationing` (object; may be ON or OFF)
- `task_block` requires:
    - `times`
    - `typeSpecific.task_block_IDs` (non-empty array of strings)
- `firstXMinutesAfterTimestamp_block` requires:
    - `times`
    - `typeSpecific.firstXMinutes.minutes` (non-null number)
    - `typeSpecific.firstXMinutes.timestampID` (non-null string)

### 9.2 Unused fields

- Fields that are irrelevant to a block’s type are ignored.

### 9.3 Validation outcome

- If a block is invalid:
    - Add an entry to `debug.errors`.
    - Treat the block as **non-applicable** (fail-open), so it cannot block unexpectedly.
- If global configuration is invalid in a way that prevents safe operation:
    - Return `status="error"` with debug errors populated.

---

## 10) Block-type semantics

### 10.1 Task blocks

- Evaluate `typeSpecific.task_block_IDs` using `current_metric_status([...])`.
- If any returned value is `false` (incomplete), the block **blocks**.
- If all are `true`, it does not block.

### 10.2 Duration blocks

- Evaluate `usedMinutes` from the sheet row indicated by `screenTimeID`.
- Compute `allowedNowMinutes`:
    - If rationing ON → `allowedSoFar` per section 7.2
    - If rationing OFF → `maxMinutes`
- Block if `usedMinutes >= allowedNowMinutes`.

### 10.3 First X minutes after timestamp blocks

- Apply only if:
    - now is within `times` window, AND
    - timestamp exists, AND
    - now < timestamp + X minutes
- If the referenced timestamp is missing/empty:
    - block is non-applicable (does not block).

---

## 11) Client compatibility

- Multiple clients can call the same server:
    - iOS Shortcuts client
    - Chrome extension client (Mac/PC)
- All clients share the same UX rules defined here.
- Android is not in scope but may be added later.

---

## 12) Server JSON output schema

Server returns JSON shaped like:

```json
{"status":"blocked","block":{"id":"workday_plan_block","type":"task_block","message":"Plan workday at your desk to unlock."},"ui":{"showMessage":true,"message":"▓▓▓▓░░░░·░░░░\n27m used, 1h 12m remaining","screenTimeBar":"▓▓▓▓░░░░·░░░░","usedMinutes":27,"maxMinutes":300,"allowedNowMinutes":72,"endTimeISO":"2026-02-05T10:42:00-05:00"},"shortcut":{"name":"Open Notion Plan Workday","input":"..."},"debug":{"preset":"workday_rules","serverTimeISO":"2026-02-05T11:32:10-05:00","errors":[]}}
```

### 12.1 Output rules

- `status`:
    - `"blocked"` if a block applied
    - `"allowed"` if no blocks applied
    - `"error"` if server can’t safely evaluate due to config/runtime issues
- `block`:
    - Present only when `status="blocked"` (or may be present for debugging on error if desired).
    - `message` is the final substituted block message.
- `ui.showMessage`:
    - If false, client should show nothing.
- `ui.message`:
    - The string to display (allowed or blocked).
- `ui.*Minutes`:
    - Only guaranteed when message context includes them (duration blocks / allowed-duration context).
- `shortcut`:
    - If `shortcut.name` empty, client should not run a shortcut.
- `debug.errors`:
    - List of strings describing warnings/errors (invalid blocks, multiple preset events, parsing issues, etc.)

---

## 13) Apple Shortcuts client pseudocode (normative behavior)

Your provided pseudocode stands as the reference for iOS behavior. The only server-relevant expectations are:

- Client calls `app_closer_v2` via JSON POST unless it is inside an “unlockedUntil” session.
- Client uses server `status` and `ui.message` to decide closing + notification.
- Client enforces illegal/legitimate unlock timers and writes to Habits V2 separately.

---

## 14) Local cache + portable evaluator (Lockouts Cache V1)

To support faster on-device lockout decisions, Lockouts V2 also exposes read-only snapshot keys and a portable JS evaluator.

### 14.1 New keys

#### `config_snapshot`

- Purpose: return all information needed for a local cache refresh (typically once per day).
- Input:
  - JSON POST body with `key = "config_snapshot"`
  - `secret` or `openHabitsSecret` matching `OPENHABITS_SECRET`
  - Optional `data` (ignored for now; reserved for future options).
- Output:
  - `schemaVersion` (currently `lockouts_cache_v1`)
  - `generatedAtISO`
  - `timezone`
  - `todayCol`
  - `config` (full lockoutsV2 config)
  - `metricState` split into:
    - `allByID`
    - `taskBlockByID`
    - `timestampByID`
    - `durationByID`
    - `globalsByID`
  - `metricIDGroups` with the corresponding ID arrays used to build each split map.

#### `metric_state`

- Purpose: return the current value for one metric ID.
- Input:
  - JSON POST body with `key = "metric_state"`
  - `secret` or `openHabitsSecret` matching `OPENHABITS_SECRET`
  - `data = "metricID"` (string), or
  - `data = {"metricID":"..."}`
- Output:
  - `ok`
  - `metricID`
  - `found`
  - `value`
  - `displayValue`
  - `generatedAtISO`
  - `todayCol`
  - `warnings` / `error` as applicable.

### 14.2 Lockout cache file shape

Recommended cache file path (Scriptable/iCloud):
- `shortcuts/App Locker/lockoutCache.json`

Recommended shape:

```json
{
  "schemaVersion": "lockouts_cache_v1",
  "generatedAtISO": "2026-03-01T08:00:00.000Z",
  "timezone": "America/New_York",
  "config": { "globals": {}, "blocks": [] },
  "metricState": {
    "allByID": {},
    "taskBlockByID": {},
    "timestampByID": {},
    "durationByID": {},
    "globalsByID": {}
  },
  "metricIDGroups": {
    "allMetricIDs": [],
    "taskBlockIDs": [],
    "timestampIDs": [],
    "durationIDs": [],
    "globalMetricIDs": []
  }
}
```

### 14.3 Client sync strategy

- Daily shortcut (`Update Lockout Cache`) calls `config_snapshot` and rewrites the whole cache.
- Fast incremental shortcut (`Update Cached Metric`) calls `metric_state` for one metric and updates that metric’s cache entry.
- Portable evaluator reads `lockoutCache.json` and performs lockout decisions locally using the same block order, token substitution, and JSON output shape as `app_closer_v2`.
- For preset selection on-device, the portable evaluator resolves presets from calendar events on calendar name `App Lockout Settings` for events that occur today (instead of relying on `data` preset input).
