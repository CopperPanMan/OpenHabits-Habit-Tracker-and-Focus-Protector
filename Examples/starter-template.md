# Prepare the starter Google Sheet

This is the maintainer checklist for the shared template. Users receive a **Google Sheets copy link**, not a spreadsheet document stored in Git. [starter-config.json](starter-config.json) supplies its configuration.

## Assemble it

1. Create the template Sheet while signed in to the **Sierra Mille account** that will own and share it. Start with a fresh Sheet rather than a copy of personal tracking history.
2. Follow the [manual installation steps](../Repo%20Docs/setup.md#1-copy-the-starter-sheet) to add the four Apps Script files and two HTML files. Import `starter-config.json` and **Save and Apply**.
3. Confirm **Tracking Data** has the nine IDs listed below. No blocking rules or Notion sync are enabled.
4. On a private test copy, deploy with a new secret, configure Insights, and verify the example shortcuts. Remove sample recordings from the public template. Keep the template's tracking rows and headers, but no recorded values from column C onward.
5. Check both current and previous configuration stored in **_OpenHabits Config** contain only starter settings. Confirm there are no personal Sheet/Notion IDs, API tokens, secrets, deployments, or installed triggers in the public template's bound project. Consumers create their own secret, deployment, and optional streak trigger after copying.

| Row ID | Purpose |
| --- | --- |
| `started_day` | Timestamp, keep first |
| `started_day_streak` | Daily completion streak |
| `started_day_points` | One point per completion |
| `water` | Number, add |
| `water_points` | One point per glass |
| `focus_duration` | Duration, add |
| `focus_points` | 0.1 points per rounded minute |
| `point_total_today` | Daily points |
| `point_total_alltime` | Cumulative points |

The config uses a five-hour late extension. Started Day is scheduled daily; water and focus can be logged daily. The example timestamps use the script timezone. Blank histories give new users their own starting point.

## Prepare matching shortcuts

For each supported iOS version, share the same shortcut names used in [Downloads](../Repo%20Docs/downloads.md). Starter-specific logger inputs are:

| Shortcut | Metric text / behavior |
| --- | --- |
| Log Started Day | `[["started_day"]]` passed to Insights |
| Log Water | `[["water",1]]` passed to Insights |
| Toggle Focus Timer | Toggle Timer Template configured for `focus_duration` |

The two loggers can be made by duplicating Metric(s) Logger Template. In the timer, correct any stale comment claiming server `start_timer`/`stop_timer` requests: the client keeps timer state and submits an elapsed duration. Check the [timer review findings](../Repo%20Docs/runtime-review-notes.md#toggle-timer) against the native shortcut before publishing it.

Shared shortcuts must not contain your secret/deployment ID, personal calendars, or third-party blocking-app actions. Use the optional **Comment** placeholders in Locked/Allowed for users who want to add their own blocking app. Verify that rerunning Insights setup updates both managed Scriptable scripts when Locked is installed.

## Publish and verify the copy

Share the template as view-only by link from the Sierra Mille account and add its Google Sheets `/copy` link to [Downloads](../Repo%20Docs/downloads.md). Add the final iCloud Shortcut links to their respective iOS sections there as well.

Open the public link signed out to verify the published owner identity is the intended Sierra Mille identity. From another account, make a copy and follow [Setup](../Repo%20Docs/setup.md) from start to finish: confirm bound code/config are present, authorize it, add a new secret, deploy it, and log all three starter metrics. Test optional shortcuts/permissions on each supported iOS version before replacing the publication placeholders.
