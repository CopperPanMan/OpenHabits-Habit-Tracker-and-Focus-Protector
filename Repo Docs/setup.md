# OpenHabits Setup and Usage Guide

## V2 quick start (recommended)

1. Copy the OpenHabits Sheet and its bound Apps Script, then reload the Sheet.
2. Set the Apps Script project timezone and add the `OPENHABITS_SECRET` Script Property. Add `spreadsheetId` only when the script is not bound to the target Sheet.
3. Choose **OpenHabits → Setup Status** and resolve any red checks.
4. Choose **OpenHabits → Install Starter Metrics**. This creates the hidden, protected `_OpenHabits Config` tab, saves a revision, and appends all missing rows to `Tracking Data`.
5. Deploy the Apps Script web app once. Configuration edits after this point do **not** require redeployment.
6. Install Insights and the starter Metric Logger Shortcut. Timer Shortcuts keep their own start state and submit elapsed values through the same logger. Insights owns the deployment URL and secret in `Shortcuts/OpenHabits/OpenHabits Metrics/settings.json`.
7. Try `started_work`, add a value to `glasses_of_water`, and submit a duration to `focus_session_minutes`.
8. Choose **OpenHabits → Edit Configuration** to add metrics from recipes, edit settings in forms, preview row changes, and use **Save and Apply**. You never need to edit JSON or redeploy for configuration changes, and the previous valid revision remains restorable.

The V2 script creates `_OpenHabits Config` itself; do not create or edit that tab manually. The tracking tab defaults to `Tracking Data`, with `Metric ID` in column A and the friendly label in column B. Existing unreferenced rows and their history are retained, never deleted.

### Quick Links

- [Developer Keys](developer-keys.md) — the web app keys you can call from your own clients.
- [Personal OpenHabits Setup Example](personal-config-placeholder.md) — an anonymized example setup with the author's config structure, Sheet/Shortcut links, and lockout strategy.
- [Habits V2 technical spec](habits-v2-spec.md) — deeper implementation details for the metric logger.
- [Lockouts technical spec](lockouts-spec.md) — deeper implementation details for app/site blocking.

# 1) Before you start: what you are setting up

OpenHabits is not one single app. It is a small personal system made from pieces you control:

- **Apple Shortcuts** are the buttons, QR/NFC launchers, app-open automations, and simple user interface.
- **Google Apps Script** is the web app brain that receives requests, writes metrics, calculates status, and evaluates lockout rules.
- **Google Sheets** is the database and dashboard source of truth.
- **Scriptable** is used by iOS lockout flows to keep the Locked Shortcut small, fast, and manageable. The lockout logic is too large for a reliable 1,000-action Shortcut, so Scriptable runs the heavier client-side logic.
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
   - `SetupV2.gs`
   - `SetupV2Sidebar.html`
   - `SetupV2Styles.html`
   - `SetupV2Client.html`
3. In Apps Script project settings, set the timezone to your real local timezone.

Timezone matters because daily columns, streaks, due times, and lockout windows all depend on what OpenHabits thinks “today” means.

## C) Add Script Properties

In **Apps Script → Project Settings → Script properties**, add:

| Property | Required? | What it does |
| --- | --- | --- |
| `spreadsheetId` | Only for standalone scripts | The ID of the Google Sheet OpenHabits should read/write. A script bound to the OpenHabits Sheet uses that Sheet automatically. |
| `OPENHABITS_SECRET` | Recommended | A long random shared secret for clients that call the web app. |
| `notionMetricDatabaseIDs` | Only for Notion | Database IDs OpenHabits should search/update. |
| `pointBlock` | Only for Notion | Notion block ID for point output. |
| `insightBlock` | Only for Notion | Notion block ID for insight output. |

You can find the Sheet ID in the Sheet URL between `/d/` and `/edit`.

> **Screenshot to add:** Apps Script Script Properties with secret values blurred. A standalone deployment should also show `spreadsheetId`.

## D) Configure OpenHabits in the Sheet

The normal configuration workflow is entirely graphical:

1. In your Sheet, choose **OpenHabits → Edit Configuration**.
2. Use **Metrics → Add from recipe** for a completion habit, additive or replacement number, timestamp, duration, text, or due-by timestamp.
3. Give the metric a friendly name. The editor generates its ID; you can still customize it before saving.
4. Open the collapsed **Advanced** sections only when you need schedules, streaks, points, or insights.
5. Add optional focus rules under **Focus rules**. Installation-wide and optional Notion settings are under **Settings**.
6. Choose **Preview Sheet changes**, then **Save and Apply**. OpenHabits validates the complete configuration, creates missing rows, retains historical rows, and activates the new revision immediately.

