# OpenHabits API reference

For custom clients. Users of the provided shortcuts can start with [Setup](setup.md) and [Feature guides](features.md).

## Request shape

Send a JSON **POST** to your deployed `/exec` web app:

```json
{"key":"record_metric_iOS","secret":"YOUR_SECRET","data":[["glass_of_water",1]]}
```

`secret` (or `openHabitsSecret`) must match the required Apps Script property `OPENHABITS_SECRET` (legacy property name `openHabitsSecret` is also accepted). `key` and the secret can instead be supplied as URL query parameters. Apps Script does not expose custom request headers to `doPost(e)`; an `OpenHabits-Secret` header alone cannot authenticate a call. GET calls are intentionally unsupported.

Optional `timezone` takes an IANA timezone name. Optional `clientNow` takes an offset-bearing RFC 2822 timestamp, such as `Mon, 05 Oct 2026 14:30:00 +0530`; it supplies the client offset when no valid named timezone is supplied. Clients should send their actual current value. These support floating metric/block evaluation; they do not backdate an arbitrary recording.

## Supported keys

| Key | Purpose | `data` |
| --- | --- | --- |
| `record_metric_iOS` | Write values and calculate points/streaks; no automatic Notion push | `[["metricID", value]]` or `[["metricID"]]` |
| `update_metric_notion` | Push completion/derived values to Notion without writing the metric again | Same metric-entry array as recording |
| `record_metric_notion` | Record a Notion-originated value and sync derived fields without echoing completion status | Same metric-entry array as recording |
| `positive_push_notification` | Return the first currently eligible what-next prompt | `null` |
| `current_metric_status` | Return an ordered array of completion booleans | `["metricA","metricB"]` |
| `app_closer` | Evaluate blocking rules; read-only on Sheets | `null`, or preset string such as `"workday"` |
| `app_closer_v2` | Alias of `app_closer` | Same as above |
| `config_snapshot` | Return local lockout config, metric/cache state, and reminder records | `null` |
| `metric_state` | Return completion, value, schedule, points, and streak state for selected metrics | `"metricID"`, `["metricA","metricB"]`, or `{"metricIDs":["metricA"]}` |

Old personal helper keys and server `start_timer`/`stop_timer` metric types are not supported by the current dispatcher. Timer clients submit elapsed values to a duration metric; see [schema migration](metric-schema-migration.md).

## Recording values and responses

Use JSON numbers for number metrics and strings for text/duration values. Number metrics require an explicit value, including `1` for completion recipes; omitted/null numbers are rejected. Timestamps record the current time without needing a value. Text and duration metrics require a value. Durations use `HH:MM:SS`. IDs must exist in the applied configuration and Sheet rows; public logging does not create missing rows.

```bash
curl -L "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{"key":"record_metric_iOS","secret":"YOUR_SECRET","data":[["time_working","00:10:00"]]}'
```

Recording responses contain `ok`, `messages`, an **array** named `metricsByID`, `errors`, `warnings`, and point totals (`pointsDelta`, `todayPoints`, `cumulativePoints`). Match each entry by its `metricID` and inspect its `status`/errors. Top-level `ok: true` can include failures for individual metrics. Successful statuses include `written` and `kept_first`; due-by and skipped conditions have their own statuses. Do not treat the presence of `metricsByID` as acknowledgement.

A request can partially succeed. There is no recording idempotency key: retrying an additive entry after an ambiguous timeout may count it twice. Verify state before retrying.

`current_metric_status` returns `[true,false,...]` on success rather than a recording response object. Numeric zero is complete; numeric targets are not evaluated by this endpoint.

## Integration references

- [Lockouts server contract](lockouts-server.md): presets, rule ordering, tokens, and block responses.
- [Runtime contract](runtime.md): local caching, offsets, unlock state, and Scriptable commands.
- [Notion guide](guides/notion.md): connection properties and the separate native property-webhook format. A recognized Notion payload without an explicit key maps to `record_metric_notion`.
- [Insights and prompts](guides/insights.md): `ppnMessage`, eligibility, and delivery by your own client.
