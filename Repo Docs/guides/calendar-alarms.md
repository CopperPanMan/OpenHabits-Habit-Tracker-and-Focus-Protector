# Calendar Alarms integration

[Calendar Alarms for iOS](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS) can use Metrics data to show/speak reminders, skip completed tasks, or keep an alarm returning until a task is done. Both projects work independently.

## Connect once

1. Finish [Metrics setup](../setup.md) and install Calendar Alarms using its [Setup Guide](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS/blob/main/Setup%20Guide.md).
2. Install **Update Lockout Cache** from the [Metrics shortcut toggles](../setup.md#3-install-the-phone-shortcuts) and follow the Scriptable steps under [Connect Insights](../setup.md#4-connect-insights). It uses your existing connection settings; Locked, Allowed, app-open automations, and blocking rules are not needed for this integration.
3. Run **Update Lockout Cache** without input, then run **Calendar Alarms Actions** setup. Approve its permissions with your phone unlocked.

The integration reads `Shortcuts/OpenHabits/OpenHabits Metrics/lockoutCache.json`. It does not need another web app deployment or a second secret.

## Show or speak a reminder

In the [Calendar Alarm Editor](https://copperpanman.github.io/Calendar-Alarms-for-iOS/), add an **OpenHabits Reminder** action, select the desired display/speech mode, and enter the exact Metrics IDs. The reminder can use completion, points, streak, and current value data.

For a custom call to **Calendar Alarms Actions**, pass one action object:

```json
{"action":"openhabits_reminder","metricIDs":["last_drank"],"mode":"both"}
```

See the [Actions reference](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS/blob/main/Calendar%20Alarms%20Actions%20Schema.md#openhabits-reminder) for other modes.

## Repeat until a task is done

In an alarm's task settings, enter the required metric IDs, a positive **Task Loop Minutes** interval, and a reschedule limit. Enable the first-fire task check if you also want to skip an alarm whose task is already complete. All listed metrics must be complete to stop the loop.

For example, require `last_drank`, repeat every `30` minutes, and set a small reschedule limit while testing. On a day when Last Drank is empty, paste the alarm configuration into a test event's notes and run **Calendar Alarm Engine** to sync. Let it fire, run **Metric(s) Logger Template**, and confirm that the follow-up is removed or stops repeating. If you have already tried the water demo today, use a new timestamp metric and a copy of the logger template instead.

Current Calendar Alarms Actions refreshes task state for task-loop resets; a separate **Task Alarm Resetter** shortcut is not required. When calling Calendar Alarm Engine after an iOS recording, pass the original recording response if your installed Insights has that integration hook. Updating the Sheet manually changes completion state but does not rerun Metrics scoring.

See Calendar Alarms' [Task Looping reference](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS/blob/main/Feature%20Reference.md#task-looping) for the alarm behavior and [JSON reference](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS/blob/main/JSON%20Alarm%20Reference.md) for raw fields. Test these features once unlocked before relying on locked-phone execution.

## End a temporary app unlock

The **Locked** readout optionally creates an **Apps Unlocked** event and invokes **Calendar Alarm Engine** when installed. Select a real calendar named **App Lockout Settings** in its event action. The expiry action sends you Home, using the returned `calendarEnd` with offset `0`. This is independent of the calendar's optional all-day preset events; see [iOS temporary unlocks](ios-lockouts.md#temporary-unlocks).
