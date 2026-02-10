# LOCKOUTS V2 REQUIREMENTS & Structure

- **Lockouts V2** is an apps script logic + google sheets data storage + iOS UI screen-time management system that closes “bad apps” under user configured conditions. It integrates with Habits V2, and can close based on things like time of day, habit completion, total screentime, and first X hours after Y timestamp.

*Changes vs the V1 code are listed after the || symbol.*


## General User Experience:

- Presets
    - a user can put a “preset” event in their google calendar. As long as this event has a name that matches a user-configured “preset” in their config file, it is considered that day’s preset. Presets determined which blocks apply on that day.
    - by being in google calendar, presets can be read by apps script directly, and by iOS in shortcuts.
    - presets should be all day events, and if there are multiple, simply choose whichever was read first, and then log an error to the JSON output.
    - today is based on whatever the google app script timezone is set for.
- Allowed entry:
    - If the user opens an app when it is allowed → It allows entry, and pops an “allowedMessage”
    - If inside the beg and end time of a duration type block:
        - the allowedMessage message says “▓▓▓▓▓▓░░░░·░░░░░░░░░░ \n 27m used, 1h 12m remaining”
            - where the progress bar represents % of the way to total screentime, with a delineator at wherever the current ration limit is, or nonexistent, if rationing is OFF.
            - The total length of the bar is a variable that can be changed, so we can fit the whole bar on different sized screens.
    - else if there is a global “cumulativeScreenTimeID” variable: show that in bar form, with the bar representing 24 hours, like this: ▓▓▓▓▓▓░░░░·░░░░░░░░░░ \n 27m used
    - else: show no message by setting the showMessage JSON output property to false.
- Disallowed Entry:
    - If the user opens an app at a time when entry is blocked, the app closes with a “blockMessage”. The blockMessage tells them what they need to do to unlock the app, ie which configured block is currently applying (message set in config).
    - Taking the prompted action that would cause that block to no longer apply is the primary way that users will unlock apps. However, there are two other ways a user can circumvent any block in the event of an emergency or weak will, so as to dissuade a user from ever turning the automation off entirely, and they consist of adding a specific event to their google calendar. Note: this section is entirely handled by the “client” app, like apple shortcuts, or google chrome on desktop. No additional apps script code is needed for this.
        - Illegitimate Unlock: (for a low point when the user really wants into the app, and where if this did not exist, the user would just turn the whole iOS automation off) → If the user opens calendar and places an event called “illegal_unlock” there, they get a one-time override. When they open the app again, it (again) closes the app, but this time tells them that they will have to wait 30s to open the app, and that they will lose X points by doing so (set in the shortcut). If they try to open before a full 30s has elapsed, it resets the timer. When the user finally opens after 30s, it lets them in, and the client sends to the separate habits code to record the metric with metricID “illegal_unlock”, and also starts a timer. It also deletes the “illegal_unlock” event from calendar. This whole unlock event is time limited to 10 minutes. After 10 minutes, it is as if this unlock attempt never happened. If illegal_unlock is left in calendar after 10 minutes, it gets deleted.
        - Legit Unlock: (for when I legitimately need to access a tutorial or other valid information) → I open calendar, and place an event called “legitimate_unlock” there. When I open again, it again closes the app, and tells me that I will have to wait 60s to open the app. If I try to open during that time, it resets the timer. When I finally open after 60s, it lets me in, time limited to 20 minutes. It also starts a timer. After 20 minutes, it is as if nothing ever happened.

## Block Objects:

