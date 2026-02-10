# HABITS V2 REQUIREMENTS & Structure

Habits V2 is an apps script logic + google sheets data storage system that allows a user to log various data associated with habits or tasks. Logging and return feedback can happen via iOS Shortcuts, or Notion. It fits into the existing set of automations I have already written. 

## Apps Script Files

- *Apps Script Sheets Apps Script Sheets Features.gs:* where all of the logic lives.
    - keeps roughly the same structure. “keys” and “metrics” input are joined by a new “data” input. This new data input is not required for many existing and unrelated keys (ie features).
    - New keys (ie features):
        - *record_habit_iOS* → records a habit. This one overarching habit key replaces all of the previous individual habit keys. In this case, “data” = [[taskID1, metric1],[taskID2,metric2]]. For each taskID, it uses that ID to identify the habit in config, write it to google sheets, and (if write_to_notion is ON), marks the task complete in notion via API, as well as writing a point multiplier and streak.
        - record_habit_notion → records a habit, just like record_habit_iOS, but it does not write status information back via the notion API, since the task was just completed from there.
        - *positive_push_notification* → sends back a message saying what the next thing to do is, and what the current streak is for that. || No changes to current functionality.
        - *habit_status* → returns true or false, depending on whether a habit is complete, or not. || this is new
- *config.gs:* configuration happens in a dictionary/JSON format inside here.
    - settings for the various features (keys) live here.
    - Habit Dictionary Structure and Properties:
        
        ```
        // global settings
        var pointTotalID = ""
        var trackingSheetName = ""
        var summaryMetricsSheetName = ""
        var writeToNotion = true
        
        		
        //The settings for each piece of logged data associated with a habit are configured inside a habits object (shown below). There can be as many as a user wants, in a list.
        	
        [
        	{
            taskID: "weightNumber",        //used to find where this metric is in google sheets, notion, or other future integrations.
            type: "number",                // timestamp, minutes, number, due_by, start_timer, stop_timer. ("minutes" represents values in "minutes:seconds" format only, to record decimal minutes mark it as a number type)
            points: {value: 1, multiplierDays: 4, maxMultiplier: 1.2, pointsID: "weightPoints"}                     // || all new. This is how many points completion of this habit gives. For timer and duration types, points multiplies by each minute, and for numbers, it multiplies by the number. pointsID is where to write it. The rest is explained in "point multipliers" below.
        		displayName: "Weight: ",       //First text in output message (ie: "Weight: ", "Heart Rate: ", "Run Duration: ") || used to be named insightFirstWords.
            recordType: "overwrite"        //for whether multiple recordings to the same cell should "overwrite", "keep_first", or "add", to whatever is already there, respectively.
            
            taskInsightSettings: {insightChance: .9, dayToDayChance: .1, dayToAvgChance: .4, rawValueChance: .1, increaseGood: true, insightUnits: "lbs"},
            
        		dates: [["Sunday","10:15", 12, 17],["Tuesday","15:43", 9, 17],["Friday","15:45", 1, 24]], //[day of the week, due by time, startHour, endHour] -> user can't have duplicate days of week. Used for "complete by" habits, and calculating streak lengths (ie only count the days shown for streak calcs). Time of day not necessary unless it's a due_by type.
        		streaks: {unit: "days", streaksID: "weightNumberStreak", notionOutput: true} //{unit the streak count should be displayed in, place in the sheet to record streaks to, whether to record back to notion}. Could be days, or could be a fun unit like “hafthors” for weightlifting, for ex.
        		ppnMessage: ["part 1", "part 2"] // || Positive Push Notifications are now combined with habits.
        		
        		//if point multiplier was global, we could enter the same equation in notion and skip the api call. 
        		//but where do we write point multiplier in notion? Because it is not with every single taskID
        		ifTimer_Settings: {timerMessageTemplate: null, timerStartTaskID: null, timerDurationTaskID: null} // || Timers are now combined with habits, with start_timer and stop_timer being types of habit.
        	}
        ]
        ```
        

## Point Multipliers

