# iOS app protection

Finish [basic setup](../setup.md) first. This feature redirects selected apps when a configured rule blocks them. It needs Scriptable and three additional shortcuts; a third-party blocking app is optional.

## Install and connect

1. Install **Scriptable** from the App Store.
2. Install **Locked**, **Allowed**, and **Update Lockout Cache** from your iOS section on [Downloads](../downloads.md). Keep those names unless you also update every referring action.
3. In Scriptable, create a file bookmark named **Shortcuts** pointing to **iCloud Drive/Shortcuts**.
4. Run **Insights** without input after installing Locked. Its setup installs **OpenHabits Runtime** and **lockouts** in Scriptable. Approve file/network permissions and reselect any imported Run Shortcut or Run Script actions that have lost their connections.
5. Run **Update Lockout Cache** without input to fetch the configuration and today's metric state.

If your installed Insights predates the installer wiring in this repo, create Scriptable scripts named **OpenHabits Runtime** and **lockouts** by pasting [OpenHabits Runtime.js](../../OpenHabits%20Runtime.js) and [lockouts.js](../../lockouts.js). The [action readouts](../shortcut-actions/index.md) describe the intended shared shortcuts; the repo cannot update copies already installed on your phone.

Connection settings remain in `Shortcuts/OpenHabits/OpenHabits Metrics/settings.json`. Do not create a second set of credentials for these shortcuts.

## Add a first rule

In the Config Editor, add a **task block** requiring `started_day`. Leave presets empty for this first test. Set its time window to cover the current time and its message to “Log Started Day to unlock.” Apply the configuration and run **Update Lockout Cache**.

In Shortcuts, create a personal automation for **App → Is Opened**, select the apps you want protected, and have it run **Locked** immediately. Allow its permissions while your phone is unlocked.

On a day when Started Day is empty, opening a protected app should send you Home and show the block message. Log Started Day, then reopen the app: it should be allowed. If you've already logged it today, use a new test completion metric instead. Remove the test rule when finished.

Choose more rules in [Blocking rules and presets](rules.md).

## Track protected app time

Duration rules need a recorded duration; OpenHabits does not read Apple's Screen Time totals.

1. Create a duration metric such as `screen_time`, with **Add** as its recording behavior.
2. Duplicate **Toggle Timer Template** and configure it for `screen_time`, following [Track time](timers.md).
3. Create a shortcut named **Start Screen Time Timer** that runs your timer with input `start`.
4. Create a corresponding stop helper that runs it with input `stop`. Run that helper in an **App → Is Closed** automation for the same protected apps.
5. Check that the **Allowed** shortcut calls **Start Screen Time Timer** when present. Test an allowed app session and confirm its elapsed duration reaches the Sheet after closing.

The documented temporary-unlock branch in **Locked** bypasses **Allowed**. If you want those sessions tracked too, add a call to **Start Screen Time Timer** in that grant branch. These are optional native shortcut hooks; they are not automatic OS-wide screen-time collection.

## Temporary unlocks

Run **Allowed** without input to request an unlock. It offers a 60-second legitimate wait or a 30-second penalty wait. After waiting, reopen a protected app to complete the attempt. Early entry restarts the wait; an attempt expires after five minutes.

Runtime 1.1.1 grants a minute-aligned deadline: a legitimate session lasts up to 19 minutes and a penalty session up to 9 minutes. The actual interval can be almost one minute shorter. At expiry, opening an app reevaluates the normal rules.

For penalty scoring, create a number/add metric with a negative point value, as described in [Points and streaks](points-streaks.md). Create **Log Screen Time Lock Off** to log one unit of it. Locked calls this optional shortcut on a penalty grant. A notification alone does not deduct points.

For an expiry alarm that sends you Home, install [Calendar Alarms](calendar-alarms.md) and create the **App Lockout Settings** calendar used by Locked. Its event uses the runtime's `calendarEnd` with offset `0`; do not subtract another minute. Test a temporary session through expiry before relying on the alarm.

## Optional blocking app

The shared action readouts contain **Comment** placeholders where you can optionally start a session in a blocking app when access is blocked, and stop it when access is allowed. Add the native actions for whichever app you use. No particular blocking app is required.

Without this extra layer, enforcement happens when the app-open automation runs; it does not continuously remove an already open app. For troubleshooting and cache refreshes, see [Maintenance](maintenance.md).
