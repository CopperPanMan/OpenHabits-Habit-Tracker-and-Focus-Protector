# OpenHabits Setup (30-60 min)

While OpenHabits has the ability to be both a habit tracker and a screen time limiter, you don't have to use both features. The setup shows you how to use either/or.
There is shared setup among the two features. But you don't have to use all of the features. You can selectively use what you would like.

Shared Setup
- Download the Google Sheet Metric Logger Template and upload it to your Google Drive. Find and input the spreadSheetID as an apps script "Script Property" as shown below.
- While in Script Properties
   - if you intend on syncing habits with Notion, add those properties, and explain what they do.


Habit Tracking
- what habits can do (and what it can do that other habit trackers cannot)
- how streaks, points, and insight messages work (unless this fits better under habit JSON template)
- shortcuts you need for habits (Habits qrCodeMaker, Metric(s) Logger Template, Toggle Timer Template, Insights). No automations are needed, but you can optionally log from NFC by using automations to launch a shortcut on NFC scan.
  - follow the instructions in the comment at the top of each shortcut to set them up.
- a habit JSON template, and below it, an explanation of each key/setting. 

Lockouts
- what lockouts can do (and what it can do that other app lockers cannot)
- how legitimate unlock and illegal unlock work
- dependencies
  - what shortcuts you need (Locked, Allowed, Update Lockout Cache)
    - follow the instructions in the comment at the top of each shortcut to set them up.
  - what automations you need
    - when apps are opened (run Locked)
    - when apps are closed (If you want to keep track of your screentime (required for blocking based on screentime), you'll need a metric shortcut configured to log a stop timestamp to a screentime row.)
    - note - you can block different apps differently, by calling a copy of the lockouts shortcut that passes a specific preset in.
  - what files you need (hopefully we can eliminate this step if it can build the files itself)
  - what scriptable scripts you need, and scriptable bookmarks
- a lockout block JSON template, and below it, an explanation of each key/setting.
  

My Personal Config -> Here is a link a folder containing my personal config.gs setup, Google Sheet Setup, and Logger Shortcuts. It what my personal config setup is. You can use this to duplicate my productivity system immediately.

Developer Stuff -> here are the "keys" you can call and what they do, if you would like to build loggers from different clients.










## 1) Make a copy of the sheet and script project

1. Create/copy your Google Sheet so you control the data.
2. Open **Extensions → Apps Script**.
3. Copy this repository's script files (`Main.gs`, `Config.gs`, `Lockouts.gs`) into your Apps Script project.
4. Set the Apps Script timezone to your local timezone (**Project Settings → Script properties / timezone**).

> Why timezone matters: day rollover logic, schedule windows, and lockout windows all depend on script-local time.

## 2) Build the required sheet structure

Create (at minimum) a tab named:

- `Tracking Data`

Set up header row on `Tracking Data`:

- `A1 = Metric ID`
- `B1 = Metric` (or `Metric Name`)
- `C1+ = day columns` (date/timestamp headers)

Required rows in column A (IDs) for Habits V2 totals:

- `point_total_today` (or whatever you set as `dailyPointsID`)
- `point_total_alltime` (or whatever you set as `cumulativePointsID`)

Then add one row per metric you want to track (column A = metric ID, column B = display name).

## 3) Configure `Config.gs` globals

In `getAppConfig()` verify these fields first:

- `trackingSheetName` (typically `"Tracking Data"`)
- `dailyPointsID`
- `cumulativePointsID`
- `lateExtensionHours` (for day rollover; example: `5` means 12:00–4:59 AM still counts as "yesterday")
- `metricSettings` (your Habits V2 metric definitions)

Also set:

- `scriptProperties.spreadsheetId` to your Sheet ID.
- `writeToNotion` to `true` only if you're actually wiring Notion.
- If using Notion task sync, set `notion.syncFields` to choose which task properties to write (`status`, `streak`, `pointMultiplier`, `points`). Any field set to `false` is skipped, so the Notion database does not need that property.
- keep `trackingSheetName` and `lateExtensionHours` at the top level of `getAppConfig()`; `sheetConfig` is only for sheet column positions.

## 4) Add your Habits V2 metrics (`metricSettings`)

Each metric needs a unique `metricID` and a supported `type`.

At a minimum for each metric define:

- `metricID`
- `type` (`number`, `duration`, `timestamp`, `due_by`, `start_timer`, `stop_timer`)
- `displayName`
- `recordType` (`overwrite`, `keep_first`, `add`)
- `writeToNotion` (optional per-metric Notion sync flag; response output is forced to `false` if the global config disables Notion)

Optional but recommended:

- `dates` (scheduling metadata)
- `streaks` (`streaksID` row, unit)
- `points` (`value`, multiplier behavior, `pointsID` row)
- `ifTimer_Settings.muteOutput` (optional for `start_timer` / `stop_timer`; defaults to `false`, and when `true` timer writes return an empty `messages` array entry-wise)

If you use `pointsID` or `streaksID`, create those IDs as rows in `Tracking Data` too.

## 5) Configure Lockouts V2 (`lockoutsV2`)

In `Config.gs`, configure:

- `lockoutsV2.globals`
  - `cumulativeScreentimeID`: metric ID row used by duration blocks.
  - `barLength`: size of visual bar in lockout messages.
  - `presetCalendarName`: optional calendar for automatic preset selection.
- `lockoutsV2.blocks`: ordered array of lock rules (first matching blocking rule wins).

Block types supported in V2:

- `task_block`
- `duration_block`
- `firstXMinutesAfterTimestamp_block`

Important setup notes:

- Keep block order intentional; V2 uses first blocking match.
- `times.beg` / `times.end` use `HH:MM` local time.
- `beg == end` means a 24-hour active window.
- V2 endpoint is read-only (it evaluates and returns JSON; no Sheet writes).

## 6) Add Script Properties (Apps Script settings)

In **Project Settings → Script properties**, add at least:

- `spreadsheetId`
- `OPENHABITS_SECRET` (a long random shared secret used by POST clients)

If using Notion, also add your Notion-related properties referenced in config (database IDs, block IDs, token plumbing used by your existing setup).

## 7) Deploy the web app

1. Click **Deploy → New deployment**.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Access: whichever scope your Shortcuts/clients need (commonly “Anyone with the link” for personal automation).
5. Copy the web app URL.

## 8) Connect iOS Shortcuts / clients

Use `POST` requests with a JSON body. Recommended request shape:

Headers:
- `Content-Type: application/json`
- `OpenHabits-Secret: <your secret>`

Body:
```json
{
  "key": "record_metric_iOS",
  "secret": "your_random_secret_string",
  "data": [["weightNumber", 140]]
}
```

> Apps Script web apps do not expose custom request headers to `doPost(e)`, so server-side validation must receive the same secret in the JSON body as `secret`/`openHabitsSecret` or in the web-app URL query params.

> Alternatively, you can supply `key` and `secret`/`openHabitsSecret` in the web-app URL query params when a client cannot place them in the JSON body.

Primary V2 keys:

- `record_metric_iOS`
- `update_metric_notion`
- `record_metric_notion`
- `positive_push_notification`
- `current_metric_status`
- `app_closer_v2` (Lockouts V2)

## 9) Smoke-test each path

Run these from Shortcuts, curl, Postman, or another HTTP client that can send JSON POST requests:

1. **Record a metric (Habits V2):** call `record_metric_iOS` for a known metric ID and verify today's cell updates.
2. **Sync that metric to Notion (Habits V2):** call `update_metric_notion` with the same payload format used for `record_metric_iOS`.
3. **Read status:** call `current_metric_status` and verify returned text for your metric.
4. **Push prompt:** call `positive_push_notification` and verify a sensible response.
5. **Lockout evaluation:** call `app_closer_v2` and confirm JSON with `status` in `allowed|blocked|error`.

If lockouts are not behaving as expected:

- check `lockoutsV2.blocks` order,
- validate each block's `times` and IDs,
- check returned `debug.errors` in the `app_closer_v2` response.

## 10) Rollout strategy (recommended)

- Start with 2–5 metrics and 1 simple lockout block.
- Verify stable behavior for a few days.
- Then add points/streak rows and more advanced lockout presets.
- Keep V1 clients untouched while you migrate automations to V2 keys.

---

## Quick troubleshooting

- **"Metric not found" behavior:** ensure metric ID exists exactly in column A.
- **Writes landing in wrong day column:** re-check timezone + `lateExtensionHours`.
- **Lockouts never trigger:** confirm you are calling `app_closer_v2`, not legacy `app_closer`.
- **Calendar preset not applying:** verify `presetCalendarName` and that event titles exactly match configured preset names.

## Minimal go-live checklist

- [ ] `Tracking Data` exists with correct header shape.
- [ ] Required ID rows exist (`dailyPointsID`, `cumulativePointsID`, plus any metric-derived IDs).
- [ ] `metricSettings` populated with real metrics.
- [ ] `lockoutsV2.globals` and `lockoutsV2.blocks` configured.
- [ ] Script properties set (`spreadsheetId`, `OPENHABITS_SECRET`, plus Notion properties if needed).
- [ ] Web app deployed and URL wired into Shortcuts.
- [ ] Smoke tests pass for all V2 keys you use.
