## **Habit and App Lockout System:**

- What this is:
    - This system is a **personal automation platform** built on tools you already own (iOS Shortcuts, Calendar, Google Apps Script, Google Sheets, optionally Notion) that turns “intentions” into **enforced behavior** through reminders, friction, logging, and feedback.
        
        It exists because default tools (Clock alarms, Screen Time, habit apps, task apps) each solve only a slice of the problem, don’t integrate well, and don’t reliably drive day-to-day behavior—especially when motivation is low or attention is fragmented.
        
- Why this exists:
    
    Because you need a system that is:
    
    - **More reliable than willpower.** When you’re tired, distracted, or unmotivated, the system still executes the plan.
    - **Integrated.** Planning, focus enforcement, alarms, and tracking are connected instead of living in separate apps that don’t talk.
    - **Low-friction to use daily.** Logging and triggers happen via NFC/buttons/automations, not manual data entry.
    - **Highly customizable.** You can express rules like “QR code to stop oversleeping” or “lock social apps until the day is planned.”
    - **Durable over time.** The configuration and logic are self-contained, editable, and understandable later—so you don’t abandon it when you forget how it works.
    - **Shareable.** It can be packaged as a repeatable “system” (not a pile of personal hacks), with clear setup steps and modifiable config.
    
    ## The core problem it solves
    
    Turning “I want to do X” into “X happens by default,” by combining:
    
    - **timely prompts** (alarms/reminders),
    - **enforcement** (lockouts / QR requirements),
    - **measurement** (logs/streaks),
    - **and visibility** (dashboard / next action).

## System Structure

