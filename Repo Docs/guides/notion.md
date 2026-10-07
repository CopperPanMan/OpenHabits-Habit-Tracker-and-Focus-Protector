# Notion sync

Notion is optional. Start with one timestamp metric, such as Last Drank, and test each direction separately.

## Prepare a database

Create an [internal connection](https://developers.notion.com/guides/get-started/internal-connections) with permission to read and update content, and grant it access to your database. Copy its API token. Use these properties for the starter configuration:

| Property | Notion type | Purpose |
| --- | --- | --- |
| `metricID` | Text | Exact OpenHabits metric ID, such as `last_drank` |
| `Status` | Status, including an option named `Complete` | Completion sent from Sheets |
| `Points` | Number | Metric's awarded points |
| `Point Multiplier` | Number | Applied multiplier |
| `Streak` | Number | Current streak |

Keep one matching page per metric. In **Apps Script → Project Settings → Script properties**, add:

| Property | Value |
| --- | --- |
| `notionAPIKey` | Your connection's API token |
| `notionMetricDatabaseIDs` | Database ID, or a comma-separated list/JSON array of IDs |

The database ID is the 32-character identifier in the database URL, rather than the `?v=` view ID. The server currently uses Notion API version `2022-06-28`; leave the optional `notionVersion` property unset unless you have also updated the integration code for a newer API.

## Sheets → Notion

1. Enable **Write to Notion** under **Metrics → Metric Settings → Optional Notion Integration Settings** in the Config Editor.
2. Confirm the configured property names match the table above. An existing config may use `State` instead of `Status`; either works when the configuration and database agree.
3. Enable **Write To Notion** for each metric you want synced. Keep only the sync fields whose properties you've created.
4. **Save and Apply**, then log that metric through **Insights**. Check its Notion page for `Complete` and any configured derived values.

This flow updates completion and derived fields, not arbitrary copies of every raw metric value. Insights calls `update_metric_notion` after recording; a custom logger needs to make that call itself. Recording in Sheets can succeed even if the subsequent Notion update fails.

## Notion → Sheets

Use a database automation triggered when **Status becomes Complete**, with a **Send webhook** action. [Notion's webhook actions](https://www.notion.com/help/webhook-actions) require a paid plan.

1. Set the webhook URL to your web app URL with the secret URL-encoded in the query string:

   `https://script.google.com/macros/s/DEPLOYMENT_ID/exec?secret=URL_ENCODED_SECRET`

2. Include the page's **metricID** property in the webhook content. For this incoming flow, the property must be named literally `metricID` and contain text.
3. Do not add a `key` query parameter: the server recognizes Notion's property payload and selects `record_metric_notion` itself. Apps Script cannot read a custom authentication header, so the secret belongs in this URL. Keep that credential-bearing URL private.
4. Mark the page complete and check its Sheet cell. A timestamp receives the current time. Use a timestamp metric for this native property-webhook flow.

The native property webhook identifies the metric without a value. Number metrics (including completion recipes), text, and durations require an explicit value; use a custom client that sends the standard JSON request, for example:

```json
{"key":"record_metric_notion","secret":"YOUR_SECRET","data":[["glass_of_water",1]]}
```

Use a keep-first timestamp if you want repeated status changes on the same day to be harmless. An additive metric can count repeated custom webhook calls more than once.

## Optional Notion display blocks

To display total points or the latest insight, give the connection access to the target blocks and add script properties **pointBlock** and/or **insightBlock** containing their block IDs. Global Notion settings control the output style. These blocks are optional; leave their properties unset to skip them.

If an update fails, check database access, token, property types/names, matching metricID, and Apps Script **Executions**. If a webhook fails, Notion may pause its automation; resume it after fixing the issue. See [Maintenance](maintenance.md#troubleshooting) for connection checks.
