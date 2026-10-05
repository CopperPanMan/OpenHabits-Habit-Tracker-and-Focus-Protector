# Prepare the starter Google Sheet and six shortcuts

Users receive a **Google Sheets copy link**, not a spreadsheet document in Git. [starter-config.json](starter-config.json) matches the two templates used in the setup demos. All install links belong directly in the [Setup Guide](../Repo%20Docs/setup.md).

## Assemble the Sheet

1. Create a fresh template Sheet while signed in to the **Sierra Mille account** that will own/share it. Follow the [manual installation](../Repo%20Docs/setup.md#1-copy-the-starter-sheet) to add the four script files and two HTML files; import the starter JSON and **Save and Apply**.
2. Confirm Tracking Data contains the nine IDs below. Blocking and Notion are disabled; users add their own rules after the demos.
3. Test on a private copy with a new secret/deployment. Keep the public template's rows and headers but clear demo recordings from column C onward.
4. Check current and previous configurations in **_OpenHabits Config** contain only starter settings. Remove personal IDs, API tokens, secrets, deployments, and installed triggers from the public template's bound project. Users create their own credentials/deployment and optional streak trigger after copying.

| Row ID | Purpose |
| --- | --- |
| `glass_of_water` | Number/add: one unit per glass |
| `glass_of_water_points` | One point per glass |
| `last_drank` | Timestamp/overwrite: latest drink time |
| `last_drank_points` | One daily completion point; overwrites adjust by the difference |
| `last_drank_streak` | Daily completion streak |
| `time_working` | Duration/add: accumulated working time |
| `time_working_points` | 0.1 points per rounded minute |
| `point_total_today` | Daily points |
| `point_total_alltime` | Cumulative points |

The late extension is five hours and schedules default to every day. Two water-demo runs produce two glasses, the latest timestamp, and three total points before any work session. Blank history gives users their own starting point. Do not apply this starter over an existing personal configuration unless you intend to replace that configuration; it does not rename historical rows or existing loggers.

## Prepare the six shared shortcuts

Publish exactly **Insights**, **Metric(s) Logger Template**, **Toggle Timer Template**, **Locked**, **Allowed**, and **Update Lockout Cache**, separately for iOS 26 and iOS 27. No extra demo shortcuts are needed.

| Template | Preloaded Text |
| --- | --- |
| Metric(s) Logger Template | `[["glass_of_water",1],["last_drank"]]` |
| Toggle Timer Template | `[["time_working"]]` |

Numbers require a value on the current server, so the water entry includes `1`. See the [logger publication readout](../Repo%20Docs/shortcut-actions/Metric%28s%29%20Logger%20Template.md) for its three native actions. The timer stores start state locally and submits elapsed duration; remove the historical comment about server start_timer/stop_timer requests. Check the [timer publication notes](../Repo%20Docs/shortcut-actions/Toggle%20Timer%20Template.md) and recovery findings against the actual native shortcut.

Shared shortcuts must not include your credentials, personal calendar selections, or third-party blocking-app actions. Keep the optional Comment placeholders in Locked/Allowed. Include the app-open automation in the iOS 27 Locked share; iOS 26 users create a personal automation.

Use the [Insights installer readout](../Repo%20Docs/shortcut-actions/Insights.md): installation is triggered by **Update Lockout Cache**, supporting both protection and Calendar Alarms-only users. Verify the logger passes its original recording response to Update Lockout Cache when installed. Confirm rerunning setup updates both managed scripts without replacing settings/state.

## Publish and verify

Share the Sheet view-only by link from the Sierra Mille account. Add its `/copy` link to **Copy the starter Sheet** in [Setup](../Repo%20Docs/setup.md#1-copy-the-starter-sheet), and put the six final iCloud links in each version toggle under **Install the phone shortcuts**. Downloads is only a pointer to that page, so it does not need a second set of links.

Open the public Sheet signed out to check the owner identity. From another account, copy it and follow setup: authorize, deploy with a new secret, log both water metrics twice, and complete two work sessions. Verify app protection through both blocked and allowed outcomes, test both temporary unlock types, and test Calendar Alarms-only setup with Update Lockout Cache but no Locked/Allowed. Approve permissions unlocked and test each published iOS version before replacing the placeholders.
