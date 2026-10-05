# Track time

The [setup demo](../setup.md#time-a-session) uses **Toggle Timer Template** itself, preloaded with `[["time_working"]]`. Run it once to start and again to stop; completed sessions add to **Time Working** in the Sheet.

## Make your own timer

Add a duration metric in the Config Editor and choose additive recording if sessions should accumulate. Duplicate your installed **Toggle Timer Template**, replace its configured metric ID, and confirm its recording action calls **Insights**. Test a short session before adding automations.

The template's comments identify optional calendar events, Focus changes, wallpapers, or native countdown timers. Choose the actions you want in your copy; no separate demo shortcut is needed.

Passing `start` or `stop` as Shortcut input requests that operation explicitly. With no input, it toggles. Starting alone does not write a duration; stopping submits the elapsed value. For automatic protected-app timing, see [Screen-time allowance](ios-lockouts.md#add-a-screen-time-allowance).

Timer state lives at `iCloud Drive/Shortcuts/OpenHabits/OpenHabits Metrics/timerStates.json`. Avoid operating the same timer simultaneously from two devices. If submission fails, check the Sheet before retrying an additive duration, since the server may already have received it.

[Developer review notes](../runtime-review-notes.md#toggle-timer) record outstanding recovery issues in the historical timer transcription. Shared native shortcuts still need verification before publication.
