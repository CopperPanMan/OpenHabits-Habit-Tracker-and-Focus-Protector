# Metric data-type migration

This release intentionally replaces the old metric `type` model. Active configurations and timer clients must be migrated together; the server does not include a legacy compatibility layer.

## Field mapping

| Old configuration | New configuration |
| --- | --- |
| `type: "number"` | `dataType: "number"` |
| `type: "duration"` | `dataType: "duration"` |
| `type: "timestamp"` | `dataType: "timestamp", timestampSettings: { writeMode: "now" }` |
| `type: "due_by"` | `dataType: "timestamp", timestampSettings: { writeMode: "due_by" }` |
| textual value disguised as a number | `dataType: "text"` with `overwrite` or `keep_first` |
| `type: "start_timer"` | Remove; the client stores its own start state. |
| `type: "stop_timer"` | Replace with the target `duration` metric using `recordType: "add"`. |
| `ifTimer_Settings` | Remove. |

Do not rename existing Sheet row IDs unless desired. A former `timerDurationMetricID` is normally the `metricID` of the new loggable duration metric.

## Timer client migration

Old clients sent a start metric and later a stop metric without values. New clients:

1. Save the start instant locally.
2. Calculate elapsed time locally when stopped.
3. Send the elapsed duration to the duration metric, for example `[["work_duration", "00:22:00"]]`.
4. Clear their local timer state only after handling the request according to the client’s retry policy.

The Chrome extension included in this repository follows this model and has one screen-time duration metric setting.

## Deployment checklist

1. Export and retain the existing config and client automations for rollback.
2. Convert every metric to `dataType` and validate the new config in the Config Editor.
3. Convert each timer pair and update its Shortcut or other client.
4. Deploy the server, new config, and timer clients together.
5. Verify text, number, duration, ordinary timestamp, due-by timestamp, points, streaks, and lockouts before deleting the backups.
