# Points and streaks

Start with [basic setup](../setup.md). The starter already awards points for water, Last Drank, and Time Working, and tracks a Last Drank streak.

## Points

In a metric's settings, enable **Points**, enter its value, and give its supporting points row a unique ID, such as `glass_of_water_points`. Keep the global daily and cumulative points IDs configured. **Save and Apply** creates these rows.

| Metric type | What the point value means |
| --- | --- |
| Number | Points per recorded unit |
| Duration | Points per rounded minute, not per hour |
| Text or timestamp | Points per completion |

For example, water at `1` point per unit earns `2` points for two glasses. Time Working at `0.1` points per minute earns `3` points for 30 minutes. Last Drank earns one daily completion point; updating that timestamp again does not add another point. These are the starter values, before any multiplier.

The daily total receives each point change; the cumulative total carries the running total across days. An additive metric scores the new increment. Overwriting a metric adjusts totals by the difference from its previously recorded points. Keeping the first value does not award points again for repeated taps. Editing a cell directly in Sheets does not rerun scoring.

For a penalty, use a number metric with **Add** and a negative point value. For example, `penalty_unlock` at `-10` points, logged with value `1`, deducts ten points on every recording.

## Streaks

Enable **Streaks** and set a supporting row ID, such as `last_drank_streak`. Configure the days on which the metric is expected. A nonempty daily value counts as complete; unscheduled days are skipped. A numeric `0` also counts as complete—streaks do not test a numeric target.

Logging updates the configured streak row. To update streaks even on days with no logging:

1. Open **Extensions → Apps Script**.
2. Select and run **installDailyStreakRecomputeTrigger** once, and authorize it.

It installs a daily recomputation around 1 a.m. in the script timezone. Rerunning it replaces the existing trigger for that handler. You can run **recomputeAllStreaks** to recompute immediately.

## Streak multipliers

In **Points**, set **Max Multiplier** above `1` and **Multiplier Days** to the number of prior streak days needed to reach it. The multiplier grows linearly from `1` to that maximum using the streak before the new recording. For a constant award, use a maximum of `1`.

After applying changes, log a test value and check that metric's points/streak rows and the two totals. Keep supporting row IDs distinct from primary metric IDs. See [Maintenance](maintenance.md) for backups and row repair.
