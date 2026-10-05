# Blocking rules and presets

Rules use the same metrics you log. Configure them in the Config Editor's **Blocks** tab, then **Save and Apply**. For iOS, also run **Update Lockout Cache**. Chrome reads the server's rules directly.

First install [iOS app protection](ios-lockouts.md) or [Chrome website protection](chrome.md).

## Choose a rule

| Goal | Configuration |
| --- | --- |
| Block until the day is planned | **Task block**, required timestamp metric `day_plan`; see the [complete setup example](ios-lockouts.md#1-require-a-day-plan-before-social-apps) |
| Block after 60 minutes of protected app use | **Duration block**, duration metric `screen_time`, max minutes `60` |
| Block every day from 09:00 to 12:00 | **Duration block**, valid duration metric `screen_time`, max minutes `0`, time window `09:00`–`12:00` |
| Block for 30 minutes after planning | **First X minutes after timestamp**, timestamp metric `day_plan`, minutes `30` |
| Release screen-time allowance gradually | **Duration block** with rationing enabled, described below |

A task block remains active if **any** required metric is incomplete. Completion means a nonempty daily cell, including numeric zero; it does not mean a target count has been reached.

A duration block needs a configured duration metric and its corresponding Sheet row. An empty cell for that existing row counts as zero use. Connect [phone timers](ios-lockouts.md#track-protected-app-time) or [Chrome logging](chrome.md) to supply actual use. A zero-minute limit blocks throughout its window even without recorded use.

A timestamp rule needs a valid timestamp for the tracking day. If none exists, that rule does not block; pair it with a task block if the timestamp must be logged before access is allowed.

## Time windows and order

The beginning is inclusive and the end is exclusive. A window crossing midnight, such as `22:00`–`07:00`, works overnight. Equal beginning/end times mean a full day.

Rules are evaluated in their listed order. The first rule that actually blocks supplies the message and optional shortcut action. If you want an action when blocked, choose its Shortcut name/input in the rule; Chrome displays the block but cannot run an iOS shortcut.

Fixed timezones use the configured/script timezone; floating rules use the client's offset. See [Timezone settings](maintenance.md#timezone-settings) when you travel or mix clients.

## Rationing

For a duration block, enable **Rationing** and choose the allowance at the beginning and end of its window. For example, within `09:00`–`21:00`, an allowance growing from `0` to `120` minutes releases about ten minutes per hour. Also set max minutes to `120` to cap the day's allowance. Access blocks when used minutes reach the allowance available now.

Use a message such as `{usedHuman} used; allowance now {allowedNowHuman}.` The editor supports tokens for used, available, maximum, remaining, end time, and the screen-time bar; the [server reference](../lockouts-server.md#message-and-tokens) lists their exact names.

## Different rules on different days

A **preset** is a label on blocks, not a separate copy of your metrics. For example, assign `workday` to workday rules and `weekend` to weekend rules.

On iOS, create an all-day event in **App Lockout Settings** titled exactly `workday` or `weekend`. Locked reads that title as the day's preset. Use one matching all-day event per day.

For Chrome, set the global **Preset Calendar Name** to a Google Calendar the Apps Script account can read. Create today's all-day event with the preset title there. If you want both devices to use it, make that Google Calendar available in Apple Calendar and select it in Locked's calendar actions. The Chrome options page has no separate preset selector.

With a selected preset, only blocks assigned to that preset are eligible. **With no selected preset, all blocks are eligible**, even blocks assigned to different presets. Create calendar events for the days on which you need a particular selection.

Test each preset with one incomplete task and then its completed value. The server's `app_closer` response includes the resolved preset and evaluation errors for custom debugging; see [API reference](../developer-keys.md).
