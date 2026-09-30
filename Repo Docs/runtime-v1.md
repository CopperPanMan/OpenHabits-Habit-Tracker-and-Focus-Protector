# Metrics runtime v1 — implementation and Shortcut wiring

## Status and scope

`OpenHabits Runtime.js` implements local unlock state and cache preparation/commit. It does not make HTTP requests, download iCloud files, show notifications, operate Jomo, or invoke Calendar Alarms. `lockouts.js` remains the separate pure-input evaluator. No existing caller changes until its Shortcut is rewired.

The repository contains no editable exports of Locked, Allowed, Update Lockout Cache, or Insights. The instructions below are the required native edits; they have not been applied to the iCloud-shared Shortcuts. The runtime has automated Node tests using mocked Scriptable APIs. An on-device smoke test remains required.

Calendar Alarms remains independently installable. Its Engine and QR Scanner are unchanged. No Calendar Alarms Runtime is added here: we have not mapped the Calendar Alarms Shortcut logic to define its operations yet. Calendar Alarms Actions should continue installing its existing scripts; it must not download the Metrics runtime as a required dependency.

## Installation

Create a Scriptable bookmark named **Shortcuts** pointing at `iCloud Drive/Shortcuts`. All state paths are under `OpenHabits/OpenHabits Metrics` relative to that bookmark. There is no fallback to Scriptable Documents.

Install the source as a Scriptable script named **OpenHabits Runtime**. Keep the evaluator named **lockouts** (lowercase, matching the current repository/setup). The Scriptable app-extension execution must be enabled for each Run Script action; do not use a URL that opens the app.

`runtime-install-manifest.json` lists both managed scripts, their exact filenames and raw download URLs. These main-branch URLs become available after this change is merged. To test the branch first, use `codex/metrics-runtime-v1` in place of `main` in each URL.

In **Insights' setup/update branch**, after saving the existing `settings.json`:

1. Fetch the manifest with **Get Contents of URL** in Shortcuts.
2. Repeat through `scripts`, fetching each `url` in Shortcuts.
3. Reject an empty response or HTML/error response. Save each downloaded source under its `filename` in `iCloud Drive/Scriptable`, replacing its prior managed version. If the installer uses Scriptable's import flow instead, retain that mechanism and confirm replacement of the matching script.
4. Confirm both scripts exist before reporting setup success. A failed download must leave the previous script intact. Updating scripts must never delete or reinitialize Metrics settings, cache, or unlock state.
5. Setup may be run again to update the managed scripts; do not skip merely because they exist.

These files are scripts in Scriptable's folder; **do not save them inside the Metrics data folder**. Keep the scripts and data downloaded in Files. If Scriptable detects an undownloaded data file, it returns an error rather than waiting for iCloud inside the short execution budget. The Shortcut can explicitly retrieve that file first if needed, but must not grant access on an error.

## Common request/result contract

Pass one **Dictionary** as Run Script's parameter (JSON text also works):

```json
{
  "operation": "lockouts.processAppOpen",
  "clientVersion": 1,
  "data": {}
}
```

Output is a dictionary. Every result has `ok`, `action`, and `runtimeVersion`. Optional `notification` is complete text for a native **Show Notification** action. Shortcuts need not calculate or build messages. `clientVersion` is optional for initial migration; sending an unsupported version returns an error.

For **every** call, check `ok` before allowing access or claiming success. `ok: false` returns `action: error` (or `refresh_failed` for a rejected server response) and notification text. Locked's error path must start/retain Primary, pause media and eject using its existing native block actions, then notify and stop. Scriptable action failures/timeouts may abort Shortcuts before a result exists: retain existing Jomo protection and test this case on-device. Never treat an absent result as allowed.

Dates written by the runtime are ISO 8601. Existing parseable date strings are accepted; malformed state is left intact and returns an error, rather than resetting an unlock. Native date actions should consume `unlockedUntil` as a Date when creating an event.

## Allowed

Leave the nonempty-input path unchanged: Stop Primary, notify with the passed input, and optionally run Start Screen Time Timer if installed.

For empty input, keep the native **Choose Unlock Type** menu. After a selection:

- Legitimate: call `lockouts.beginUnlock` with `data: {"type":"legitimate_unlock"}`.
- Penalty: call it with `data: {"type":"penalty_unlock"}`.
- Cancel: stop without calling the runtime.

After either call, show `notification` if present and stop. The runtime initializes state if missing and sets `unlockWait` at the time of the actual selection. It returns `action: unlock_started`, `waitSeconds` (60/30), and `validForSeconds: 300`. It does not stop Primary or grant entry at this stage.

## Locked — unlock path

Replace the file/date/unlock-state section with `lockouts.processAppOpen`. Keep the existing evaluator and native integrations.

| action | Result fields | Native behavior |
|---|---|---|
| `active_unlock` | `remainingMinutes`, `unlockedUntil`, `notification` | Stop Primary; notify; stop. Preserve existing active-session behavior. |
| `too_early` | `unlockType`, `waitSeconds`, `notification` | Eject via the existing Home/block path; notify; stop. Do not stop Primary. |
| `unlock_granted` | `unlockType`, `durationMinutes`, `unlockedUntil`, `calendarUnlockMinutes`, `logScreenTimeLockOff`, `notification` | Stop Primary; execute the existing grant integrations; notify; stop. |
| `evaluate_lockout` | no notification | Continue the existing lockouts evaluator/native block-or-allow path. |
| `error` / missing result | notification when available | Retain blocking/eject, notify if possible, stop. |

