# Chrome website protection

The extension redirects configured websites to a block page. Connect it to your Metrics web app to apply [blocking rules](rules.md) on your computer.

## Install

1. Download or clone this repository and extract it if needed.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository's **Chrome Extension** folder.
4. Open **Lockouts Client → Details → Extension options**.
5. Enter the domains to protect, your complete Apps Script `/exec` URL, and the same shared secret used in [basic setup](../setup.md). Save settings.

Domains also match their subdomains. Keep **Metric logging key** as `record_metric_iOS` for the provided server. Without a server URL, the extension can block the configured sites locally, but cannot use your Sheet's task/rationing rules.

## Test a rule

Use a task block requiring an unlogged completion metric. Open a protected website: you should see the block page. Log the metric, then retry the website; it should be allowed. For scheduled presets, use the global preset calendar configuration in [Rules and presets](rules.md#different-rules-on-different-days).

## Log website time

Create a duration metric with **Add**, such as `desktop_screen_time`. In extension options, enable screentime logging and enter that **Screen-time duration metric ID**. Apply your Sheet configuration before testing.

The extension times a protected website while its tab is active, its window is focused, the user is non-idle, and the server permits access. Leaving that session submits its elapsed duration. It does not collect all computer use. If you want phone and desktop use combined, configure both clients to add to the same metric; otherwise use distinct IDs.

Check the duration cell after a short permitted session. A duration block should refer to this same metric ID if it is meant to enforce that usage.

## Temporary access and penalties

The block page offers legitimate and penalty unlocks. Defaults are a 60-second wait for 20 minutes of legitimate access, or a 30-second wait for 10 minutes of penalty access. Complete the second click after the wait and within five minutes. Wait lengths are configurable; these desktop durations differ from the minute-aligned iOS runtime durations.

On grants, the extension attempts no-value recordings for the built-in IDs `illegal_unlock` and `legitimate_unlock`. Create timestamp metrics with those IDs if you want a daily record of each unlock type. The optional **Illegal Unlock metric ID** sends an additional no-value recording on penalty grants.

For a once-per-day penalty, use a timestamp/keep-first metric with a negative point value and a distinct supporting points row. Number/add penalties need an explicit value, which the current extension's unlock logger does not send; deducting points on every grant would require a client change. Verify the Sheet and points rows rather than treating the unlock notification as a scoring confirmation.

Extension state lives in Chrome's local storage. Source updates need **Reload** on `chrome://extensions`; configuration changes in your Sheet do not require reinstalling. If blocking or logging fails, recheck the URL/secret and the [server troubleshooting steps](maintenance.md#troubleshooting).

Connection failures, timeouts, and temporary HTTP errors are retried once. Each decision attempt has a 10-second timeout. If verification still fails, the block page explains the connection or server error; it does not imply that your tasks or screen-time allowance triggered a rule. Server authentication/configuration errors are displayed, and rules without a custom message receive a default explanation. Retry the original website after resolving the reported problem.
