## Habits V2 Specification (Codex-ready)

This document rewrites and reorganizes the provided Habits V2 requirements to remove ambiguity while preserving intent. It is written as an implementation target for Google Apps Script, designed to fit alongside existing V1 code and shared functions. All V1 functionality should *always* remain unaffected; V2 should be built alongside V1.

---

# 0) Purpose and scope

- **Habits V2** is a **Google Apps Script Web App** + **Google Sheets time-series data model** for logging “metrics” (atomic loggable fields).
- Logging clients:
    - **iOS Shortcuts** (primary)
    - **Notion** (optional)
- “Habit” / “Task” are conceptual only; the system stores and operates on **metrics** only.
- Habits V2 adds/defines these **new web app keys/features**:
    - `record_metric_iOS`
    - `update_metric_notion`
    - `record_metric_notion`
    - `positive_push_notification`
    - `current_metric_status`
- Non-scope (explicitly not implemented here):
    - Charts/dashboard logic in Google Sheets (formulas and charts are user-defined)
    - Looker Studio dashboard creation (but supporting data may be kept up to date)

---

# 1) Google Sheets data model (shared)

## 1.1 Tabs

- **Tracking Data** (required; used by code)
    - Time-series table where metrics and derived values are recorded.
- **Dashboard Data** (optional; not used by code)
    - Static ranges produced by formulas for charting.
- **Dashboard Charts** (optional; not used by code)
    - Google Sheets charts.

## 1.2 Tracking Data sheet layout

**Rows = metrics (or derived rows like streaks/points)**

**Columns = [Metric ID, Metric Name, day columns…]**

- Row 1 is the header row.
    - A1 = `"Metric ID"`
    - B1 = `"Metric"` (or `"Metric Name"`)
    - C1+ = per-day headers (see “Today column rules”)
- Column meanings:
    - **Column A (1):** `metricID` (string, unique by convention)
    - **Column B (2):** display name / metric name (human-readable)
    - **Column C+ (3+):** one column per day (time-series)

## 1.3 Metric row addressing

- The code finds a row to write to by searching **Column A** for the `metricID`.
- Users may reorder rows freely; the system must always locate rows by `metricID`.

## 1.4 Required derived rows

These are rows in **Tracking Data** that must exist (they are addressed by IDs like any other metric row):

- `dailyPointsID` (global): a time-series row storing **today’s points total** in the “today” column.
- `cumulativePointsID` (global): a time-series row storing **all-time cumulative points** in the “today” column.
- Per-metric optional derived rows (configured):
    - `metric.points.pointsID` (per metric): stores this metric’s points value for today.
    - `metric.streaks.streaksID` (per metric): stores this metric’s streak count (recomputed and written by scheduled job).

---

# 2) “Today column” rules (lateExtension)

Habits V2 uses a global late-night rollover rule so “today” matches human sleep patterns.

## 2.1 Global config

- `lateExtensionHours` (integer, >= 0): number of hours after midnight that still count as “yesterday”.
    - Example: `lateExtensionHours = 4` → up until 3:59 AM, writes go to yesterday’s column; at 4:00 AM, a new day starts.

## 2.2 Determining whether a new day column is needed

On any request that needs to read/write today’s values:

1. Read the timestamp in **Row 1, last day column** (the last used header cell in row 1).
2. Compute the “effective day” using Apps Script timezone and `lateExtensionHours`.
3. If the effective day has advanced past what the last column represents, **append exactly one new day column** at the far right and write the header timestamp for that new day.

## 2.3 Column header value

- The header cell (Row 1, today column) stores a timestamp representing the start of that “effective day” column.
- The system must be consistent: whatever format is written here is the format used to evaluate day transitions.

---

# 3) Apps Script structure (files)

## 3.1 Files

- `Main.gs`
    - Contains logic for routing by key, validation, sheet writes, optional Notion updates, and computed outputs.
- `config.gs`
    - Contains configuration (global settings + metricSettings array).

---

# 4) Configuration spec (config.gs)

## 4.1 Global config

Required globals:

- `trackingSheetName` (string) = `"Tracking Data"`
- `dailyPointsID` (string) = row ID for daily points total (e.g. `"point_total_today"`)
- `cumulativePointsID` (string) = row ID for cumulative all-time points (e.g. `"point_total_alltime"`)
- `writeToNotion` (boolean) = global default for Notion writes
- `lateExtensionHours` (integer)

`trackingSheetName` and `lateExtensionHours` are top-level config values; they should not be duplicated under nested fallback keys.

Optional global config (used only if Notion enabled):

