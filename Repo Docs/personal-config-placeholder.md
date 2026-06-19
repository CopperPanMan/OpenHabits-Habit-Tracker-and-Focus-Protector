# Personal OpenHabits Setup Example

This page describes an anonymized version of the author's personal OpenHabits setup: the habits it tracks, the lockout strategy it uses, and the Shortcuts that make the system usable day to day.

> **Privacy note:** this example omits private Sheet IDs, Notion database IDs, deployment URLs, secrets, and personal identifiers. Replace every placeholder before using it.

## Copyable resources

- **Personal Sheet template:** PLACEHOLDER: personal Sheet template link.
- **Personal Config Editor export / `Config.gs`:** PLACEHOLDER: personal config link.
- **Personal Shortcut folder:** PLACEHOLDER: personal Shortcut folder link.

The Sheet template should be treated as the source of truth for row labels and visual grouping. This page explains the system at the workflow level rather than documenting every row one by one.

## What this setup includes

This is a full productivity setup, not a minimal demo. It includes:

- **morning startup habits** for wake-up, brushing teeth, weight, and moisturizing,
- **meditation tracking** with completion, duration, and calmness ratings,
- **work planning and work timers** for choosing tasks and tracking focused time,
- **personal project planning and timers** for non-work goals,
- **screen-time tracking** for distracting-app sessions and lockout accountability,
- **health and evening shutdown habits** for exercise, nutrition, flossing, daily review, and phone-down timing,
- **Notion sync** for selected habit statuses, streaks, point multipliers, and points,
- **points and streaks** for the behaviors that should be reinforced,
- **lockout rules** that make distracting apps depend on the right prerequisites.

## Habit groups

### Morning startup

Includes wake-up logging, brushing teeth, weight, and moisturizing. The purpose is to make the first few minutes of the day visible and to give the rest of the system a clear starting point.

### Meditation

Includes a meditation completion log, meditation duration, and before/after calmness ratings. The group is one habit from the user's perspective, but it stores multiple metrics so the Sheet can show both completion and quality/context.

### Work planning and focused work

Includes choosing today's work tasks, running a work timer, and planning the next workday. This is the backbone of the weekday lockout flow: distracting apps can stay locked until work has been intentionally chosen, and evening access can depend on planning tomorrow.

### Personal projects

Includes personal-day planning, checking personal tasks, and tracking personal project time. This keeps the system from becoming only a work-productivity tool and gives non-work goals their own protected lane.

### Screen-time accountability

Includes start/stop metrics for distracting-app usage and a metric for turning the screen-time lock off. These rows support duration-based lockouts and accountability around bypassing the system.

### Health, reflection, and shutdown

Includes exercise, nutrition targets, flossing, day review, day/stress/vitality ratings, and phone-down timing. These close the loop at night and protect the next morning.

## Lockout strategy

This setup uses `cumulative_app_opened` as the global distracting-app screen-time metric and expects a preset calendar named `App Lockout Settings`.

| Rule ID | Strategy |
| --- | --- |
| `until_0910` | Blocks distracting apps during the early morning on weekday presets. |
| `until_tasks_chosen` | Blocks until the work-task planning habit is logged. |
| `first_3m_after_tasks_chosen` | Adds a short buffer after task planning so the user does not immediately jump into distractions. |
| `until_workday_planned` | Blocks during the evening until tomorrow's workday is planned. |
| `first_3m_after_workday_planned` | Adds a short buffer after evening planning. |
| `after_10pm` | Blocks distracting apps late at night. |
| `max_2h_per_day_rationed` | Allows a rationed daily screen-time budget. |

The point is not just to block apps. The point is to make access depend on having given the day enough structure first.

## Personal Shortcut set

You can install the author's prebuilt Shortcuts once they are linked below, or you can duplicate the generic templates from the setup guide and recreate the same flows yourself.

These Shortcuts are shared as working examples, not as a managed support product. Expect to inspect and adjust them for your own web app URL, secret, deployment ID, Notion setup, and automations.

**Important import note:** anywhere an imported Shortcut contains a **Run Shortcut** action, open that action and manually reselect the Shortcut it should run. Apple Shortcuts can display the correct Shortcut name after import while still keeping a stale internal link.

### Morning

| Shortcut | Link |
| --- | --- |
| Woke Up | PLACEHOLDER |
| Brushed Teeth | PLACEHOLDER |
| Log Weight | PLACEHOLDER |
| Log Moisturize | PLACEHOLDER |

### Meditation

| Shortcut | Link |
| --- | --- |
| Log Meditate | PLACEHOLDER |

### Work

| Shortcut | Link |
| --- | --- |
| Log Check Work Tasks | PLACEHOLDER |
| Toggle Work Timer | PLACEHOLDER |
| Log Planned Tomorrow's Workday | PLACEHOLDER |

### Personal projects

| Shortcut | Link |
| --- | --- |
| Log Planned Today's Personal Tasks | PLACEHOLDER |
| Log Check Personal Tasks | PLACEHOLDER |
| Toggle Personal Timer | PLACEHOLDER |

### Health and evening review

| Shortcut | Link |
| --- | --- |
| Log Exercise | PLACEHOLDER |
| Hit Macros | PLACEHOLDER |
| Log Floss | PLACEHOLDER |
| Review Day | PLACEHOLDER |
| Log Sleep Time | PLACEHOLDER |

### Lockouts and screen time

| Shortcut | Link |
| --- | --- |
| Log Screentime Lock Off | PLACEHOLDER |
| Start Screentime Timer | PLACEHOLDER |
| Stop Screentime Timer | PLACEHOLDER |

## Template fallback

If you do not want to install every example Shortcut, duplicate the templates instead:

- **Metric Logger Template** for one-off logs, ratings, timestamps, and due-by metrics.
- **Toggle Timer Template** for work, personal work, meditation duration, or other timers.
- **Metric Logger for Screen Time** for the lockout screen-time start/stop flow.

This takes longer but gives you fewer inherited assumptions.

## Minimum useful install

To try the core idea without importing everything, start with:

- Brushed Teeth,
- Log Check Work Tasks,
- Toggle Work Timer,
- Start Screentime Timer,
- Stop Screentime Timer,
- Locked,
- Allowed,
- Update Lockout Cache.

That gives you the basic loop: log a prerequisite, track productive time, track distracting-app time, and enforce a lockout.

## AI-assisted customization

If you want this setup adapted to your own routine, give an AI assistant this page plus the repo link and describe the habits, lockouts, timers, point values, and Shortcut plan you want. Ask it to produce a Config Editor-compatible setup or a `Config.gs` version, then review the result in the Config Editor.

Do not paste real secrets, private deployment URLs, Notion tokens, or sensitive personal data into tools you do not trust.

## What to customize first

Before using this setup directly, decide whether to change:

- morning and evening deadlines,
- point values,
- which habits sync to Notion,
- the protected app list,
- the preset calendar name,
- the screen-time budget,
- lockout messages and Shortcut names,
- whether health/body metrics belong in your copy.

The safest approach is to import the Sheet/config structure, test one logger Shortcut, test one timer, then enable lockout rules gradually.