- Points are not just ascribed based on the point value for a task, but also on the current streak count, based on the rules below.
- Multipliers are determined per habit, using a new “multiplierDays” and “maxMultiplier” property. The multiplier grows linearly over dayCount days.
    - Today’s Multiplier = (((maxMultiplier-1)/multiplierDays)*currentStreakCount)+1, where currentStreakCount is the count prior to this recording, and maxes out at multiplierDays
    - hypothetical scenario: *(maxMultiplier = 1.2, multiplierDays = 4)*
        - Day 1: Multiplier = (((1.2 - 1) / 4) * 0) + 1 = 1
        - Day 2: Multiplier = (((1.2 - 1) / 4) * 1) + 1 = 1.05
        - Day 3: Multiplier = (((1.2 - 1) / 4) * 2) + 1 = 1.1
        - Day 4: Multiplier = (((1.2 - 1) / 4) * 3) + 1 = 1.15
        - Day 5: Multiplier = (((1.2 - 1) / 4) * 4) + 1 = 1.2
        - Day 6: Multiplier = (((1.2 - 1) / 4) * 4) + 1 = 1.2

## Where Multipliers Are Written:

- new “Summary Metrics” google sheet tab. This records current state data for each habit. Initially the data to write for each is: streak, multiplier, and per-habit points.
    - all formatting and data on Summary Metrics should be automatically generated for all habits, and require no user setup.
- new row on “Log” google sheet tab - It will have a taskID of “dailyPoints”, and is where we write today’s current running point total.
- Notion: if the new “writeToNotion” variable == true, then do the following
    - Update the associated Notion database item (ie task) that contains a matching taskID in it’s taskID property with the following
        - property: Point Value = current point value
        - property: Current Multiplier = current multiplier
        - property:
    - Update a specific synced block called pointBlock (user sets this up in scriptProperties) → Overwrite whatever it contains with today’s new point count

## Google sheets tabs:

- *Tracking Data* → the log where truth is recorded.
- *Summary Metrics* → the code calculates streak counts and any other calculated, non time-series data for each habit here. || this sheet did not previously exist.
- *(non code) Dashboard Data* → a static range of data that charts can draw upon. This is created via formula inside google sheets
- *(non code) Dashboard Charts* → these are google sheets charts made entirely inside google sheets.

## iOS Integration

- by scanning a QR code or tapping an NFC, users can have a “logging” shortcut run, which triggers logging via webhook. Every combination of taskID’s and data to record are custom setup in a different shortcut.
- by doing it this way, users can add their own custom shortcut actions before, after, and inside of the logging shortcut. This adds flexibility to the system.

## Optional Notion Integration

- **Notion Database Properties to be Updated:** upon a task being logged via iOS, the apps script code uses the Notion API to find a task with a matching taskID, and marks all relevant data to various properties, depending on what the user has configured in the habit settings. Notion Properties include:
    - taskID (used to find a matching task in a database. Tasks with matching taskID’s can exist in multiple databases. We search in as many databases for these tasks as the user provides.)
    - completion status (apps script sets “Status” to “Complete”)
    - streak (apps script sets “Streak” to the calculated_streak_count). This is done for every habit with a task.streaks.sheetID value
    - point multiplier (apps script sets “Point Multiplier” to calculated_point_multiplier)
    - points (apps script sets “Points” to calculated_point_number) → the pointTotalID cell is updated by the apps script upon any task with task.points > 0 being logged.
    - [unused by apps script] data (text) → user inputs all other metrics associated with a habit, separated by the separator character (initially Ù) before marking complete. For meditation, it could look like 15:54Ù7.5Ù8.5. This is used to send the metrics payload along with the taskID “key” in the webhooks request to apps script
- **Dashboard View:** notion has one “dashboard view” page that contains a filtered view of the task databases, as well as data written by the apps script. Data includes:
    - today’s current point total
    - this week’s point total
    - embedded charts from looker studio. (this enables us to be more flexible with what we show than writing a hard-coded set of values, and exists less as a real-time data tracker, and more as an analytical reflection tool.
- an automation sends a webhook to apps script when any “habits” related task’s “State” property is marked “Complete”

## Future Features

- one shortcut logs every habit by taking in a list of taskID’s, finding them via a locally cached version of the config file, and then dynamically showing menus and prompts for the information needed.
    - this speeds up creating new habits (only update config and print a new QR code), but obscures the actions of each shortcut, which can make individual modifications more complex.
    - requires adding iosPrompt, shortcutOnRun, and shortcutOnLog as properties to send back.
- Make “minutes” type habits actually hh:mm:ss
