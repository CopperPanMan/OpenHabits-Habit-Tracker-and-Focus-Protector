# OpenHabits Metrics

**OpenHabits Metrics lets you track the things you do each day to Google Sheets, then use that data to measure progress, motivate behavior, and control distractions.**

Log text, numbers, timestamps, and durations from your iPhone (using Apple Shortcuts) or Notion straight to a Google Sheet you own. You can then chart it, block apps based on it, instantly get feedback on performance, award points for each task, track streaks, and build your own dashboards.

For example, each day you might:
- Rate your mood from 1–10, automatically record when you went to sleep with an iOS automation, and track your focused work hours to see how the three relate over time.
- Keep YouTube and Reddit blocked across your phone and computer until you've planned the day's tasks.
- Assign point values to the behaviors and tasks that matter to you, then chart a daily composite score to see how you're doing over time based on the priorities you chose.

OpenHabits Metrics is free and combines capabilities normally spread across habit trackers, mood and metric trackers, and screen-time blockers — along with capabilities those apps generally can’t provide because they don’t share the same underlying data.

## How Does This Work?

OpenHabits Metrics revolves around logging metrics to your Google Sheet from your iPhone or Notion. Each metric is something you want to track over time, stored as one row, with a new column added automatically for each day.

A metric can be:

- text
- a number
- a timestamp
- a duration

On your phone, you log these metrics using the provided **Metric(s) Logger Template** Apple Shortcut. A single Shortcut can log one metric or many at once, and can be run directly, triggered by an NFC tag or QR code, or launched automatically via iOS automations.

Selected metrics can also sync with Notion. Complete one in Notion and OpenHabits can record it in Sheets; log it via iPhone and the corresponding Notion item can update too.

Depending on how a metric is configured, OpenHabits can also:
- record awarded points to the sheet
- record streaks to the sheet
- notify you of performance insights
- notify you of what to do next (using a Calendar Alarms for iOS integration)
- regulate access to distracting apps

You choose which features to use. When the same metric is logged multiple times in one day, it can be configured to keep the first value, keep the most recent value, or add to the existing value. OpenHabits stores one resulting value per metric per day, keeping the data in an easy-to-chart time series rather than a log of individual entries.

For example, you could create metrics for `Exercise`, `Weight`, `Focused Work`, `Mood`, and `Planned Workday`. `Planned Workday` could appear in a dashboard, earn points, contribute to a completion streak, sync with Notion, and keep distracting apps and websites blocked until it has been logged.

## What Am I Installing?

OpenHabits Metrics is not an app. Instead, it is a system built from Google Sheets, Google Apps Script, Apple Shortcuts, and a few optional integrations.

- **Google Sheets** stores your metrics, history, configuration, and any dashboards or charts you choose to build.
- **Google Apps Script** is attached to your Sheet and handles the underlying logging, calculations, integrations, and focus rules in the background.
- **Apple Shortcuts** provide the main iPhone interface.
- **Scriptable** handles the more complex local logic used by iOS focus protection.
- **A Chrome extension** optionally applies the same focus rules to websites on your computer.
- **Notion** is optional and can sync selected tasks and metrics with OpenHabits.

You do not need every part - if you only want to track habits, work, or other data, you can use the logging side without any lockouts. If you primarily want focus protection, you can configure only the metrics needed for your rules. Or you can use both together so your phone and computer respond to the same underlying data.

Once setup is complete, day-to-day use is simple. You can launch a small control panel in the sheet to edit your metrics and other settings, and log just by scanning a QR code.

## Feature Highlights

- **Easily track what matters and get insights**

  Track tasks and behaviors, numbers, ratings, timestamps, and even hours worked or other durations using the timer template. Metrics can be logged from Apple Shortcuts, QR codes, NFC tags, Siri, Notion, automations, or other clients. Because all of your data lives in a Google Sheet, you can even use an LLM to find trends and correlations across what you track. When you log a metric from your iPhone, OpenHabits can also return a performance insight comparing the new value with yesterday, previous periods, or recent averages.
