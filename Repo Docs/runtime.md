# OpenHabits Runtime 1.1.1

This checkpoint uses the user's uploaded 1.1.0 script as its baseline, rather
than the obsolete dictionary-envelope prototype in PR #163. The native action
sequences are recorded under `shortcut-actions/`. These are textual readouts,
not signed Shortcut exports; this PR cannot modify installed iOS Shortcuts.

## Responsibility boundary

Scriptable owns state files, parsing, date arithmetic, cache decisions, and
notification text. The inline installer downloads its managed scripts itself.
Shortcuts owns logging/cache HTTP, menus, notifications, optional blocking-app actions, calendar
queries/events, and calls to other Shortcuts. `lockouts.js` stays a pure evaluator
with no file, network, or calendar access. The Metrics runtime does not depend
on a Calendar Alarms runtime.

Create a Scriptable bookmark named `Shortcuts` pointing to `iCloud Drive/Shortcuts`.
State paths are under `OpenHabits/OpenHabits Metrics`: `settings.json`,
`lockouts.json`, and `lockoutCache.json`. The installer writes scripts into
Scriptable Documents, never into that state folder. Runtime calls never wait
for an iCloud download; unavailable files return a block/error notification.

## Commands

Use a Text action for a command. When an operation needs additional input, use
a native List with the command as item 1 and the original value as later items.
No JSON envelope, Base64, or `ok` flag is required. Run in App is Off.

| Parameter | Output |
| --- | --- |
| `app_open` or `["app_open", Shortcut Input]` | `route`: allow, block, or evaluate; notification when appropriate; a new grant also returns calendarEnd/calendarMinutes/penalty; evaluation returns cacheJSON |
| `["app_open", "task_block"]` | Read/validate cache only; skip unlock-state processing and do not refresh |
| `["evaluator_input", OpenResult, PresetTitle]` | Serialized JSON `{cache, presetOverride}` for the separate lockouts script; titles are escaped safely |
| `begin_legitimate` | Persist the unlock request; return complete notification text |
| `begin_penalty` | Persist the unlock request; return complete notification text |
| `["cache_prepare", Shortcut Input]` | Return URL/secret/clientNow for native POST when fetching; otherwise updatedState is 1 for a changed patch or empty text |
| `["cache_commit", ServerResponse]` | Validate and save a snapshot; empty dictionary on success or notification on rejection |

The main entry point catches local errors and returns `route: block` plus a
notification. Native action errors/timeouts can terminate before any result;
there is no additional native error-handling ladder. The snapshot's `ok` field
is an existing server contract, not a runtime success flag.

## Earlier session end and immediate reentry

Waits remain 30 seconds for penalty and 60 seconds for legitimate unlocks. An
attempt is valid through exactly five minutes; later attempts fall through
without clearing fields. Early entry restarts the complete wait. Granting clears
unlockType. Only penalty grants request the optional penalty logger.

New grants now use the same earlier, whole-minute timestamp for both persisted
`unlockedUntil` and returned `calendarEnd`:

```text
deadline = floor_to_minute(now + nominal_duration - 1 minute)
```

Penalty is nominally 9 minutes instead of 10, legitimate 19 instead of 20. Since
the Clock alarm is minute-based, actual access may be up to 59.999 seconds less
than 9/19 minutes. `calendarMinutes` describes that nominal duration; use
`calendarEnd` for the actual event end. The notification formats the actual
deadline. No extra -1-minute offset belongs in the alarm notes.

Example: a legitimate grant at 12:00:37 previously expired locally at 12:20:37,
while the corresponding Clock time was 12:20. The new shared deadline is 12:19:00.
At or after that time the temporary unlock no longer grants entry. Normal rules
are reevaluated, so an app may still be allowed if its configured rules permit it.
Existing sessions already stored in lockouts.json keep their existing deadline;
the change applies to new grants. Installed Clock alarms must be created/synced
by the native Shortcut, and previously created events are not rewritten.

## Cache behavior retained

- No input requests a full refresh, even with a fresh cache.
- Metric patches require a snapshot from today, at most five hours old, not
  future-dated, with the device's current RFC 2822 offset.
- `fetch_new_cache` bypasses patching but retains the 15-second refresh throttle,
  including on timezone changes. A throttled change emits no notification yet.
- Offsets use signed minutes, supporting half-hour and quarter-hour timezones.
- Patches affect known metric entries, preserve lastUpdated, accept zero/false,
  skip missing/null/empty values, and write once after all changes.
- Native POST sends JSON `key: config_snapshot`, `secret`, and RFC 2822 clientNow.
- Rejected HTML, malformed JSON, incorrect schemas, or incomplete snapshots do
  not replace the last known cache. Snapshot validation includes config.blocks.
- Task blocks act before fetching. Recursive task_block evaluation neither
  fetches again nor processes an unlock attempt.

## Installation and verification

`runtime-install-manifest.json` records managed filenames, URLs, and version.
The published installer uses main-branch download URLs. When testing unmerged
runtime changes, replace the `main` segment with the test branch in the installer's base URL.

`Inline Scriptable/Insights Installer.js` needs no input parameter. It downloads
both scripts and validates them before writing either. It always replaces valid
managed files, so rerunning setup updates them. It never
touches user settings/cache/timer state. The current Insights publication readout
checks for `Update Lockout Cache`, so Calendar Alarms-only users can install the
scripts without Locked/Allowed. Logging-only users retain no Scriptable dependency.
Apply this native installer edit to shared Shortcut exports before publication;
the historical Insights transcription retains the earlier Locked condition.

The user reported the 1.1.0 lockout sequences working on-device. Version 1.1.1's
minute-aligned timing and the new inline installer still need on-device checks:
grant both types at a nonzero second, confirm the Clock alarm/event deadline,
and reopen at expiry under a blocking preset. Run setup twice and confirm managed
scripts update without changing state. Automated tests cannot verify native blocking-app
permissions, Clock firing, Scriptable extension lifetime, or multi-device iCloud
concurrency. No cross-device transaction mechanism is introduced.
