# Logging performance

Logging reuses data within one authenticated request. The next request loads a
fresh configuration snapshot and reads current Sheet values again. Editor
operations outside the public request continue to load configuration normally.

- Configuration, the tracking Sheet, metric IDs, and Sheet row count are loaded
  once per request.
- Date headers and needed historical rows are read in ranges. Streak calculations
  reuse preceding-day results, including scheduled and seeded streaks, while
  today's completion comes from pending values in the recording batch.
- Constant points multipliers do not require a historical streak scan. Streak
  output and streak insights still calculate the exact streak when needed.
- Today's column is read once for recording. Only changed rows are written back,
  grouped into contiguous ranges. Unrelated formulas and values remain intact.
- Performance insights read the tail needed for configured comparisons and
  averaging spans, and reuse any history already loaded for streak calculations.
  Long streaks still read sufficient history to calculate their exact length.

The authenticated JSON POST contract, per-metric errors, points, streaks, and
insight selection remain the same. GET remains unsupported. These optimizations
do not add a recording retry/idempotency mechanism or serialize overlapping
additive requests. An ambiguous timeout can still follow a successful write.

## Update an existing installation

1. Replace `Main.gs` with the updated source.
2. Update **only `getAppConfig()` at the bottom of `Config.gs`** if that file
   contains your custom configuration. Preserve `getCodeBackedAppConfig()` and
   all of your existing settings. Installations using the unmodified starter
   configuration can replace `Config.gs` normally.
3. Choose **Deploy → Manage deployments → Edit → New version → Deploy**.
   Updating the existing deployment preserves its URL and Shortcut settings.
4. Test a normal recording, an additive duration, points/streak output, and your
   optional Notion and Calendar Alarms integrations.

No Shortcut update or configuration migration is required for these changes.

## Offline verification

Run each Node test file directly from the repository root:

```sh
for file in tests/*.test.js; do
  node "$file" || exit 1
done
```

`tests/logging_performance.test.js` checks service-call bounds alongside values,
points, scheduled/seeded streaks, due-by reversals, repeated metrics, insight
windows, formula preservation, cache lifetime, and authentication.

An offline comparison against commit
`e2b800eaf1e46e7bfbde4eaee763306723714c90` produced identical responses and stored
values in 507 synthetic scenarios. For one metric with a continuous 180-day
streak, a previous-day seed, and an initialized cumulative total:

| Operation | Before | After |
| --- | ---: | ---: |
| Value-read method calls | 733 | 7 |
| Configuration loads | 9 | 1 |
| Spreadsheet opens | 2 | 1 |

Method-call counts are not network-request counts or measured Google latency.
Apps Script has internal caching, and Google service delays may remain.

## Measure the deployed improvement

Use a test Sheet and deployment for repeat recordings. Time configuration,
streaks, insights, writes, and each Notion request separately with
`console.time()`/`console.timeEnd()`. Also measure the complete HTTP request from
the client; server timings omit delays before handler entry and after return.

Collect 30–50 sequential samples across more than one time period, including
requests after idle time and back-to-back requests. Compare median, 95th
percentile, and the fraction exceeding the Shortcut's 60-second deadline.
Check Apps Script Executions for requests that finish after the phone times out.

If delays remain, compare an authenticated no-Sheets POST, a one-cell read/write,
and a complete log on the test deployment. A formula-light copy of the same
Sheet can help isolate recalculation cost. Avoid blindly replaying additive
recordings in production.