For a grant, run **Log Screen Time Lock Off** only if `logScreenTimeLockOff` is true. It is false for legitimate unlocks. Preserve the existing Calendar Alarm event definition and integrations; use `calendarUnlockMinutes` and `unlockedUntil` for its timing. Run the integrations before displaying the grant notification, which contains penalty wording. The runtime returns a logging directive; it does not itself deduct points.

The runtime grants 10 minutes for penalty unlocks and 20 for legitimate unlocks, with waits of 30/60 seconds. At exactly five minutes after `unlockWait`, the attempt is valid; after five minutes it falls through without clearing state. Reopening early resets `unlockWait` to now. Active `unlockedUntil` takes precedence. A successful grant clears `unlockType` to prevent replay after the unlocked period.

## Locked — task cache refresh

Preserve **block first, then refresh**. On the first stale-cache task block, run Primary/media/ejection/notification actions before calling Update Lockout Cache with `fetch_new_cache`. Then reevaluate with the refreshed local cache.

Remove the extra Update Lockout Cache call at the start of recursive `Locked(task_block)` handling. That reevaluation must only read/evaluate the local cache and must not refresh again. Do not move HTTP ahead of blocking. If refresh fails, keep the existing block rather than routing to Allowed. Runtime changes alone do not fix this native duplication; the Shortcut edit is required.

## Update Lockout Cache

1. Call `lockouts.prepareCacheUpdate`, with `data: {"input": Shortcut Input}`. Omit `input` if there is none. For a forced refresh, pass `input: "fetch_new_cache"` or `mode: "force"`.
2. If `ok` is false, show its notification and stop without reporting a patch.
3. Show `notification` if present (timezone-change message).
4. If `action` is `done`, stop and output `1` when `updated` is true; otherwise stop without output. This preserves the old patch-only `updatedState` meaning.
5. If `action` is `fetch`, retain the optional integration: enumerate installed Shortcuts and run Calendar Alarm Engine with no input only if it exists. This happens **before** fetching, as in the original.
6. **Get Contents of URL** at `result.url`, method **POST**, request body **JSON**. Map returned `body.key`, `body.secret`, and `body.clientNow` to the JSON fields `key`, `secret`, and `clientNow`. Content type is `application/json`. Do not send the whole body dictionary as a quoted JSON string, and do not use GET. Preserve the prepare result in a named variable so Calendar Alarm Engine's output cannot replace it.
7. Call `lockouts.commitCacheRefresh` with `data: {"response": Contents of URL}`. Pass either the response dictionary or its JSON text. HTML/error text is accepted as input and rejected safely.
8. If its notification has value, show it. Stop without output: a full refresh returns `refreshed: true`, `updated: false`; it does not pretend to be an incremental patch.

If Get Contents of URL fails at the native action level, the second call will not run. The existing cache is retained. The calling Locked path must remain blocked.

### Cache decisions and validation

- No input requests a full refresh, even for a five-hour-fresh cache. This preserves the original input-dependent logic.
- A metric response can patch only when the snapshot is today in the device timezone, at most five hours old, not future-dated, and its offset matches the device.
- `fetch_new_cache`/`mode: force` bypass patch eligibility, **but still honor the existing 15-second refresh throttle**, including on timezone changes.
- Patches update known `metricState.allByID` entries only, preserve other snapshot fields and `lastUpdated`, and write once after the loop. Zero and false are accepted values; missing/null/empty values are ignored. No new metric entries or derived/reminder-state calculations are invented.
- A successful commit requires `ok: true`, `schemaVersion: lockouts_cache_v1`, a parseable `lastUpdated`, `config`, `metricState.allByID`, and `virtualDay`, with a valid RFC 2822 offset (or the server's intentional empty offset). Unknown schema versions, HTML, incomplete responses, and server errors leave the previous cache intact.
- Responses are not echoed into notifications, to avoid displaying credentials or huge HTML bodies.
- Requests use an RFC 2822 `clientNow` with the device's current offset. The server uses this to build its offset-bearing virtual day. The server's IANA timezone path currently returns an empty cached offset, so this runtime intentionally uses the existing explicit-offset path instead.
- Offset deltas use signed minutes, fixing half- and quarter-hour calculations. The sign retains the old `(cachedOffset - currentOffset)` convention, while the notification identifies the new offset.

## On-device verification before replacing your daily shortcuts

Duplicate the three existing Shortcuts and wire the copies to this runtime. Use a test app and a copy of the state/cache if you want to avoid altering the live session.

1. Choose each unlock type; reopen early, then wait the full reset interval. Confirm Jomo stays active during the wait and the resulting sessions are 10/20 minutes.
2. Let an attempt expire for more than five minutes; confirm normal rules resume. Confirm only the penalty grant triggers the existing 10-point logging integration.
3. Force a task-cache refresh. Confirm blocking precedes HTTP and the second evaluation does not fetch again.
4. Test a valid server response, a Drive error response, an undownloaded file, and a failed HTTP action. Confirm previous cache survives and a failed flow does not allow entry.
5. Run Insights setup twice; confirm both scripts update and state/settings stay intact.

Automated validation: `TZ=America/New_York node --test tests/*.test.js`. The runtime suite also runs under UTC and fractional-offset timezones. It cannot verify iOS permissions, Scriptable execution limits, Jomo state, native Shortcut wiring, or concurrent iCloud sync between devices. This runtime expects one device to own these state files during a flow; it introduces no cross-device transaction mechanism.