- Notion database IDs to search (stored in Script Properties for security; referenced by code)
- Notion property name mappings (see Notion section)

## 4.2 Metric settings array

`metricSettings` is an **ordered array** (order matters for Positive Push Notifications).

Each metric object:

```jsx
{metricID:"weightNumber",// requiredtype:"number",// required enum: number | duration | timestamp | due_by | start_timer | stop_timerdisplayName:"Weight: ",// required (used in output messaging)recordType:"overwrite",// required enum: overwrite | keep_first | add// dates controls scheduling, streak-counting, and PPN filteringdates: [// [dayOfWeek, dueByTime, [[startHour, endHour], ...]]
    ["Sunday","10:15",[[12,17]]],
    ["Tuesday","15:43",[[9,12],[14,17]]],
    ["Friday","15:45",[[1,24]]]
  ],// streak row target + display unitstreaks: {unit:"days",streaksID:"weightNumberStreak" },// points configurationpoints: {value:1,multiplierDays:4,maxMultiplier:1.2,pointsID:"weightPoints"
  },// performance insight configuration (used by existing function)insights: {/* passed to findPerformanceInsightsV2_ (ex: {insightChance:1, streakProb:0.8, dayToDayChance:1, dayToAvgChance:0.5, rawValueChance:1, increaseGood:-1, firstWords:"Time Completed:", insightUnits:"minutes"}) */ },// positive push notification text fragmentsppnMessage: ["part 1","part 2"],// per-metric override to allow/deny Notion updateswriteToNotion:true,// timer-specific settings (used when type is start_timer or stop_timer)ifTimer_Settings: {stopTimerMessage:"Added {addedTimeLong}! (addedTimeDec)\nNew Score: {totalTimeLong}",timerStartMetricID:null,timerDurationMetricID:null,muteOutput:false
  }
}
```

### 4.2.1 Insights field naming (V2)

- Habits V2 uses `insights` (not `metricInsightSettings`).
- `insights.firstWords` is the preferred field name for message prefixes.
- Backward compatibility: `insights.insightFirstWords` may still be accepted as an alias for `insights.firstWords`.
- Insight text emitted in API `messages[]` is the same text written to the Notion `insightBlock`.

## 4.3 Duplicate IDs

- Users are instructed not to create duplicate `metricID`s.
- If duplicates exist, the system:
    - Uses the **first** matching metric in `metricSettings`.
    - Logs an error in the response output indicating duplicate IDs were detected.

---

# 5) Web app API

Habits V2 is invoked via JSON `POST` requests. Existing unrelated keys may exist; Habits V2 adds these keys.

## 5.1 Request format (common)

Each request is JSON. Common fields:

- `key` (string): one of the supported keys below
- `secret` or `openHabitsSecret` (string): must match the Apps Script `OPENHABITS_SECRET` Script Property
- `data` (varies by key): payload
- Optional:
    - `source` (string): `"iOS"` or `"Notion"` (if not provided, infer from key)

Clients may also send `OpenHabits-Secret` as an HTTP header, but Apps Script cannot read custom headers from `doPost(e)`, so the same secret must be present in the JSON body for validation.

### 5.1.1 `data` format for record keys

For `record_metric_iOS`, `update_metric_notion`, and `record_metric_notion`:

- `data` is an array of metric entries:
    - Each entry is `[metricID]` or `[metricID, value]`
    - If value is omitted or null, it is treated as “no value supplied”.

Example:

```json
{"key":"record_metric_iOS","secret":"your_random_secret_string","data":[["weightNumber",140],["runDuration","00:21:24"],["workTimerStart"],["weightTimestamp",null]]}
```

## 5.2 Response format (common)

All Habits V2 endpoints return a JSON response:

- `ok` (boolean): true if request processed (even if partial errors), false only if catastrophic (e.g., cannot open sheet)
- `messages` (string[]): user-facing messages to display
- `metricsByID` (object[]): key-specific structured output (`record_metric_*` returns one object per requested metric in the same array position)
- `errors` (string[]): error messages (validation/config/unknown IDs)
- `warnings` (string[]): non-fatal issues (duplicates, ignored values, unsupported operations)

**Rule:** if some metric entries fail, still process the rest (“best effort”), and report errors/warnings.

---

# 6) Endpoint: `record_metric_iOS`

Records one or more metrics and returns quickly without running Notion sync.

## 6.1 Processing steps (per request)

