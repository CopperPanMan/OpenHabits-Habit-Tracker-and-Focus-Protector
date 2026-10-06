# Set up and use iOS app protection

Use your recorded metrics to decide when distracting apps are available. For example, social apps can stay blocked until you have planned your day, or close once you have used your daily allowance.

When you open a protected app, **Locked** checks the rules. If blocked, it pauses media, shows your message, and sends you Home (or runs your configured shortcut). When the rules allow access, you can use the app normally. **Allowed** also lets you request a temporary unlock.

Start with one app and the day-plan example below. After it works, expand the apps and rules you protect.

## Install and connect

Finish [Metrics setup and the two demos](../setup.md). Install **Locked**, **Allowed**, and **Update Lockout Cache** from the [shortcut toggles](../setup.md#3-install-the-phone-shortcuts), and complete the Scriptable steps under **Connect Insights**. Keep the shared shortcuts' names so their referring actions work.

Open each shortcut in the Shortcuts editor and read its **Comment blocks** for instructions and optional setup actions.

<details>
<summary>Manual script installation for an older Insights shortcut</summary>

In Scriptable, create scripts named **OpenHabits Runtime** and **lockouts** by pasting [OpenHabits Runtime.js](../../OpenHabits%20Runtime.js) and [lockouts.js](../../lockouts.js). Create a **Shortcuts** bookmark pointing to **iCloud Drive/Shortcuts**, then run **Update Lockout Cache** without input.

The publication [Insights readout](../shortcut-actions/Insights.md) installs these scripts when Update Lockout Cache is present. A repository readout does not update a shortcut already installed on your phone.

</details>

## 1. Require a day plan before social apps

1. In the Config Editor, add a **Timestamp** metric called **Day Plan**, with ID `day_plan`, keeping the first recording of the day. Apply the configuration to the Sheet.
2. Duplicate **Metric(s) Logger Template**, name it **Log Day Plan**, and replace its entire Text action with `[["day_plan"]]`. Confirm it calls Insights. Run this logger when you have finished planning; leave it unlogged for the first protection test.
3. Add a block using **Require completed metrics**, selecting `day_plan`. For this first test, use a full-day window (`00:00`–`00:00`), create a preset named `everyday` and assign it to the block, and set the message to “Plan your day, then run Log Day Plan to unlock.”
4. In Apple Calendar, create an all-day event titled `everyday` in **App Lockout Settings**, starting today and repeating daily. On iOS a day with no preset has no blocks.
5. **Save and Apply**, then run **Update Lockout Cache** without input.

This uses a new metric so the earlier demos do not accidentally satisfy the rule. The extra logger is a copy you make from the included template; it is not another download. You can change the block's hours after testing.

## 2. Connect the apps you want to protect

<a id="ios-27-app-automation"></a>
<details>
<summary><strong>iOS 27 and newer</strong></summary>

Open **Locked** in the Shortcut editor. Expand its included **When App Is Opened** automation, select your protected apps, and enable it to run immediately. Start with one app you can safely use for testing.

If your installed copy has no included automation, create an **App → Is Opened → Run Immediately** personal automation that runs **Locked**, using the same steps described for iOS 26 below.

</details>

<a id="ios-26-app-automation"></a>
<details>
<summary><strong>iOS 26</strong></summary>

1. Open **Shortcuts → Automation** and create an **App** automation.
2. Select your protected app, choose **Is Opened**, and **Run Immediately**.
3. Have the automation run **Locked**.

Add more apps to this automation after your first test passes.

</details>

Open the protected app once with the phone unlocked and approve permissions. If an imported Run Shortcut or Run Script action has a stale connection, reselect the installed shortcut/script in that action.

## 3. Verify both outcomes

- **Before logging Day Plan:** open the protected app. It should send you Home and show your block message.
- **After logging Day Plan:** run Log Day Plan, confirm its Sheet timestamp, then reopen the app. It should be allowed. Insights passes the recording to Update Lockout Cache; if your installed copy lacks that hook, refresh the cache manually.

If either outcome fails, check that the automation is enabled, the rule references `day_plan`, today’s all-day preset event is `everyday`, and the cache has been refreshed. [Troubleshooting](maintenance.md#troubleshooting) covers connection and file errors.

## Everyday use

Keep **Log Day Plan** somewhere convenient, such as a widget or Home Screen icon. Each new tracking day, your apps stay protected until you finish planning and log it. The starter's tracking day begins at 05:00; [Late Extension Hours](maintenance.md#timezone-settings) controls that boundary.

You do not need to reopen the configurator every day. Log your metrics normally; Insights updates the local cache, and the app-open automation checks access whenever you enter a protected app.

Run **Update Lockout Cache** without input after changing configuration, after changing timezone, or when a recording from Notion/another device has not reached your phone. Locked requests refreshes when needed, but the phone still needs a usable local snapshot. Test permission prompts unlocked before relying on the automations.

<a id="temporary-unlocks"></a>
### Need a temporary exception?

Run **Allowed** without input. Choose a legitimate unlock (60-second wait) or a penalty unlock (30-second wait). Leave the protected app closed while waiting, then reopen it to complete the request. Entering early restarts the wait; complete the attempt within five minutes.

Runtime 1.2.0 uses a whole-minute deadline: legitimate access lasts up to 19 minutes and penalty access up to 9 minutes, sometimes almost a minute shorter. Once that session expires, the next app opening checks your ordinary rules again.

<details>
<summary>Optional: deduct points for a penalty unlock</summary>

Duplicate the logger template as **Log Screen Time Lock Off**, configure a **Done / not done** metric with **Add** and a negative point value (we recommend `-2`), and have the logger send `1`. Choose the cost yourself in the metric’s Points Properties. Locked calls this named logger on a penalty grant; without it, no points are deducted. Runtime notifications omit the cost so they do not misrepresent your configuration.

</details>

For an expiry alarm that sends you Home while an app is still open, use [Calendar Alarms integration](calendar-alarms.md#end-a-temporary-app-unlock).

<a id="track-protected-app-time"></a>
## Add a screen-time allowance

A duration rule needs recorded app time; OpenHabits does not read Apple's Screen Time totals. These helpers are made from your installed templates, with no further downloads:

1. Add a duration/add metric such as `screen_time`, then duplicate **Toggle Timer Template** as **Toggle Screen Time Timer** and configure its metric Text as `[["screen_time"]]`. Read the timer's Comment blocks for its configuration instructions.
2. Create **Start Screen Time Timer** with a Run Shortcut action calling **Toggle Screen Time Timer** with input `start`. Inside **Allowed**, confirm or configure its Run Shortcut action to run **Start Screen Time Timer** when access is allowed. Keep that helper name so Allowed's included action finds it.
3. Create **Stop Screen Time Timer** with a Run Shortcut action calling **Toggle Screen Time Timer** with input `stop`. Create an **App → Is Closed → Run Immediately** automation, select all of your protected apps, and have it run **Stop Screen Time Timer** whenever any of those apps closes.
4. In **Locked**'s temporary-grant branch (`Route is allow`), also call **Start Screen Time Timer** if temporary sessions should count toward the allowance. That branch bypasses Allowed.
5. Test a short allowed app session, close the app, and verify the elapsed duration appears in the Sheet. Then add a **Screen-time limit** rule referencing `screen_time`, with the allowance and hours you want. Apply and refresh the cache.

Once measured time reaches the allowance, the next protected app opening blocks access. Rationing can release that allowance gradually instead; see [Rules and presets](rules.md).

## Different rules for workdays and weekends

Presets select groups of rules using an all-day calendar event. For example, use `workday` and `weekend` presets in a calendar named **App Lockout Settings**. [Rules and presets](rules.md#different-rules-on-different-days) covers the setup and how to share that selection with Chrome.

On iOS, no preset means no blocks. Runtime 1.2.0 remembers expected presets for today and the next seven days, refreshing that forecast once a day when an app opening reaches rule evaluation. If today’s expected event disappears, its rules continue for two minutes from the first observed absence. Reopening does not restart the countdown. When the countdown has passed and the event is still absent, today’s expectation is cleared. A different preset takes effect immediately.

Use **Allowed** for a temporary exception instead of deleting a day’s preset or disabling an automation. Temporary unlocks keep working during a deletion countdown. Calendar errors retain expectations and report a failure instead of treating the day as empty. Approve Scriptable’s calendar access with the phone unlocked when first running the updated scripts.

The runtime stores its registry in `presetRegistry.json` beside the other state files, leaving `settings.json` alone. The existing Locked actions and shared shortcut links remain compatible. The registry can only remember events it has actually observed.

## Optional blocking app

Locked and Allowed contain Comment placeholders where you can start or stop a session in a blocking app of your choice. Add that app's native actions if you want another enforcement layer; no particular blocking app is required.

The app-open automation acts when you enter an app. Continuous enforcement and returning you Home at a temporary session's deadline need the optional blocking-app or Calendar Alarms setup above. [Chrome website protection](chrome.md) applies Metrics rules on your computer.