- Apps Script
    - [Habits.gs](http://Habits.gs): name tbd, this is where all of the logic lives.
        - keeps roughly the same structure. “keys” are now also dual purpose taskID’s. We just have a list of taskID names that a user cannot use, and taskID’s must each be unique.
    - [Config.gs](http://Copnfig.gs): configuration happens in a dictionary/JSON format inside of a new [config.gs](http://config.gs) script.
        - settings for the various features (keys) live here
        - Habits
            - Each habit includes the following properties object, and can include multiples of the object depending on how many other metrics it records. “flossed” would just be one (a timestamp), where meditation could be 4 (a timestamp, a duration, beginning mental calmness 1-10, ending mental calmness 1-10)
                
                ```
                		[
                      {
                        taskID:         //used to find where this metric is in google sheets
                        points:             //how many points completion of this habit gives
                        insightChance:      //chance of getting a performance insight at all (use decimal 0-1, 0 = 0% never recieve a message, 1 = 100% always recieve a message), (use 0 for things like text/journal entries that aren't comparable statistics),
                        dayToDayChance:     //chance the performance insight compares day to day values instead of weekly avg to weekly avg. values. (use decimal 0-1, 0 = 0%, 1 = 100%),
                        dayToAvgChance:     //if calculating using averages, chance the performance insight compares day to average instead of avg to avg (use decimal 0-1, 0 = 0%, 1 = 100%),
                        rawValueChance:     //chance the performance insight displays in raw-value changes instead of percentage changes (use decimal 0-1, 0 = 0%, 1 = 100%),
                        increaseGood:       //whether this metric increasing is good or decreasing is good (1 = increase is good, -1 = decrease is good),
                        insightFirstWords:  //First text in output message (ie: "Weight: ", "Heart Rate: ", "Run Duration: "),
                        insightUnits:       //(ie: "Kg", "BPM", "minutes"), 
                        unitType:          //"timestamp", "minutes", or "number" ("minutes" represents values in "minute:second" format only, for decimal minutes just mark it as a number),
                        recordType:         //1,2,3 for whether multiple recordings to the same cell should "overwrite", "keep_first_instance", or "add", to whatever is already there, respectively.
                        name: // used in the event that the habit must be shown in dashboard view
                				dates: [] //days of the week
                				startTime: // 1-24 hour of the day, used in "what to do next" messages
                				messagepart1: // used in output message
                				streakTerm: //unit the streak count should be displayed in. Could be days, or could be a fun unit like “hafthors” for weightlifting, for ex.
                				messagePart2: //used in message output
                			}
                		]
                ```
                
        - App Lockouts
            - lockouts become one big ol’ JSON array / dictionary of 0 to infinity “appBlock” objects
                - each appBlock object can have the following properties
                    - type (task_block, duration_block, firstXHoursFromTimestamp,
                    - start time
                    - end time
                    - blockerTaskID
                    - firstXHoursVal
                    - shortcutOnBlock
            - Global Lockout Settings
                - cumulative ScreenTime
                - screenTimeLimit
                - rationingStart
                - rationingEnd
- Google sheets tabs:
    - Tracking Data → the log where truth is recorded.
    - Dashboard Data → a static range of data that charts can draw upon. This is done via formula inside google sheets
    - Dashboard Charts → these are google sheets charts made entirely inside google sheets.
    - Points Ledger →
- iOS
    - a shortcut allows users to scan a QR code or NFC, to record a habit completion via webhook
- Notion
    - has database “task” entries with the following relevant properties (there are more, these are what we care about). There are two databases to look in, one for work, one for personal.
        - taskID (text) → based on user input
        - metrics (text) → user inputs all other metrics associated with a habit, separated by the separator character (initially Ù) before marking complete. For meditation, it would look like 15:54Ù7.5Ù8.5. This is sent as the metrics payload along with the taskID “key” in the webhooks request to apps script
        - points (number) → updated by the apps script upon running.
        - point multiplier (number) → updated by the apps script upon running.
        - streak count (number) → updated by the apps script upon running.
    - has one “dashboard view” page that contains a filtered view of the databases, as well as data written by the apps script. Data includes:
        - today’s current point total
        - this week’s point total
        - embedded charts from looker studio. (this enables us to be more flexible with what we show than writing a hard-coded set of values, and exists less as a real-time data tracker, and more as an analytical reflection tool.
    - an automation sends a webhook to apps script when any “habits” related task’s “State” property is marked “Complete”

## New Features

- Habits V2
    - you can submit a taskID instead of a key, and it will match that taskID to a task (effectively the key becomes a taskID), and find the row in the sheet by that taskID, instead of a set row number. Why:
        - this enables a single “habit recorder” shortcut to scan a QR code, and submit the taskID out of it.
        - syncing notion to sheets becomes infinitely easier.
            - Notion → sheet → phone: Send in task’s taskID property. Update Sheet.
            - Phone → Sheet → Notion:  Send in task’s taskID property. Update Sheet, AND Notion.
        - The big question: why not use row number in place?
            - Users will want to be able to re-order their sheet rows without breaking everything, and having to track down a row number stored in notion, calendar notes, app script, and iOS shortcuts, each in multiple places.
    - you do not need to store row numbers for habits. They are automatically appended to the end of the sheet on first run (append to the 2nd sequential totally-empty row)
        - number of rows calculation: all properties are stored for each task, just like they currently are. But based on the length of the settings array, we know how many rows we will write to. ie no need to store a separate length variable.
- Dashboard V2
    - For each row in the google sheet, we need to compute several metrics. These can either be done via apps script, or just inside the google sheet with formulas, whatever is easier/better.
        - rolling 7 day averages
        - streak count
        - point multiplier
    - Dashboard Data
        - Only ONCE: cumulative point value
        - For EACH: Static data range showing
            - last year of that value
            - last 3 months of that value
            - last 1 month of that value
            - last week of that value
            - NOTE: the biggies here are: where I am-raw points, where I am going-trend, why
    - Non-Code → Dashboard Charts Tab
        - point balance (we can deduct what we spend) at the end of every week *this is used on the notion page, though.
        - point “store” items
- App Locker V2
    - a synced chrome extension is mandatory.
    - lockouts become one big ol’ JSON array of 0 to infinity block objects
        - each block object can have the following properties
            - type
            - start time
            - end time
            - blockerTaskID
            - shortcutOnBlock
        - Global Properties
            - cumulative ScreenTime
            - screenTimeLimit
            - rationing
        - Block Types
            - task_blocker
            - duration_blocker
            - 
        - note: time-based lockouts are ONLY
        - this uses taskID as well for the cells to look at
- Usage Example
    - maybe: all_lockouts_off now applies to day 1 up to 3AM.
    - Getting into apps (on iOS, no exceptions on desktop)
        - Allowed usage is a 10s wait.
        - App lockout for illegitimate reasons is a 30s wait
        - Legit reason = 60s wait
        - I have to wait the entire time with no form of timer. If I open before that number, it restarts the timer. No penalty accrues until I successfully open the app.
        - While I wait, it pops a message down that tells me how many points I have, and how many I will lose by opening the app.
            - if streak_count > 1: “Delete the unlock immediately, or LOSE your 4 day streak and 11 points. Current points = 54.
                
                
                Don’t be an addicted idiot.
                
        - If the timestamp the unlock was written was over 5 minutes ago, automatically delete it on the next app openning attempt.
    - Blocking message
        - I open app, it blocks me out. It can send me to a particular shortcut depending on what block it is.
            - In the morning, I open youtube, it launches shortcut “open notion dashboard”
            - I open calendar, and type “all_lockouts_off”

- Current App Script Keys (functions)
    - next_habit_check → returns what the next habit is. Replaced by PPN V2
    - append_to_notion_inbox → paired with shortcut to append to my notion inbox via siri
    - nighttime_away_notifier → if away from home, tell me when to leave to get to bed on time
    - nighttime_notifier → if at home, tell me when to go to bed
    - check_341_tasks → returns a list of all personal notion tasks that are 341. I believe this was part of the original task check feature, that would not open the task view unless something was actually on it. I want to keep this, it could be useful in the future.
    - set_notion_plan_workday_complete → superseded by complete by new complete by taskID feature
    - set_notion_plan_personal_day_complete → superseded by complete by new complete by taskID feature
    - start_work → was purpose built to specifically handle work timers. Superseded by habits V2 → will write
    - stop_work → was purpose built to specifically handle work timers. Superseded by habits V2
    - is_nfc_completed → returns no/yes depending on if habit is complete. Needs updated.
    - dashboard_view → this seems like an alternate habit_dashboard output layout that never got used.
    - positive_push_notification → tells you what the next thing to do is, and what the streak is. Can be better.
        - this
        - this can return what to do, when it is due by, the points you will gain by doing it or lose by not doing it.
    - habit_dashboard → displays list of streak values for a list of tasks. It may be too much information to really process? Why did this not work?
        - it only shows up sometimes, not always. You can’t see it by accident.
        - it ultimately only shows streaks. This works for a time, but then… why am I doing this? What does it lead to?
        - points, (and ones that can be spent) show a tangible thing you *earn* every single day, and that doesn’t go away from a bad day.
    - record_new_screentime → this is just like stop_work (it records the elapsed time between a start time and now(), but unlike stop_work, it also outputs a different message.
    - app_closer → locks app out. Will be updated with app lockouts V2
    - all regular habit recordings → cascading if statements inside settings block. Will be updated to support new “find by ID” lingo. I think.

I want a way to get notified if I am about to lose my habit streak. Opening an app, or an alarm going off, is what prompts that.

Dashboard Purpose:

1. **Am I on pace?**
2. **Why?**
3. **What should I do next?**
