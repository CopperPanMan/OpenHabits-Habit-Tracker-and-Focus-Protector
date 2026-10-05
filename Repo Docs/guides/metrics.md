# Create and log metrics

[Feature guides](../features.md) · [Setup](../setup.md)

A metric stores one resulting value each day. Repeated recordings replace, retain, or add to that value according to its settings.

## Create a metric

1. Open the editor from the Sheet panel and choose **Metrics**.
2. Add the appropriate recipe and give it a **Display Name**. Usually you can keep its generated **Metric ID**.
3. Choose what should happen **When today already has a value**.
4. Finish editing and **Save and Apply** in the Sheet panel.

| Track | Recipe/type | Example logger Text |
| --- | --- | --- |
| A task you completed | Completion | `[["flossed",1]]` |
| A count or rating | Number | `[["mood",8]]` |
| A note | Text | `[["daily_note","A good day"]]` |
| When something happened | Timestamp | `[["started_day"]]` |
| Elapsed time | Duration | `[["focus_duration","00:25:00"]]` |

The IDs in these examples must exist in your configuration. The completion recipe uses a number, so send `1` explicitly; the current server requires a numeric value. A timestamp records the current time without a supplied value. A duration value uses `HH:MM:SS` (hours:minutes:seconds).

## Make its logger

1. Duplicate **Metric(s) Logger Template** from [Downloads](../downloads.md) and rename it.
2. In the editor's **Shortcut-ready metric text**, select the metric and generate/copy its text.
3. Paste it into the logger's **Text** action. For a completion recipe, make the entry `["metricID",1]`; generated no-value text must be given this explicit value. Confirm **Run Shortcut** calls **Insights**.
4. Run it, then check the matching Sheet cell.

For a value you enter each time, add **Ask for Input** before Text. Replace `<Provided Input>` with its actual magic-variable token. Numbers are unquoted; text and duration strings need JSON quotes around the token. For example, a rating has the structure `[["mood",8]]`; a duration has the structure `[["focus_duration","00:25:00"]]`.

For free-form text containing quotation marks, backslashes, or newlines, build the metric entries with native List actions and serialize them as JSON before passing them to Insights; interpolating that text into a JSON Text action does not escape it automatically.

To log several metrics at once, select them together in the generator, or use:

```json
[["flossed",1],["mood",8],["daily_note","A good day"]]
```

Generate value-bearing metrics individually when connecting different input variables, then combine their entries inside one outer array.

## Schedules and completion

In **Advanced → Date Rules**, choose the days that should count toward the metric's scheduled streak and prompt eligibility. A missing schedule means every day. Logging outside those days is still possible; the schedule is not a general recording lock.

For a deadline, use the **Due-by task** recipe, add a date rule for each applicable weekday, and set its **Due By** time. Test before and after that time. A late `keep_first` recording makes no write; late `overwrite` clears that day's value and its points. The due time is a deadline, not an alarm; use [Calendar Alarms](calendar-alarms.md) to schedule reminders.

Completion means the effective day's cell is nonempty, not that it meets a numeric target. A logged `0` counts as complete. To block apps until a task is done, use a separate completion/timestamp metric instead of expecting a count to reach a goal.

Changing a saved Metric ID requires updating its loggers and rule references; the old history row is retained. See [Maintenance](maintenance.md).
