# Create and log metrics

[Feature guides](../features.md) · [Setup](../setup.md)

A metric stores one resulting value each day. Repeated recordings replace, retain, or add to that value according to its settings.

## Create a metric

Use the Config Editor to choose the value type and how repeated recordings behave, then **Save and Apply** in the Sheet panel. Keep the generated Metric ID unless you want a different one; your logger uses that ID.

| Track | Recipe/type | Example logger Text |
| --- | --- | --- |
| A task you completed | Completion | `[["flossed",1]]` |
| A count or rating | Number | `[["mood",8]]` |
| A note | Text | `[["daily_note","A good day"]]` |
| When something happened | Timestamp | `[["last_drank"]]` |
| Elapsed time | Duration | `[["time_working","00:25:00"]]` |

The IDs in these examples must exist in your configuration. The **Done / not done** recipe stores a number and marks the metric as a completion so the generator supplies `1` automatically. For an older completion metric, choose **Done / not done** under **What are you tracking?**; ordinary numeric metrics keep accepting input. A timestamp records the current time without a supplied value. A duration value uses `HH:MM:SS` (hours:minutes:seconds).

## Make its logger

1. Duplicate your installed **Metric(s) Logger Template** and rename it.
2. In the editor's **Shortcut-ready metric text**, select the metric and generate/copy its text.
3. Paste it into the logger's **Text** action. The generator uses the configured type: completion sends `1`, timestamps need no value, and numbers, text, and durations receive a Provided Input placeholder. Confirm **Run Shortcut** calls **Insights**.
4. Run it, then check the matching Sheet cell.

The shortcut's **Comment blocks** contain instructions for configuring its actions and optional integrations.

For a value you enter each time, add **Ask for Input** before Text. Replace `<Provided Input>` with its actual magic-variable token. The generator sets numbers and string quotes for you. You can enter a fixed value beside a selected metric instead; the generator serializes it as JSON, including any quotes, backslashes, or line breaks. For example, a rating has the structure `[["mood",8]]`; a duration has the structure `[["time_working","00:25:00"]]`.

For free-form text containing quotation marks, backslashes, or newlines, build the metric entries with native List actions and serialize them as JSON before passing them to Insights; interpolating that text into a JSON Text action does not escape it automatically.

To log several metrics at once, select them together in the generator, or use:

```json
[["flossed",1],["mood",8],["daily_note","A good day"]]
```

You can select several value-bearing metrics together. Replace each placeholder with the input variable belonging to that entry. Direct Insights QR codes support completion and timestamp metrics; use a dedicated logger Shortcut QR when a metric needs input.

## Schedules and completion

In **Advanced → Date Rules**, choose the days that should count toward the metric's scheduled streak. A missing schedule means every day. Logging outside those days is still possible; the schedule is not a general recording lock.

For a deadline, use the **Due-by task** recipe, add a date rule for each applicable weekday, and set its **Due By** time. Test before and after that time. A late `keep_first` recording makes no write; late `overwrite` clears that day's value and its points. The due time is a deadline, not an alarm; use [Calendar Alarms](calendar-alarms.md) to schedule reminders.

Completion means the effective day's cell is nonempty, not that it meets a numeric target. A logged `0` counts as complete. To block apps until a task is done, use a separate completion/timestamp metric instead of expecting a count to reach a goal.

Changing a saved Metric ID requires updating its loggers and rule references; the old history row is retained. See [Maintenance](maintenance.md).
