/* Code Explanation:
  - this code is an amalgamation of a several features, added to over the course of 2 years. Primarily, it takes habit tracking information via webhook (run on my phone using apple shortcuts), adds it to the user's specified google sheet, and then returns various performance insights in the form of text a few seconds later.
  - the exact info sent by the shortcut is a text "key" that lets this code know what colored block in the google sheet is being added to, and a list of all the metrics being added, separated (by the shortcut) by this character: (Ù).
  - it can accept as many metrics as you want.
  - thus, each habit tracked must have it's own unique apple shortcut containing it's own unique key as an identifier. 
  - other features include methods of tracking habit streaks, creating dashboard views of those streaks, telling me what to do next, reminding me of when to leave an event to get to bed on time, syncing data with my Notion tasks database, appending to my notion inbox, timing work sessions and screentime, and locking me out of "bad apps" based on various conditions.

  - overall, I am looking to simplify this and add functionality, using what I have learned through 2 years of usage.
*/

/* Future Features

  OLD ADDITIONS (As of 2024)
  - task point values ("+3 points. Total: 12") (estimate .5 days)
    - adds a row to GS called "point total"
    - adds a setting called %positive or something like that
    - adds a property to tasks called "point_value"
    - upon scan, it adds point_value* some random point muliplier (to casino-ify it) to point total and returns it to the user
    - stretch goals:
      - adds a second task property called "PointsPerMin" and adjusts calculator function to add PointsPerMinute*minutes completed of a task
      - double XP weekends + strategic XP multipliers the day after a streak has ended to incentivize re-entry + extra points for "key decision point" habits like meditation

  - recurring task reminders (estimate 2 days) - not high priority because I can more easily and usefully build this into Notion itself.
    - example output (two times per day): "recurring tasks that need completed: - schedule haircut (last 10/2/22)") (Intention is that this prompts me to put it in my notion (except it's already there?))
    - functionally adds a new type of task to code called recurring, with a property called recur invterval. When that task is completed, it looks at every recurring task that is overdue. checks off a 1 if completed.
    - shortcut is triggered 2 times per day (during work for work recurs, after work for personal recurs)
    - stretch features:
      - takes another property called "allowable notification times" that enables overdue tasks to not be notified during certain times of day (for instance changing sheets while I'm at work)
      - pull from Notion Database using API to sync fluidly b/w NFC system and Notion.

  - message output features that would be nice to have but who knows if I will ever add them:
    - track streaks
    - estimate time until a goal is reached based on rate of change
    - perhaps more conversational and less statistical/computational, EG "Your weight has increased 1.3 lbs vs yesterday"
    - compare your percentile to that of your other countrymen
    - "you completed 4/5 of today's tasks!"

  - fix habits that feature multiple comparisons to only use one date range instead of a different one for each point.
  
*/

//establishing global variables
var key;
var spreadsheetID;
var sheet1;
var separatorChar;
var activeCol;
var currentTimeStamp = new Date();
var originalComparisonArray  = [];
var firstLineMessage = [];
var firstLineMessageFreq;
var posPerformanceFreq;
var negPerformanceFreq;
var averageSpan;
var morningMessageStatus;
var habitOrders;
var nextTask;
var thewhyoftoday;
var firstHabitofDay = 0;
var tomorrowGoalRow;
var appCloserRow;
var lateExtension;
var morningAppLockoutDuration;
var time_elapsed = [];
var nextActionSetting; //ALL 3 OF THESE SHOULD BE REPLACED BY NEXT HABIT CHECK OR PPN
var nextActionRow;
var nextActionMessage;
var homeWifiName;
var personalPlanningRow;
var screentimeTimeStampRow;
var screenStartTime;
var screenTimeLimit;
var rationDuration;
var screenTimeRationing;
var cumulativeScreenTimeRow;
var chartDataRanges;
var sheetNames;
var workWifiName;
var arrivedAtWorkCell;
var lastDepartedWorkCell;
var toggleKey;
var calendarOutput;
var eventNameInput;
var whiteListCell;
var appLockSettings = {};
var nighttime_notifier_settings = [];
var habitChain; //used for PPN V2 (updated version of ppndict)

