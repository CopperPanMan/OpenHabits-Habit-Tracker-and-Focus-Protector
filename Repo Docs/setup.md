# OpenHabits Metrics Setup

This guide connects your Sheet and shortcuts, then lets you try recording values and timing a session. Afterward, you can customize your metrics or [set up iOS app protection](guides/ios-lockouts.md).

You need a Google account and an iPhone with Apple Shortcuts. Scriptable is also used for iOS app protection and Calendar Alarms integration. Notion and third-party blocking apps are optional.

## 1. Copy the starter Sheet

**Starter Google Sheet — copy link pending publication.** Make your own copy when the shared Sheet is available. It includes the bound Apps Script and these metrics, matching the preloaded templates:

| Metric | What the demo records |
| --- | --- |
| Glasses of Water (`glass_of_water`) | Adds one glass each time you run the logger |
| Last Drank (`last_drank`) | Records the latest time you ran that same logger |
| Time Working (`time_working`) | Adds elapsed time when you stop the timer |

The **Tracking Data** tab holds your history. **OpenHabits → Open OpenHabits** opens its settings panel.

<details>
<summary>Install the Sheet manually before its copy link is published</summary>

1. Create a Google Sheet. Open **Extensions → Apps Script**.
2. Create script files and paste [Main.gs](../Main.gs), [Config.gs](../Config.gs), [Lockouts.gs](../Lockouts.gs), and [SetupV2.gs](../SetupV2.gs).
3. Create HTML files named **SetupV2Launcher** and **SetupV2Styles**, using [SetupV2Launcher.html](../SetupV2Launcher.html) and [SetupV2Styles.html](../SetupV2Styles.html). Apps Script adds the `.html` extension.
4. Save, run **openHabitsShowLauncher** once, authorize it, and reload the Sheet.
5. In the OpenHabits panel, choose [starter-config.json](../Examples/starter-config.json) under **Or choose a configuration backup**, then **Save and Apply**.

The JSON configures the Sheet. The shared starter Sheet itself will be distributed through a Google Sheets copy link.

</details>

## 2. Deploy your web app

1. Open **Extensions → Apps Script → Project Settings**. Set its timezone to your local timezone.
2. Under **Script properties**, add **OPENHABITS_SECRET** with a long random value. Keep it for the shortcut setup below.
3. Choose **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Authorize and deploy.
4. Copy the **deployment ID**, the portion between `/s/` and `/exec` in the URL:

   `https://script.google.com/macros/s/DEPLOYMENT_ID/exec`

Your secret lets your shortcuts call this deployment. A script bound to your Sheet does not need a separate spreadsheet ID property. [Google's deployment instructions](https://developers.google.com/apps-script/guides/web) explain the account-specific deployment options.

## 3. Install the iPhone shortcuts

**Install these three shortcuts:**

| Shortcut & install link | What it does and why you need it |
| --- | --- |
| **[Insights](https://www.icloud.com/shortcuts/732362ad21c64aa3b33af262654b1d0e)** | Connects your loggers to the Sheet and displays feedback. Used by both templates. |
| **[Metric(s) Logger Template](https://www.icloud.com/shortcuts/bf26ab9d8ddc420c983484a2ea8a9c89)** | Records one or more metrics. Comes ready for the water demo; duplicate it later for your own loggers. |
| **[Toggle Timer Template](https://www.icloud.com/shortcuts/cff63da7e3814bc6bac740a732e82998)** | Starts/stops a timer and records elapsed time. Used for the timer demo; keep it for anything you want to time. |

**Also using iOS app protection?** Install all three below. For Calendar Alarms integration alone, install **Update Lockout Cache**; you do not need Locked or Allowed.

| Shortcut & install link | What it does and why you need it |
| --- | --- |
| **[Locked](https://www.icloud.com/shortcuts/d7f5f060e14b434dac749d3baca003e0)** | Checks your rules when a protected app opens and redirects you when blocked. NOTE: *You will need to set an automation to run this whenever a protected app is opened (you choose the apps). Further instructions can be found inside the shortcut.*|
| **[Allowed](https://www.icloud.com/shortcuts/0a2a22c2049c4d10a56c5c01fc7209ad)** | Handles allowed access and lets you request a temporary unlock. *Further instructions can be found inside the shortcut.*|
| **[Update Lockout Cache](https://www.icloud.com/shortcuts/1c81ba3450604c2699068e1edf8583e3)** | Refreshes the local metric/rule data used by iOS protection and OpenHabits reminders/task checks in Calendar Alarms. |

Note: if you want to track screen time, you'll need one more automation that runs a shortcut to stop a configured screen time timer. Do this by making a shortcut that runs "Screen Time Timer" with input = stop.

## 4. Connect Insights

Manually run **Insights**. Enter the same **Secret** and **Web App Id** from step 2, then choose **I'm Finished**. Both templates use these connection settings.

<details>
<summary>If you installed Update Lockout Cache: prepare Scriptable</summary>

1. Install **Scriptable** and create a file bookmark named **Shortcuts** pointing to **iCloud Drive/Shortcuts**.
2. Run **Insights** setup again after Update Lockout Cache is installed. Its published installer wiring downloads **OpenHabits Runtime** and **lockouts** to Scriptable.
3. Run **Update Lockout Cache** without input once, with the phone unlocked, and approve its permissions.

Follow [app protection](guides/ios-lockouts.md) to activate protection, or [Calendar Alarms integration](guides/calendar-alarms.md) to use reminders and task checks. Installing these shortcuts alone does not protect apps.

</details>

## 5. Try the templates

### Record two metrics together

Run **Metric(s) Logger Template**, approve its permissions, and check today's cells. **Glasses of Water** should be `1`, and **Last Drank** should contain the current time. Run it again: the count becomes `2` and Last Drank updates.

The preloaded Text action is:

```json
[["glass_of_water",1],["last_drank"]]
```

The explicit `1` adds one glass. Timestamp metrics can record the current time without a supplied value.

### Time a session

Run **Toggle Timer Template** to start. Wait a minute, then run it again to stop. The elapsed time should appear in **Time Working**. A second completed session adds to the same daily total. Starting alone does not write a duration.

The timer comes configured with `[["time_working"]]`. Its comment blocks explain optional calendar/Focus actions; you can leave those out of the demo.

If either demo fails, use [Troubleshooting](guides/maintenance.md#troubleshooting) before continuing.

## 6. Make it yours

Open the Sheet's settings panel and use **Copy Current Configuration → Open Config Editor**. Load the copied configuration, customize it, then use **Finish and Copy for OpenHabits** and **Save and Apply** back in the Sheet panel.

Duplicate the logger or timer template for your own metrics. See [logger input examples](guides/metrics.md) or [timers](guides/timers.md) when you need them. New rows are created when you apply the configuration; ordinary configuration changes do not need a new deployment.

## 7. Set up app protection

Use your metrics to make access depend on what you have done: require a day plan before opening social apps, limit accumulated app time, or protect a window after an event.

[**Set up iOS app protection →**](guides/ios-lockouts.md) takes you through a complete first rule, app automation, verification, temporary unlocks, and everyday use. You can choose different rules and day presets afterward.

For websites on your computer, use [Chrome website protection](guides/chrome.md). For reminders and task-based alarms, use [Calendar Alarms integration](guides/calendar-alarms.md). [More features](features.md) covers points, streaks, insights, Notion, and other ways to log.