1. Ensure today column exists (per “Today column” rules).
2. For each metric entry in `data`:
    - Resolve metric config by `metricID`.
    - Validate value according to type.
    - Apply recordType write rules to Tracking Data.
    - If the write changes “completion state” or adds value (depending on recordType/type), compute points and update totals.
    - Compute streak (from sheet) for multiplier logic (streak value is computed, but the *streak row* may be updated by scheduled job).
    - No Notion sync happens on this endpoint.
3. If multiple metrics were processed:
    - Update daily points row once (incremental additions per successful scoring event).
    - Update cumulative points row once (sum deltas across metrics, then add once).
4. Return response messages + errors. Each metric result also includes `writeToNotion`, which reflects the metric setting unless the global config forces it to `false`.

## 6.2 Completion status rule (global invariant)

- A metric is “complete” **iff** its cell for today is **non-empty**.
- Empty cell = incomplete.
- `0` counts as complete (it is non-empty).
- No boolean values are stored anywhere.

## 6.3 Allowed metric value inputs by type

- `number`:
    - Must parse as a number (optional negative sign, optional decimal).
    - No commas.
- `duration`:
    - Input may be `"MM:SS"` or `"HH:MM:SS"`.
    - Stored format is always `"HH:MM:SS"`.
    - Max hours = 99.
- `timestamp`:
    - Input value is ignored.
    - System writes current timestamp string into the metric’s today cell.
- `due_by`:
    - Input value ignored.
    - If on-time: write current timestamp.
    - If late: write nothing and award no points.
- `start_timer` / `stop_timer`:
    - Input value ignored.
    - They do not write to their own `metricID` row; see Timer section.
    - If `ifTimer_Settings.muteOutput` is `true`, timer-specific strings are omitted from `messages`.

## 6.4 RecordType rules

### overwrite

- Always replace today cell with incoming value (or derived timestamp).
- Points and Notion updates:
    - Recompute points for this write event (based on current multiplier rules).
    - (Daily points behavior is defined in Points section; see note about retroactive updates.)

### keep_first

- If today cell is non-empty:
    - Do not write.
    - Do not update points, streak/multiplier effects, Notion status, or any derived calculations.
    - Return success with a warning message if desired (optional).
- If today cell is empty:
    - Treat like overwrite and proceed normally.

### add

- `number`: add numeric value to existing numeric cell (empty treated as 0).
- `duration`: add durations (empty treated as 00:00:00), store normalized HH:MM:SS.
- For unsupported types (`timestamp`, `due_by`, `start_timer`, `stop_timer`):
    - Silently ignore add behavior (do not write); log a warning.

---

# 7) Validation and config errors

## 7.1 Validation failures

Log an error and skip that metric entry if:

- `metricID` not found in config
- value fails type validation
- required per-type config is missing (examples: timer IDs missing, due_by date entry missing if required)
- duration > 99 hours after normalization

## 7.2 Config validation failures

If config errors prevent safe operation, skip affected writes and return errors.

---

# 8) Dates field behavior

The `dates` array drives:

- whether a metric is considered “scheduled” on a given day (for streak/multiplier logic),
- positive push notification filtering,
- due_by “time” meaning (only relevant for `due_by` metrics).

Each entry: `[dayOfWeek, dueByTime, excludedWindows]` where `excludedWindows` is optional and can be one of:

- **New format (preferred):** `[[startHour, endHour], ...]`
- **Legacy format (still supported):** `startHour, endHour`

Rules:

- `dayOfWeek` must be a valid weekday string.
- Duplicate weekday entries:
    - Only the first is used.
    - Log an error/warning.
- `dueByTime`:
    - 24h `HH:MM`
    - Optional unless `type == "due_by"` (see assumptions list for exact requirement)
- PPN hour windows (`excludedWindows` in the new format):
    - Each pair is `[startHour, endHour]` with integer hours in 0–23 space.
    - **Inclusive** (simple mental model): `startHour <= hour <= endHour`.
    - Multiple pairs are allowed and interpreted with OR logic (if current hour matches any pair, day is eligible for PPN).
    - Overnight windows are allowed (`startHour > endHour`) and wrap across midnight.
    - If missing (or invalid/empty), the metric is considered eligible for PPN filtering on that day (i.e., no hour restriction).

Edge case rule (explicit from your spec):

- If metric scheduled Tue/Fri but logged Wed:
    - Data is still stored.
    - Points are still awarded using the current multiplier logic.
    - It does **not** count for streak advancement or multiplier advancement (since that is tied to scheduled days).

---

# 9) Streak definitions and maintenance

## 9.1 Streak meaning

- Streak is computed from the sheet using the completion rule (non-empty cell).
- Only **scheduled days** (per `dates`) count toward streak progression.
- Missing a scheduled day resets the streak immediately (once the day is considered “missed” per lateExtension rule).

