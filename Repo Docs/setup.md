# OpenHabits Setup and Usage Guide

### Quick Links

- [Developer Keys](developer-keys.md) — the web app keys you can call from your own clients.
- [Personal Setup Placeholder](personal-config-placeholder.md) — a stand-in for the future shareable folder with Mike's personal config, Sheet, and Shortcuts.
- [Habits V2 technical spec](habits-v2-spec.md) — deeper implementation details for the metric logger.
- [Lockouts technical spec](lockouts-spec.md) — deeper implementation details for app/site blocking.

# 1) Before you start: what you are setting up

OpenHabits is not one single app. It is a small personal system made from pieces you control:

- **Apple Shortcuts** are the buttons, QR/NFC launchers, app-open automations, and simple user interface.
- **Google Apps Script** is the web app brain that receives requests, writes metrics, calculates status, and evaluates lockout rules.
- **Google Sheets** is the database and dashboard source of truth.
- **Scriptable** is used by iOS lockout flows that need stronger file/client behavior than Shortcuts alone.
- **Chrome Extension** is the desktop website blocker/client.
- **Notion** is optional. Use it only if you want habit/task status mirrored there.

You do **not** have to use every piece. OpenHabits can be:

- just a habit/metric logger,
- just a screen time and focus protector,
- or both connected together so your habits decide what gets unlocked.

> **Screenshot to add:** a simple architecture diagram showing Shortcuts/Chrome/Notion calling Apps Script, Apps Script reading/writing Google Sheets, and optional Notion sync.

# 2) Choose your path

## If you only want habit tracking

