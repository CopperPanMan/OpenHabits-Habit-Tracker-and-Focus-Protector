# Lockouts Client Chrome Extension

## What this does

- Blocks a configurable list of websites (defaults: youtube.com, instagram.com, reddit.com, facebook.com).
- Implements timed unlock logic inspired by your Apple Shortcuts flow:
  - Illegal unlock: first click starts a configurable timer (default 30s), second click (between timer completion and 5m) grants 10m unlock and logs `illegal_unlock`.
  - Legitimate unlock: first click starts a configurable timer (default 60s), second click (between timer completion and 5m) grants 20m unlock and logs `legitimate_unlock`.
- Creates `unlockedUntil` state on first run (using extension storage).
- Optionally queries a Lockouts server before blocking via JSON `POST` requests to `app_closer`.
- Supports optional screentime start/stop metric logging with configurable metric IDs and POST key name (default: `record_metric_iOS`).
- Uses a stable active-session rule before starting screentime logging: the tab must still be active, focused, non-idle, and server-allowed when the decision returns.
- Sends an `OpenHabits-Secret` header and also includes the same secret in the JSON body so Apps Script can validate it.

## Install locally (Windows 10 + Chrome)

1. Download or clone this repo to your PC (for example: `C:\Users\<you>\Documents\Apps-Script-to-Sheets-Features`).
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Pick the `chrome-extension` folder inside this repo.
6. Find **Lockouts Client** in your extension list and click **Details**.
7. Click **Extension options** to set your blocked websites and (optionally) your Apps Script URL.

### Recommended first-time setup

1. In **Blocked websites**, keep or edit the starter list:
   - `youtube.com`
   - `instagram.com`
   - `reddit.com`
   - `facebook.com`
2. (Optional) Add your `.../exec` Apps Script URL in **Lockouts server URL**.
3. Add the same shared secret you stored in Apps Script as `OPENHABITS_SECRET`.
4. (Optional) Enable screentime logging and enter your `start_timer` / `stop_timer` metric IDs.
5. Set **Illegal unlock wait (seconds)** and **Legitimate unlock wait (seconds)** if you want values other than 30/60.
6. Leave **Metric logging key** as `record_metric_iOS` unless you use a different metric endpoint key.
7. Click **Save settings**.
8. Open one of the blocked sites to verify the block page appears.

## Notes

- This extension uses `chrome.storage.local` instead of files/calendar.
- Timer windows are reset if they expire after 5 minutes.

- When a distracting tab loses focus, the Chrome window blurs, the user goes idle, or the tab closes/navigates away, the extension ends the active screentime session and sends the configured stop metric if enabled.