## 9.2 Manual edits

- Users may manually edit the sheet; streak computation is derived from sheet values, so manual corrections affect streaks.

## 9.3 Scheduled streak refresh job

- A function exists that recomputes and writes all streak counts to their `streaksID` rows.
- This function is scheduled via Apps Script triggers to run daily at **1:00 AM** (Apps Script timezone).

---

# 10) Points and scoring

## 10.1 Points config

- If `metric.points.value` is missing or null: no points are computed for that metric.
- Points may be negative or decimal.

## 10.2 Points by type

Let `basePoints = metric.points.value`.

- `duration`:
    - Convert duration to minutes: `minutes = round(totalSeconds / 60)`
    - Points = `minutes * basePoints * multiplier`
- `number`:
    - Points = `numericValue * basePoints * multiplier`
- `timestamp` / on-time `due_by`:
    - Points = `basePoints * multiplier`
- late `due_by`:
    - Write nothing; points = 0

## 10.3 Points by recordType

- `keep_first`: if the cell was already non-empty, award **no** points and do **no** derived updates.
- `overwrite`: award points based on the written value and current multiplier logic.
- `add`: award points on the incremental added amount (number delta or added duration minutes) using current multiplier logic.

## 10.4 Writing point rows

- `metric.points.pointsID` row:
    - Write the calculated points for that metric for today (value for today).
- `dailyPointsID` row:
    - Increment today’s cell by the points delta for this event.
    - Empty cell counts as 0.
- `cumulativePointsID` row:
    - Increment today’s cell by total points delta across all metrics processed in the request.
    - If multiple metrics are logged in one webhook, add the cumulative delta **once**.

## 10.5 Non-retroactive rule

- “If a metric is overwritten, today’s points is not updated retroactively.”
    - Interpretation captured in assumptions list; implementation must match your intended meaning.

# 11) Point multipliers

## 11.1 Multiplier parameters

Per metric:

- `multiplierDays`
- `maxMultiplier`

Defaults:

- If `multiplierDays` or `maxMultiplier` missing → default to 1 (effectively no multiplier growth).
- Special-case rule:
    - If `maxMultiplier = 0`, treat multiplier as constant `M = maxMultiplier` “always maxed” (see assumptions; this needs a precise numeric meaning).

## 11.2 Multiplier formula

Using your provided formula:

- `streakCountPrior` = streak count **prior to this recording event**
- Clamp: `effectiveStreak = min(streakCountPrior, multiplierDays)`

Then:

`multiplier = (((maxMultiplier - 1) / multiplierDays) * effectiveStreak) + 1`

Maxes out once `streakCountPrior >= multiplierDays`.

## 11.3 Streak/multiplier relationship

- Streak is computed first (from sheet).
- Multiplier is derived from streak prior to recording.
- If user missed a required scheduled day, streak resets, thus multiplier resets.

---

# 12) Timers

Timers are implemented using metrics of type `start_timer` and `stop_timer`.

## 12.1 Storage model

Timers do not write to their own `metricID` row. They write to two other rows specified by config:

- `timerStartMetricID`: stores the “started at” timestamp for today
- `timerDurationMetricID`: stores cumulative duration for today (HH:MM:SS)

## 12.2 Canonical workflow

- `start_timer`:
    - Writes current timestamp to `timerStartMetricID` (today cell), subject to its recordType (typically `keep_first`).
    - If `ifTimer_Settings.muteOutput` is `true`, it contributes no timer-specific text to `messages`.
- `stop_timer`:
    - Reads timestamp from `timerStartMetricID`.
    - If missing/empty: error (cannot stop timer).
    - Compute delta = now - startTime.
    - Add delta duration to `timerDurationMetricID` (as HH:MM:SS).
    - Clear `timerStartMetricID` cell (set to empty).
    - Return a message generated from `stopTimerMessage` token replacement unless `ifTimer_Settings.muteOutput` is `true`.

## 12.3 Token replacement for stopTimerMessage

Supported tokens:

- `{addedTimeLong}` → e.g., `1h 24min` (duration added this stop)
- `{addedTimeDec}` → e.g., `1.4h` (duration added this stop)
- `{totalTimeLong}` → e.g., `1h 24min` (new total cumulative duration)
- `{totalTimeDec}` → e.g., `1.4h`

Rules:

- Unknown tokens remain unchanged.
- Replacement is single-pass.
- Replacement happens after determining which timer action occurred.

## 12.4 Timer points behavior