- **Chart your progress and motivate behavior**

  Your data lives in a normal Google Sheet, so you can chart it, summarize it with formulas, conditionally format it, or create custom dashboards for anything you track. Log a task, watch a chart satisfyingly update in real time, and then see how it compares to other metrics over time.
- **Motivate further with points and streaks**

  Give different metrics different point values, calculate daily and cumulative scores, and track streaks automatically. Use this to plot a composite score for each day and see how you're really doing over time across the metrics that matter to you.
- **Take back your attention, intelligently**

  Block distracting apps and websites by time of day, screen time used, or whether specific tasks have been completed. Rules can also depend on metric data — for example, blocking apps for the first 30 minutes after a wake-up timestamp is logged — or ration a screen-time allowance gradually throughout the day. The same underlying rules can be used across iPhone, iPad, and desktop Chrome.
- **Get reminders that respond to what you've actually done**
  
  Integrate with Calendar Alarms for iOS to schedule reminders tied to OpenHabits metrics. Reminders can skip themselves when a task is already complete, or repeat at a cadence you choose until it is done.
- **Use the same system for work and personal life**

  Metrics can represent exercise or flossing just as easily as focused work, customer outreach, sales activity, or another business measure.

## You Can Go Much Further Than the Editor

The Config Editor is meant to make OpenHabits Metrics usable without understanding the machinery underneath it. But the metric configuration is ultimately just structured JSON, which also makes it very easy for AI to create.

For example, you can give an LLM a link to this repository and describe what you want to track, how you want points or streaks to work, what apps and websites you want protected, or how you want the system to behave. It can generate a working configuration for you, as well as Sheet formulas and dashboards, or help with Apple Shortcuts, integrations, and modifications to the underlying OpenHabits code.

You can then paste that config back into the Editor to adjust it visually.

## Ready to Install?

Basic installation is straightforward and takes approximately 15–20 minutes.

The guide walks through each installation step, followed by an optional 10–15 minute tutorial and test event so you can learn the basic workflow and verify that everything is working correctly before relying on it. You do not need to configure the entire system at once.

### [**→ Setup & Usage Guide**](Repo%20Docs/setup.md)

<details>
<summary><strong>Read more about OpenHabits</strong></summary>

## Want the Full OpenHabits System?

OpenHabits Metrics is part of **OpenHabits**, along with its sibling, [Calendar Alarms for iOS](https://github.com/CopperPanMan/Calendar-Alarms-for-iOS).

When integrated, Calendar Alarms can check whether OpenHabits tasks have been completed. An alarm can keep reminding you at a cadence you choose until a task is done, skip itself entirely if you've already completed it, speak information such as current points or task value, or launch Apple Shortcuts based on task state.

Meanwhile, OpenHabits Metrics can use the same data for dashboards, insights, points, streaks, Notion sync, and app and website lockouts.

Both tools can also be used independently.

## Why Did I Make This?

Hi, I’m Mike, founder of [Sierra Mille](https://www.sierramille.com/). I struggled to control my attention and wanted a way to build my own personal “Jarvis”—a system that could passively help keep me on track and let me make decisions for my future self while I was thinking clearly, instead of relying on willpower in the moment.

OpenHabits Metrics and Calendar Alarms both live under the OpenHabits umbrella. Development grew out of a broader interest in designing environments, digital and physical, that make the right behavior easier than the wrong one.

## Future Development, Android Support, and Licensing

### Future development

OpenHabits Metrics currently does everything I built it to do, so I don't have a roadmap of planned new features. I'll continue maintaining it for my own use, and contributions are welcome.

### Android support

There is currently no Android version. If a community member wants to build one, I'd be happy to link to it here!

### Licensing

OpenHabits Metrics is licensed under the **PolyForm Perimeter 1.0.1** license. The source is publicly available and may be used, modified, and shared subject to that license. OpenHabits Metrics is free and source-available, rather than OSI-defined open source.

**Paid services around OpenHabits Metrics are welcome.** Consulting, installation, configuration, training, and support are all encouraged. The restriction is intended to prevent OpenHabits Metrics itself (or a derivative of it) from being repackaged and offered as a competing product without separate permission.

Third-party services should make clear that they are independent and should not imply that they are official OpenHabits products or services.

</details>

