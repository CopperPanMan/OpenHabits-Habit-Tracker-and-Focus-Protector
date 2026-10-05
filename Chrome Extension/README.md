# Lockouts Client for Chrome

Blocks configured domains using OpenHabits rules, with optional duration logging and temporary unlocks.

Follow [Chrome website protection](../Repo%20Docs/guides/chrome.md) for installation, connection, usage logging, and testing. Load this **Chrome Extension** directory as an unpacked extension.

The extension uses `chrome.storage.local` for its own state. Server calls use JSON POST with the secret in the body; the additional `OpenHabits-Secret` header is not sufficient for Apps Script authentication. Duration logging submits elapsed values to a duration/add metric using `record_metric_iOS` by default.

Unlock grants attempt no-value recordings for `illegal_unlock` or `legitimate_unlock`, plus the configured optional penalty ID for penalty grants. Use timestamp metrics for these requests; numeric penalties require an explicit value this unlock logger does not send. See the guide for once-per-day penalty scoring. Default temporary durations are 10 minutes for penalty grants and 20 minutes for legitimate grants; wait lengths are configurable.