- Points should be awarded primarily on `stop_timer`.
- For `stop_timer`, points are computed using **only the newly added duration**, in rounded minutes, times point value, times multiplier.

---

# 13) Endpoint: `update_metric_notion`

Takes the exact same `data` payload format as `record_metric_iOS`, but performs **Notion sync only** (no sheet writes).

Use this endpoint after a successful `record_metric_iOS` call so iOS gets a fast response first, then Notion sync runs in a separate request.

---

# 14) Endpoint: `record_metric_notion`

Same as `record_metric_iOS` for writing to Sheets and computing points/streak/multiplier behavior, with one key difference:

- It **does not write “status information back” to Notion**, because the completion originated in Notion.

Specifically:

- It may still update shared Notion “dashboard blocks” (pointBlock/insightBlock) only if you intend that (see assumptions list; your current text implies “no status writes” but doesn’t fully constrain dashboard writes).

---

# 15) Endpoint: `current_metric_status`

## 14.1 Input

- `data`: array of metricIDs

Example:

```json
{"key":"current_metric_status","data":["weightNumber","runDuration"]}
```

## 14.2 Output

- Returns a list/array of booleans in the same order:
    - `true` if that metric’s today cell is non-empty
    - `false` if empty
- This endpoint always uses the “today column” logic (lateExtension included).
- It ignores metric type; completion is purely cell non-empty.

---

# 16) Endpoint: `positive_push_notification`

Goal: return a message describing “the next thing to do” and its current streak.

## 15.1 Metric selection order

- Base ordering is the order of metrics in `metricSettings`.

## 15.2 Filtering rules (as provided)

For each metric, determine if it should be included “right now”:

- If `dates` has **no days of week listed** → include.
- If `dates` has days listed:
    - If today’s weekday is not present → exclude.
    - If today’s weekday is present:
        - If that weekday entry has no valid PPN windows → include.
        - Else include only if `now()` is inside **any** configured window pair for that weekday.

## 15.3 “Next” metric

- From the filtered list, pick the first metric whose today cell is empty (incomplete).
- If all are complete, return a “done” message (implementation-defined).

## 15.4 Returned message content

- Uses `metric.ppnMessage` text and includes current streak for that metric (computed from sheet / streak job).
- “No changes to current usage UX once setup” means output format should be stable and suitable for iOS Shortcuts notifications.

---

# 17) Optional Notion integration

Notion integration is enabled when:

- global `writeToNotion == true`, AND
- per-metric `metric.writeToNotion == true`

The per-metric logging result must also expose this resolved value as `writeToNotion`; if the global flag is `false`, the response value is forced to `false` even when the metric config is `true`.

## 16.1 Notion database task lookup

- The script searches one or more Notion databases for tasks/items whose `metricID` property equals the metric’s `metricID`.
- Multiple databases may contain matching `metricID`s.

## 16.2 Updates performed (for iOS-originated logging)

When a metric is logged via iOS, update matching Notion items:

- Set task Status / Completion Status to “Complete”
- Set:
    - Points
    - Point Multiplier
    - Streak (if metric has `streaks.streaksID`)
- If the same metricID exists multiple times across searched databases:
    - Log an error
    - Update all matches (per your current text)

## 16.3 Synced blocks (dashboard page)

If configured in Script Properties:

- `pointBlock`: overwrite with today’s point total (rounded to 1 decimal)
- `insightBlock`: overwrite with performance insight(s) from whatever was just logged
    - Additionally, if an error occurs, append error message to end of insightBlock.

## 16.4 Configurable property names

- Notion property names (e.g., “Points”, “Point Multiplier”, “Streak”, “Status”, “metricID”) must be configurable in config (or script properties) to support user renames.

## 16.5 Notion → Apps Script automation

- When a Notion “habits-related metric” task’s State/Status is marked “Complete”, an automation triggers `record_metric_notion`.

---

# 17) Error handling and reporting

## 17.1 Error conditions to report

- unknown metricID
- wrong type value
- missing required fields for a type (e.g., timer IDs missing)
- due_by logged late (treated as a handled condition: no write, no points; may be warning rather than error)

## 17.2 Where errors go

- Always returned in response JSON to caller.
- If the caller is Notion-originated:
    - Append the error message(s) to the end of `insightBlock` (if configured).

---

# 18) Future feature (non-implemented)

- A single iOS shortcut that dynamically prompts for values based on a cached config and metric types, then calls `record_metric_iOS`.
- Would require extra returned config for iOS UI prompting (e.g., `iosPrompt`, `shortcutOnRun`, `shortcutOnLog`).
