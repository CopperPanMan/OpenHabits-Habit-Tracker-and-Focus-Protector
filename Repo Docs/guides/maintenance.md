# Maintenance and troubleshooting

## Charts and dashboards

Your tracking data is a normal Sheet: column A identifies each metric, column B labels it, and columns C onward hold daily values. Use Sheets charts, formulas, and conditional formatting for the views you want.

For a simple chart-ready table on a separate tab, put `Date` and `Water` in A1:B1. In A2 enter `=TRANSPOSE('Tracking Data'!C1:1)`. In B2 enter `=TRANSPOSE(FILTER('Tracking Data'!C2:1000,'Tracking Data'!A2:A1000="glass_of_water"))`. Chart the resulting two columns. Replace `glass_of_water` with another metric ID; widen the row range if your Sheet has more than 1,000 rows. Keep the area below these formulas empty so their results can expand.

## Timezone settings

Set the **Apps Script project timezone** and **Google Sheet timezone** to the intended home timezone. Metric and block settings can use **fixed** (configured/script timezone) or **floating** (client timezone/offset) behavior. Custom clients must provide a `timezone` or offset-bearing `clientNow` when they want client-based evaluation; see [API reference](../developer-keys.md).

**Late Extension Hours** shifts the tracking day boundary after midnight. With `5`, a recording at 01:00 belongs to the previous tracking day. This also matters for streaks and completion checks. It is not an extra five hours added to every task's deadline.

After travel or a timezone/configuration change, run **Update Lockout Cache** without input on each iOS device. It refreshes the snapshot using that device's current offset. Timed alarms still need Calendar Alarms' own synchronization.

## Back up and change configuration

Download a JSON backup in the editor and make a private copy of the Google Sheet for its history and bound code. The JSON contains configuration, not historical recordings, credentials, or phone timer/unlock state. Phone state lives separately in `iCloud Drive/Shortcuts/OpenHabits/OpenHabits Metrics`.

For ordinary changes, use the Sheet's **Copy Current Configuration → Open Config Editor** flow, then **Finish and Copy for OpenHabits → Save and Apply**. The panel also offers restoring the previous configuration and repairing missing rows. Applying configuration appends missing rows and retains old history rows; it does not delete metrics' historical data or overwrite custom nonempty labels.

Changing a display name is independent of its metric ID. Changing an ID creates a new identity: update shortcuts, Notion pages, alarm references, and blocking rules together. Existing history stays under the old ID. Duplicate IDs must be resolved before applying configuration.

## Update installed code

| Change | What to do |
| --- | --- |
| Metric/global/rule configuration | Save and Apply; refresh iOS caches |
| Apps Script source files | Replace the corresponding files; **Deploy → Manage deployments → Edit → New version → Deploy** to keep the existing deployment URL |
| iOS shared shortcut | Install the updated version, reselect imported action connections, and test it |
| Metrics Scriptable runtime/evaluator | Rerun updated Insights setup with Locked installed, or replace both named scripts manually |
| Chrome extension source | Update the local extension folder and choose Reload in `chrome://extensions` |

The current inline installer replaces managed scripts after validating downloaded source; it keeps settings, cache, timer, and unlock-state files. Historical installers that skip existing files do not update them. The [runtime reference](../runtime.md) describes the current wiring and remaining on-device checks.

The logging performance update changes `Main.gs` and `getAppConfig()` in `Config.gs`. Preserve your custom `getCodeBackedAppConfig()` settings when updating the latter. See [logging performance](../performance.md) for deployment steps, offline checks, and live timing guidance.

## Troubleshooting

| Symptom | Check next |
| --- | --- |
| Logger runs but no cell changes | Correct deployment **ID** in Insights, matching required secret, web app access set to Anyone, correct metric ID and existing row. Check Apps Script **Executions** for errors. |
| Web app URL opened in a browser says POST is required | Expected: this server accepts JSON POST requests, not ordinary browser GET requests. Test through Insights or the [custom logger example](../developer-keys.md#recording-values-and-responses). |
| New rows are missing | Save and Apply the configuration in the Sheet panel, or use its repair action. Public logging endpoints do not create rows. |
| Today's recording appears under yesterday | Check Late Extension Hours and timezone settings above. |
| Repeated taps make no change | Check whether the metric keeps its first value, or rejects writes after a due-by deadline. |
| Values update but totals/streaks don't | Configure distinct supporting row IDs and repair rows. Direct Sheet edits do not rerun logging calculations. Install the daily streak trigger for unlogged days. |
| Timer stop failed or timed out | Check the duration cell before retrying: an additive request may already have succeeded. See [timer guide](timers.md) and [developer review notes](../runtime-review-notes.md#toggle-timer). |
| Run Shortcut/Run Script action is disconnected | Reselect the installed shortcut/script explicitly; a displayed imported name may retain a stale binding. |
| Scriptable reports missing files/bookmark | Verify the **Shortcuts** bookmark, exact script names, iCloud state path, and file availability on that device. Run setup/cache refresh once unlocked. |
| iOS rules are out of date | Run Update Lockout Cache without input; verify the saved configuration and preset event. |
| App never blocks | Check automation runs immediately, current rule window, preset assignment, required metric IDs, and recorded duration. Invalid rules can be skipped; inspect server diagnostics if necessary. |
| Notion alone fails | Follow the [Notion checks](notion.md); Sheets logging and Notion sync are separate operations. |

For custom clients, check `errors` and each requested metric's entry in `metricsByID`. A top-level `ok: true` can include individual recording failures. Retrying additive requests blindly can duplicate a recording.

For an installation made before the current metric schema, read [Schema migration](../metric-schema-migration.md) before updating.