There is no config code to copy, no JSON to write, and no deployment step after a configuration change. The [standalone browser editor](https://copperpanman.github.io/OpenHabits-Habit-Tracker-and-Focus-Protector/) remains available for advanced migration and offline backup work; it is not the normal setup path.

Important shared fields:

- `scriptProperties.spreadsheetId` names the optional Script Property that points a standalone script at your Sheet. Sheet-bound projects use their bound Sheet automatically.
- `trackingSheetName` should match the tab name exactly.
- `lateExtensionHours` lets late-night logging count toward the previous day. For example, `5` means 1:00 AM still belongs to yesterday.
- `metricSettings` is where habit metrics go.
- `lockouts.blocks` is where blocking rules go.
- `writeToNotion` should stay `false` unless you are intentionally setting up Notion.

> **Tip:** If you are not sure what config to build, see the README section on using AI to generate, revise, or debug an OpenHabits setup. You can bring the result back into the Config Editor for review.

> **Screenshot to add:** Sheet sidebar with the recipe picker and **Save and Apply** button highlighted.

## E) Deploy the web app

1. Click **Deploy → New deployment**.
2. Choose **Web app**.
3. Execute as: **Me**.
4. Access: usually **Anyone with the link** for personal Shortcuts automation.
5. Copy the deployment URL. You will paste it into Shortcuts, Scriptable, and/or the Chrome extension.

> **Screenshot to add:** the Apps Script deployment dialog with “Web app,” “Execute as me,” and the copied deployment URL.

# 4) Recommended first smoke test

Do this after you have installed at least one logger Shortcut. Most users should not need curl, Postman, or any developer tool for the first test.

1. Choose **OpenHabits → Install Starter Metrics**.
2. Install Insights and the starter logger Shortcuts; configure the deployment URL and secret once in Insights' settings file.
3. Run the Started Work logger, the Glasses of Water logger, and the Focus Session timer manually.
4. Confirm today's cells update in the Sheet.

If this works, your Sheet, Apps Script deployment, permissions, secret, and Shortcut path are connected. If it fails, fix this before building a full habit or lockout system.

# 5) Habit Tracking Setup

## Local iCloud folder layout

OpenHabits stores its Shortcut-managed files below the base `Shortcuts` folder in iCloud Drive. Use this layout so habit tracking, timers, lockouts, and Calendar Alarms do not compete for the same files:

```text
Shortcuts/
└── OpenHabits/
    ├── OpenHabits Metrics/
    │   ├── settings.json
    │   ├── timerStates.json
    │   ├── lockoutCache.json
    │   └── lockouts.json
    └── Calendar Alarms/
        ├── <5 × Calendar Alarms .txt files>
        ├── settings.json
        └── Alarm Tones/
```

`OpenHabits Metrics` is the canonical location for files managed by the OpenHabits Shortcuts. `Calendar Alarms` is reserved for the separate Calendar Alarms for iOS integration; its `Alarm Tones` folder is user-managed, and OpenHabits must not replace or delete it.

When upgrading an existing installation, move files into `Shortcuts/OpenHabits/OpenHabits Metrics` before running the updated Shortcuts. In particular, move `Shortcuts/App Locker/lockoutCache.json` to the new folder. If a file already exists at the new location, keep it rather than overwriting it with an older copy. After verifying that the updated Shortcuts work, the old `App Locker` folder can be removed.

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

- **Shortcut QR Code Generator** — use the always-available panel below Export in the online Config Editor to create a QR code that launches any installed habit logger Shortcut. Enter the Shortcut name exactly as it appears in Apple Shortcuts, then download or scan the generated code.
- **Metric Logger Template** — duplicatable template for text, numbers, durations, and timestamps.
- **Timer client** — a Shortcut may toggle a timer locally, but when it stops it sends only the elapsed value to an additive duration metric.
- **Insights** — optional UX helper that reads and displays the return message generated after a metric logger Shortcut records something.
- **Remember!** — optional helper that fetches the current status of a metric.

Follow the setup comments at the top of each Shortcut. Usually you will paste in:

- your Apps Script web app URL,
- your shared secret,
- and the metric IDs you want that Shortcut to log.

**Important Shortcuts import note:** if an imported Shortcut contains a **Run Shortcut** action, open that action and manually reselect the Shortcut it should run. Apple Shortcuts can show the correct name while still failing to connect the imported Shortcut behind the scenes.

No automations are required for basic habit logging. Optional NFC automations can scan a tag and launch a specific logging Shortcut.

The QR generator runs in your browser and encodes only the Shortcut launch URL. It does not include your Apps Script URL, shared secret, or metric IDs; those remain configured inside the logger Shortcut itself.

> **Screenshot to add:** one Shortcut editor screen showing where the web app URL and metric ID are pasted.

## C) Habit metric template

```js
{
  metricID: 'meditationDuration',
  dataType: 'duration',
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
| `dataType` | Stored value type: `text`, `number`, `duration`, or `timestamp`. |
| `displayName` | Human-readable name used in output messages. |
| `recordType` | How writes behave: `overwrite`, `keep_first`, or `add`. |
| `dates` | Days/times when this metric is expected or eligible for prompts/streaks. |
| `streaks` | Optional derived streak row. Create the `streaksID` row in the Sheet. |
| `points` | Optional point settings. Create the `pointsID`, daily total, and cumulative total rows in the Sheet. |
| `insights` | Controls comparison/performance messages after logging. |
| `ppnMessage` | Text fragments used by positive push notification prompts. |
| `writeToNotion` | Per-metric Notion sync preference. Global `writeToNotion` must also be enabled. |
| `timestampSettings` | Timestamp-only write policy. Use `writeMode: 'due_by'` to gate writes by each matching date rule’s due time. |

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

## C) Scriptable setup

The **Locked** Shortcut uses a Scriptable script named `lockouts` for the heavier lockout logic. This keeps the Shortcut layer small and reliable instead of trying to maintain hundreds of actions inside one Shortcut. The Shortcut reads the cache from `Shortcuts/OpenHabits/OpenHabits Metrics/lockoutCache.json` and passes its contents to the script; the script does not read the file itself.

1. Install Scriptable from the App Store.
2. In iCloud Drive, create `Shortcuts/OpenHabits/OpenHabits Metrics` if it does not already exist.
3. Open Scriptable and create a new script named `lockouts`.
4. Copy the contents of `lockouts.js` into that Scriptable script.
5. In Scriptable, create a file bookmark to the base `Shortcuts` folder. Name the bookmark exactly `Shortcuts`.
6. Confirm the bookmark opens successfully before testing the **Locked** Shortcut.

> **Screenshot to add:** iCloud Drive showing `Shortcuts/OpenHabits/OpenHabits Metrics`, Scriptable showing the `lockouts` script, and Scriptable's bookmark list showing the base `Shortcuts` bookmark.

## D) Shortcuts you need

For iOS lockouts, import or build these Shortcuts:

- **Locked** — main entry check. It determines whether you are allowed into the app and uses a local cache for faster responses. Its setup instructions route to the `lockouts` Scriptable script.
- **Allowed** — UX helper shown when entry is allowed. It makes the notification green and says “allowed,” instead of showing a grey notification from the Locked Shortcut with a lock icon.
- **Update Lockout Cache** — refreshes the local lockout cache from the Apps Script server.
- **Metric Logger for Screen Time** — a copy of the Metric Logger Template configured to log app start/stop timestamps or duration rows. This is required if you want duration-based blocks.

Follow the comments at the top of each Shortcut. Most setup is pasting your web app URL, shared secret, and web app/deployment ID. If an imported Shortcut contains a **Run Shortcut** action, open that action and manually reselect the Shortcut it should run; Apple Shortcuts can show the correct name while keeping a stale internal link.

## E) Automations you need

Create Shortcuts automations for the distracting apps you want to protect:

1. **When app is opened → run Locked**
   - Choose every enforced app in the automation trigger.
   - Turn off “Ask Before Running” if iOS offers that option.
   - This is the main blocking check.
2. **When app is closed → log screen time stop timestamp**
   - Required if you want to track screen time or block based on duration.
   - Point this automation at the screen-time logger Shortcut you configured.
3. Optional: use different copies of the Locked Shortcut for different apps.
   - Example: YouTube can pass `entertainment`, while Safari can pass `web`.
   - This is powerful, but it is not just a tiny tweak: it can mean maintaining nearly duplicate client setups that differ only by preset, Sheet/App Script target, or routing. Start with one Locked Shortcut first. Split into app-specific copies only after the basic flow works.

> **Screenshot to add:** iOS Automation screen showing “When YouTube is opened → Run Locked,” plus a second automation showing “When YouTube is closed → Run Metric Logger for Screen Time.”

## F) Configure lockout rules with the Config Editor

Use **OpenHabits → Edit Configuration → Focus rules** for normal lockout rule creation.

The editor is the primary way to create blocks and choose rule types. Choose **Save and Apply** after each change; no source edit or redeployment is required. Then run **Update Lockout Cache** so your phone has the fresh rules and re-test one protected app.

You still need to understand the concepts below, because they affect what the GUI fields mean. But you should not need to hand-write the whole block object unless you are debugging or building an advanced custom setup.

### Lockout block concepts

| Concept | What it means |
| --- | --- |
| Block ID | Human-readable identifier for debugging and messages. |
| Rule type | The kind of condition being enforced, such as task completion, screen-time duration, or first-X-minutes-after-a-timestamp. |
| Preset | A named mode such as `workday`, `weekend`, or `entertainment`. Clients can pass presets so different apps can be governed differently. |
| Active time window | The daily time range when the block applies. Some windows can cross midnight. |
| Required metric IDs | Habit/task rows that must be complete before access is allowed. |
| Screen-time metric ID | The row where app/site usage is accumulated for duration-based blocks. |
| Messages | Text the client can show when blocked or allowed. |
| Shortcut/action hints | Optional information telling the client what Shortcut or next action to offer. |

## G) Chrome extension setup

For desktop website blocking, load the Chrome extension as an unpacked extension:

1. Download the repo or at least the contents of the `Chrome Extension` folder.
2. If you downloaded a zip, extract it.
3. Put the extracted Chrome extension files into a normal folder you can find again, such as `Documents/OpenHabits Chrome Extension`.
4. Open Chrome.
5. Go to **⋮ → Extensions → Manage Extensions**, or open `chrome://extensions`.
6. Turn on **Developer mode** in the top-right corner.
7. Click **Load unpacked**.
8. Select the folder that directly contains the extension files, including `manifest.json`. Do not select the entire repo unless `manifest.json` is directly inside the selected folder.
9. Open the extension options page.
10. Add your Apps Script web app URL, shared secret, protected sites, preset names, and screen-time metric IDs if you want desktop usage logging.

> **Screenshot to add:** Chrome's `chrome://extensions` page with Developer Mode and Load Unpacked highlighted, then the folder picker selecting the folder that contains `manifest.json`, then the OpenHabits extension options page.

## H) Lockout testing sequence

Test in layers instead of trying the whole system at once:

1. Run **Update Lockout Cache** and confirm it finishes without an error.
2. Open one protected iPhone app and confirm **Locked** runs.
3. Create a rule that should allow you, then confirm the **Allowed** notification appears.
4. Create a rule that should block you, then confirm you are redirected or shown the blocked message.
5. Close the app and confirm your screen-time logger writes a stop timestamp or duration row to the Sheet.
6. If using desktop blocking, open a protected site in Chrome and confirm the extension logs session time to the Sheet.
7. Only after those pass, add more apps, presets, and stricter rules.

# 7) Notion setup (optional)

Skip this section unless you want Notion integration.

1. Create or choose the Notion databases OpenHabits should update.
2. Add the Notion-related Script Properties listed in shared setup.
3. Confirm `notion.propertyNames` in `Config.gs` match your Notion property names.
4. Set global `writeToNotion: true`.
5. Set `writeToNotion: true` only on the metric objects you want synced.

If a sync field is disabled or a metric has `writeToNotion: false`, OpenHabits should still work as a Sheet-first system.

# 8) Personal setup example

A full personal example is valuable because it shows how the pieces fit together in real life. See the [Personal OpenHabits Setup Example](personal-config-placeholder.md) for the author's anonymized setup structure, Sheet template link, Shortcut link placeholders, lockout strategy, and customization notes.

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
- [ ] For a standalone Apps Script project only, the `spreadsheetId` Script Property is set.
- [ ] Apps Script timezone is correct.
- [ ] Web app is deployed and URL is copied.
- [ ] One test metric can be logged successfully.
- [ ] Habit Shortcuts have web app URL + secret.
- [ ] Lockout Shortcuts have web app URL + secret, if using lockouts.
- [ ] App-open automations are enabled, if using iOS lockouts.
- [ ] Chrome extension options are configured, if using desktop website lockouts.
- [ ] Personal rules start small: 2–5 metrics and 1 simple lockout block before expanding.
