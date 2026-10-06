# Insights and prompts

**Insights** is the phone shortcut that submits metric recordings. Optional performance feedback is configured per metric; it is separate from reminders telling you what to do next.

## Performance feedback when logging

Enable **Insights** for a metric in the Config Editor. Choose whether higher or lower values are better and which kinds of feedback you want: comparisons with previous days, recent averages, raw values, or streaks. Global settings control the comparison dates, average span, and positive/negative performance frequency.

Probabilities control how often feedback is selected; an insight is not guaranteed on every recording. Comparisons also need suitable history. Text metrics do not support numeric performance comparisons.

**Save and Apply**, then log through a shortcut that calls **Insights**. Start with a number or duration metric with several days of history if you want to test comparisons. The Sheet is the place to verify that the recording succeeded even when no comparison appears.

## Scheduled reminders

For a reminder that names a metric, checks its completion, or repeats until it is done, use [Calendar Alarms integration](calendar-alarms.md). This is the simplest way to schedule prompts without building your own client.

## Custom “what next?” prompts

The server also supports `positive_push_notification`. It chooses the first scheduled, incomplete metric in configuration order that has a `ppnMessage` and is eligible at the current time. This endpoint does not itself schedule or deliver a notification, and there is no dedicated published prompt shortcut.

For a custom client:

1. In **Advanced → What’s next? prompts**, turn on **Enable Suggestions** and edit the words before and after the streak count. For example, use “Keep your streak going:” before it and “Start your focused work.” afterward. The configuration stores this as `"ppnMessage": ["Keep your streak going:", "Start your focused work."]`; imported text messages are also preserved and editable.
2. Set the scheduled weekdays under **Date Rules**, then add **Suggestion Start Hour** and **Suggestion End Hour** windows in the prompts section if you want to limit eligibility. Hours use `0`–`24`; `8.5` means 08:30, and `20`–`2` crosses midnight. You can add multiple windows to a weekday. With no windows, the metric is eligible all day on its scheduled days; with no date rules, it is eligible every day. Due By controls due-by timestamp recording.
3. Send a JSON POST to your web app with `key: "positive_push_notification"`, your `secret`, and `data: null`.
4. Read the response's `messages` and display them in your client; use a personal automation if you want a schedule.

The example's first phrase is followed by the calculated streak count and unit, then the second phrase. See [API reference](../developer-keys.md) for request/response details. Prompt hours restrict prompting, rather than ordinary logging; [Create and log metrics](metrics.md) explains logging schedules.

Reorder metrics in the editor to change suggestion priority. For example, a custom “What should I do now?” shortcut could suggest an unfinished morning habit during the morning and focused work during working hours. Turning **Enable Suggestions** off removes that metric's prompt message while retaining its weekday and time-window settings.
