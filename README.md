# OpenHabits
## What is this?

OpenHabits is an open source habit tracker and focus protection system built around Apple Shortcuts, Google Sheets, and Google Apps Script. It is for people who want more than a checklist app or a simple app blocker: it lets your habit data become the thing that shapes what your phone and computer allow you to do next.

It has two main parts, and you can use either one without the other:

- **Metric Logger** — log habits, tasks, durations, timestamps, ratings, and other personal metrics into a Google Sheet from iPhone Shortcuts. OpenHabits can calculate streaks, points, and insight messages, and can optionally sync habit status back to Notion.
- **App/Website Locker** — block or allow distracting apps and websites based on time windows, completed tasks, cooldowns, screen time budgets, and presets. It can run on iOS through Shortcuts automations and on desktop Chrome through the included extension.

## What Can This Do?

- **Turn a QR code or NFC tag into a habit logger**
  Scan a code after meditating, working out, reading, cleaning, or practicing. OpenHabits can ask for a duration, score, or note, write it to your Sheet, and return a message like how today compares with last week.

- **Make distracting apps depend on the life you said you wanted**
  If YouTube, Instagram, Reddit, or another app opens before your required tasks are done, OpenHabits can immediately redirect you, show what is missing, and tell you what would unlock the app.

- **Use screen time as a budget instead of a vague intention**
  Let yourself use a distracting app for a certain amount of time, then block it until tomorrow or until a cooldown/rationing rule says it is reasonable again.

- **Build your own productivity operating system**
  Keep the raw data in a Sheet you own, build dashboards however you like, use Notion if you want, and call the same web app from Shortcuts, Chrome, widgets, NFC automations, or your own scripts.

- **Ask OpenHabits what needs attention next**
  Poll `positive_push_notification` from a Shortcut or widget to get a useful prompt based on which scheduled metric is currently due.

## How do I Use it?

Once setup is finished, daily use is mostly Shortcuts and automations:

1. You log metrics from Shortcut buttons, QR codes, NFC tags, widgets, or Notion.
2. The Apps Script web app writes those metrics into your Google Sheet.
3. OpenHabits calculates derived status such as points, streaks, completion, and insight messages.
4. Lockout clients ask the same web app whether the current app/site should be allowed.
5. If a rule blocks you, the client redirects you or shows the reason why.

The important idea is that the Sheet is not just a dashboard. It is the shared source of truth that lets habits and lockouts work together.

## AI Can Help You Build Your Setup

OpenHabits is transparent enough that a good AI assistant can help you understand, customize, and debug it. You can give your favorite AI a link to this GitHub repo, describe the habits, timers, points, lockouts, and workflows you want, and ask it to generate a Config Editor-compatible setup or a `Config.gs` version. This works surprisingly well with strong coding models, including GPT-5.5. You can paste the result into the Config Editor, review it, and keep editing from there.

AI can also help with setup questions, use-case brainstorming, debugging config issues, or modifying the codebase with tools like Codex or Claude Code. Do not paste real secrets, private deployment URLs, Notion tokens, or sensitive personal data into tools you do not trust.

### Next Step >> [Setup and Usage Guide](Repo%20Docs/setup.md)

Most users should build their first setup through the [OpenHabits Config Editor](https://copperpanman.github.io/OpenHabits-Habit-Tracker-and-Focus-Protector/) instead of hand-writing config code. The setup guide explains when to use the editor, what to paste into Apps Script, and how to test Shortcuts and lockouts in order.

## Why?

OpenHabits was created to help users take back control over their lives and attention while still owning the system themselves.

Most habit trackers only record what happened. Most app blockers only say “no” on a fixed schedule. OpenHabits tries to connect the two: if you already know the behaviors that make your day work, your devices should be able to help protect those behaviors before attention gets spent somewhere else.

*Dev Note*: OpenHabits is currently primarily iOS focused because the Shortcut clients were built first. Android equivalents could likely be built with Tasker or similar tools, and community help would be welcome.
