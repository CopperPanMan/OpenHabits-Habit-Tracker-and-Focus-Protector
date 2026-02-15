# V1 map

This is a quick orientation map for the current V1 flow.

## Entrypoint
- `doGet(e)` in `Main.gs` is the main web app entrypoint.
- It reads `e.parameters.key` and routes behavior by key.
- In the legacy path, it also parses `e.parameters.metrics` for key-specific handlers.

## Key dispatch pattern
- Dispatch is primarily an `if/else if` chain keyed on `key` inside `doGet(e)`.
- There is an early V2 branch (`isHabitsV2Key_(key)`), then V1 key routing continues for legacy keys.

## Where `app_closer` lives
- `app_closer` handling is in `Main.gs` inside the `doGet(e)` key-dispatch chain.
- It starts at the `else if (key == "app_closer")` block.

## Key helpers used by `app_closer`
Common helper/utilities that support app lockout logic and related time formatting include:
- `areWeInsideTimeSpan(startHour, hourDuration)`
- `convertTimeToMs(timeStr)`
- `convertHoursToHoursMinutes(hoursDecimal)`

Other nearby support used in lockout/timing paths:
- `calculateAndWriteDuration(startTime, stopTime, durationRow)`
- `convertMsToTime(milliseconds)`
- `findactiveCol()`
