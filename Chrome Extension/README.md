# Lockouts Client Chrome Extension

## What this does

- Blocks a configurable list of websites (defaults: youtube.com, instagram.com, reddit.com, facebook.com).
- Implements timed unlock logic inspired by your Apple Shortcuts flow:
  - Illegal unlock: first click starts 30s timer, second click (between 30s and 5m) grants 10m unlock and logs `illegal_unlock`.
  - Legitimate unlock: first click starts 60s timer, second click (between 60s and 5m) grants 20m unlock and logs `legitimate_unlock`.
- Creates `unlockedUntil` state on first run (using extension storage).
- Optionally queries a Lockouts server (`key="app_closer"`) before blocking.
- Optionally sends metrics to server using configurable key.

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
3. Click **Save settings**.
4. Open one of the blocked sites to verify the block page appears.

## Notes

- This extension uses `chrome.storage.local` instead of files/calendar.
- Timer windows are reset if they expire after 5 minutes.
