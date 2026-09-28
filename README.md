# OpenHabits Metrics

**OpenHabits Metrics lets you track the things you do each day, then use that data to measure progress, motivate behavior, and control distractions.**

Track habits, tasks, ratings, timestamps, durations, and other metrics from your iPhone, Notion, or automations. Your tracked data is stored in a Google Sheet you own, where you can chart it, summarize it with formulas, build dashboards around it, and use it to power streaks, points, performance insights, and optional app or website lockouts.

For example, you might rate your mood from 1–10 each day, record when you went to sleep, and track your focused work hours to see how the three relate over time. You might keep YouTube and Reddit blocked across your phone and computer until you've planned the day's tasks, then award yourself points for doing so. Or you might assign point values to the behaviors and tasks that matter to you, then chart a daily composite score to see how you're doing over time according to the priorities you chose.

That's what makes OpenHabits Metrics different from a typical habit tracker or screen-time blocker: **the data you track doesn't have to stop at a checkmark.** It can drive charts, points, streaks, reminders, performance feedback, Notion state, and whether distracting apps or websites are currently available.

The same focus rules can apply to apps on your iPhone and websites in Google Chrome on your computer, so your rules don't disappear just because you switch devices.

## How Does This Work?

OpenHabits revolves around logging metrics to your Google Sheet from your iPhone or Notion. Each metric is something you want to track over time, stored as one row, with a new column added automatically for each day.

A metric can be:

- a number
- text
- a timestamp
- a duration

On your iPhone, you log these metrics using the provided **Metric(s) Logger Template** Apple Shortcut. A single Shortcut can log one metric or many at once, and can be run directly, triggered by an NFC tag or QR code, or launched automatically via iOS automations.

You can also optionally log metrics from Notion by linking a Notion database entry to a configured metric.

OpenHabits can then use that data for points, streaks, performance insights, Notion syncing, dashboards, reminders, and focus rules.

Subsequent loggings of the same metric can be set to keep the first value, keep the most recent value, or add to the existing value. OpenHabits stores one resulting value per metric per day, keeping the data in an easy-to-chart time series rather than a log of individual entries.

For example, you could create metrics for `Exercise`, `Weight`, `Focused Work`, `Mood`, and `Planned Workday`. `Planned Workday` could appear in a dashboard, earn points, contribute to a streak, sync with Notion, and keep distracting apps and websites blocked until it has been logged.

## What Am I Installing?

OpenHabits Metrics is not an app. Instead, it is a system built with tools you control:

- **Google Sheets** stores your metrics, history, configuration, and any dashboards or charts you choose to build.
- **Google Apps Script** is attached to your Sheet and handles the underlying logging, calculations, integrations, and focus rules in the background.
- **Apple Shortcuts** provide the main iPhone interface.
- **Scriptable** handles the more complex local logic used by iOS focus protection.
- **A Chrome extension** optionally applies the same focus rules to websites on your computer.
- **Notion** is optional and can sync selected tasks and metrics with OpenHabits.

You do not need every part.

If you only want to track habits, work, or other data, you can use the logging side without any lockouts. If you primarily want focus protection, you can configure only the metrics needed for your rules. Or you can use both together so your phone and computer respond to the same underlying data.

**You do not need to write code to install, configure, or use OpenHabits Metrics.** Configuration is managed from your Google Sheet using the OpenHabits Config Editor, which provides a graphical interface for changing metrics, points, streaks, lockouts, and other settings.

## Feature Highlights

- **Track what matters**

  Track tasks and behaviors, numbers, ratings, timestamps, durations, and start/stop timers. Data can come from Apple Shortcuts, QR codes, NFC tags, Siri, Notion, automations, or other clients.
- **Chart your progress and motivate behavior**

  Your data lives in a normal Google Sheet, so you can chart it, summarize it with formulas, conditionally format it, or create custom dashboards for anything you track. Log a task, and watch a chart satisfyingly update in real time.
- **Motivate further with points and streaks**

  Give different metrics different point values, calculate daily and cumulative scores, and track streaks automatically. Plus, upon logging a habit from your iPhone, get a performance insight notification that compares today’s value to yesterday, previous periods, or even recent averages.
- **Take back your attention**

  Make access to distracting apps depend on completing tasks, total screen time, the first X minutes after a task is completed, or even a ration that unlocks screen time through the day. And the same blocks can sync across your iPhone, iPad, and desktop Chrome, so rules are always consistent. OpenHabits can guide you to better behaviors.
- **Sync with Notion**

  Complete something from your phone and its state can update in both Google Sheets and Notion. Complete it in Notion and OpenHabits can reflect that state back on your phone for things like reminders and focus rules.
- **Track work as easily as personal habits**

  Metrics can represent exercise or flossing just as easily as focused work, customer outreach, sales activity, or another business measure.

## You Can Go Much Further Than the Editor

OpenHabits can be fully installed, configured, and used without writing code.

But the cool thing is that your configuration is ultimately structured JSON text. That makes OpenHabits easy to customize with AI.

For example, you can give an LLM a link to this repository and describe what you want to track, how you want points or streaks to work, what apps and websites you want protected, or how you want the system to behave, and it can then help you design configurations, Sheet formulas, dashboards, Apple Shortcuts, integrations, or modifications to the underlying OpenHabits code.

## Ready to Install?

The setup guide walks through copying the OpenHabits Sheet, completing the one-time setup, installing the starter Apple Shortcuts, logging your first metrics, and optionally enabling focus protection on iOS and Chrome.

You do not need to configure the entire system at once.

### [**→ Setup & Usage Guide**](Repo%20Docs/setup.md)
