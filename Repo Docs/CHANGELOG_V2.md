## Lockouts cache virtual-day windows

- Prevented client-timezone `config_snapshot` responses from accepting stale task values merely because they exist in an adjacent date column.
- Timestamped task completions now use exact effective-day window membership across adjacent physical columns.
- Non-timestamp task completions retain spreadsheet day semantics and use a documented, lenient physical-day-end inference when projected across timezones.
- Virtual-day and per-metric metadata now expose the evaluated window and whether a completion instant was stored or inferred.
