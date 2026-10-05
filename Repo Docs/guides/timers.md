# Track time

[Feature guides](../features.md)

Timer shortcuts keep their start time on your phone. When stopped, they submit the elapsed duration to a metric in the Sheet.

## Try the starter timer

1. Complete [setup](../setup.md), then install **Toggle Focus Timer** from [Downloads](../downloads.md).
2. Run it to start. Wait a minute, then run it again to stop.
3. Check **Focused Work** in the Sheet. The elapsed time should be added to today's total.

Starting the timer alone does not write a duration to Sheets. Two completed sessions add together.

## Create another timer

1. In the editor, add a **Duration** recipe. Choose **Add the new amount to it**, then **Save and Apply**.
2. Duplicate **Toggle Timer Template** and replace its configured metric ID with your duration metric's ID.
3. Confirm the final recording action runs **Insights**.
4. Follow its comment blocks to choose optional calendar events, Focus changes, wallpapers, or native countdown timers. Remove optional actions you do not want.
5. Test one short session and a second session. Confirm the same daily cell accumulates both.

Passing `start` or `stop` as Shortcut input requests that operation explicitly. This is useful for automations; no input toggles the timer.

Your timer state lives at `iCloud Drive/Shortcuts/OpenHabits/OpenHabits Metrics/timerStates.json`. Do not assume two devices can safely operate the same timer simultaneously.

If a submission fails, check the Sheet before retrying an additive duration. A request can have reached the server even when the phone did not receive its reply. Current timer readouts have outstanding recovery issues recorded in [developer review notes](../runtime-review-notes.md#toggle-timer); they do not guarantee recovery of every interrupted session.