Do the shared setup, then complete [Habit Tracking Setup](#5-habit-tracking-setup). You do not need Scriptable, lockout automations, or the Chrome extension.

## If you only want app/site lockouts

Do the shared setup, then complete [Lockouts Setup](#6-lockouts-setup). You still need a Google Sheet because lockouts read completion and screen-time rows from it, but you can keep the habit setup minimal.

## If you want the full system

Do the shared setup, then add habit metrics first, then lockout rules. This is the recommended path because task-based lockouts are easier to understand once you have seen a metric row update correctly.

# 3) Shared setup (Google Sheet + Apps Script)

## A) Copy or create the Metric Logger Sheet

1. Download or copy the **Google Sheet Metric Logger Template**.
2. Upload it to your Google Drive if needed.
3. Open the Sheet and confirm there is a tab named `Tracking Data`.
4. Confirm the first row starts like this:
   - `A1 = Metric ID`
   - `B1 = Metric` or `Metric Name`
   - `C1+ = daily columns`

OpenHabits finds rows by the ID in column A, so you can reorganize the Sheet visually as long as metric IDs stay unique.

> **Screenshot to add:** the `Tracking Data` tab with columns A/B highlighted and a few example metric IDs shown.

## B) Create the Apps Script project

1. In the Sheet, open **Extensions → Apps Script**.
2. Copy this repo's Apps Script files into the project:
   - `Main.gs`
   - `Config.gs`
   - `Lockouts.gs`
3. In Apps Script project settings, set the timezone to your real local timezone.

Timezone matters because daily columns, streaks, due times, and lockout windows all depend on what OpenHabits thinks “today” means.

## C) Add Script Properties

In **Apps Script → Project Settings → Script properties**, add:

| Property | Required? | What it does |
| --- | --- | --- |
| `spreadsheetId` | Yes | The ID of the Google Sheet OpenHabits should read/write. |
| `OPENHABITS_SECRET` | Recommended | A long random shared secret for clients that call the web app. |
| `notionMetricDatabaseIDs` | Only for Notion | Database IDs OpenHabits should search/update. |
| `pointBlock` | Only for Notion | Notion block ID for point output. |
| `insightBlock` | Only for Notion | Notion block ID for insight output. |

You can find the Sheet ID in the Sheet URL between `/d/` and `/edit`.

> **Screenshot to add:** Apps Script Script Properties with `spreadsheetId` shown and secret values blurred.

## D) Configure `Config.gs`

Start with these values:

```js
scriptProperties: {
  spreadsheetId: 'spreadSheetID'
},
trackingSheetName: 'Tracking Data',
writeToNotion: false,
dailyPointsID: 'point_total_today',
cumulativePointsID: 'point_total_alltime',
lateExtensionHours: 5,
metricSettings: [],
lockouts: {
  globals: {
    cumulativeScreentimeID: null,
    timeOpenedID: 'timeOpenedID',
    barLength: 20,
    presetCalendarName: ''
  },
  blocks: []
}
```

Important fields:

- `spreadsheetId` points the script at your Sheet.
- `trackingSheetName` should match the tab name exactly.
- `lateExtensionHours` lets late-night logging count toward the previous day. For example, `5` means 1:00 AM still belongs to yesterday.
- `metricSettings` is where habit metrics go.
- `lockouts.blocks` is where blocking rules go.
- `writeToNotion` should stay `false` unless you are intentionally setting up Notion.

## E) Deploy the web app

1. Click **Deploy → New deployment**.
2. Choose **Web app**.
3. Execute as: **Me**.
4. Access: usually **Anyone with the link** for personal Shortcuts automation.
5. Copy the deployment URL. You will paste it into Shortcuts, Scriptable, and/or the Chrome extension.

> **Screenshot to add:** the Apps Script deployment dialog with “Web app,” “Execute as me,” and the copied deployment URL.

# 4) Recommended first smoke test

Before building your whole system, create one simple metric row and call it successfully.

1. Add a row in `Tracking Data` with `test_metric` in column A and `Test Metric` in column B.
2. Add a simple metric object to `metricSettings`.
3. Call `record_metric_iOS` from a Shortcut, curl, or Postman.
4. Confirm today's cell updates in the Sheet.

Example request body:

```json
{
  "key": "record_metric_iOS",
  "secret": "your_random_secret_string",
  "data": [["test_metric", 1]]
}
```

If this works, your Sheet, Apps Script deployment, permissions, and basic client path are connected.

# 5) Habit Tracking Setup

## A) What habit tracking can do

OpenHabits logs metrics, not just checkboxes. That means one habit can be a yes/no completion, a number, a duration, a timestamp, a timer start/stop pair, or a due-by task. Because the data is in a Sheet, you can build formulas, charts, dashboards, and custom review systems on top of it.

Compared with a normal habit tracker, OpenHabits can:

- log from QR codes, NFC tags, widgets, Siri, Notion, or custom clients,
- store raw history in a Sheet you own,
- calculate streaks and point totals,
- generate insight messages after logging,
- return “what should I do next?” prompts,
- and feed completion status into app lockouts.

## B) Shortcuts you need

For habit tracking, import or build these Shortcuts:

- **Habits QR Code Maker** — creates QR codes that launch specific logging flows.
- **Metric(s) Logger Template** — logs one or more metrics to the web app.
- **Toggle Timer Template** — starts/stops duration timers.
- **Insights** — fetches or displays insight/status output.

Follow the setup comments at the top of each Shortcut. Usually you will paste in:

- your Apps Script web app URL,
- your shared secret,
- and the metric IDs you want that Shortcut to log.

No automations are required for basic habit logging. Optional NFC automations can scan a tag and launch a specific logging Shortcut.

> **Screenshot to add:** one Shortcut editor screen showing where the web app URL and metric ID are pasted.

## C) Habit metric template

```js
{
  metricID: 'meditationDuration',
  type: 'duration',
  displayName: 'Meditation',
  recordType: 'overwrite',
  dates: [
    ['Monday', '22:00', [[6, 22]]],
    ['Tuesday', '22:00', [[6, 22]]],
    ['Wednesday', '22:00', [[6, 22]]],
    ['Thursday', '22:00', [[6, 22]]],
    ['Friday', '22:00', [[6, 22]]]
  ],
  streaks: {
    unit: 'days',
    streaksID: 'meditationStreak'
  },
  points: {
    value: 1,
    multiplierDays: 4,
    maxMultiplier: 1.2,
    pointsID: 'meditationPoints'
  },
  insights: {
    insightChance: 1,
    dayToDayChance: 1,
    dayToAvgChance: 0.5,
    rawValueChance: 1,
    increaseGood: 1,
    firstWords: 'Meditation:',
    insightUnits: 'minutes'
  },
  ppnMessage: ['Meditation is still open.', 'A short session counts.'],
  writeToNotion: false
}
```

### Habit metric keys

| Key | What it means |
| --- | --- |
| `metricID` | Unique row ID in column A of `Tracking Data`. |
| `type` | Metric kind. Common values: `number`, `duration`, `timestamp`, `due_by`, `start_timer`, `stop_timer`. |
| `displayName` | Human-readable name used in output messages. |
| `recordType` | How writes behave: `overwrite`, `keep_first`, or `add`. |
| `dates` | Days/times when this metric is expected or eligible for prompts/streaks. |
| `streaks` | Optional derived streak row. Create the `streaksID` row in the Sheet. |
| `points` | Optional point settings. Create the `pointsID`, daily total, and cumulative total rows in the Sheet. |
| `insights` | Controls comparison/performance messages after logging. |
| `ppnMessage` | Text fragments used by positive push notification prompts. |
| `writeToNotion` | Per-metric Notion sync preference. Global `writeToNotion` must also be enabled. |
| `ifTimer_Settings` | Timer-specific settings for start/stop timer metric pairs. |

# 6) Lockouts Setup

## A) What lockouts can do

OpenHabits lockouts are designed for “I want access when it actually makes sense,” not just “block this app from 9 to 5.”

A lockout can block:

- until specific tasks are complete,
- during scheduled windows,
- after a screen-time budget is used,
- during the first X minutes after a timestamp,
- differently on different preset days,
- and differently for different apps if the client passes different presets.

## B) Legitimate unlock vs illegal unlock

The lockout server decides whether the current rule says `allowed` or `blocked`. The client decides what to do next.

- A **legitimate unlock** is when the user satisfies the configured rule: completes the required task, waits until the window ends, stays under the budget, or uses an allowed preset.
- An **illegal unlock** is when the user manually bypasses the client flow: disabling automations, opening through a loophole, force-quitting helper apps, or otherwise avoiding the redirect/block action.

OpenHabits is meant to make good behavior easier and bad behavior more annoying. It is not a device-management product and cannot be perfectly tamper-proof on a personal phone.

## C) Shortcuts you need

For iOS lockouts, import or build:

- **Locked** — runs when a blocked app opens and asks the web app if access is allowed.
- **Allowed** — handles allowed access or a legitimate unlock path.
- **Update Lockout Cache** — refreshes lockout/cache data for faster client decisions.
- **Metric Logger for Screen Time** — logs start/stop timestamps or duration rows if you want duration-based blocks.

Follow the comments at the top of each Shortcut. Paste in your web app URL, shared secret, and any preset names.

## D) Automations you need

Create Shortcuts automations for the distracting apps you want to protect:

1. **When app is opened → run Locked**
   - This is the main blocking check.
2. **When app is closed → log screen time stop timestamp**
   - Required if you want blocking based on screen time duration.
3. Optional: use different copies of the Locked Shortcut for different apps.
   - Example: YouTube can pass `entertainment`, while Safari can pass `web`.

> **Screenshot to add:** iOS Automation screen showing “When YouTube is opened → Run Locked.”

## E) Scriptable setup

Some iOS lockout flows use Scriptable for file access and richer client behavior.

1. Install Scriptable.
2. Create the required iCloud Drive folder for OpenHabits runtime files.
3. Add Scriptable file bookmarks required by the lockout scripts.
4. Copy the lockout Scriptable scripts into Scriptable.
5. Confirm bookmarks resolve before testing app-open automations.

> **Screenshot to add:** Scriptable File Bookmarks screen with the OpenHabits/Shortcuts folder selected.

## F) Files/cache setup

The current lockout flow may require local cache/runtime files. If the client can create them automatically, let it. If not, create the files described in the Shortcut or Scriptable script comments.

> TODO: Replace this section with exact file names once the final client packaging is ready.

## G) Chrome extension setup

For desktop website blocking:

1. Open `Chrome Extension/` in this repo.
2. Load it as an unpacked extension in Chrome.
3. Open the extension options.
4. Add your Apps Script web app URL and secret.
5. Configure the sites/presets you want the extension to check.

> **Screenshot to add:** Chrome Extensions “Load unpacked” screen and the OpenHabits extension options page.

## H) Lockout block template

```js
{
  id: 'youtube_after_work_tasks',
  type: 'task_block',
  presets: ['workday'],
  times: {
    beg: '06:00',
    end: '17:00'
  },
  typeSpecific: {
    task: {
      metricIDs: ['plannedWork', 'meditationDuration'],
      mode: 'all'
    },
    duration: {
      maxMinutes: 30,
      screenTimeID: 'youtubeScreenTime'
    },
    firstXMinutesAfterTimestamp: {
      timestampID: 'wakeupTime',
      minutes: 90
    }
  },
  ui: {
    blockedMessage: 'YouTube is locked until your work-start tasks are done.',
    allowedMessage: 'YouTube is allowed right now.'
  },
  shortcut: {
    name: 'Open Work App',
    input: 'plannedWork'
  },
  timezoneMode: 'fixed'
}
```

### Lockout block keys

| Key | What it means |
| --- | --- |
| `id` | Human-readable block identifier for debugging. |
| `type` | Rule type: `task_block`, `duration_block`, or `firstXMinutesAfterTimestamp_block`. |
| `presets` | Preset names this block belongs to. If no preset is active, all blocks are eligible. |
| `times` | Daily active window. `beg == end` means all day. Windows may cross midnight. |
| `typeSpecific.task.metricIDs` | Metric IDs that must be complete for task blocks. |
| `typeSpecific.task.mode` | Whether `all` or some other configured completion mode is required. |
| `typeSpecific.duration.maxMinutes` | Screen-time budget for duration blocks. |
| `typeSpecific.duration.screenTimeID` | Metric row containing accumulated screen time. |
| `typeSpecific.firstXMinutesAfterTimestamp` | Blocks for a period after a logged timestamp. |
| `ui` | Messages the client can show when blocked or allowed. |
| `shortcut` | Optional hint telling the client what Shortcut/action to run. |
| `timezoneMode` | `fixed` uses script/cache timezone; `floating` follows the device/browser local timezone. |

# 7) Notion setup (optional)

Skip this section unless you want Notion integration.

1. Create or choose the Notion databases OpenHabits should update.
2. Add the Notion-related Script Properties listed in shared setup.
3. Confirm `notion.propertyNames` in `Config.gs` match your Notion property names.
4. Set global `writeToNotion: true`.
5. Set `writeToNotion: true` only on the metric objects you want synced.

If a sync field is disabled or a metric has `writeToNotion: false`, OpenHabits should still work as a Sheet-first system.

# 8) My personal config

A full personal example is valuable because it shows how the pieces fit together in real life. The future folder should include:

- a real `Config.gs`,
- a copyable Google Sheet setup,
- logger Shortcuts,
- lockout Shortcuts,
- and example presets.

For now, use this placeholder: [Personal Setup Placeholder](personal-config-placeholder.md).

# 9) Troubleshooting

- **Metric not found** — make sure the metric ID exists exactly in column A of `Tracking Data`.
- **Writes go to the wrong day** — check Apps Script timezone and `lateExtensionHours`.
- **Shortcuts get permission errors** — redeploy the web app and confirm access settings.
- **Lockouts never trigger** — confirm the app-open automation is enabled and calls the right Shortcut.
- **Duration blocks never trigger** — confirm app-close automation logs screen time to the expected row.
- **Preset rules do not apply** — check the preset name passed by the client or the event title in the preset calendar.
- **Notion does not update** — confirm global `writeToNotion`, per-metric `writeToNotion`, Script Properties, and Notion property names.

# 10) Minimal go-live checklist

- [ ] `Tracking Data` tab exists.
- [ ] Column A contains unique metric IDs.
- [ ] `spreadsheetId` Script Property is set.
- [ ] Apps Script timezone is correct.
- [ ] Web app is deployed and URL is copied.
- [ ] One test metric can be logged successfully.
- [ ] Habit Shortcuts have web app URL + secret.
- [ ] Lockout Shortcuts have web app URL + secret, if using lockouts.
- [ ] App-open automations are enabled, if using iOS lockouts.
- [ ] Chrome extension options are configured, if using desktop website lockouts.
- [ ] Personal rules start small: 2–5 metrics and 1 simple lockout block before expanding.