- Users can programmatically create lockout “block” objects. When the key “app_closer” is sent, we look through all of the block objects in order (similar to in V1). If any apply, we send back a blockMessage depending on what applied first. If not, we send back an allowedMessage in the format from above.
- Block objects have the following properties (like a big old JSON array/dictionary of 0 to infinity “appBlock” objects
    
    ```jsx
    /* notes
    	- if two block objects are both trying to block access at the same time, the code chooses the one that appears first in the list.
    	- rationing:
    		- rationing divides up your duration_maxMinutes between the start and end times of the block. duration.maxMinutes is always the cap, but ration endMinutes can **b**e set higher to give you your full screentime earlier into the block.
    		- think of rationing like 2 points on a graph that form a line -> (hours.start, begMinutes), and (hours.end, endMinutes). This line represents the max allowed screentime at any time in the block, but where duration_maxMinutes is still the overall screentime cap for that block.
    		- Precise Definition:
    			Let t = minutes elapsed since block window start (clamped 0..windowLen).
    			Let rationCap(t) be linear interpolation from begMinutes to endMinutes across the window.
    			Let allowedSoFar = min(maxMinutes, rationCap(t))
    			Block if usedMinutes >= allowedSoFar
    */
    
    //Global Variables
    var cumulativeScreenTimeID = "cumulativeScreentime" //used in message output.
    var barLenth = 10
    
    [
    	{
    		id: "Plan Workday", // just a name for this block. Pick anything.
    		type: "completion_block", // types include: duration_block (max X minutes), completion_block (blocks based on task/metric completion),and firstXMinutesAfterTimestamp_block (first X minutes after Y timestamp)
    		presets: ["workday_rules","weekend_rules"], // all of the "presets" that a block pertains to. eg: ["weekend_rules","workday_rules"].
    		times: {beg: "09:00", end: "17:00"}, //when this block begins and ends to take effect (1-24). Can cross over midnight.
    		typeSpecific: {
    			duration: {maxMinutes: null, screenTimeID: null, rationing: {isON: true, begMinutes: 25, endMinutes: 300}}, //if a duration_block type, maxMinutes is the max screentime that can be hit during the timespan this block is active, and where to find that cumulative screenTime value in the sheet. A total block can be achieved by setting this to 0. rationing is explained in the notes above.
    			completion_block_ID: "plan_workday", //if a completion_block type, this is what metricID to search for to check for completion. If there is data there, it is complete. Or call a new metric status function.
    			firstXMinutes: {minutes: null, timestampID: null} //if a firstXHoursFromTimestamp type, this is how many hours and what metricID timestamp to reference as the "beginning" of the block.
    		}
    		onBlock: {message: "Plan Workday to Unlock.", shortcutName: "open notion dashboard", shortcutInput: ""} //the message that is shown when an app is blocked by this, and the shortcut to run (if any) upon a block applying. NOTE: anything 
    	},
    	{
    		id: "Max 2 Hours Per Day",
    		type: "duration_block",
    		presets: ["workday_rules","weekend_rules"],
    		times: {beg: "09:00", end: "24:00"},
    		typeSpecific: {
    			duration: {maxMinutes: 120, screenTimeID: "cumulativeScreentime", rationing: {isON: true, begMinutes: 25, endMinutes: 200}},
    			completion_block_ID: "plan_workday",
    			firstXMinutes: {minutes: null, timestampID: null}
    		}
    		onBlock: {message: "{screenTimeBar} \n {maxMinutes} Min limit reached. ", shortcutName: "", shortcutInput: ""}
    	},
    	{
    		id: "First 2 Hours after Wakeup",
    		type: "firstXMinutesAfterTimestamp_block",
    		presets: ["workday_rules"],
    		times: {beg: "09:00", end: "17:00"},
    		typeSpecific: {
    			duration: {maxMinutes: null, screenTimeID: "screentime", rationing: {isON: true, begMinutes: 25, endMinutes: 300}},
    			completion_block_ID: "plan_workday",
    			firstXMinutes: {minutes: 120, timestampID: "wake_up_timestamp"}
    		}
    		onBlock: {message: "Lock ends at {endTime}", shortcutName: "", shortcutInput: ""}
    	}
    ]
    
    /*Output Message Tokens -> write any of these in a onBlock.message output and the code will substitute it with the calculated value.
    	- {endTime} → formatted local time like 10:42 AM
    	- {screenTimeBar} → the ASCII bar string
    	- {usedMinutes} / {usedHuman} → 27 or 27m
    	- {allowedNowMinutes} / {allowedNowHuman} → ration cap at this moment
    	- {maxMinutes} / {maxHuman} → block cap
    	- {remainingMinutes} / {remainingHuman} → max - used (clamped)
    	- {rationMarker} if you want to expose the marker position separately (usually unnecessary if bar includes it)
    	
    	- unknown tokens remain unchanged, tokens are replaced after the block decision is made, and replacement is single-pass. Users cannot user the literal "{endTime}", for example, without it beng replaced.
    ```
    
    ## Configuration Field Validation
    
    ### Rule A — “Required fields by type” (validated, not hidden)
    
    Even if every block contains every sub-object, your code should validate that the fields required for the chosen `type` are present and non-null.
    
    Example:
    
    - `duration_block` requires: `typeSpecific.duration.maxMinutes`, `typeSpecific.duration.screenTimeID` (or allow null if you want “just show no bar”), `times`.
    - `completion_block` requires: `typeSpecific.completion_block_ID`.
    - `firstXMinutesAfterTimestamp_block` requires: `typeSpecific.firstXMinutes.minutes`, `typeSpecific.firstXMinutes.timestampID`.
    
    If missing, return `status:"blocked"` or `status:"allowed"` isn’t the right response — return `status:"error"` (or `status:"blocked"` with a loud debug error) so you don’t silently mis-enforce rules.
    
    ### Rule B — “Ignore everything else”
    
    - Unused fields are ignored, period.
    - **Net:** users still copy/paste one block template, but the system is self-protecting.
    
    ### Validation + failure behavior
    
    - Missing required fields for a block type → add an entry to `debug.errors` and either:
        - treat the block as “non-applicable” (fail-open)
    
    ## Rationing Specifics
    
    - `windowLen = minutes between window start and end` (handling midnight-cross)
    - `t = clamp(now - windowStart, 0..windowLen)`
    - `rationCap(t) = lerp(begMinutes, endMinutes, t/windowLen)`
    - `allowedSoFar = min(maxMinutes, rationCap(t))`
    - Block if `usedMinutes >= allowedSoFar`
    - **Marker**:
        - “delineator at wherever the current ration limit is” means: marker position corresponds to `allowedSoFar/maxMinutes` (clamped 0..1). If `maxMinutes==0`, marker behavior should be defined (probably no bar / special message).
        - if `rationing.isON=false`, do not show a marker.
    
    ## First X Minutes After Timestamp Particulars
    
    - `times` is an *additional gating window*.
        - Block applies only if **(now is within times window)** AND **(now < timestamp + X minutes)**.
    - if a timestamp is missing, default to block does not apply.
    
    ## **Time window evaluation**
    
    - `times.beg` and `times.end` are local times in script timezone.
    - If `beg < end`: active window is same-day `[beg, end)`.
    - If `beg > end`: window crosses midnight and is active `[beg, 24:00)` **OR** `[00:00, end)`.
    - If `beg == end`: interpret as 24h window (or invalid) — pick one.
    
    ## Services Used
    
    - Apps Script Files
        - *Main.gs:* where all of the logic lives.
            - keeps roughly the same structure. “keys” and “metrics” input are joined by a new “data” input. This new data input is not required for many existing and unrelated keys (ie features).
            - keys (ie features):
                - *app_closer* → what runs this lockout code.
                - *metric_status* → returns true or false, depending on whether a metric is complete, or not.
        - *Config.gs:* all blocking configuration happens in a dictionary/JSON format inside here.
    - Google sheets (relevant tabs):
        - *Tracking Data* → the log where truth is recorded. All values referenced by lockouts come from this sheet.
    
    ## Clients → iOS and Chrome Extension(s)
    
    - There is an iOS client that calls this apps script, and a chrome extension client (for mac and PC). They all have the same basic user experience, as defined above, and call the same apps script.
    - This allows a user to sync blocks to all of their relevant devices. Android is not currently in the plans, but can come later if demand exists.
    - Lockouts endpoint is read-only. It never writes data anywhere.
    
    ## JSON Output to Client
    
    ```jsx
    //the following JSON block represents the JSON output that is sent back to the client.
    {
      "status": "blocked",
      "block": {
        "id": "workday_plan_block",
        "type": "completion_block",
        "message": "Plan workday at your desk to unlock."
      },
      "ui": {
        "showMessage": true,
        "message": "▓▓▓▓░░░░·░░░░\n27m used, 1h 12m remaining",
        "screenTimeBar": "▓▓▓▓░░░░·░░░░",
        "usedMinutes": 27,
        "maxMinutes": 300,
        "allowedNowMinutes": 72,
        "endTimeISO": "2026-02-05T10:42:00-05:00"
      },
      "shortcut": { "name": "Open Notion Plan Workday", "input": "..." },
      "debug": {
        "preset": "workday_rules",
        "serverTimeISO": "2026-02-05T11:32:10-05:00",
        "errors": []
      }
    }
    ```
    
    # Apple Shortcuts Client Pseudo Code
    
    Chrome is opened → Timed Lockout Shortcut runs:
    
    look up unlockedUntil.txt timestamp
    
    if now - unlockedUntil < 0 (ie we are before timestamp)
    
    show notification now - unlockedUntil minutes remaining in this session.
    
    stop this shortcut
    
    if event called “illegal_unlock” is in calendar:
    
    look up unlockWait.txt file
    
    if unlockWait.txt > 5 minutes ago or < 30s
    
    write current timestamp and save
    
    go to homescreen
    
    show notification “30s timer started. You will lose 10 points by continuing. Delete event immediately!!”
    
    otherwise
    
    show notification “10 points deducted.”
    
    delete illegal_unlock from calendar
    
    write now + 10 minutes to unlockedUntil.txt
    
    send metricID: “illegitimate_unlock” to code to log the occurrence
    
    stop this shortcut
    
    if event called “legitimate_unlock” is in calendar:
    
    look up unlockWait.txt file
    
    if unlockWait.txt> 5 minutes ago or < 60s
    
    write current timestamp and save
    
    go to homescreen
    
    show notification “60s timer started for Legitimate Unlock”
    
    otherwise
    
    write now + 20 minutes to unlockedUntil.txt
    
    stop this shortcut
    
    toggle screenmode
    
    send app_closer key to code
    
    if output.blockStatus
    
    go to homescreen
    
    pause media
    
    if output.shortcutOnBlock is not empty
    
    run shortcut output.shortcutOnBlock
    
    show notification output.message
    
    toggle screenmode