//main function
function doGet(e) {
  var scriptProperties = PropertiesService.getScriptProperties();

  key = JSON.parse(e.parameters.key);
  //key = "append_to_notion_inbox";

  var allMetricSettings = loadSettings(key);

  var lastCol = sheet1.getLastColumn();
  activeCol = findactiveCol();
  if (activeCol > lastCol) {updateAllRanges()}

  var metrics = createMetricsArray(JSON.parse(e.parameters.metrics));
  //var metrics = createMetricsArray("the thing"); //"-54Ù8.1Ù6:30"


if (key == "append_to_notion_inbox") { //paired with shortcut to append to my notion inbox via siri
  tempString = "Failed to write. Please try again. ";

  try {
    // Read inputs
    blockID = scriptProperties.getProperty('notionInboxBlockID');
    contentToWrite = metrics[0].join("");

    if (!blockID) throw new Error("Missing script property: notionInboxBlockID");
    if (!contentToWrite || !String(contentToWrite).trim()) throw new Error("Nothing to write (empty content).");

    // Write to Notion (append as a bullet under the block)
    notionAppendToBlock_(blockID, contentToWrite, { as: "bulleted_list_item" });

    tempString = "successfully wrote " + contentToWrite + " to your notion inbox.";
  } catch (e) {
    // Make error visible to Shortcuts while debugging
    tempString = "Failed to write. " + (e && e.message ? e.message : String(e));
  }

  console.log(tempString);
  return ContentService.createTextOutput(tempString);
}


  if (key == "nighttime_away_notifier") { //example metricsArray = [70, 8.1, 6:30, 30] Up to Date as of Jan 27: What this is: if I am away from home, tell me when to leave to get to bed on time

    var padding = nighttime_notifier_settings[0][1]      //  [["Harold", 14, 25, 5, 10, 15, 15], 60, 30, 0];       //["Harold", 14, 180, 60, 30] settings[name of streak, minutes above or below, row, time to get to car, tt get inside, tt get ready, tt read], first notification (minutes), second notification (minutes), third notification (minutes), 
    var firstAlertTime = nighttime_notifier_settings[1]
    var secondAlertTime = nighttime_notifier_settings[2]
    var finalAlertTime = nighttime_notifier_settings[3]

    var tempString;
    var timeUntilSleep = Number(metrics[0].join(""));
    var sleepDuration = Number(metrics[1].join(""));
    var wakeTime = metrics[2].join("");
    var travelTime = Number(metrics[3].join(""));

    var timeUntilLeave = timeUntilSleep - travelTime - nighttime_notifier_settings[0][6] - nighttime_notifier_settings[0][5] - nighttime_notifier_settings[0][4] - nighttime_notifier_settings[0][3]; // LEAVE TIME = SLEEP TIME - 15 MIN GETTING READY - 15 MIN READING - TRAVEL TIME - TIME TO GET TO CAR - TIME TO GET SETTLED AT HOME
    console.log("timeUntilSleep: " + timeUntilSleep + " timeUntilLeave: " + timeUntilLeave + " travelTime: " + travelTime + " nighttime_notifier_settings[0][3]: " + nighttime_notifier_settings[0][3])

    //CALCULATING TIMESTAMP DATA
    let leaveTimestamp = new Date(currentTimeStamp.getTime() + timeUntilLeave * 60000);     // Assuming currentTimeStamp is a Date object and travelTime is a number (in minutes)
    // Format the hours and minutes in 12-hour time format without am/pm
    let leaveHours = leaveTimestamp.getHours() % 12 || 12; // Convert to 12-hour format and handle midnight
    let leaveMinutes = leaveTimestamp.getMinutes().toString().padStart(2, '0'); // Ensure 2-digit format for minutes
    let formattedLeaveTime = `${leaveHours}:${leaveMinutes}`;

    let arriveTimestamp = new Date(currentTimeStamp.getTime() + ((timeUntilLeave + travelTime + nighttime_notifier_settings[0][3]) * 60000));     // Assuming currentTimeStamp is a Date object and travelTime is a number (in minutes)
    // Format the hours and minutes in 12-hour time format without am/pm
    let arriveHours = arriveTimestamp.getHours() % 12 || 12; // Convert to 12-hour format and handle midnight
    let arriveMinutes = arriveTimestamp.getMinutes().toString().padStart(2, '0'); // Ensure 2-digit format for minutes
    let formattedArrivalTime = `${arriveHours}:${arriveMinutes}`;

    var alarmStatus = 0;

    //get the streak count here!
    var dataRange = sheet1.getRange(nighttime_notifier_settings[0][2], 2, 1, activeCol-1).getValues();
    var streakCount = streakCheck(dataRange[0].slice(0, -1));

    //Set 60 min alarm
    if (timeUntilLeave < (firstAlertTime+28) && timeUntilLeave > (firstAlertTime+2)) {

      alarmStatus = 1;
      alarmTimestamp = new Date(currentTimeStamp.getTime() + ((timeUntilLeave - firstAlertTime) * 60000));
      let alarmHours = alarmTimestamp.getHours() % 12 || 12; // Convert to 12-hour format and handle midnight
      let alarmMinutes = alarmTimestamp.getMinutes().toString().padStart(2, '0'); // Ensure 2-digit format for minutes
      let timeToAlarm = `${alarmHours}:${alarmMinutes} PM`;

      console.log("Setting 1 hour alarm")
      console.log("Ù|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput("Ù|" + alarmStatus + "|"+timeToAlarm);

    }

    //Send 60 min message
    else if (timeUntilLeave <= (firstAlertTime+2) && timeUntilLeave >= (firstAlertTime-2)) {

      let timeToAlarm = 0;
      var hours = (timeUntilLeave/60).toFixed(1)
      var numericHours = parseFloat(hours); // Convert the string back to a number
      var formattedHours = (numericHours % 1 === 0) ? numericHours.toFixed(0) : numericHours.toFixed(1);

      console.log("Sending 1 hour message")
      console.log(formattedHours + " hour warning. Leave by " + formattedLeaveTime + " for " + wakeTime + " wakeup, " + nighttime_notifier_settings[0][6] + " min reading. Travel Time = " + travelTime + " minutes to home|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput(formattedHours + " hour warning. Leave by " + formattedLeaveTime + " for " + wakeTime + " wakeup, " + nighttime_notifier_settings[0][6] + " min reading. Travel Time = " + travelTime + " minutes to home|" + alarmStatus + "|"+timeToAlarm);

    }

    //Set 30 min alarm
    else if (timeUntilLeave < (secondAlertTime+28) && timeUntilLeave > (secondAlertTime+2)) {

      alarmStatus = 1;
      alarmTimestamp = new Date(currentTimeStamp.getTime() + ((timeUntilLeave - secondAlertTime) * 60000));
      let alarmHours = alarmTimestamp.getHours() % 12 || 12; // Convert to 12-hour format and handle midnight
      let alarmMinutes = alarmTimestamp.getMinutes().toString().padStart(2, '0'); // Ensure 2-digit format for minutes
      let timeToAlarm = `${alarmHours}:${alarmMinutes} PM`;

      console.log("Setting 30 min alarm")
      console.log("Ù|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput("Ù|" + alarmStatus + "|"+timeToAlarm);

    }

    //Send 30 min message
    else if (timeUntilLeave <= (secondAlertTime+2) && timeUntilLeave >= (secondAlertTime-2)) {

      let timeToAlarm = 0;
      console.log("Sending 30 min message")
      console.log(timeUntilLeave + " minute warning. Leave by " + formattedLeaveTime + " to get home by " + formattedArrivalTime + ". " + nighttime_notifier_settings[0][0] + "s: "  + streakCount + "|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput(timeUntilLeave + " minute warning. Leave by " + formattedLeaveTime + " to get home by " + formattedArrivalTime + ". " + nighttime_notifier_settings[0][0] + "s: "  + streakCount + "|" + alarmStatus + "|"+timeToAlarm)

    }

    //Set "Time To Leave" Alarm
    else if (timeUntilLeave < (finalAlertTime+28) && timeUntilLeave > (finalAlertTime+2)) {

      alarmStatus = 1;
      alarmTimestamp = new Date(currentTimeStamp.getTime() + ((timeUntilLeave - finalAlertTime) * 60000));
      let alarmHours = alarmTimestamp.getHours() % 12 || 12; // Convert to 12-hour format and handle midnight
      let alarmMinutes = alarmTimestamp.getMinutes().toString().padStart(2, '0'); // Ensure 2-digit format for minutes
      let timeToAlarm = `${alarmHours}:${alarmMinutes} PM`;

      console.log("Setting Time To Leave Alarm");
      console.log("• Time to leave. Travel Time = " + travelTime + " minutes.|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput("• Time to leave. Travel Time = " + travelTime + " minutes.|" + alarmStatus + "|"+timeToAlarm);

    }

    //Send "Time To Leave" Message
    else if (timeUntilLeave <= (finalAlertTime+2) && timeUntilLeave >= (finalAlertTime-2)) {

      let timeToAlarm = 0;
      
      console.log("Sending Time To Leave Message");
      console.log("Time to leave. Travel Time = " + travelTime + " minutes. Your " + streakCount + " " + nighttime_notifier_settings[0][0] + "s Need You. You will arrive at " + formattedArrivalTime + ".|" + alarmStatus + "|"+timeToAlarm);
      return ContentService.createTextOutput("Time to leave. Travel Time = " + travelTime + " minutes. Your " + streakCount + " " + nighttime_notifier_settings[0][0] + "s Need You. You will arrive at " + formattedArrivalTime + ".|" + alarmStatus + "|"+timeToAlarm);

    }

    //IF YOU ARE LATE MESSAGE
    else if (timeUntilLeave < 0) {

      var timeToAlarm = 0;
      if (dataRange[0][dataRange[0].length - 1] != "") { //if I have already flossed, let the shortcut know to not send a notification
        console.log("ignore|" + alarmStatus + "|"+timeToAlarm)
        return ContentService.createTextOutput("ignore|" + alarmStatus + "|"+timeToAlarm);
      }    

      //console.log(timeUntilSleep + " minute warning to go floss (for " + sleepDuration + "h of sleep and a " + wakeTime + " wakeup) Harold Count: " + streakCount)
      console.log(timeUntilLeave + " minute warning to leave (for " + sleepDuration + "h of sleep and a " + wakeTime + " wakeup). " + nighttime_notifier_settings[0][0] + "s: " + streakCount + "|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput(timeUntilLeave + " minute warning to leave (for " + sleepDuration + "h of sleep and a " + wakeTime + " wakeup). " + nighttime_notifier_settings[0][0] + "s: " + streakCount + "|" + alarmStatus + "|"+timeToAlarm);
    }

    //SEND no message
    else {
      var timeToAlarm = 0;
      return ContentService.createTextOutput("ignore|" + alarmStatus + "|"+timeToAlarm);
    }
  }


  if (key == "nighttime_notifier") {// Up to Date as of Jan 27: if at home, tell me when to go to bed

    var padding = nighttime_notifier_settings[0][1]     //["Harold", 14, 24], 180, 60, 30       //settings["name", minutes above or below, excelRow], first notification (minutes), second notification (minutes), third notification (minutes)
    var firstAlertTime = nighttime_notifier_settings[1]
    var secondAlertTime = nighttime_notifier_settings[2]
    var finalAlertTime = nighttime_notifier_settings[3]

    var tempString;
    var timeUntilSleep = metrics[0].join("");
    var sleepDuration = metrics[1].join("");
    var wakeTime = metrics[2].join("");

    var alarmStatus = 0;
    var timeToAlarm = 0;

    //WATCH MOVIE REMINDER
    if (timeUntilSleep < (firstAlertTime+padding) && timeUntilSleep > (firstAlertTime-padding)) {
      var hours = (timeUntilSleep/60).toFixed(1)
      var numericHours = parseFloat(hours); // Convert the string back to a number
      var formattedHours = (numericHours % 1 === 0) ? numericHours.toFixed(0) : numericHours.toFixed(1);
      console.log(formattedHours + " hours until bedtime for a " + wakeTime + " wakeup. If you want to watch a movie, do it soon.|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput(formattedHours + " hours until bedtime for a " + wakeTime + " wakeup. If you want to watch a movie, do it soon.|" + alarmStatus + "|"+timeToAlarm);
    }
    //get the streak count here!
    var dataRange = sheet1.getRange(nighttime_notifier_settings[0][2], 2, 1, activeCol-1).getValues();
    //console.log("dataRange: " + dataRange[0][dataRange[0].length - 1]);
    var streakCount = streakCheck(dataRange[0].slice(0, -1));
    //console.log(streakCount)
    
    //LEADUP WARNING 1
    if (timeUntilSleep < (secondAlertTime+padding) && timeUntilSleep > (secondAlertTime-padding)) {
      console.log(timeUntilSleep-30 + " minute warning to go floss (for " + sleepDuration + "h of sleep and a " + wakeTime + " wakeup). You have " + streakCount + " " + nighttime_notifier_settings[0][0] + "s.|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput(timeUntilSleep-30 + " minute warning to go floss (for " + sleepDuration + "h of sleep and a " + wakeTime + " wakeup). You have " + streakCount + " " + nighttime_notifier_settings[0][0] + "s.|" + alarmStatus + "|"+timeToAlarm)
    }
    if (dataRange[0][dataRange[0].length - 1] != "") { //if I have already flossed, let the shortcut know to not send a notification
      console.log("ignore|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput("ignore|" + alarmStatus + "|"+timeToAlarm);
    }

    //TIME TO HEAD TO BED WARNING
    if (timeUntilSleep < (finalAlertTime+padding) && timeUntilSleep > (finalAlertTime-padding)) {
      console.log("Floss. Your " + streakCount + " Harolds Need You. You can resume what you’re doing after or read a book.|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput("Floss. Your " + streakCount + " " + nighttime_notifier_settings[0][0] + "s Need You. You can resume what you’re doing after or read a book.|" + alarmStatus + "|"+timeToAlarm);
    }

    //IF YOU ARE LATE WARNING
    if (timeUntilSleep < 0) {
      //console.log(timeUntilSleep + " minute warning to go floss (for " + sleepDuration + "h of sleep and a " + wakeTime + " wakeup) Harold Count: " + streakCount)
      console.log(timeUntilSleep-30 + " minute warning (for " + sleepDuration + "h of sleep and a " + wakeTime + " wakeup). " + nighttime_notifier_settings[0][0] + " Count: " + streakCount + "|" + alarmStatus + "|"+timeToAlarm)
      return ContentService.createTextOutput(timeUntilSleep-30 + " minute warning (for " + sleepDuration + "h of sleep and a " + wakeTime + " wakeup). " + nighttime_notifier_settings[0][0] + " Count: " + streakCount + "|" + alarmStatus + "|"+timeToAlarm);
    }
    return ContentService.createTextOutput("ignore|" + alarmStatus + "|"+timeToAlarm);
  }



  if (key == "check_341_tasks") { //Up to date as of Jan 27 2026:  returns a list of all personal notion tasks at a given location (in this case 341). This was part of the original task check feature, that would not open a location-based task view unless there were actually tasks to-do on it. I want to keep this, it could be useful in the future.
    var count = notionTaskLocationChecker(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('personalNotionTaskDatabaseID'), "341 Glyn Tawel Dr")
    console.log("count = " + count)
  }
  if (key == "home_apartment_tasks") {
    
    var count = 0;
    var tempString;

    console.log("searching personal database")
    count = notionTaskLocationChecker(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('personalNotionTaskDatabaseID'), "Home (Apartment)");

    console.log("searching work database")
    count += notionTaskLocationChecker(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('workNotionTaskDatabaseID'), "Home (Apartment)");

    console.log("searching stitch & stripes database")
    count += notionTaskLocationChecker(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('DToMNotionTaskDatabaseID'), "Home (Apartment)");

    console.log("searching ArmorSource database")
    count += notionTaskLocationChecker(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('ArmorSourceTaskDatabaseID'), "Home (Apartment)");

    console.log("searching 341 database")
    count += notionTaskLocationChecker(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('341NotionTaskDatabaseID'), "Home (Apartment)");

    if (count == 1) {tempString = count + " task found."}
    else {tempString = tempString = count + " tasks found."}
    console.log(tempString);

    return ContentService.createTextOutput(tempString);
    
  }

  if (key == "set_notion_plan_workday_complete") {// This 'syncs' notion task status with the google sheet. Will be superseded by a "syncToNotionViaID" feature that uses taskID"
    setNotionTaskState(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planWorkdayID'), "Complete")
  }

  if (key == "set_notion_plan_personal_day_complete") {// This 'syncs' notion task status with the google sheet. Will be superseded by a "syncToNotionViaID" feature that uses taskID"
    setNotionTaskState(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planPersonalDayID'), "Complete")
  }

  if (key.includes("start_work")) { //was purpose built to specifically handle work timers. Likely Superseded by/rolled up into habits V2
    //if there is a wifi network found, it matches work wifi, and the cell is empty, write.
    console.log("key == start work. metrics[] = " + metrics)
    if (metrics[0] != undefined) {
      //if the wifi network is the work wifi network
      if ((metrics[0].join('')).includes(workWifiName)) {
        console.log("writing first arrived at work timestamp")
        writeToSheetGeneric(arrivedAtWorkCell,currentTimeStamp,2) //write in "non overwrite" mode
      }
    }
  }

  if (key.includes("stop_work")) {//was purpose built to specifically handle work timers. Likely Superseded by/rolled up into habits V2

    var startTime = sheet1.getRange(time_elapsed[0], activeCol).getValue()

    //if using only one nfc to control both start and stop, and StartTime is empty, start the timer
    if (startTime == "") {
      if (key == "start_stop_work") {
        sheet1.getRange(time_elapsed[0], activeCol).setValue(currentTimeStamp)
        return ContentService.createTextOutput("Work Timer has Started!");
      }
      return ContentService.createTextOutput("No Timer Found to Stop");
    }

    //if there is a wifi network found, it matches work wifi, and the cell is empty, write.
    if (metrics[0] != undefined) {
      //if the wifi network is the work wifi network
      if (metrics[0].join('').includes(workWifiName)) {
        writeToSheetGeneric(lastDepartedWorkCell,currentTimeStamp,1) //write in overwrite mode
      }
    }

    //otherwise, stop the timer (empty start time, calculate duration, write to sheet)
    startTime = new Date(startTime);
    var durationArray = calculateAndWriteDuration(startTime, currentTimeStamp, time_elapsed[1]);
    sheet1.getRange(time_elapsed[0] , activeCol).setValue("") //empty startingTime cell

    //update the graph if time elapsed > 30 seconds
    if (currentTimeStamp - startTime > 30000) { //milliseconds
      updateDataRanges(spreadsheetID, sheetNames[0].dataSheetName, sheetNames[1].targetSheetName, chartDataRanges);
    }
    //turn off calendar output if time is not at least 5 minutes
    if (currentTimeStamp - startTime < 300000) { //milliseconds
      calendarOutput = "OFF";
    }

    //Print Statements
    var amountAdded = convertTimeToOutputForm(durationArray[0],1)
    var amountAddedDecimal = convertTimeToOutputForm(durationArray[0],2)
    var newDuration = convertTimeToOutputForm(durationArray[1],1)
    console.log("Stopped. Added +" + amountAdded + "! ("+ amountAddedDecimal +")\nNew Score: " + newDuration);
    return ContentService.createTextOutput(startTime + "|" + calendarOutput + "|" + eventNameInput + "|" + workWifiName + "|Added +" + amountAdded + "! (" + amountAddedDecimal + ")\nNew Score: " + newDuration + "!");
  }

  else if (key == "is_nfc_completed") {//returns no/yes depending on if habit is complete. Needs updated to return true/false, and if any additional info is needed, to output in JSON format.
    var lookupRow = Number(metrics[0].join(""));
    if (sheet1.getRange(lookupRow, activeCol).getValues() == "") {
      return ContentService.createTextOutput("no");
    }
    return ContentService.createTextOutput("yes, last completed " + sheet1.getRange(23, activeCol).getValues());
  }

  //if you want this to show up in habit output, you'll have to find the habit output to do so.
  else if (key == "positive_push_notification") { // enhanced habit chain function with full day names. This is V2 of this feature.
    if (positive_push_notifications == "Off") {
      return ContentService.createTextOutput("PPN is OFF");
    }
    //updateDashboardData()

    const currHour = getCurrentHour();
    const today = new Date();
    const todayDayName = today.toLocaleDateString('en-US', { weekday: 'long' }); // Get full day name

    // Define the enhanced habit chain with customization options

    // Filter and sort habits based on day, time, and order
    const filteredHabits = habitChain.filter(habit => {
      // Check if 'dates' is defined and includes the current day name
      if (habit.dates && habit.dates.includes(todayDayName)) {
        // Further check if current time is within the allowed range
        return currHour >= habit.startTime && currHour <= habit.endTime;
      }
      return false; // If 'dates' is undefined, filter it out
    }).sort((a, b) => a.order - b.order);

    // Check the habit chain in order
    for (const habit of filteredHabits) {
      const dataRange = sheet1.getRange(habit.row, 2, 1, activeCol - 1).getValues();
      const streakCount = streakCheck(dataRange[0].slice(0, -1), habit.dates); // Account for irregular habits

      // Check if the habit is incomplete
      const cellValue = sheet1.getRange(habit.row, activeCol).getValue();
      if (cellValue === "") {
        // Construct the message for the habit
        let customizedMessage = habit.messagePart1 
          + " " + streakCount + " " + habit.streakTerm 
          + ". " + habit.messagePart2;

        console.log(`Next habit: ${habit.name}. Streak: ${streakCount}.`);
        console.log("MESSAGE OUTPUT:   " + customizedMessage);
        return ContentService.createTextOutput(customizedMessage);
      }
    }

    // If all habits are complete, display a message
    console.log("All habits completed.");
    return ContentService.createTextOutput("All habits completed for today!");
  }


else if (key == "habit_dashboard") {//JAN 27 THIS CAN BE superceded by or MERGED WITH HABITS V2. when called, it can return what to do, when it is due by, the points you will gain by doing it or lose by not doing it. Then again, that is basically next habit check / positive push notifications. It may be what needs to write dashboard updates to notion. Still in progress.

  const today = new Date();
  const todayDayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const currHour = today.getHours();

  const activeCol = sheet1.getLastColumn();

  let outputLines = [];
  let dashboardData = []; // Array to hold data for "Dashboard Data" sheet
  let totalStreak = 0;
  let nextHabitFound = false;

  console.log('Today is:', todayDayName);

  for (const habit of habitChain) {

    // Get dataRange for the habit
    const dataRange = sheet1.getRange(habit.row, 2, 1, activeCol - 1).getValues();
    const streakCount = streakCheck(dataRange[0].slice(0, -1), habit.dates);

    // Get cell value for today
    const cellValue = sheet1.getRange(habit.row, activeCol).getValue();
    // Adjusted the completedToday condition
    const completedToday = cellValue !== "" && cellValue !== 0 && cellValue !== "0";

    // Calculate display streak count
    const displayStreakCount = streakCount + (completedToday ? 1 : 0);

    // Update totalStreak
    totalStreak += displayStreakCount;

    // Determine if the habit is relevant today
    const isHabitRelevantToday = habit.dates.includes(todayDayName);

    // Log habit details for debugging
    console.log(`Habit: ${habit.name}`);
    console.log(`  Relevant Today: ${isHabitRelevantToday}`);
    console.log(`  Streak Count: ${streakCount}`);
    console.log(`  Completed Today: ${completedToday}`);
    console.log(`  Display Streak Count: ${displayStreakCount}`);

    // Include the habit in the output regardless of relevance today
    let habitLine = {
      name: habit.name,
      displayStreakCount: displayStreakCount,
      completedToday: completedToday,
      isNextHabit: false
    };

    // If the habit is incomplete today, relevant today, and nextHabitFound is false, mark it as nextHabit
    if (!nextHabitFound && !completedToday && isHabitRelevantToday) {
      habitLine.isNextHabit = true;
      nextHabitFound = true;
      console.log(`  Next Habit to Complete: ${habit.name}`);
    }

    // Add to outputLines
    outputLines.push(habitLine);

    // Prepare data for "Dashboard Data" sheet
    dashboardData.push([habit.name, displayStreakCount]);
  }

  // Update "Dashboard Data" sheet
  updateDashboardSheet(dashboardData);

  // Build the final output string without automatic padding
  let finalOutput = '';
  let maxLineLength = 0;

  // Build habit lines and calculate maximum line length
  outputLines.forEach((habitLine) => {
    let line = `${habitLine.name} ${habitLine.displayStreakCount}`;

    if (habitLine.completedToday) {
      line += ' (+1)';
    }

    if (habitLine.isNextHabit) {
      line += '  <<<<<<'; // Add arrows to highlight the next habit
    }

    finalOutput += line + '\n';

    // Log each line for debugging
    console.log('Habit Line:', line);

    // Update maxLineLength if necessary
    const lineLength = line.length;
    if (lineLength > maxLineLength) {
      maxLineLength = lineLength;
    }
  });

  // Add an extra newline between the final habit and the total line
  finalOutput += '\n';

  // Construct the TOTAL line
  const totalLabel = 'TOTAL';
  const totalValueString = totalStreak.toString();

  // Calculate the number of dashes needed
  const numDashes = maxLineLength - (totalLabel.length + totalValueString.length);
  const dashString = " " + '-'.repeat((Math.max(0, numDashes))/2-1) + " ";

  // Construct the total line
  const totalLine = `${totalLabel}${dashString}${totalValueString}`;

  finalOutput += totalLine;

  // Log the final output
  console.log('Final Output:\n' + finalOutput);

  // Return the final output
  return ContentService.createTextOutput(finalOutput);

}





  //This code is to run when an app is closed and records the time between when it was opened and closed.
  else if (key == "record_new_screentime") {

    var sheetVal = sheet1.getRange(time_elapsed[0], activeCol).getValue()
    if (sheetVal == "" && sheet1.getRange(time_elapsed[1], activeCol).getValue() == "") {
      sheet1.getRange(time_elapsed[1] , activeCol).setValue("00:00:00") //set time to 00:00:00
    }
    else {
      var startTime = new Date(sheetVal);
      var durationArray = calculateAndWriteDuration(startTime, currentTimeStamp, time_elapsed[1]);
      sheet1.getRange(time_elapsed[0] , activeCol).setValue("") //empty startingTime cell

      //update the graph if time elapsed > 2 minutes
      currentTimeStamp - startTime > 120000
      console.log("time elapsed in milliseconds: " + (currentTimeStamp - startTime))
      if (currentTimeStamp - startTime > 120000) {
        updateDataRanges(spreadsheetID, sheetNames[0].dataSheetName, sheetNames[1].targetSheetName, chartDataRanges);
      }
    }

    //Print Statements
    //var amountAdded = convertTimeToOutputForm(durationArray[0],1)
    //var amountAddedDecimal = convertTimeToOutputForm(durationArray[0],2)
    //var newDuration = convertTimeToOutputForm(durationArray[1],1)
    //console.log("Stopped. Added +" + amountAdded + "! ("+ amountAddedDecimal +")\nNew Score: " + newDuration);
    //return ContentService.createTextOutput("Added +" + amountAdded + "! (" + amountAddedDecimal + ")\nNew Score: " + newDuration + "!");
  }

  //This code is for writing the time an app was opened and closing it if it shouldn't have been opened.
  else if (key == "app_closer") {

    var tempString;

    //Write the time that you opened the app
    sheet1.getRange(screentimeTimeStampRow, activeCol).setValue(String(currentTimeStamp).slice(0,24));

    //Allow Blanket Access if whitelist cell is written to within 5 minutes
    if (appLockSettings["quick_unlocker"] == "ON") {
      var whiteListTimestamp = sheet1.getRange(whiteListCell, activeCol).getValues()
      if (whiteListTimestamp != "") {
        whiteListTimestamp = new Date(whiteListTimestamp);
        var whiteListCutoff = new Date (whiteListTimestamp.getTime()+ 5 * 60000) //add 5 minutes to get last milisecond the whitelist is valid for
        
        if (whiteListCutoff > currentTimeStamp) {
          //allow access
          if (whiteListCutoff.getHours() > 12) {
            var whiteListCutoffHours = whiteListCutoff.getHours() - 12
          }
          return ContentService.createTextOutput("Temporarily Unlocked until " + whiteListCutoffHours + ":" + whiteListCutoff.getMinutes() + " % ");
        }
      }
    }

    //morning 2 hour lockout function

    var lockoutBeg = new Date(sheet1.getRange(1, activeCol).getValues());
    var lockoutEnd = new Date(lockoutBeg);

    console.log("lockoutBeg", lockoutBeg)
    console.log("lockoutEnd" , lockoutEnd)

    // get the current hour value and add lockout duration to it
    let hour = lockoutBeg.getHours() + morningAppLockoutDuration;

    // set the new hour value
    lockoutEnd.setHours(hour);

    if (appLockSettings['morning_app_lockout'] == 'ON' && currentTimeStamp < lockoutEnd) { //if the morning lockout end hasn't passed yet, lock app
      if (lockoutEnd.getMinutes() == 0) {
        tempString = "App will unlock at " + lockoutEnd.getHours() + ":" + "00" + "AM";
      }
      else {
        tempString = "App will unlock at " + lockoutEnd.getHours() + ":" + lockoutEnd.getMinutes() + " AM";
      }
      return ContentService.createTextOutput(tempString);
      console.log(tempString)
    }

    //nightly lockout function
    else if (appLockSettings['night_app_lockout'] == 'ON' && areWeInsideTimeSpan(nightAppLockoutStartTime, nightAppLockoutDuration)) {
      if (nextActionSetting == "on" && sheet1.getRange(nextActionRow, activeCol).getValues() == "") {
        tempString = "Apps locked after " + (nightAppLockoutStartTime-12) + "pm.\n" + nextActionMessage;
      } else {
        tempString = "Apps locked after " + (nightAppLockoutStartTime-12) + "pm.\n" + nightAppLockoutMessage;
      }
      console.log(tempString)
      return ContentService.createTextOutput(tempString);
    }
    
    //check for workday planning having been done if after 9am
    if (appLockSettings['workday_planning_lockout'] == 'ON' && currentTimeStamp.getHours() >= appLockSettings['morning_planning_time']) { //this is the ~9AM plan day locker

      //NOTION
      tempString = "Plan your Workday in Notion to Unlock"; //set initial tempstring value
      if (appLockSettings['use_notion_task_ID'] == "ON") {
        if (getNotionTaskState(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planWorkdayID')) == "Complete") {
          tempString = "Complete";
          var workdayTimestamp = getNotionTaskLastCompleted(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planWorkdayID'));

          if (currentTimeStamp.getTime() < (workdayTimestamp.getTime() + 180000)) { //if current time is < completion time + 3 minutes
            var timeToUnlock = workdayTimestamp.getMinutes() + 3 - currentTimeStamp.getMinutes()
            if (timeToUnlock == 0) {return ContentService.createTextOutput("Thanks for Planning Workday!\nApp will unlock within 1 minute.");}
            tempString = "Thanks for Planning Workday!\nApp will unlock in "+ timeToUnlock +" minutes.";
            console.log(tempString)
          }
        }
      }

      //GOOGLE SHEETS SECTION
      if (tempString == "Plan your Workday in Notion to Unlock" && appLockSettings['use_sheets_task_ID'] == "ON") {
        if (sheet1.getRange(appCloserRow, activeCol).getValues() != "") { //if complete on sheet
          tempString = "Complete";
          var workdayTimestamp = new Date (sheet1.getRange(appCloserRow, activeCol).getValues());

          if (currentTimeStamp.getTime() < (workdayTimestamp.getTime() + 180000)) { //if current time is < completion time + 3 minutes
            var timeToUnlock = workdayTimestamp.getMinutes() + 3 - currentTimeStamp.getMinutes()
            if (timeToUnlock == 0) {return ContentService.createTextOutput("Thanks for Planning Workday!\nApp will unlock within 1 minute.");}
            tempString = "Thanks for Planning Workday!\nApp will unlock in "+ timeToUnlock +" minutes.";
            console.log(tempString)
          }
        }
      }
      if (tempString != "Complete") {
        return ContentService.createTextOutput(tempString);
      }
    }

    //if after 3pm, check for personal planning having been done and if you are home
    if (appLockSettings['personal_planning_lockout'] == 'ON' && metrics[0] != undefined) { //no wifi name provided, might not have wifi
      if (currentTimeStamp.getHours() >= appLockSettings['personal_planning_time'] && metrics[0].join('').includes(homeWifiName)) { 

        //NOTION
        tempString = "Plan your Personal Day in Notion to Unlock"; //set initial tempString value
        if (appLockSettings['use_notion_task_ID'] == "ON") {
          if (getNotionTaskState(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planPersonalDayID')) == "Complete") {
            tempString = "Complete"
            var workdayTimestamp = getNotionTaskLastCompleted(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planPersonalDayID'));

            if (currentTimeStamp.getTime() < (workdayTimestamp.getTime() + 180000)) { //if current time is < completion time + 3 minutes
              var timeToUnlock = workdayTimestamp.getMinutes() + 3 - currentTimeStamp.getMinutes()
              if (timeToUnlock == 0) {return ContentService.createTextOutput("Thanks for Planning Personal Day!\nApp will unlock within 1 minute.");}
              tempString = "Thanks for Planning Personal Day!\nApp will unlock in "+ timeToUnlock +" minutes.";
              console.log(tempString)
            }
          }
        }

        //GOOGLE SHEETS SECTION
        if (tempString == "Plan your Personal Day in Notion to Unlock" && appLockSettings['use_sheets_task_ID'] == "ON") { //if tempString has not changed, now look at sheet
          if (sheet1.getRange(personalPlanningRow, activeCol).getValues() != "") { //if complete on sheet
            tempString = "Complete";
            var workdayTimestamp = new Date (sheet1.getRange(personalPlanningRow, activeCol).getValues());

            if (currentTimeStamp.getTime() < (workdayTimestamp.getTime() + 180000)) { //if current time is < completion time + 3 minutes
              var timeToUnlock = workdayTimestamp.getMinutes() + 3 - currentTimeStamp.getMinutes()
              if (timeToUnlock == 0) {return ContentService.createTextOutput("Thanks for Planning Personal Day!\nApp will unlock within 1 minute.");}
              tempString = "Thanks for Planning Personal Day!\nApp will unlock in "+ timeToUnlock +" minutes.";
              console.log(tempString)
            }
          }
        }
        if (tempString != "Complete") {
          return ContentService.createTextOutput(tempString);
        }

      }
    }
    
    //screen time limit lockout section (locks app if time is above the value set here in settings section)
    var cumulativeTime = (convertTimeToMs((sheet1.getRange(cumulativeScreenTimeRow, activeCol).getValues()).toString())/3600000)
    console.log(cumulativeTime)
    if (cumulativeTime >= screenTimeLimit) {

      //output format: "Screen Time is now 2.21h \n App limit has been reached."
      tempString = "Screen Time is now " + cumulativeTime.toFixed(2) + "h\nApp limit has been reached.";
      console.log(tempString)
      return ContentService.createTextOutput(tempString);
    }
    if (screenTimeRationing == "ON") {
      var hoursIntoScreenDay = Math.abs(currentTimeStamp.getHours() + currentTimeStamp.getMinutes()/60 - screenStartTime)
      var currentAllocation = (hoursIntoScreenDay / rationDuration) * screenTimeLimit
      if (cumulativeTime >= currentAllocation) {

        //output in format: "ScreenTime in Cooldown. \n Current: 1.21h vs Allocation: 1.11h
        tempString = "Apps in Cooldown.\nCurrent: " + cumulativeTime.toFixed(2) + "h vs Allocation: " + currentAllocation.toFixed(2) + "h";
        console.log(tempString)
        return ContentService.createTextOutput(tempString);
      }
    }

    //output in format: "Current Wasted Time Today: 1h 21m. \n68% to limit. Allowed"
    tempString = "Total App Time: " + convertHoursToHoursMinutes(cumulativeTime) + " \n" + ((cumulativeTime/screenTimeLimit).toFixed(2))*100 + "% to limit";
    console.log(tempString)
    return ContentService.createTextOutput(tempString);
  }

  if (toggleKey == true) {
    return allMetricSettings
  }

  //write data to sheet
  console.log("allMetricSettings:", allMetricSettings);
  console.log("allMetricSettings[0]:", allMetricSettings[0]);

  try {
    if ((allMetricSettings[0]["recordType"] != 2) || (allMetricSettings[0]["recordType"] == 2 && sheet1.getRange(allMetricSettings[0]["rowNumber"], activeCol).getValues() == "")) {
      sheet1.getRange(allMetricSettings[0]["rowNumber"] , activeCol).setValue(String(currentTimeStamp).slice(0,24)); // write timestamp
    }
    for (let i = 1; i <= metrics.length; i++) {
      console.log("Begin writeDataToSheet function")
      writeDataToSheet(allMetricSettings, metrics, i);
    };

    var tempString = calculateFirstLineMessage();
    for (let i = 0; i < metrics.length+1; i++) {
      if (Math.random() <= allMetricSettings[i]["insightChance"]) {
        if (tempString != "") {
          tempString += "\n";
        }
        if (Math.random() <= allMetricSettings[i]["streakProb"]) {
          var dataRange = sheet1.getRange(allMetricSettings[i]["rowNumber"], 2, 1, activeCol-1).getValues();
          var streakCount = streakCheck(dataRange[0])
          tempString += "streak +1. Now = " + streakCount + " days"; // 2 day streak increased to 3 OR streak +1. Now = 4 days
        }
        else {
          tempString += findPerformanceInsights(allMetricSettings[i], metrics, key);
        }
      }
    }
  }
  catch {return console.log("Error: possibly more parameters given than in metric settings array")}

  if (nextTask == 1) {
    tempString += "\n" + findNextTaskMessage();
  }
  if (firstHabitofDay == 1) { //if this is the first habit scanned, give yesterday's feedback
    console.log("generatingMorningMessage")
    tempString += generateMorningMessage();
  }
  if (nextActionSetting == "on") {
    tempString += nextActionMessage;
  }
  console.log(tempString);
  return ContentService.createTextOutput(tempString);
}

function loadSettings(global_key) {

  key = global_key;

  console.log("loading settings");
  var scriptProperties = PropertiesService.getScriptProperties();
  var config = getAppConfig();

  positive_push_notifications = config.positive_push_notifications; // On/Off

  //screen time features
  screenTimeLimit = config.screenTime.limit; //total limit (hours)
  cumulativeScreenTimeRow = config.screenTime.cumulativeRow;
  screenTimeRationing = config.screenTime.rationing; //"ON" or "OFF", acts like this: if you are 50% through the day, and you are at or above 50% of your screentime, it blocks the app the next time you open the app to "ration" or cooldown your usage until more time has passed
  screenStartTime = config.screenTime.startTime; //24h hour format, used with rationing feature
  rationDuration = config.screenTime.rationDuration; //hours until your access is 100% -> used with rationing feature. Lower number means you get more time allowed earlier in the day
  appLockSettings = Object.assign({}, config.appLockSettings);

  appCloserRow = config.rows.appCloserRow;
  personalPlanningRow = config.rows.personalPlanningRow;
  lateExtension = config.rows.lateExtension; //This sets how many hours into the next day a task will be recorded to the prior one. For example, a value of 4 means tasks recorded up to 4AM will be recorded the prior day.

  homeWifiName = scriptProperties.getProperty(config.scriptProperties.homeWifiName);
  workWifiName = scriptProperties.getProperty(config.scriptProperties.workWifiName);
  lastDepartedWorkCell = config.rows.lastDepartedWorkCell;
  calendarOutput = config.calendarOutput; // ON or OFF used with start stop work to write blocks to calendar
  eventNameInput = config.eventNameInput; // ON or OFF used with start stop work to name blocks after their tasks (ON), or default to "work block" (OFF)

  morningAppLockoutDuration = config.lockout.morningDuration; //how many hours after you wake up you want an app (chosen on phone) to be locked for. For apple automations that automatically close apps.
  nightAppLockoutDuration = config.lockout.nightDuration; //hrs
  nightAppLockoutStartTime = config.lockout.nightStartTime; //24h format of when my apps lock again
  nightAppLockoutMessage = config.lockout.nightMessage;
  whiteListCell = config.rows.whiteListCell; //cell that overrides app lockouts for 5 minutes

  if (config.lockoutOverrides[key]) {
    var lockoutOverride = config.lockoutOverrides[key];
    if (lockoutOverride.screenTimeLimit !== undefined) {
      screenTimeLimit = lockoutOverride.screenTimeLimit;
    }
    if (lockoutOverride.nightAppLockoutStartTime !== undefined) {
      nightAppLockoutStartTime = lockoutOverride.nightAppLockoutStartTime;
    }
    if (lockoutOverride.appLockSettings) {
      Object.keys(lockoutOverride.appLockSettings).forEach(function (settingKey) {
        appLockSettings[settingKey] = lockoutOverride.appLockSettings[settingKey];
      });
    }
    if (lockoutOverride.overrideKey) {
      key = lockoutOverride.overrideKey;
    }
  }


  //the timestamp of the very first nfc recording event for the current day is what you use to gauge when the lockout begins. This happens WHENEVER this script first runs, for any reason. This way, even if you sleep in, you are STILL locked out for an hour. Known vulnerability is waking up in the night before "lateExtension, and triggering a recording, thus when you truly wake up a few hours later you're already run up your duration and it doesn't trigger.

  spreadsheetID = scriptProperties.getProperty(config.scriptProperties.spreadsheetId);
  sheet1 = SpreadsheetApp.openById(spreadsheetID).getSheetByName(config.sheetConfig.trackingSheetName); //replace with your sheet's info
  separatorChar = config.sheetConfig.separatorChar;  // this character should be one that you'll never use. It must match what's in your apple shortcuts. It's "Ù" by default.

  firstLineMessage = config.messages.firstLineMessage;
  firstLineMessageFreq = config.messages.firstLineMessageFreq; //how often you want a randomized first line message from above (0-1)
  originalComparisonArray  = config.messages.originalComparisonArray;
  posPerformanceFreq = config.messages.posPerformanceFreq;   //how often a message output is positive, 0-1 (roughly; actual frequency will be affected by your own performance)
  negPerformanceFreq = config.messages.negPerformanceFreq;     //how often a message output is negative, 0-1
  averageSpan = config.messages.averageSpan;            //how long of a period you want an average value to be calculated from

  sheetNames = config.sheetNames.map(function (sheet) {
    return Object.assign({}, sheet);
  });
  chartDataRanges = config.chartDataRanges.map(function (range) {
    return Object.assign({}, range);
  });

  // NOTE: the allMetricSettings array stores the row number and return message settings for each metric you are recording in a given apple shortcut, as shown below.
  // Keep in mind, all "messages" will come combined into one (1) bulleted list in one (1) single notification per NFC trigger.
  
  /* allMetricSettings CHEATSHEET:

    - [POSITION 0 = dictionary for Metric 0 settings (always the timestamp)
        {rowNumber:         where this metric is in google sheets,
        insightChance:      chance of getting a performance insight at all (use decimal 0-1, 0 = 0% never recieve a message, 1 = 100% always recieve a message), (use 0 for things like text/journal entries that aren't comparable statistics),
        dayToDayChance:     chance the performance insight compares day to day values instead of weekly avg to weekly avg. values. (use decimal 0-1, 0 = 0%, 1 = 100%),
        dayToAvgChance:     if calculating using averages, chance the performance insight compares day to average instead of avg to avg (use decimal 0-1, 0 = 0%, 1 = 100%),
        rawValueChance:     chance the performance insight displays in raw-value changes instead of percentage changes (use decimal 0-1, 0 = 0%, 1 = 100%),
        increaseGood:       whether this metric increasing is good or decreasing is good (1 = increase is good, -1 = decrease is good),
        insightFirstWords:  First text in output message (ie: "Weight: ", "Heart Rate: ", "Run Duration: "),
        insightUnits:       (ie: "Kg", "BPM", "minutes"), 
        unitType:          "timestamp", "minutes", or "number" ("minutes" represents values in "minute:second" format only, for decimal minutes just mark it as a number),
        recordType:         1,2,3 for whether multiple recordings to the same cell should "overwrite", "keep_first_instance", or "add", to whatever is already there, respectively.
      POSITION 1 = dictionary for metric 1 settings (if you have one)
        {rowNumber:
        insightChance:
        dayToDayChance:
        ... etc etc. - the order you list your metrics in these arrays must match the order in which you enter the metrics on your device.
        ] */
         
  //each of these if statements correspond to a specific colored metric block in the google sheet.

  if (key == "next_habit_check") { //OUTDATED: returns what the next habit is. Replaced by positive push notifications v2
    return [];
  }
  if (key == "append_to_notion_inbox") {
    return [];
  }

  if (config.keySettings[key]) {
    applyKeySettings_(config.keySettings[key]);
  }

  if (key == "positive_push_notification" || key == "habit_dashboard") { // enhanced habit chain function -> JAN 27 THIS CAN BE MERGED WITH HABITS. can return what to do, when it is due by, the points you will gain by doing it or lose by not doing it.
    habitChain = config.habitChain.map(function (habit) {
      return Object.assign({}, habit);
    });
  }

  if (key == "fanOnOff" || key == "teslaPortOnOff") {
    var toggleSettings = config.toggleSettings[key];
    activeCol = findactiveCol();
    toggleKey = true;
    return leToggler(0, 1, toggleSettings.dataRow, toggleSettings.onOutput, toggleSettings.offOutput);
  }

  if (config.notifierSettings[key]) {
    nighttime_notifier_settings = config.notifierSettings[key];
  }

  if (config.timeElapsedSettings[key]) {
    var timeElapsedConfig = config.timeElapsedSettings[key];
    if (timeElapsedConfig.arrivedAtWorkCell !== undefined) {
      arrivedAtWorkCell = timeElapsedConfig.arrivedAtWorkCell;
    }
    if (timeElapsedConfig.chartDataRangeIndex !== undefined) {
      chartDataRanges = [chartDataRanges[timeElapsedConfig.chartDataRangeIndex]];
    }
    time_elapsed = timeElapsedConfig.timeElapsed.slice();
    if (timeElapsedConfig.returnType === "time_elapsed") {
      return time_elapsed;
    }
  }

  if (config.noMetricKeys.indexOf(key) !== -1) {
    return [];
  }

  if (config.metricSettings[key]) {
    return resolveMetricSettings_(config.metricSettings[key], config);
  }

  return ContentService.createTextOutput("Invalid Key. Please try again.");
}

function applyKeySettings_(keySettings) {
  if (keySettings.arrivedAtWorkCell !== undefined) {
    arrivedAtWorkCell = keySettings.arrivedAtWorkCell;
  }
  if (keySettings.nextActionSetting !== undefined) {
    nextActionSetting = keySettings.nextActionSetting;
  }
  if (keySettings.nextActionRow !== undefined) {
    nextActionRow = keySettings.nextActionRow;
  }
  if (keySettings.nextActionMessage !== undefined) {
    nextActionMessage = keySettings.nextActionMessage;
  }
  if (keySettings.screentimeTimeStampRow !== undefined) {
    screentimeTimeStampRow = keySettings.screentimeTimeStampRow;
  }
}

function resolveMetricSettings_(metricSettings, config) {
  return metricSettings.map(function (metric) {
    if (metric.rowNumberKey) {
      var resolvedMetric = Object.assign({}, metric);
      resolvedMetric.rowNumber = config.rows[metric.rowNumberKey];
      delete resolvedMetric.rowNumberKey;
      return resolvedMetric;
    }
    return metric;
  });
}

function notionAppendToBlock_(blockId, text, opts) {
  opts = opts || {};
  var as = opts.as || "bulleted_list_item"; // "bulleted_list_item" | "to_do" | "paragraph"
  var checked = !!opts.checked;

  var scriptProperties = PropertiesService.getScriptProperties();

  var notionToken = scriptProperties.getProperty('notionAPIKey');
  var notionVersion = scriptProperties.getProperty('notionVersion') || "2025-09-03";

  if (!notionToken) throw new Error("Missing script property: notionToken");

  // Split newlines so multi-line dictation becomes multiple bullets
  var lines = String(text)
    .split(/\r?\n/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });

  if (lines.length === 0) return;

  var children = lines.map(function (line) {
    return buildNotionChildBlock_(as, line, checked);
  });

  var url = "https://api.notion.com/v1/blocks/" + normalizeNotionId_(blockId) + "/children";

  var res = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: {
      "Authorization": "Bearer " + notionToken,
      "Notion-Version": notionVersion
    },
    payload: JSON.stringify({ children: children })
  });

  var status = res.getResponseCode();
  var body = res.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error("Notion append failed (" + status + "): " + body);
  }
}

function buildNotionChildBlock_(type, content, checked) {
  var rich_text = [{ type: "text", text: { content: content } }];

  if (type === "to_do") {
    return { object: "block", type: "to_do", to_do: { rich_text: rich_text, checked: !!checked } };
  }

  if (type === "paragraph") {
    return { object: "block", type: "paragraph", paragraph: { rich_text: rich_text } };
  }

  // default: bullet
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich_text } };
}

function normalizeNotionId_(id) {
  // Strip hyphens and any non-hex chars; Notion accepts either format
  return String(id).replace(/[^0-9a-fA-F]/g, "");
}


function sendScheduledEmail() {
  // Replace with your own email and desired subject/message
  const recipient = "michaelndickson@gmail.com";
  const subject = "Run Smart Devices Wakeup";
  const body = "This is your scheduled notification from Google Apps Script.";

  // Send the email
  GmailApp.sendEmail(recipient, subject, body);
}

//toggles a value between an off and on value
function leToggler(offValue, onValue, dataRow, onOutput, offOutput) {

  var currentCellVal = sheet1.getRange(dataRow, activeCol).getValue()
  console.log("current status:" + currentCellVal)
  if (currentCellVal == null || currentCellVal == offValue) {
    writeToSheetGeneric(dataRow, onValue, 1)
    console.log(onOutput)
    return ContentService.createTextOutput(onOutput);
  }
  else {
    writeToSheetGeneric(dataRow, offValue, 1)
    console.log(offOutput)
    return ContentService.createTextOutput(offOutput);
  }
}

function updateDashboardSheet(dashboardData) {
  // Get the sheet names from the global variable
  var dashboardSheetName = sheetNames[2].dashboardSheetName;

  // Open the spreadsheet (assuming 'spreadsheetID' is defined)
  var spreadsheet = SpreadsheetApp.openById(spreadsheetID);

  // Get or create the "Dashboard Data" sheet
  var dashboardSheet = spreadsheet.getSheetByName(dashboardSheetName);
  if (!dashboardSheet) {
    dashboardSheet = spreadsheet.insertSheet(dashboardSheetName);
  } else {
    dashboardSheet.clear(); // Clear existing data before updating
  }

  // Prepare the data array with headers
  var dataToWrite = [];
  dataToWrite.push(["Habit", "Streak"]); // Headers
  dataToWrite = dataToWrite.concat(dashboardData); // Add the dashboard data

  // Write all data to the sheet in one call
  dashboardSheet.getRange(1, 1, dataToWrite.length, dataToWrite[0].length).setValues(dataToWrite);

  // Optional: Auto-resize columns for better display
  dashboardSheet.autoResizeColumns(1, 2);
}


function updateDashboardData() {
  // Get the sheet names from the global variable
  var dataSheetName = sheetNames[0].dataSheetName;
  var dashboardSheetName = sheetNames[2].dashboardSheetName;

  // Open the spreadsheet (assuming 'spreadsheetID' is defined)
  var spreadsheet = SpreadsheetApp.openById(spreadsheetID);

  // Get the sheets
  var dataSheet = spreadsheet.getSheetByName(dataSheetName);
  var dashboardSheet = spreadsheet.getSheetByName(dashboardSheetName);

  // Get or create the "Dashboard Data" sheet
  if (!dashboardSheet) {
    dashboardSheet = spreadsheet.insertSheet(dashboardSheetName);
  } else {
    dashboardSheet.clear(); // Clear existing data before updating
  }

  // Set the headers
  dashboardSheet.getRange(1, 1).setValue("Habit");
  dashboardSheet.getRange(1, 2).setValue("Streak");

  const activeCol = dataSheet.getLastColumn(); // Get the last column in the "Tracking Data" sheet

  // Iterate over each habit in the global habitChain
  habitChain.forEach((habit, index) => {
    // Retrieve the data range for each habit's row
    const dataRange = dataSheet.getRange(habit.row, 2, 1, activeCol - 1).getValues()[0];
    const streakCount = streakCheck(dataRange.slice(0, -1), habit.dates); // Calculate streak for the habit

    // Get cell value for today
    const cellValue = dataSheet.getRange(habit.row, activeCol).getValue();
    const completedToday = cellValue !== "";

    // Calculate display streak count
    const displayStreakCount = streakCount + (completedToday ? 1 : 0);

    // Add the habit name and display streak to the "Dashboard Data" sheet
    dashboardSheet.getRange(index + 2, 1).setValue(habit.name); // Habit name
    dashboardSheet.getRange(index + 2, 2).setValue(displayStreakCount); // Display streak count
  });
}




function writeToSheetGeneric(writeCell, data, recordType){

  //if recordtype is 1, overwrite the data
  if (recordType == "1") {
    //write first arrived 
    sheet1.getRange(writeCell, activeCol).setValue(data)
  }

  // else keep first instance
  else {
    //if the cell is empty
    if (sheet1.getRange(writeCell, activeCol).getValue() == "") { //need to be gotten rid of here
      //write first arrived 
      sheet1.getRange(writeCell, activeCol).setValue(data)
    }
  }
}

function areWeInsideTimeSpan(startHour, hourDuration) {
  currentHourDecimal = currentTimeStamp.getHours() + currentTimeStamp.getMinutes()/60;

  var endHour = startHour + hourDuration;
  if (endHour >= 24) {
    endHour -= 24; //Adjust for times past midnight
  }

  if (startHour <= currentHourDecimal && currentHourDecimal < endHour) { 
    return true // Current time is within the lockout period
  } else if (endHour < startHour && (currentHourDecimal >= startHour || currentHourDecimal < endHour)) {
    return true // Handle overnight period that crosses midnight
  } else {
    return false; // Current time is outside the lockout period
  }
}

function shouldLockApps(nightAppLockoutStartHour, nightAppLockoutDuration) {
    var now = new Date();
    var currentHourDecimal = now.getHours() + now.getMinutes() / 60;
    
    var lockoutEndHour = nightAppLockoutStartHour + nightAppLockoutDuration;
    if (lockoutEndHour >= 24) {
        lockoutEndHour -= 24;  // Adjust for times past midnight
    }

    if (nightAppLockoutStartHour <= currentHourDecimal && currentHourDecimal < lockoutEndHour) {
        return true; // Current time is within the lockout period
    } else if (lockoutEndHour < nightAppLockoutStartHour && (currentHourDecimal >= nightAppLockoutStartHour || currentHourDecimal < lockoutEndHour)) {
        return true; // Handle overnight period that crosses midnight
    } else {
        return false; // Current time is outside the lockout period
    }
}


function findNextTaskMessage() {
  for (let i = habitOrders.length; i > 0; i--) {
    if (sheet1.getRange(habitOrders[i-1][0], activeCol).getValues() != "") {
      if (i == habitOrders.length) {
        return "";
      }
      else {
        return habitOrders[i-1][1];
      }
    }
  }
  return "next -> Tap first NFC";
}

function generateMorningMessage() {
  if (sheet1.getRange(tomorrowGoalRow, activeCol-1).getValues() != "") {
    var tempString = "\n\n" + "📈 Today's Goals 📈"
    tempString += "\n" + "• " + sheet1.getRange(tomorrowGoalRow, activeCol-1).getValues() + " " + thewhyoftoday;
    return tempString;
  }
  else {
    return "\n\n" + "complete nightly review to unlock morning summaries"
  }
}

function calculateFirstLineMessage() {
  if (Math.random() <= firstLineMessageFreq) {
    return (shuffle(firstLineMessage))[0];
  }
  else {
    return "";
  }
}

function findactiveCol() {
  var today = (new Date());
  var lastCol = sheet1.getLastColumn();
  //console.log("value in sheet: " + String(sheet1.getRange(1,lastCol).getValues()).slice(0,15) + " vs value of today's date: " + today)

  if (String(sheet1.getRange(1,lastCol).getValues()).slice(0,15) == String(today).slice(0,15)) { //if the last column written to is today, then that col is today.
    return lastCol;
  }

  else { 
    if (today.getHours() < lateExtension) { //if current hour is before the late exension, act like it's the same day
      return lastCol;
    }
    else {
      sheet1.getRange(1,lastCol+1).setValue(String(today).slice(0,24)); //otherwise, it's a new day. Make a new date column, and set activeCol to it.
      firstHabitofDay = 1;
    }
    return lastCol+1;
  }
}

function writeDataToSheet(allMetricSettings, metrics, i) {
  console.log("record type == " + allMetricSettings[i]["recordType"])
  console.log("current value in sheet: " + sheet1.getRange(allMetricSettings[i]["rowNumber"], activeCol).getValues())
  //console.log('writing data to: ' + key)
  if (allMetricSettings[i]["recordType"] == 1) {
      sheet1.getRange(allMetricSettings[i]["rowNumber"] , activeCol).setValue(metrics[i-1].join(""));
  }
  else if (allMetricSettings[i]["recordType"] == 2 && sheet1.getRange(allMetricSettings[i]["rowNumber"], activeCol).getValues() == "") {
    console.log("writing: " + (metrics[i-1].join("")) + "to row: " + allMetricSettings[i]["rowNumber"] + " col: " + activeCol)
    sheet1.getRange(allMetricSettings[i]["rowNumber"] , activeCol).setValue(metrics[i-1].join(""));
  }
  else if (allMetricSettings[i]["recordType"] == 3) { //this may not work
    var existingVal = sheet1.getRange(allMetricSettings[i]["rowNumber"], activeCol).getValues();
    sheet1.getRange(allMetricSettings[i]["rowNumber"] , activeCol).setValue(metrics[i-1]+existingVal);
    }
return;

}

function findPerformanceInsights(metricSettings, metrics, key, dataRange = [], foundNegativeComp = 0, foundPositiveComp = 0) {
  
  var comparisonArray = originalComparisonArray.slice();

  //validate that the settings have been inputted correctly
  var validSettings = checkSettings(metricSettings);
  if (validSettings != 1) {
    return validSettings;
  }

  //validate that enough data even exists to make a comparison possible
  if (activeCol < 3) {
    //return "no prior data to compare to. Complete this task tomorrow for new performance insights!";
    return "Well done! Complete this tomorrow for new performance insights.";
  }
  else if (metricSettings["dayToDayChance"] < 1 && metricSettings["dayToDayChance"] > 0 && activeCol - averageSpan+1 < 2) {
    metricSettings["dayToDayChance"] = 1;
  }
  else if (metricSettings["dayToDayChance"] == 0 && activeCol - averageSpan+1 < 2) {
    return "Nice job! Not enough data to compare averages yet.";
  }

  //if this is our first iteration
  if (dataRange.length == 0) {
    console.log("running findPerformanceInsights with: " + metricSettings["insightFirstWords"]);
    dataRange = sheet1.getRange(metricSettings["rowNumber"], 2,1, activeCol-1).getValues()[0];
    var chooseChance = Math.round(1/maxPossibleComparisons(metricSettings, avgBool=0)*100)/100;
  }
  //else this function has already run once and found a valid comparison it didn't choose (we're in recursion #1), so set it to randomly choose the first valid comparison it finds
  else {
    var chooseChance = 1;
    comparisonArray  = shuffle(comparisonArray);
    posPerformanceFreq = 1;
    negPerformanceFreq = 1;
  }

  //by default, I've set it to have an equal chance of picking ANY possible comparison by increasing chooseChance as it iterates. To make comparisons trend more recent, you could add more recent comparisons to the comparisonArray
  var todaysValue;
  var compValue;
  var compColumn;

  //if calculating day vs day values (not avg)
  if (Math.random() <= metricSettings["dayToDayChance"]) {

    todaysValue = turnToNumber(metricSettings, dataRange[activeCol-2]); //should be the last element in the array

    //iterate through all possible comparisons
    for (let i = 0; i < comparisonArray.length; i++) {

      //validate comparison is possible and grab number
      var compColumn = activeCol - comparisonArray[i][0];
      if (compColumn > 1 && compColumn < activeCol) {

        if (chooseChance != 1) {
          chooseChance = (chooseChance / (1-chooseChance)); //chances need to go up each time
        }

        compValue = turnToNumber(metricSettings, dataRange[activeCol-2-comparisonArray[i][0]]); //  ASDF;LKJASDF;LKAJSDF;LKJASDF;LKJASDF;LKJASD;FLKJASD

        if (compValue > 0) {
          //positive vs negative message readout
          if ((todaysValue-compValue)*metricSettings["increaseGood"] > 0) {
            foundPositiveComp = 1;
            if (Math.random() <= posPerformanceFreq*chooseChance) {
              return metricSettings["insightFirstWords"] + " " + findMessageValue(metricSettings, todaysValue, compValue) + " vs " + comparisonArray[i][1] + "!" //generate positive day vs day message
            }
          }
          else if ((todaysValue-compValue)*metricSettings["increaseGood"] <= 0) {
            foundNegativeComp = 1;
            if (Math.random() <= negPerformanceFreq*chooseChance) {
              return metricSettings["insightFirstWords"] + " " + findMessageValue(metricSettings, todaysValue, compValue) + " vs " + comparisonArray[i][1] + " " //generate negative day vs day message
            }
          }
        }
      }
    }
  }
  
  //else calculating avg values
  else {

    //find the value for today (whether today or average of span)
    if (Math.random() <= metricSettings["dayToAvgChance"]) {
      todaysValue = turnToNumber(metricSettings, dataRange[activeCol-2]);
      var messageModifier = "today";
    }
    else {
      todaysValue = getAverage(turnArrayToNumbers(metricSettings, dataRange.slice([activeCol-2-averageSpan+1], [activeCol-2+1])));
      var messageModifier = "this " + averageSpan + " day span";
    }

    //iterate through all possible comparisons
    for (let i = 0; i < comparisonArray.length; i++) {

      //validate comparison is possible and grab number
      var compColumn = activeCol - comparisonArray[i][0];
      if ((compColumn - averageSpan+1) >= 2 && compColumn < activeCol) {
        
        if (chooseChance != 1) {
          chooseChance = (chooseChance / (1-chooseChance)); //chances need to go up each time
        }

        compValue = getAverage(turnArrayToNumbers(metricSettings, dataRange.slice([activeCol-2-comparisonArray[i][0]-averageSpan+1], [activeCol+1-2-comparisonArray[i][0]])));

        if (compValue != 0) { //if comp is 0 it's probably an empty range

          //positive vs negative message readout
          if ((todaysValue-compValue)*metricSettings["increaseGood"] > 0) {
            foundPositiveComp = 1;
            if (Math.random() <= posPerformanceFreq*chooseChance) {
              return metricSettings["insightFirstWords"] + " " + findMessageValue(metricSettings, todaysValue, compValue) + " " + messageModifier + " vs " + averageSpan + " day span concluding " + comparisonArray[i][1] + "!" //generate positive avg vs avg message
            }
          }
          else if ((todaysValue-compValue)*metricSettings["increaseGood"] <= 0) {
            foundNegativeComp = 1;
            if (Math.random() <= negPerformanceFreq*chooseChance) {
              return metricSettings["insightFirstWords"] + " " + findMessageValue(metricSettings, todaysValue, compValue) + " " + messageModifier + " vs " + averageSpan + " day span concluding " + comparisonArray[i][1] + " " //generate negative avg vs avg message
            }
          }
        }
      }
    }
  }
  //if no possible comparisons exist
  if (foundNegativeComp == 0 && foundPositiveComp == 0) {
    return "Complete tomorrow for new performance comparisons!"
  }
  //else if the type of comparison you wanted (positive or negative) doesn't exist
  else if ((foundPositiveComp == 0 && negPerformanceFreq == 0) || foundNegativeComp == 0 && posPerformanceFreq == 0) {
    return "";
    
  }
  else {
    console.log("----no comparisons chosen, running again-----")
    return findPerformanceInsights(metricSettings, metrics, key, dataRange, foundNegativeComp, foundPositiveComp);
  }
}

// Returns the length of the most recent habit "streak" given a range of values
// Optionally accepts allowedDays as an array (e.g., ["Monday", "Wednesday", "Friday"]) for habits that aren't daily.
function streakCheck(dataRange, allowedDays = null) {
  //console.log(dataRange);
  var streakCount = 0;
  var today = new Date();

  // Loop through values backward in the range
  for (let i = dataRange.length - 1; i >= 0; i--) {
    // Check if allowedDays is specified and the current day matches
    if (allowedDays) {
      // Calculate the day of the week for the current index in the range
      var checkDate = new Date(today.getTime() - (dataRange.length - 1 - i) * 24 * 60 * 60 * 1000);
      var dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long' });

      // If the day is not in allowedDays, skip without breaking the streak
      if (!allowedDays.includes(dayName)) {
        continue;
      }
    }

    // Break the streak if a value is not found
    if (dataRange[i] == "" || dataRange[i] == " " || dataRange[i] == "NO" || dataRange[i] == 0) {
      return streakCount;
    }

    // Increment streak if the day matches or if no allowedDays are specified
    streakCount += 1;
  }
  
  return streakCount;
}


//All functions below are helpers for findPerformanceInsights() 
function createMetricsArray(metrics) {

  var tempMetrics = [];
  var index = 0;
  var metricLength = 0;
  var newWord = 1;

  for (let i = 0; i < metrics.length; i++) {

    if (metrics[i] == separatorChar) {
      if (tempMetrics[0]) {
        if (metrics[i-1] != separatorChar) {
          index++;
          metricLength = 0;
          newWord = 1;
        }
      }
    }
    else {

      if (newWord == 1) {
        tempMetrics.push([]);
        newWord = 0;
      }
      tempMetrics[index][metricLength]=(metrics[i]);
      metricLength++;
    }

  }

  return tempMetrics;
}

function mapCompArrayToDates () {
  var temp = [];
  //known issue: at present, when it averages "the last 7 days", etc, it's really averaging "the last 7 dates/columns", which means if you forgot a day, it's averaging data from 8 DAYS ago, not 7.
  //fixing this is tough though, because of all the edge cases. What if a span of days is missing one in the middle? etc, etc.
  //will leave as is for now.

  //WHAT happens if the date you're looking to compare against doesn't exist in the sheet?
  //you simply delete it from the comparison array
  //you have two incrementers, one that increments the comparison array and one that increments the date column
  //each cycle increments the date column (i)
  //  if date at i == activeCol-comparisonArray[x]
  //    x++ and move on.
  //  if the date is bigger than the date that should be there.... how do you even do this???
  //grab the date row between activeCol and 1
  //tturn the whole row into numbers
  //compare that number to the current number
  //meanwhile also keep track of how many rows away you are currently looking
  //1. turn the dates to numbers
  return temp;
}

function shuffle(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

function getAverage (ourArray) {
  var total = 0;
  var blankCount = 0;
  for (let i = 0; i < ourArray.length; i++) {
    if (ourArray[i] < 0 || ourArray[i] > 0) {
      total += ourArray[i];
    }
    else { //we have a blank cell
      blankCount += 1;
    }
  }
  if (blankCount == ourArray.length) {
    return "";
  }
  return total / (ourArray.length-blankCount);
}

function checkSettings(metricSettings){
  if (metricSettings["dayToDayChance"] > 1 || metricSettings["dayToDayChance"] < 0) {
    return "error: dayToDayChance value in "+ metricSettings["insightFirstWords"] + " (in code) is not between 0 and 1";
  }
  if (metricSettings["rawValueChance"] > 1 || metricSettings["rawValueChance"] < 0) {
    return "error: rawValueChance value in "+ metricSettings["insightFirstWords"] + " (in code) is not between 0 and 1";
  }
  if (metricSettings["increaseGood"] != 1 && metricSettings["increaseGood"] != -1) {
    return "error: increaseGood value in "+ metricSettings["insightFirstWords"] + " (in code) is not -1 or 1";
  }
  if (metricSettings["unitType"] != "timestamp" && metricSettings["unitType"] != "minutes" && metricSettings["unitType"] != "number") {
    return "error: unitType value in "+ metricSettings["insightFirstWords"] + " (in code) is not valid";
  }
  else {
    return 1;
  }
}

function turnToNumber (metricSettings, cellValue) {

  if (metricSettings["unitType"] == "timestamp") {
    cellValue = (new Date(cellValue)).toLocaleTimeString('en-US' , { hour12: false });

    // Needs to convert this: 11:12:40 into minutes.
    cellValue = cellValue.split(":");
    var minutes = parseFloat(cellValue[0])*60 + parseFloat(cellValue[1]) + parseFloat(cellValue[2])/60;
    return minutes;
  }

  //this is expecting decimal minutes
  else if (metricSettings["unitType"] == "minutes") {

    //Needs to convert this: 11:12:40 into minutes.
    cellValue = cellValue.split(":");
    var minutes = parseFloat(cellValue[0])*60 + parseFloat(cellValue[1]) + parseFloat(cellValue[2])/60;
    return minutes;
  }
  else {
    return cellValue;
  }
}

function turnArrayToNumbers (metricSettings, ourArray) {
  var temp = [];
  //console.log("turning to numbers: "+ourArray);
  for (let i = 0; i < ourArray.length; i++) {
    temp[i] = turnToNumber(metricSettings, ourArray[i]);
  }
  return temp;
}

function isArrayEmpty (ourArray) {
  var emptyArray = 1;
  for (let i = 0; i < ourArray.length; i++) {
    if (ourArray[i] != 0) {
      emptyArray = 0;
    }
  }
  return emptyArray;
}

function maxPossibleComparisons (metricSettings, avgBool) {

  if (avgBool == 0) {
    var span = 0;
  }
  else {
    var span = averageSpan-1;
  }
  for (let i = 0; i < originalComparisonArray.length; i++) {
    if (activeCol - originalComparisonArray[i][0]-span < 2) {
      return i;
    }
  }
  return originalComparisonArray.length;
}

function findMessageValue (metricSettings, todaysValue, compValue) { 

  //if it's a minute output over 60, make it hours
  if (metricSettings["insightUnits"] == "minutes" && (todaysValue-compValue > 60 || compValue-todaysValue > 60)) {
    metricSettings["insightUnits"] = "hours";
    todaysValue = todaysValue/60;
    compValue = compValue/60;
  }

  //calculate performance message
  if (Math.random() <= metricSettings["rawValueChance"]) {
    if (todaysValue-compValue > 0) {
      return "+" + (Math.round((todaysValue-compValue)*100)/100).toString() + " " + metricSettings["insightUnits"];
    }
    else {
      return (Math.round((todaysValue-compValue)*100)/100).toString() + " " + metricSettings["insightUnits"];
    }
  }
  else {
    if (todaysValue-compValue > 0) {
      return "+" + (Math.round(((todaysValue/compValue -1)*100)*100)/100).toString() + "%";
    }
    else {
      return (Math.round(((todaysValue/compValue -1)*100)*100)/100).toString() + "%";
    }
  }
}

function getCurrentHour() {
  const now = new Date();
  const currentHour = now.getHours();
  //Logger.log(currentHour); // Logs the current hour in 24-hour format to the Google Apps Script log
  return currentHour;
}







// Function to check the number of tasks that match specific criteria
function notionTaskLocationChecker(apiKey, databaseID, location) {
  const NOTION_API_KEY = apiKey;
  const DATABASE_ID = databaseID;

  let tasks = [];
  let hasNextPage = true;
  let startCursor = null;
  let matchCount = 0;

  while (hasNextPage) {
    // Fetch task data from Notion API with filters
    const fetchUrl = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
    const fetchPayload = {
      filter: {
        and: [
          {
            property: 'Location',
            multi_select: {
              contains: location
            }
          },
          {
            property: 'State',
            status: {
              does_not_equal: 'Complete'
            }
          },
          {
            property: 'State',
            status: {
              does_not_equal: 'Archived'
            }
          },
          {
            property: 'State',
            status: {
              does_not_equal: 'Yes but Not Now'
            }
          },
          {
            property: 'State',
            status: {
              does_not_equal: 'Maybe Someday'
            }
          },
          {
            or: [
              {
                property: 'Due',
                date: {
                  is_empty: true
                }
              },
              {
                property: 'Due',
                date: {
                  on_or_before: new Date().toISOString()
                }
              }
            ]
          },
          {
            property: 'Dependency Status',
            formula: {
              string: {
                does_not_equal: '🔴Dependant'
              }
            }
          },
          {
            property: 'Project State',
            rollup: {
              any: {
                status: {
                  does_not_equal: 'Complete'
                }
              },
              any: {
                status: {
                  does_not_equal: 'Archived'
                }
              },
              any: {
                status: {
                  does_not_equal: 'Maybe Someday'
                }
              }
            }
          }
        ]
      }
    };

    if (startCursor) {
      fetchPayload.start_cursor = startCursor;
    }

    const fetchParams = {
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2021-08-16",
        "Content-Type": "application/json"
      },
      method: 'POST',
      payload: JSON.stringify(fetchPayload),
      muteHttpExceptions: true
    };

    const fetchResponse = UrlFetchApp.fetch(fetchUrl, fetchParams);
    Logger.log(fetchResponse.getContentText()); // Debugging line to log full response

    const jsonResponse = JSON.parse(fetchResponse.getContentText());

    tasks = tasks.concat(jsonResponse.results);

    if (jsonResponse.has_more) {
      startCursor = jsonResponse.next_cursor;
    } else {
      hasNextPage = false;
    }
  }

  matchCount = tasks.length;

  Logger.log(`Number of matching tasks: ${matchCount}`);
  return matchCount;
}







// Function to check the number of tasks that match specific criteria. VERY slow, as it has notion return back EVERY item here, rather than having notion itself search
function notionTaskLocationCheckerOLD(apiKey, databaseID, location) {
  const NOTION_API_KEY = apiKey;
  const DATABASE_ID = databaseID;

  let tasks = [];
  let hasNextPage = true;
  let startCursor = null;
  let matchCount = 0;

  while (hasNextPage) {
    // Fetch task data from Notion API
    const fetchUrl = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
    const fetchParams = {
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2021-08-16",
        "Content-Type": "application/json"
      },
      method: 'POST',
      payload: startCursor ? JSON.stringify({ start_cursor: startCursor }) : null
    };

    const fetchResponse = UrlFetchApp.fetch(fetchUrl, fetchParams);
    const jsonResponse = JSON.parse(fetchResponse.getContentText());

    tasks = tasks.concat(jsonResponse.results);

    if (jsonResponse.has_more) {
      startCursor = jsonResponse.next_cursor;
    } else {
      hasNextPage = false;
    }
  }

  tasks.forEach((task) => {
    try {
      const taskName = task.properties.Name && task.properties.Name.title && task.properties.Name.title[0] ? task.properties.Name.title[0].plain_text : null;
      if (!taskName) {
        Logger.log('Skipping task due to missing name');
        return;
      }

      const projectState = task.properties["Project State"] && task.properties["Project State"].rollup && task.properties["Project State"].rollup.array[0] ? task.properties["Project State"].rollup.array[0].name : null;
      const dueDate = task.properties.Due && task.properties.Due.date ? new Date(task.properties.Due.date.start) : null;
      const dependencyStatus = task.properties["Dependency Status"] && task.properties["Dependency Status"].formula ? task.properties["Dependency Status"].formula.string : null;
      const state = task.properties.State && task.properties.State.status ? task.properties.State.status.name : null;
      const locationProperty = task.properties.Location && task.properties.Location.multi_select ? task.properties.Location.multi_select.map(loc => loc.name) : [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dueDate) dueDate.setHours(0, 0, 0, 0);

      // Check each condition and log the result
      if (projectState !== 'Complete' && projectState !== 'Archived' && projectState !== 'Maybe Someday') {
        //Logger.log(`Task ${taskName} passed Project State check`);
        
        if (!dueDate || dueDate <= today) {
          //Logger.log(`Task ${taskName} passed Due date check`);
          
          if (dependencyStatus !== '🔴Dependant') {
            //Logger.log(`Task ${taskName} passed Dependency Status check`);
            
            if (state !== 'Complete' && state !== 'Archived' && state !== 'Yes but Not Now' && state !== 'Maybe Someday') {
              //Logger.log(`Task ${taskName} passed State check`);
              
              if (locationProperty.includes(location)) {
                Logger.log(`Task ${taskName} passed ALL checks`);
                
                // Increment match count if all checks passed
                matchCount += 1;
              } else {
                //ogger.log(`Task ${taskName} failed Location check`);
              }
            } else {
              //Logger.log(`Task ${taskName} failed State check`);
            }
          } else {
            //Logger.log(`Task ${taskName} failed Dependency Status check`);
          }
        } else {
          //Logger.log(`Task ${taskName} failed Due date check`);
        }
      } else {
        //Logger.log(`Task ${taskName} failed Project State check`);
      }
    } catch (error) {
      Logger.log(`Skipping task due to error: ${error.message}, Task ID: ${task.id}`);
    }
  });

  Logger.log(`Number of matching tasks: ${matchCount}`);
  return matchCount;
}






function setNotionTaskStateTESTER() { //tests all task IDs
  var scriptProperties = PropertiesService.getScriptProperties();
  setNotionTaskState(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planWorkdayID'), "Active")
  setNotionTaskState(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planPersonalDayID'), "Complete")
}

// Function to update the state of a specific Notion task by its ID
function setNotionTaskState(apiKey, taskID, newState) {
  // Set up headers for authorization and content type
  var headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28' // Replace with the current Notion API version
  };

  // Make PATCH request to Notion API to update the task state
  var updateUrl = 'https://api.notion.com/v1/pages/' + taskID;
  var updateParams = {
    headers: headers,
    method: 'PATCH',
    payload: JSON.stringify({
      "properties": {
        "State": { "status": { "name": newState } }
      }
    })
  };

  var response = UrlFetchApp.fetch(updateUrl, updateParams);
  var responseData = JSON.parse(response.getContentText());

  console.log('Updated State to: ' + newState);
  return responseData;
}


function getNotionTaskLastCompletedTESTER() { //tests all task IDs
  var scriptProperties = PropertiesService.getScriptProperties();
  getNotionTaskLastCompleted(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planWorkdayID'))
  getNotionTaskLastCompleted(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planPersonalDayID'))
}

// Function to fetch the "Last Completed" timestamp of a specific Notion task by its ID
function getNotionTaskLastCompleted(apiKey, taskID) {
  // Set up headers for authorization and content type
  var headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28' // Replace with the current Notion API version
  };

  // Make GET request to Notion API
  var response = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + taskID, {
    headers: headers
  });

  // Parse response JSON
  var task = JSON.parse(response.getContentText());

  try {
    // Access and return the "Last Completed" timestamp
    if (task.properties && task.properties['Last Completed'] && task.properties['Last Completed'].date) {
      var lastCompleted = new Date(task.properties['Last Completed'].date.start);
      console.log('Last Completed on: ' + lastCompleted.toISOString()); // Print the date in ISO format
      return lastCompleted;
    } else {
      console.log('Last Completed timestamp not found for task ID: ' + taskID);
      return null; // Handle as needed if the property is not found
    }
  } catch (error) {
    console.error('Error fetching Last Completed timestamp:', error);
    return null; // Handle the error appropriately
  }
}

function getNotionTaskStateTESTER() { //tests all task IDs
  var scriptProperties = PropertiesService.getScriptProperties();
  getNotionTaskState(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planWorkdayID'))
  getNotionTaskState(scriptProperties.getProperty('notionAPIKey') , scriptProperties.getProperty('planPersonalDayID'))
}

function getNotionTaskState(apiKey, taskID) { // fetches the state of a specific Notion task by its ID
  // Set up headers for authorization and content type
  var headers = {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28' // Replace with the current Notion API version
  };

  // Make GET request to Notion API
  var response = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + taskID, {
    headers: headers
  });

  // Parse response JSON
  var task = JSON.parse(response.getContentText());
  //console.log(task);

  //ACCESS PROPERTIES TO GET STATE
  try {
      //Logger.log(`Now looking at: ${task.properties.Name.title[0].plain_text}`)
    }
    catch {}
    //Ignore if name field is empty
    if (
      !task || 
      !task.properties || 
      !task.properties.Name || 
      !task.properties.Name.title || 
      task.properties.Name.title.length === 0 || 
      !task.properties.Name.title[0].plain_text
    ) {
      console.log("Skipping task due to null or undefined Name.");
      return;
    }

    if (task.properties.State) {
      console.log(task.properties.Name.title[0].plain_text + ': ' + task.properties.State.status.name);
      return task.properties.State.status.name;
    } 
}


function updateALLRecurringTasksNotion() {

  //fetch script properties
  var scriptProperties = PropertiesService.getScriptProperties();

  console.log("\nresetting Michael's notion tasks\n\n")
  updateRecurringTasksNotion(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('personalNotionTaskDatabaseID')) //work
  console.log("\nresetting Sierra Mille notion tasks\n\n")
  updateRecurringTasksNotion(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('workNotionTaskDatabaseID'))
  console.log("\nresetting Don't Thread on Me notion tasks\n\n")
  updateRecurringTasksNotion(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('DToMNotionTaskDatabaseID'))

  console.log("\nresetting ArmorSource notion tasks\n\n")
  updateRecurringTasksNotion(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('ArmorSourceTaskDatabaseID'))
  console.log("\nresetting Terry (341) notion tasks\n\n")
  updateRecurringTasksNotion(scriptProperties.getProperty('notionAPIKey'), scriptProperties.getProperty('341NotionTaskDatabaseID'))
}

function updateRecurringTasksNotion(apiKey, databaseID) {
  const NOTION_API_KEY = apiKey;
  const DATABASE_ID = databaseID;

  // Define the filter to get only completed recurring tasks
  const filter = {
    "filter": {
      "and": [
        {
          "property": "State",
          "status": {
            "equals": "Complete"
          }
        },
        {
          "property": "Recur Interval",
          "number": {
            "is_not_empty": true
          }
        },
        {
          "property": "Due",
          "date": {
            "is_not_empty": true
          }
        }
      ]
    }
  };

  let tasks = [];
  let hasNextPage = true;
  let startCursor = null;

  while (hasNextPage) {
    // Fetch filtered task data from Notion API
    const fetchUrl = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
    const fetchPayload = startCursor ? { ...filter, start_cursor: startCursor } : filter;
    
    const fetchParams = {
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2021-08-16",
        "Content-Type": "application/json"
      },
      method: 'POST',
      payload: JSON.stringify(fetchPayload),
      muteHttpExceptions: true
    };

    const fetchResponse = UrlFetchApp.fetch(fetchUrl, fetchParams);
    //Logger.log(fetchResponse.getContentText()); // Debugging line to log full response

    const jsonResponse = JSON.parse(fetchResponse.getContentText());

    tasks = tasks.concat(jsonResponse.results);

    if (jsonResponse.has_more) {
      startCursor = jsonResponse.next_cursor;
    } else {
      hasNextPage = false;
    }
  }

  var itemCount = 0;
  var resetCount = 0;
  console.log("Total filtered tasks: ", tasks.length);

  tasks.forEach((task) => {
    try {
      Logger.log(`Now looking at: ${task.properties.Name.title[0].plain_text}`);
    } catch { }
    itemCount += 1;

    const dueDate = task.properties.Due.date ? new Date(task.properties.Due.date.start) : null;
    const today = new Date();

    // Set the time to midnight for a fair comparison
    today.setHours(0, 0, 0, 0);
    if (dueDate) dueDate.setHours(0, 0, 0, 0);

    if (!dueDate || dueDate <= today) {
      const nextDue = task.properties['Next Due'].formula.date?.start; // Find "next due" value, assuming this is a date string
      const nextDueDate = new Date(nextDue); // Convert 'October 16, 2023' format to a Date object

      // Check if nextDueDate is a valid date
      if (isNaN(nextDueDate.getTime())) {
        Logger.log(`Skipping: ${task.properties.Name.title[0].plain_text} due to invalid Next Due date.`);
        Logger.log(task.properties['Next Due'])
        return;
      }

      // Convert the Date object to ISO 8601 string
      const nextDueISO = nextDueDate.toISOString();

      // Update task data in Notion
      Logger.log(`UPDATING TASK: ${task.properties.Name.title[0].plain_text}`);
      resetCount += 1;
      const updateUrl = `https://api.notion.com/v1/pages/${task.id}`;
      const updateParams = {
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": "2021-08-16",
          "Content-Type": "application/json"
        },
        method: 'PATCH',
        payload: JSON.stringify({
          "properties": {
            "State": { "status": { "name": "On Deck" } },
            "Due": { "date": { "start": nextDueISO } }
          }
        })
      };

      UrlFetchApp.fetch(updateUrl, updateParams);
    }
  });
  console.log("Reset Completed. ", itemCount, "items passed, ", resetCount, "resets made.");
}


function convertTimeToOutputForm(time, outputStyle) {
  hours = parseInt(time.slice(0, 2));
  minutes = parseInt(time.slice(3, 5));

  console.log("hours" + hours);
  console.log("minutes" + minutes);

  let timeString;

  //for outputs like: "1h 4min!"
  if (outputStyle == 1) {
    if (hours == 0) {
      timeString = minutes.toString() + "min";
    } else {
      timeString = hours.toString() + "h " + minutes.toString() + "min";
    }
  }
  //for outputs like: "1.03h"
  else if (outputStyle == 2) {
    timeString = (hours + (minutes / 60)).toFixed(2) + "h";
  }
  //for output like "1.04h"
  else {
    if (hours == 0) {
      timeString = minutes + "min";
    } else {
      hours += minutes / 60;
      timeString = hours.toFixed(2) + "h";
    }
  }
  return (timeString);
}


//NOTE: this function sets [due = next due], and [state = On Deck] for completed recurring tasks only.
function updateRecurringTasksNotionOLD(apiKey, databaseID) {

  const NOTION_API_KEY = apiKey;
  const DATABASE_ID = databaseID;

  let tasks = [];
  let hasNextPage = true;
  let startCursor = null;
  
  while (hasNextPage) {
    // Fetch task data from Notion API
    const fetchUrl = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
    const fetchParams = {
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2021-08-16",
        "Content-Type": "application/json"
      },
      method: 'POST',
      payload: startCursor ? JSON.stringify({ start_cursor: startCursor }) : null
    };

    const fetchResponse = UrlFetchApp.fetch(fetchUrl, fetchParams);
    const jsonResponse = JSON.parse(fetchResponse.getContentText());
    
    tasks = tasks.concat(jsonResponse.results);
    
    if (jsonResponse.has_more) {
      startCursor = jsonResponse.next_cursor;
    } else {
      hasNextPage = false;
    }
  }
  
  var itemCount = 0;
  var resetCount = 0;
  console.log("total database items shared with us: ", tasks.length)
  
  tasks.forEach((task) => {
    try {
      Logger.log(`Now looking at: ${task.properties.Name.title[0].plain_text}`)
    }
    catch {}
    itemCount += 1;
    //Ignore if name field is empty
    if (
      !task || 
      !task.properties || 
      !task.properties.Name || 
      !task.properties.Name.title || 
      task.properties.Name.title.length === 0 || 
      !task.properties.Name.title[0].plain_text
    ) {
      console.log("Skipping task due to null or undefined Name.");
      return;
    }

    if (task.properties["Recur Interval"].number === null) {
      Logger.log(`Skipping: ${task.properties.Name.title[0].plain_text} due to empty Recur Interval.`);
      return;
    }

    if (task.properties.Due.date === null) {
      Logger.log(`Skipping: ${task.properties.Name.title[0].plain_text} due to empty Due date.`);
      return;
    }

    if (task.properties.State && task.properties.State.status.name == 'Complete') {
      
      Logger.log(`IDENTIFIED: ${task.properties.Name.title[0].plain_text} IS COMPLETE.`)
      const dueDate = task.properties.Due.date ? new Date(task.properties.Due.date.start) : null;
      const today = new Date();
      
      // Set the time to midnight for a fair comparison
      today.setHours(0, 0, 0, 0);
      if (dueDate) dueDate.setHours(0, 0, 0, 0);
      
      if (!dueDate || dueDate <= today) {
        const nextDue = task.properties['Next Due'].formula.string; // Find "next due" value, assuming this is a date string
        const nextDueDate = new Date(nextDue);                       // Convert 'October 16, 2023'b format to a Date object
        //something could slip by right here and not be printed out
        // Check if nextDueDate is a valid date
        if (isNaN(nextDueDate.getTime())) {
          Logger.log(`Skipping: ${task.properties.Name.title[0].plain_text} due to invalid Next Due date.`);
          return;
        }

        // Convert the Date object to ISO 8601 string
        const nextDueISO = nextDueDate.toISOString();

        // Update task data in Notion
        Logger.log(`UPDATING TASK: ${task.properties.Name.title[0].plain_text}`);
        resetCount += 1;
        const updateUrl = `https://api.notion.com/v1/pages/${task.id}`;
        const updateParams = {
          headers: {
            "Authorization": `Bearer ${NOTION_API_KEY}`,
            "Notion-Version": "2021-08-16",
            "Content-Type": "application/json"
          },
          method: 'PATCH',
          payload: JSON.stringify({
            "properties": {
              "State": { "status": { "name": "On Deck" } },
              "Due": { "date": { "start": nextDueISO } }
            }
          })
        };
        
        UrlFetchApp.fetch(updateUrl, updateParams);
      }
    }
  });
  console.log("Reset Completed. ", itemCount, "items passed, ",resetCount , "resets made.")
}

function convertTimeToOutputForm (time, outputStyle) {

  hours = parseInt(time.slice(0,2));
  minutes = parseInt(time.slice(3,5));

  console.log("hours"+hours)
  console.log("minutes"+minutes)

  //for outputs like: "1h 4min!"
  if (outputStyle == 1) {
    if (hours == 0) {
      timeString = minutes.toString() + "min";
    } else {
    timeString = hours.toString() + "h " + minutes.toString() + "min";
    }
  }
  //for outputs like: "1.03h"
  else if (outputStyle == 2) {
    timeString = (hours+(minutes/60)).toFixed(2) + "h";
  }
  //for output like "1.04h"
  else {
    if (hours == 0) {
      timeString = minutes + "min";
    } else {
    hours += minutes/60;
    timeString = hours.toFixed(2) + "h";
    }
  }
  return (timeString);
}

//takes two TIME objects (start and stop times) and a cumulative row to write to, adds the difference to the value of the row (in hh:mm:ss format), and outputs [duration, newTotal]
function calculateAndWriteDuration(startTime, stopTime, durationRow) {
  // Fetch start and stop times
  //var stopTime = new Date(sheet1.getRange(stopRow, activeCol).getValue());

  //console.log("startRowVal: ", sheet1.getRange(startRow, activeCol).getValue());
  //console.log("stopRowVal: ", sheet1.getRange(stopRow, activeCol).getValue());  
  console.log("startTime: ", startTime);
  console.log("stopTime: ", stopTime);

  // Check if both times are valid dates
  if(startTime instanceof Date && !isNaN(startTime) &&
     stopTime instanceof Date && !isNaN(stopTime)) {

    // Calculate duration in milliseconds
    var durationMs = stopTime - startTime;

    // Convert milliseconds to hh:mm:ss
    var duration = convertMsToTime(durationMs);

    // Update the cell with the new duration
    var currentTotalMs = convertTimeToMs(sheet1.getRange(durationRow, activeCol).getValue());
    var newTotalMs = currentTotalMs + durationMs;
    var newTotal = convertMsToTime(newTotalMs);
    sheet1.getRange(durationRow, activeCol).setValue(newTotal);
    var durationArray = [duration, newTotal];

    console.log("duration: " + duration);
    console.log("Duration in ms: " + durationMs);
    console.log("Current Total in ms: " + currentTotalMs);
    console.log("New Total in ms: " + newTotalMs);
    console.log("New Total Time: " + newTotal);

    return durationArray;
  } else {
    // Handle error, such as one or both times not being dates
    Logger.log("Invalid start or stop time");
  }
  //sheet1.getRange(startRow, activeCol).setValue(stopTime);
}

function convertMsToTime(milliseconds) {
  var seconds = Math.floor((milliseconds / 1000) % 60);
  var minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  var hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);

  hours = (hours < 10) ? "0" + hours : hours;
  minutes = (minutes < 10) ? "0" + minutes : minutes;
  seconds = (seconds < 10) ? "0" + seconds : seconds;

  return hours + ":" + minutes + ":" + seconds;
}

//takes string hh:mm:ss and converts to milliseconds
function convertTimeToMs(timeStr) {

  if (typeof timeStr !== 'string' || timeStr.trim() === '') return 0; //return 0 if cell is empty or non-string

  var timeParts = timeStr.split(':');
  var hoursToMs = parseInt(timeParts[0]) * 60 * 60 * 1000;
  var minutesToMs = parseInt(timeParts[1]) * 60 * 1000;
  var secondsToMs = parseInt(timeParts[2]) * 1000;

  return hoursToMs + minutesToMs + secondsToMs;
}

//updates a list of rows in spreadsheet used for graphing so graphs can maintain a rolling 7 day view
function updateDataRanges(spreadsheetId, dataSheetName, targetSheetName, chartDataRanges) {
  console.log ("updating chart range");
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var dataSheet = spreadsheet.getSheetByName(dataSheetName); // Sheet where data is read from
  var targetSheet = spreadsheet.getSheetByName(targetSheetName); // Sheet where data is pasted to

  // Find the last column with data only once for efficiency
  var lastColumnWithData = activeCol

  chartDataRanges.forEach(function(range) {
    // Calculate the start column in the data sheet based on the last X days
    var startColumn = Math.max(lastColumnWithData - range.lastXDays + 1, 1);

    // Define the range for the last X days of data in the data sheet
    var dataRange = dataSheet.getRange(range.dataRow, startColumn, 1, range.lastXDays);

    // Clear existing content in the target range to avoid overlap, if necessary
    targetSheet.getRange(range.targetRow, range.targetColumn, 1, range.lastXDays).clearContent();

    // Copy the data to the target range starting from targetColumn in the target sheet
    console.log("chart range starting at Row: " + range.targetRow + " Col: " + range.targetColumn + " has been updated.")
    dataRange.copyTo(targetSheet.getRange(range.targetRow, range.targetColumn));
  });
}

//runs on a routine basis to update data ranges for gooogle sheets charts
function updateAllRanges() {
  updateDataRanges(spreadsheetID, sheetNames[0].dataSheetName, sheetNames[1].targetSheetName, chartDataRanges);
}

function convertHoursToHoursMinutes(hoursDecimal) {
    var hours = Math.floor(hoursDecimal); // Get the whole hour part
    var minutes = Math.round((hoursDecimal - hours) * 60); // Convert the decimal part to minutes

    // If rounding the minutes gives you 60, adjust to roll over to hours
    if (minutes === 60) {
        hours += 1;
        minutes = 0;
    }

    return hours + "h " + minutes + "m"; // Combine into a formatted string
}

/*
  Example styles of output (not all are built-in): 
    - "You completed habit_stack_1 23.8 minutes faster than yesterday"
    - "Your weight has increased 1.3 lbs vs yesterday"
    - "Completion Time: -23.8 minutes vs yesterday!"
    - "Weight: +1.3 lbs today vs "7 day rolling avg concluding yesterday!"
    - "average this week vs "7 day rolling avg concluding 7 days ago!""

 Javascript learnings
  - you can't send data in a JSON with ANY spaces or newlines in it. It apparently isn't read as data but rather as part of the structure of the JSON and screws it up.
  - thus, you have to "URL encode" your variables before you send them, if they're going to include spaces or newlines. Apple shortcuts does have a native module to do this, but you can also do it manually. I couldn't get Apple shortcuts to work right for encoding newlines, though - only spaces.
  - when apple shortcuts adds two variables together, it adds a hidden character that screws up the JSON file it sends. Fixed via method found in shortcut
  - how to query GS = sheet1.getRange("Sheet1!F3:F3").getValues();
  - how to format a return message (returning strings over URL doesn't work) = return ContentService.createTextOutput(string_message);

  I believe there are 3 types of metrics based on how much direct control you have over them: mostly controlled (i.e. completion time), mostly NOT-controlled (i.e. mood), partially-controlled (i.e. max squat weight))

  Other metrics I'm considering tracking:
  - weights/reps/time duration for all possible exercises to see strength/health trends
  - at different points in the day (wake, beg work, pre lunch, post lunch, evening, bed)
  - tiredness
  - mental calmness
  - mood
  - resting heartrate
  - caloric intake (proetein, carbs, fat)]
*/
