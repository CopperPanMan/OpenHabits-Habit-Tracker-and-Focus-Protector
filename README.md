# Read Me

### OpenHabits is an open source habit tracker and focus protection system built around Apple Shortcuts, Google Sheets, and Google Apps Script. It has two components:
- **Metric Logger:** a system to easily record habits (or any text or number data) to a Google Sheet "log" from your iPhone, generate streak counts, point totals, and performance insights, and optionally sync data both ways with Notion databases.
- **App/Website Locker:** a configurable app and website limiting system that uses the data from the user's Metric Logger Google Sheet to restrict usage on iOS and desktop Chrome. Its purpose is to let users take back their attention, with much more flexibility and control than any other paid app on the market. It can block:
  - until tasks are comleted
  - during time windows
  - or usage limits are respected, with optional screentime rationing/cooldowns to prevent binges.

## Example uses

- “When I finish meditating, I scan a QR code that prompts to input the duration in mm:ss and a review 1-10. It then logs that, and generates and returns a message comparing how today's duration was to this day last week.
- “I tried to open YouTube but I hadn't planned my work tasks. It blocked me and redirected to my work app.
- “Show me what habit is due next by polling `positive_push_notification` and surfacing the response in a widget/shortcut.”

### OpenHabits was created to let users take back control over their lives and attention, and own it themselves. You can set it up [here](https://github.com/CopperPanMan/OpenHabits-Habit-Tracker-and-Focus-Protector/blob/main/docs/setup.md).



---



*Dev Note*:  OpenHabits is currently primarily iOS focussed, but that's just because I haven't had the time to build the Shortcut client equivalents on Tasker for Android. Perhaps a community member could help with this!

## Lockouts V2 timezone behavior

Lockouts V2 supports explicit block timezone modes for travel-safe app blocking:

- `timezoneMode: 'fixed'` evaluates `times.beg` and `times.end` in the Lockouts cache/server timezone (`cache.timezone`). This is the backward-compatible default when a block omits `timezoneMode`.
- `timezoneMode: 'floating'` evaluates the block window in the device or browser's local JavaScript timezone so the block follows the user's current wall clock while traveling.

Lockouts V2 globals may also include:

```js
lockoutsV2: {
  globals: {
    defaultBlockTimezoneMode: 'fixed', // 'fixed' | 'floating'
    cacheTimezoneMode: 'script'        // 'script' | 'client'
  },
  blocks: []
}
```

`cacheTimezoneMode: 'script'` preserves the legacy `config_snapshot` behavior and reads task-block state from the script-timezone physical sheet day. `cacheTimezoneMode: 'client'` allows `config_snapshot` to use a valid request timezone to build virtual task-block completion state from the current physical sheet column and adjacent existing date columns. This virtual task cache does not create, reorder, or mutate sheet columns and does not merge duration, number, timestamp, or global metrics across days.

Clients may optionally include the current IANA timezone when requesting Lockouts state or decisions, for example:

```txt
?key="config_snapshot"&timezone=Pacific/Honolulu
```

The Chrome extension may send the browser timezone with server decision requests. Existing URLs and Shortcuts continue to work without the `timezone` parameter. The server/cache timezone remains exposed as `cache.timezone`; any client timezone used for virtual task-state metadata is exposed separately under `virtualDay.timezone`.

### Manual timezone verification

- Request `config_snapshot` without `timezone` and confirm the response keeps `schemaVersion: 'lockouts_cache_v1'`, keeps `timezone` set to the script timezone, and has `virtualDay.enabled: false` unless a valid client timezone is supplied with `cacheTimezoneMode: 'client'`.
- Request `config_snapshot` with `timezone=Not/AZone` and `cacheTimezoneMode: 'client'`; the cache should still be generated with script-timezone behavior and include a warning about the invalid request timezone.
- With `cacheTimezoneMode: 'client'`, request `config_snapshot&timezone=Pacific/Honolulu` and confirm `cache.timezone` remains the script timezone while `virtualDay.timezone` is `Pacific/Honolulu`.
- In `lockouts.js`, verify fixed blocks use `cache.timezone` even when the wrapper input has a different `timezone`, and floating blocks use the current device-local wall clock.
- For duration blocks with rationing, verify the rationing progress follows the same fixed or floating timezone mode used for the block window check.
