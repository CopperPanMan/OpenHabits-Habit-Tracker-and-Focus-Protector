# OpenHabits Developer Keys

This is a quick reference for people who want to call OpenHabits from a client other than the provided Apple Shortcuts or Chrome extension.

## Request shape

Most clients should call the Apps Script web app with a JSON `POST` body:

```json
{
  "key": "record_metric_iOS",
  "secret": "your_random_secret_string",
  "data": [["metric_id_here", "value_here"]]
}
```

Apps Script web apps do not reliably expose custom headers to `doPost(e)`, so put the shared secret in the JSON body as `secret` or `openHabitsSecret`, or in the URL query string if your client cannot send it in the body.

## Common keys

| Key | What it does | Typical `data` |
| --- | --- | --- |
| `record_metric_iOS` | Records one or more metric values from Shortcuts or another client. | `[["metricID", value]]` |
| `update_metric_notion` | Pushes metric status/derived values to configured Notion records. | Same general metric payload as logger clients. |
| `record_metric_notion` | Records a metric update initiated from Notion sync flows. | Notion-oriented metric payload. |
| `positive_push_notification` | Returns a prompt for a metric that is currently due or useful to surface. | Usually empty. |
| `current_metric_status` | Returns whether each requested metric has a non-empty value for today. | `["metricID1", "metricID2"]` |
| `app_closer` | Evaluates lockout rules and returns whether the client should allow or block. | Optional preset string, such as `"workday"`. |
| `config_snapshot` | Returns the lockouts cache/config snapshot used by lockout clients. | Usually empty; optional timezone query parameter. |

## Minimal custom logger example

```bash
curl -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{"key":"record_metric_iOS","secret":"YOUR_SECRET","data":[["meditationDuration","00:10:00"]]}'
```

## Notes for custom lockout clients

- Call `app_closer` when the distracting surface is opened.
- Treat `status: "blocked"` as the signal to redirect, close, or cover the app/site.
- If you want app-specific rules, pass a preset name from the client.
- Use `config_snapshot` if your client needs cached rule data for local decisions.
