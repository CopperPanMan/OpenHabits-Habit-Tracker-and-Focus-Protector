# OpenHabits
## What is this?

OpenHabits is an open source habit tracker and focus protection system built around Apple Shortcuts, Google Sheets, and Google Apps Script. It is for people who want more than a checklist app or a simple app blocker: it lets your habit data become the thing that shapes what your phone and computer allow you to do next. It aslo allows you to build custom dashboards with a composite daily point score, to motivate positive behavior and see how you are doing over time.

It has two main parts, and you can use either one without the other:

- **Metric Logger** — log habits, tasks, durations, timestamps, ratings, and other personal metrics into a Google Sheet from iPhone Shortcuts. OpenHabits can calculate streaks, points, and insight messages, and can optionally sync habit status back to Notion.
- **App/Website Locker** — block or allow distracting apps and websites based on time windows, completed tasks, cooldowns, screen time budgets, and presets. It can run on iOS through Shortcuts automations and on desktop Chrome through the included extension.

## What Can This Do?

- **Scan a QR code, tap an NFC tag, or launch a shortcut to Log Metrics/Tasks/Habits**  
  Scan a code after meditating, working out, reading, cleaning, or practicing. OpenHabits can ask for a duration, score, or note, write it to your Sheet, and return a message like how today compares with last week.

- **Block Apps Based on Task Completion**  
  If YouTube, Instagram, Reddit, or another app opens before you completed a task like "plann your day", OpenHabits can immediately redirect you, show what is missing, and tell you what would unlock the app.

- **Block Apps Based on Screentime**  
  Let yourself use a distracting app for a certain amount of time, then block it until tomorrow or until a cooldown/rationing rule says it is reasonable again.

- **Build your own productivity OS**  
  Because your data is in a Google Sheet you own, you can build custom dashboards and charts, and use AI or traditional analysis to find insights. For instance, find the correlation between hours slept and productive hours worked, or between meal times and mood. It can even two-way sync tasks with Notion.

- **Fully Customizeable**  
  Because this is open source, you can code changes or use codex/claude to add features where desired. Give an AI the link to this repo and you can use it for troubleshooting, ideation, config creation, all sorts of stuff. It works surprisingly well.

## How do I Use it?

0. Decide what tasks and data you wish to log, and any app/website rules using the [OpenHabits Config Editor](https://copperpanman.github.io/OpenHabits-Habit-Tracker-and-Focus-Protector/)
1. Log tasks or other data from your iPhone or Notion.
2. Display that data on a Google Sheets dashboard that lives on your desk
3. Use that data to inform your decisions and motivate behavior
4. App Lockouts act as bumpers through your day to guide you to the "right" behaviors, and prevent doomscrolling.


Uncategorized
- example usage (my specific habit chain through the day)
- habit chains in general (you can make logging one thing prompt you to log another thing)
- how calendar alarms for iOS integrates, and can then create habit "stacks" like the following
-   wakeup alarm goes off, and requires a code scan. Upon scanning the code, it launches "log weight", thus prompting me to input my weight (example of logging data). That is now displayed on the weight over time graph on my dashboard, which lives on a galaxy tab a9 on my desk at home and at work. I could even put one in my kitchen. Alarms guide me through my morning routine with verbal callouts, and then a QR alarm goes off to choose my work tasks at 9:10AM, gated to only work and home. Alarms will keep looping every 15 minutes until I have logged that I completed that task. Work is valued at 3 points per minute.

- the greater theory, "why", and setup explanation behind the entire productivity system I have built and use. I can cover this in the videos, but do I need more here on that?

### Next Step >> [Setup and Usage Guide](Repo%20Docs/setup.md)

## Why?

OpenHabits was created to help users take back control over their lives and attention while still owning the system themselves.

Most habit trackers only record what happened. Most app blockers only say “no” on a fixed schedule. OpenHabits tries to connect the two: if you already know the behaviors that make your day work, your devices should be able to help protect those behaviors before attention gets spent somewhere else.

*Dev Note*: OpenHabits is currently primarily iOS focused because the Shortcut clients were built first. Android equivalents could likely be built with Tasker or similar tools, and community help would be welcome.

## Ready to Set It Up?

Start here: [OpenHabits Setup and Usage Guide](Repo%20Docs/setup.md).
