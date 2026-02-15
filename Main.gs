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
var taskIdColumn;
var labelColumn;
var dataStartColumn;
var taskIdRowMap = {};
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
var lateExtensionHours;
var trackingSheetName;
var writeToNotion;
var dailyPointsID;
var cumulativePointsID;
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

function parseRequest_(e) {
  var parameters = e && e.parameters ? e.parameters : {};
  return {
    key: JSON.parse(parameters.key),
    metricsRaw: parameters.metrics,
    dataRaw: parameters.data
  };
}

function respondText_(s) {
  return ContentService.createTextOutput(s);
}

function respondJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

//main function
function doGet(e) {
  var scriptProperties = PropertiesService.getScriptProperties();
  var request = parseRequest_(e);

  key = request.key;
  if (isHabitsV2Key_(key)) {
    loadSettings(key);
    activeCol = ensureTodayColumn_(sheet1, currentTimeStamp);

    if (key === "record_metric_iOS") {
      return respondText_(recordMetricIOS_(request.dataRaw));
    }

    if (key === "record_metric_notion") {
      return respondText_(recordMetricNotion_(request.dataRaw));
    }

    if (key === "positive_push_notification") {
      return respondText_(positivePushNotificationV2_());
    }

    if (key === "current_metric_status") {
      return respondText_(currentMetricStatusV2_(request.dataRaw));
    }

    var parsedHabitsV2Data = parseHabitsV2Data_(request.dataRaw);
    if (!parsedHabitsV2Data.ok) {
      return respondText_(buildHabitsV2Response({
        ok: false,
        errors: parsedHabitsV2Data.errors
      }));
    }

    return respondText_(buildHabitsV2Response({
      ok: true,
      results: parsedHabitsV2Data.results
    }));
  }
  //key = "append_to_notion_inbox";

  var allMetricSettings = loadSettings(key);

  var lastCol = sheet1.getLastColumn();
  activeCol = findactiveCol();
  if (activeCol > lastCol) {updateAllRanges()}

  var metrics = createMetricsArray(JSON.parse(request.metricsRaw));
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
    var dataRange = sheet1.getRange(nighttime_notifier_settings[0][2], dataStartColumn, 1, activeCol - dataStartColumn).getValues();
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
    var dataRange = sheet1.getRange(nighttime_notifier_settings[0][2], dataStartColumn, 1, activeCol - dataStartColumn).getValues();
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
      const dataRange = sheet1.getRange(habit.row, dataStartColumn, 1, activeCol - dataStartColumn).getValues();
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
    const dataRange = sheet1.getRange(habit.row, dataStartColumn, 1, activeCol - dataStartColumn).getValues();
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
          var dataRange = sheet1.getRange(allMetricSettings[i]["rowNumber"], dataStartColumn, 1, activeCol - dataStartColumn).getValues();
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

function isHabitsV2Key_(requestKey) {
  return requestKey === "record_metric_iOS" ||
    requestKey === "record_metric_notion" ||
    requestKey === "positive_push_notification" ||
    requestKey === "current_metric_status";
}

function parseHabitsV2Data_(rawData) {
  var parsedData;
  var results = [];
  var allErrors = [];
  var allWarnings = [];
  var trackingSheet;

  try {
    trackingSheet = getTrackingSheet_();
  } catch (error) {
    return {
      ok: false,
      errors: ["Unable to load tracking sheet: " + error.message]
    };
  }

  try {
    parsedData = JSON.parse(rawData);
  } catch (error) {
    return {
      ok: false,
      errors: ["Malformed JSON in data parameter."]
    };
  }

  if (!Array.isArray(parsedData)) {
    return {
      ok: false,
      errors: ["Invalid data payload. Expected an array of tuples."]
    };
  }

  for (var i = 0; i < parsedData.length; i++) {
    var tuple = parsedData[i];
    if (!Array.isArray(tuple) || tuple.length === 0 || tuple.length > 2) {
      return {
        ok: false,
        errors: ["Invalid tuple at data[" + i + "]. Expected [metricID] or [metricID, value]."]
      };
    }

    var metricID = tuple[0];
    if (typeof metricID !== "string" || metricID.trim() === "") {
      return {
        ok: false,
        errors: ["Invalid metricID at data[" + i + "]."]
      };
    }

    var rowLookup = findRowByMetricId_(metricID, trackingSheet);
    var entryErrors = [];
    var entryWarnings = [];

    if (rowLookup.error) {
      entryErrors.push(rowLookup.error);
      allErrors.push(rowLookup.error);
    }
    if (rowLookup.warnings && rowLookup.warnings.length > 0) {
      Array.prototype.push.apply(entryWarnings, rowLookup.warnings);
      Array.prototype.push.apply(allWarnings, rowLookup.warnings);
    }

    results.push({
      metricID: metricID,
      row: rowLookup.row,
      status: rowLookup.row ? "parsed" : "error",
      errors: entryErrors,
      warnings: entryWarnings
    });
  }

  return {
    ok: true,
    results: results,
    errors: allErrors,
    warnings: allWarnings
  };
}

function recordMetricIOS_(rawData) {
  return recordMetricBySource_(rawData, {
    source: "iOS",
    skipNotionStatusComplete: false
  });
}

function recordMetricNotion_(rawData) {
  return recordMetricBySource_(rawData, {
    source: "Notion",
    skipNotionStatusComplete: true
  });
}

function positivePushNotificationV2_() {
  var config = getAppConfig();
  var settings = Array.isArray(config.metricSettings) ? config.metricSettings : [];
  var now = new Date();
  var extensionHours = lateExtensionHours !== undefined ? lateExtensionHours : lateExtension;

  if (positive_push_notifications === "Off") {
    return buildHabitsV2Response({
      ok: true,
      messages: ["PPN is OFF"]
    });
  }

  for (var i = 0; i < settings.length; i++) {
    var metric = settings[i] || {};

    if (!metric.ppnMessage) {
      continue;
    }

    if (!isMetricEligibleForPPNNow_(metric, now, extensionHours)) {
      continue;
    }

    var rowLookup = findRowByMetricId_(metric.metricID, sheet1);
    if (!rowLookup.row) {
      continue;
    }

    var cellValue = sheet1.getRange(rowLookup.row, activeCol).getValue();
    if (isCompletedCellValue_(cellValue)) {
      continue;
    }

    var streakCount = calculateStreak_(metric.metricID, activeCol, extensionHours, sheet1);
    var message = composePpnMessage_(metric.ppnMessage, streakCount, metric.streaks && metric.streaks.unit);

    return buildHabitsV2Response({
      ok: true,
      messages: [message],
      results: [{
        metricID: metric.metricID,
        streak: streakCount,
        row: rowLookup.row
      }]
    });
  }

  return buildHabitsV2Response({
    ok: true,
    messages: ["All habits completed for today!"]
  });
}

function currentMetricStatusV2_(rawData) {
  var parsedData;
  var statuses = [];

  try {
    parsedData = JSON.parse(rawData);
  } catch (error) {
    return JSON.stringify({
      ok: false,
      errors: ["Malformed JSON in data parameter."]
    });
  }

  if (!Array.isArray(parsedData)) {
    return JSON.stringify({
      ok: false,
      errors: ["Invalid data payload. Expected an array of metricIDs."]
    });
  }

  var trackingSheet = sheet1 || getTrackingSheet_();
  var todayCol = getCurrentTrackingDayColumn_(trackingSheet);

  for (var i = 0; i < parsedData.length; i++) {
    var metricID = parsedData[i];
    if (typeof metricID !== 'string' || metricID.trim() === '') {
      statuses.push(false);
      continue;
    }

    var rowLookup = findRowByMetricId_(metricID, trackingSheet);
    if (!rowLookup.row) {
      statuses.push(false);
      continue;
    }

    var value = trackingSheet.getRange(rowLookup.row, todayCol).getValue();
    statuses.push(isCompletedCellValue_(value));
  }

  return JSON.stringify(statuses);
}

function isMetricEligibleForPPNNow_(metric, now, extensionHours) {
  if (!metric || !Array.isArray(metric.dates) || metric.dates.length === 0) {
    return true;
  }

  var effectiveDay = getEffectiveWeekdayName_(now, extensionHours);
  var hasDayEntries = false;

  for (var i = 0; i < metric.dates.length; i++) {
    var entry = metric.dates[i];
    if (typeof entry === 'string') {
      hasDayEntries = true;
      if (entry.trim().toLowerCase() === effectiveDay) {
        return true;
      }
      continue;
    }

    if (!Array.isArray(entry) || entry.length === 0 || typeof entry[0] !== 'string') {
      continue;
    }

    hasDayEntries = true;
    var day = entry[0].trim().toLowerCase();
    if (day !== effectiveDay) {
      continue;
    }

    var startHour = parseOptionalHour_(entry.length > 2 ? entry[2] : null);
    var endHour = parseOptionalHour_(entry.length > 3 ? entry[3] : null);

    if (startHour === null || endHour === null) {
      return true;
    }

    return isCurrentHourWithinRange_(now, startHour, endHour);
  }

  return !hasDayEntries;
}

function getEffectiveWeekdayName_(now, extensionHours) {
  var extensionMs = normalizeExtensionMs_(extensionHours);
  var effectiveNow = new Date(now.getTime() - extensionMs);
  return Utilities.formatDate(effectiveNow, Session.getScriptTimeZone(), 'EEEE').toLowerCase();
}

function parseOptionalHour_(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  var numeric = Number(value);
  if (!isFinite(numeric)) {
    return null;
  }

  return numeric;
}

function isCurrentHourWithinRange_(now, startHour, endHour) {
  var hourDecimal = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

  if (startHour <= endHour) {
    return hourDecimal >= startHour && hourDecimal <= endHour;
  }

  return hourDecimal >= startHour || hourDecimal <= endHour;
}

function composePpnMessage_(ppnMessage, streakCount, streakUnit) {
  var unit = streakUnit || 'days';

  if (Array.isArray(ppnMessage)) {
    var first = ppnMessage.length > 0 ? String(ppnMessage[0]) : '';
    var second = ppnMessage.length > 1 ? String(ppnMessage[1]) : '';
    var core = (first + ' ' + String(streakCount) + ' ' + unit + '.').replace(/\s+/g, ' ').trim();
    return (core + ' ' + second).replace(/\s+/g, ' ').trim();
  }

  var text = String(ppnMessage);
  return (text + ' ' + String(streakCount) + ' ' + unit).replace(/\s+/g, ' ').trim();
}

function recordMetricBySource_(rawData, options) {
  var sourceOptions = options || {};
  var source = sourceOptions.source || "iOS";
  var skipNotionStatusComplete = !!sourceOptions.skipNotionStatusComplete;
  var parsedData;
  var results = [];
  var messages = [];
  var errors = [];
  var warnings = [];
  var totalPointsDelta = 0;
  var trackingSheet;

  try {
    trackingSheet = getTrackingSheet_();
  } catch (error) {
    return buildHabitsV2Response({
      ok: false,
      errors: ["Unable to load tracking sheet: " + error.message]
    });
  }

  try {
    parsedData = JSON.parse(rawData);
  } catch (error) {
    return buildHabitsV2Response({
      ok: false,
      errors: ["Malformed JSON in data parameter."]
    });
  }

  if (!Array.isArray(parsedData)) {
    return buildHabitsV2Response({
      ok: false,
      errors: ["Invalid data payload. Expected an array of tuples."]
    });
  }

  for (var i = 0; i < parsedData.length; i++) {
    var tuple = parsedData[i];
    var entryErrors = [];
    var resultEntry = {
      metricID: null,
      row: null,
      source: source,
      status: "error",
      value: null,
      complete: false,
      notionStatusCompleteSkipped: skipNotionStatusComplete,
      errors: entryErrors
    };

    if (!Array.isArray(tuple) || tuple.length === 0 || tuple.length > 2) {
      entryErrors.push("Invalid tuple at data[" + i + "]. Expected [metricID] or [metricID, value].");
      results.push(resultEntry);
      Array.prototype.push.apply(errors, entryErrors);
      continue;
    }

    var metricID = tuple[0];
    resultEntry.metricID = metricID;
    if (typeof metricID !== "string" || metricID.trim() === "") {
      entryErrors.push("Invalid metricID at data[" + i + "].");
      results.push(resultEntry);
      Array.prototype.push.apply(errors, entryErrors);
      continue;
    }

    var settingLookup = getMetricSettingById(metricID);
    if (!settingLookup.setting) {
      entryErrors.push("metricID not found in metricSettings: " + metricID);
      results.push(resultEntry);
      Array.prototype.push.apply(errors, entryErrors);
      continue;
    }

    if (settingLookup.errors && settingLookup.errors.length) {
      Array.prototype.push.apply(warnings, settingLookup.errors);
    }

    var setting = settingLookup.setting;
    var metricType = setting.type || setting.unitType;
    var recordType = normalizeRecordType_(setting.recordType);
    var row = (typeof setting.rowNumber === "number" && setting.rowNumber > 0) ? setting.rowNumber : null;

    if (!row) {
      var rowLookup = findRowByMetricId_(metricID, trackingSheet);
      if (!rowLookup.row) {
        entryErrors.push(rowLookup.error || ("Unable to resolve row for metricID: " + metricID));
        results.push(resultEntry);
        Array.prototype.push.apply(errors, entryErrors);
        continue;
      }
      row = rowLookup.row;
      if (rowLookup.warnings && rowLookup.warnings.length) {
        Array.prototype.push.apply(warnings, rowLookup.warnings);
      }
    }
    resultEntry.row = row;

    var dueByGate = evaluateDueByWriteGate_(setting, currentTimeStamp, lateExtensionHours !== undefined ? lateExtensionHours : lateExtension);
    if (dueByGate.warning) {
      warnings.push(dueByGate.warning);
      resultEntry.warnings = resultEntry.warnings || [];
      resultEntry.warnings.push(dueByGate.warning);
    }

    if (dueByGate.isLate) {
      resultEntry.status = "late_no_write";
      resultEntry.complete = false;
      resultEntry.pointsDelta = 0;
      resultEntry.metricPointsToday = 0;
      results.push(resultEntry);
      continue;
    }

    var validated = validateMetricValueForRecord_(metricType, tuple.length > 1 ? tuple[1] : null);
    if (!validated.ok) {
      entryErrors.push(validated.error);
      results.push(resultEntry);
      Array.prototype.push.apply(errors, entryErrors);
      continue;
    }

    var timerHandledResult = processTimerMetric_(setting, metricID, tuple.length > 1 ? tuple[1] : null, recordType, trackingSheet, activeCol, multiplier, warnings);
    if (timerHandledResult.handled) {
      if (!timerHandledResult.ok) {
        if (timerHandledResult.error) {
          entryErrors.push(timerHandledResult.error);
          Array.prototype.push.apply(errors, entryErrors);
        }
        results.push(resultEntry);
        continue;
      }

      resultEntry.status = timerHandledResult.status;
      resultEntry.value = timerHandledResult.value;
      resultEntry.complete = timerHandledResult.complete;
      resultEntry.multiplier = multiplier;
      resultEntry.pointsDelta = timerHandledResult.pointsDelta;
      resultEntry.metricPointsToday = timerHandledResult.metricPointsToday;
      if (timerHandledResult.message) {
        resultEntry.message = timerHandledResult.message;
        messages.push(timerHandledResult.message);
      }

      if (setting.streaks && setting.streaks.streaksID) {
        var timerStreakValue = calculateStreak_(metricID, activeCol, lateExtensionHours !== undefined ? lateExtensionHours : lateExtension, trackingSheet);
        writeStreakToSheet_(setting.streaks.streaksID, timerStreakValue, activeCol, trackingSheet);
        resultEntry.streak = timerStreakValue;
      }

      totalPointsDelta += timerHandledResult.pointsDelta || 0;
      results.push(resultEntry);
      continue;
    }

    var cell = trackingSheet.getRange(row, activeCol);
    var currentValue = cell.getValue();
    var isCurrentEmpty = currentValue === "" || currentValue === null;
    var streakBeforeLog = calculateStreak_(metricID, activeCol, lateExtensionHours !== undefined ? lateExtensionHours : lateExtension, trackingSheet);
    var multiplier = getMultiplier_(metricID, streakBeforeLog);
    var metricPointsDelta = 0;
    var metricPointsToday = null;

    if (recordType === "keep_first" && !isCurrentEmpty) {
      resultEntry.status = "kept_first";
      resultEntry.value = currentValue;
      resultEntry.complete = true;
      results.push(resultEntry);
      continue;
    }

    if (recordType === "add") {
      if (metricType !== "number" && metricType !== "duration") {
        var addWarning = "Add recordType ignored for non-addable metric type (" + metricType + ") for metricID: " + metricID;
        warnings.push(addWarning);
        resultEntry.status = "ignored";
        resultEntry.value = currentValue;
        resultEntry.complete = currentValue !== "" && currentValue !== null;
        resultEntry.warnings = [addWarning];
        results.push(resultEntry);
        continue;
      }

      if (metricType === "number") {
        var existingNumber = parseStoredNumberForAdd_(currentValue);
        if (existingNumber === null) {
          entryErrors.push("Cannot add to non-numeric existing value for metricID: " + metricID);
          results.push(resultEntry);
          Array.prototype.push.apply(errors, entryErrors);
          continue;
        }

        var summedValue = existingNumber + validated.value;
        cell.setValue(summedValue);
        resultEntry.status = "written";
        resultEntry.value = summedValue;
        resultEntry.complete = true;
        metricPointsDelta = calculatePointsDelta_(metricID, metricType, summedValue, validated.value, multiplier);
        metricPointsToday = calculatePointsDelta_(metricID, metricType, summedValue, null, multiplier);
        writeMetricPointsRow_(setting, metricPointsToday, activeCol, trackingSheet, warnings);
        totalPointsDelta += metricPointsDelta;
        if (setting.streaks && setting.streaks.streaksID) {
          var numberAddStreakValue = calculateStreak_(metricID, activeCol, lateExtensionHours !== undefined ? lateExtensionHours : lateExtension, trackingSheet);
          writeStreakToSheet_(setting.streaks.streaksID, numberAddStreakValue, activeCol, trackingSheet);
          resultEntry.streak = numberAddStreakValue;
        }
        resultEntry.multiplier = multiplier;
        resultEntry.pointsDelta = metricPointsDelta;
        resultEntry.metricPointsToday = metricPointsToday;
        results.push(resultEntry);
        continue;
      }

      var existingDurationSeconds = parseDurationToSeconds_(currentValue, true);
      if (existingDurationSeconds === null) {
        entryErrors.push("Cannot add to non-duration existing value for metricID: " + metricID);
        results.push(resultEntry);
        Array.prototype.push.apply(errors, entryErrors);
        continue;
      }

      var addedSeconds = existingDurationSeconds + validated.seconds;
      if (addedSeconds > 99 * 3600 + 59 * 60 + 59) {
        entryErrors.push("Duration exceeds max 99:59:59 for metricID: " + metricID);
        results.push(resultEntry);
        Array.prototype.push.apply(errors, entryErrors);
        continue;
      }

      var addedDuration = secondsToDurationString_(addedSeconds);
      cell.setValue(addedDuration);
      resultEntry.status = "written";
      resultEntry.value = addedDuration;
      resultEntry.complete = true;
      metricPointsDelta = calculatePointsDelta_(metricID, metricType, addedDuration, validated.value, multiplier);
      metricPointsToday = calculatePointsDelta_(metricID, metricType, addedDuration, null, multiplier);
      writeMetricPointsRow_(setting, metricPointsToday, activeCol, trackingSheet, warnings);
      totalPointsDelta += metricPointsDelta;
      if (setting.streaks && setting.streaks.streaksID) {
        var durationAddStreakValue = calculateStreak_(metricID, activeCol, lateExtensionHours !== undefined ? lateExtensionHours : lateExtension, trackingSheet);
        writeStreakToSheet_(setting.streaks.streaksID, durationAddStreakValue, activeCol, trackingSheet);
        resultEntry.streak = durationAddStreakValue;
      }
      resultEntry.multiplier = multiplier;
      resultEntry.pointsDelta = metricPointsDelta;
      resultEntry.metricPointsToday = metricPointsToday;
      results.push(resultEntry);
      continue;
    }

    cell.setValue(validated.value);
    resultEntry.status = "written";
    resultEntry.value = validated.value;
    resultEntry.complete = validated.value !== "" && validated.value !== null;
    metricPointsDelta = calculatePointsDelta_(metricID, metricType, validated.value, null, multiplier);
    metricPointsToday = metricPointsDelta;
    writeMetricPointsRow_(setting, metricPointsToday, activeCol, trackingSheet, warnings);
    totalPointsDelta += metricPointsDelta;

    if (setting.streaks && setting.streaks.streaksID) {
      var streakValue = calculateStreak_(metricID, activeCol, lateExtensionHours !== undefined ? lateExtensionHours : lateExtension, trackingSheet);
      writeStreakToSheet_(setting.streaks.streaksID, streakValue, activeCol, trackingSheet);
      resultEntry.streak = streakValue;
    }

    resultEntry.multiplier = multiplier;
    resultEntry.pointsDelta = metricPointsDelta;
    resultEntry.metricPointsToday = metricPointsToday;

    results.push(resultEntry);
  }

  if (totalPointsDelta !== 0) {
    incrementPointsRowById_(dailyPointsID, totalPointsDelta, activeCol, trackingSheet, warnings);
    incrementPointsRowById_(cumulativePointsID, totalPointsDelta, activeCol, trackingSheet, warnings);
  }

  syncNotionForRecordedMetrics_(results, sourceOptions, messages, errors, warnings, trackingSheet);

  return buildHabitsV2Response({
    ok: true,
    messages: messages,
    results: results,
    errors: errors,
    warnings: warnings
  });
}

function syncNotionForRecordedMetrics_(results, sourceOptions, messages, errors, warnings, trackingSheet) {
  if (!writeToNotion) {
    return;
  }

  var config = getAppConfig();
  var notionConfig = config && config.notion ? config.notion : {};
  var scriptProperties = PropertiesService.getScriptProperties();
  var databaseIdsRaw = scriptProperties.getProperty(notionConfig.databaseIdsScriptProperty || 'notionMetricDatabaseIDs');
  var databaseIds = parseNotionDatabaseIds_(databaseIdsRaw);

  if (!databaseIds.length) {
    warnings.push('Notion sync skipped: no configured Notion database IDs.');
    return;
  }

  var sourceIsNotion = !!(sourceOptions && sourceOptions.skipNotionStatusComplete);
  var metricsUpdated = 0;
  var eligibleMetricCount = 0;

  for (var i = 0; i < results.length; i++) {
    var result = results[i] || {};
    if (!result.metricID || result.status !== 'written' && result.status !== 'kept_first') {
      continue;
    }

    var settingLookup = getMetricSettingById(result.metricID);
    var setting = settingLookup && settingLookup.setting ? settingLookup.setting : null;
    if (!setting || !setting.writeToNotion) {
      continue;
    }

    eligibleMetricCount++;
    var syncOutcome = syncSingleMetricToNotion_(result, setting, notionConfig, databaseIds, sourceIsNotion);
    if (syncOutcome.warnings && syncOutcome.warnings.length) {
      Array.prototype.push.apply(warnings, syncOutcome.warnings);
    }
    if (syncOutcome.errors && syncOutcome.errors.length) {
      Array.prototype.push.apply(errors, syncOutcome.errors);
    }
    metricsUpdated += syncOutcome.updatedCount || 0;
  }

  if (eligibleMetricCount > 0) {
    updateNotionDashboardBlocks_(notionConfig, messages, errors, warnings, trackingSheet);
  }

  if (metricsUpdated > 0) {
    messages.push('Notion task updates: ' + metricsUpdated + '.');
  }
}

function syncSingleMetricToNotion_(result, setting, notionConfig, databaseIds, sourceIsNotion) {
  var outcome = { updatedCount: 0, warnings: [], errors: [] };
  var propertyNames = notionConfig && notionConfig.propertyNames ? notionConfig.propertyNames : {};
  var metricIdPropertyName = propertyNames.metricId || 'metricID';
  var matches = [];

  for (var i = 0; i < databaseIds.length; i++) {
    var pages = findNotionPagesByMetricId_(databaseIds[i], metricIdPropertyName, result.metricID);
    Array.prototype.push.apply(matches, pages);
  }

  if (!matches.length) {
    outcome.warnings.push('No Notion task found for metricID: ' + result.metricID);
    return outcome;
  }

  if (matches.length > 1) {
    outcome.errors.push('Duplicate Notion tasks found for metricID: ' + result.metricID + '. Updating all matches (' + matches.length + ').');
  }

  var properties = {};
  var pointsName = propertyNames.points || 'Points';
  var multiplierName = propertyNames.pointMultiplier || 'Point Multiplier';
  var streakName = propertyNames.streak || 'Streak';
  var statusName = propertyNames.status || 'Status';
  var completeStatusName = notionConfig.completeStatusName || 'Complete';

  properties[pointsName] = { number: roundToOneDecimal_(Number(result.metricPointsToday || 0)) };
  properties[multiplierName] = { number: Number(result.multiplier || 1) };
  if (result.streak !== undefined && result.streak !== null && result.streak !== '') {
    properties[streakName] = { number: Number(result.streak) };
  }
  if (!sourceIsNotion) {
    properties[statusName] = { status: { name: completeStatusName } };
  }

  for (var m = 0; m < matches.length; m++) {
    try {
      updateNotionPageProperties_(matches[m].id, properties);
      outcome.updatedCount++;
    } catch (error) {
      outcome.errors.push('Failed Notion update for metricID ' + result.metricID + ': ' + error.message);
    }
  }

  return outcome;
}

function parseNotionDatabaseIds_(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    var parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.map(function (id) { return String(id || '').trim(); }).filter(function (id) { return !!id; });
    }
  } catch (error) {
  }

  return String(rawValue)
    .split(',')
    .map(function (id) { return id.trim(); })
    .filter(function (id) { return !!id; });
}

function findNotionPagesByMetricId_(databaseId, metricIdPropertyName, metricID) {
  var payload = {
    filter: {
      property: metricIdPropertyName,
      rich_text: {
        equals: metricID
      }
    },
    page_size: 100
  };

  var response = notionApiRequest_('/v1/databases/' + normalizeNotionId_(databaseId) + '/query', 'post', payload);
  return response && response.results ? response.results : [];
}

function updateNotionPageProperties_(pageId, properties) {
  notionApiRequest_('/v1/pages/' + normalizeNotionId_(pageId), 'patch', {
    properties: properties
  });
}

function updateNotionDashboardBlocks_(notionConfig, messages, errors, warnings, trackingSheet) {
  var scriptProperties = PropertiesService.getScriptProperties();
  var pointBlockId = scriptProperties.getProperty(notionConfig.pointBlockIdScriptProperty || 'pointBlock');
  var insightBlockId = scriptProperties.getProperty(notionConfig.insightBlockIdScriptProperty || 'insightBlock');

  if (pointBlockId) {
    try {
      var pointTotalToday = getCurrentPointsValueById_(dailyPointsID, activeCol, trackingSheet);
      notionOverwriteBlockText_(pointBlockId, String(roundToOneDecimal_(pointTotalToday)));
    } catch (error) {
      warnings.push('Failed to update pointBlock: ' + error.message);
    }
  }

  if (insightBlockId) {
    try {
      var insightLines = [];
      if (Array.isArray(messages) && messages.length) {
        insightLines.push(messages.join(' | '));
      }
      if (Array.isArray(errors) && errors.length) {
        insightLines.push('Errors: ' + errors.join(' | '));
      }
      if (!insightLines.length) {
        insightLines.push('No new insights.');
      }
      notionOverwriteBlockText_(insightBlockId, insightLines.join('\n'));
    } catch (error2) {
      warnings.push('Failed to update insightBlock: ' + error2.message);
    }
  }
}

function getCurrentPointsValueById_(metricID, col, trackingSheet) {
  var rowLookup = findRowByMetricId_(metricID, trackingSheet);
  if (!rowLookup.row) {
    throw new Error(rowLookup.error || ('metricID not found in sheet: ' + metricID));
  }

  var value = trackingSheet.getRange(rowLookup.row, col).getValue();
  var num = Number(value);
  return isFinite(num) ? num : 0;
}

function roundToOneDecimal_(value) {
  var numeric = Number(value);
  if (!isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 10) / 10;
}

function notionOverwriteBlockText_(blockId, text) {
  var block = notionApiRequest_('/v1/blocks/' + normalizeNotionId_(blockId), 'get');
  var blockType = block && block.type ? block.type : 'paragraph';
  var richText = [{ type: 'text', text: { content: String(text) } }];
  var payload = {};

  if (blockType === 'heading_1' || blockType === 'heading_2' || blockType === 'heading_3' || blockType === 'paragraph' || blockType === 'bulleted_list_item' || blockType === 'numbered_list_item' || blockType === 'quote' || blockType === 'to_do') {
    payload[blockType] = { rich_text: richText };
    if (blockType === 'to_do') {
      payload[blockType].checked = false;
    }
  } else {
    payload.paragraph = { rich_text: richText };
  }

  notionApiRequest_('/v1/blocks/' + normalizeNotionId_(blockId), 'patch', payload);
}

function notionApiRequest_(path, method, payload) {
  var scriptProperties = PropertiesService.getScriptProperties();
  var notionToken = scriptProperties.getProperty('notionAPIKey');
  var notionVersion = scriptProperties.getProperty('notionVersion') || '2025-09-03';

  if (!notionToken) {
    throw new Error('Missing script property: notionAPIKey');
  }

  var options = {
    method: String(method || 'get').toLowerCase(),
    muteHttpExceptions: true,
    headers: {
      'Authorization': 'Bearer ' + notionToken,
      'Notion-Version': notionVersion
    }
  };

  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch('https://api.notion.com' + path, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Notion API request failed (' + code + '): ' + body);
  }

  return body ? JSON.parse(body) : {};
}

function processTimerMetric_(setting, metricID, rawValue, recordType, trackingSheet, activeColInput, multiplier, warnings) {
  var metricType = setting && (setting.type || setting.unitType);
  if (metricType !== 'start_timer' && metricType !== 'stop_timer') {
    return {
      handled: false
    };
  }

  var timerSettings = setting && setting.ifTimer_Settings ? setting.ifTimer_Settings : {};
  var startMetricID = timerSettings.timerStartMetricID;
  var durationMetricID = timerSettings.timerDurationMetricID;
  var startLookup = findRowByMetricId_(startMetricID, trackingSheet);
  var durationLookup = findRowByMetricId_(durationMetricID, trackingSheet);

  if (!startMetricID || !durationMetricID) {
    return {
      handled: true,
      ok: false,
      error: 'Timer metric ' + metricID + ' missing ifTimer_Settings.timerStartMetricID or timerDurationMetricID.'
    };
  }

  if (!startLookup.row || !durationLookup.row) {
    return {
      handled: true,
      ok: false,
      error: (!startLookup.row ? (startLookup.error || ('metricID not found in sheet: ' + startMetricID)) : (durationLookup.error || ('metricID not found in sheet: ' + durationMetricID)))
    };
  }

  if (startLookup.warnings && startLookup.warnings.length) {
    Array.prototype.push.apply(warnings, startLookup.warnings);
  }
  if (durationLookup.warnings && durationLookup.warnings.length) {
    Array.prototype.push.apply(warnings, durationLookup.warnings);
  }

  var startCell = trackingSheet.getRange(startLookup.row, activeColInput);
  var durationCell = trackingSheet.getRange(durationLookup.row, activeColInput);

  if (metricType === 'start_timer') {
    var currentStartValue = startCell.getValue();
    var hasStartValue = !(currentStartValue === '' || currentStartValue === null);
    if (recordType === 'keep_first' && hasStartValue) {
      return {
        handled: true,
        ok: true,
        status: 'kept_first',
        value: currentStartValue,
        complete: true,
        pointsDelta: 0,
        metricPointsToday: 0
      };
    }

    var startTimestamp = new Date();
    startCell.setValue(startTimestamp);
    return {
      handled: true,
      ok: true,
      status: 'written',
      value: startTimestamp,
      complete: true,
      pointsDelta: 0,
      metricPointsToday: 0
    };
  }

  var storedStartValue = startCell.getValue();
  if (storedStartValue === '' || storedStartValue === null) {
    return {
      handled: true,
      ok: false,
      error: 'No timer start timestamp found for metricID: ' + metricID
    };
  }

  var startTime = storedStartValue instanceof Date ? storedStartValue : new Date(storedStartValue);
  if (!(startTime instanceof Date) || isNaN(startTime.getTime())) {
    return {
      handled: true,
      ok: false,
      error: 'Invalid timer start timestamp for metricID: ' + metricID
    };
  }

  var now = new Date();
  var elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
  if (!isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return {
      handled: true,
      ok: false,
      error: 'Timer stop occurred before start timestamp for metricID: ' + metricID
    };
  }

  var existingDurationSeconds = parseStoredDurationForAdd_(durationCell.getValue());
  if (existingDurationSeconds === null) {
    return {
      handled: true,
      ok: false,
      error: 'Cannot add to non-duration existing value for timer duration metricID: ' + durationMetricID
    };
  }

  var totalDurationSeconds = existingDurationSeconds + elapsedSeconds;
  if (totalDurationSeconds > 99 * 3600 + 59 * 60 + 59) {
    return {
      handled: true,
      ok: false,
      error: 'Duration exceeds max 99:59:59 for metricID: ' + durationMetricID
    };
  }

  durationCell.setValue(secondsToDurationString_(totalDurationSeconds));
  startCell.setValue('');

  var addedDuration = secondsToDurationString_(elapsedSeconds);
  var totalDuration = secondsToDurationString_(totalDurationSeconds);
  var pointsDelta = calculateTimerPointsDelta_(setting, elapsedSeconds, multiplier);
  var messageTemplate = timerSettings.stopTimerMessage || 'Added {addedTimeLong}! ({addedTimeDec})\nNew Score: {totalTimeLong}';
  var timerMessage = replaceTimerMessageTokens_(messageTemplate, elapsedSeconds, totalDurationSeconds);

  writeMetricPointsRow_(setting, pointsDelta, activeColInput, trackingSheet, warnings);

  return {
    handled: true,
    ok: true,
    status: 'written',
    value: {
      addedDuration: addedDuration,
      totalDuration: totalDuration,
      durationMetricID: durationMetricID,
      startMetricID: startMetricID
    },
    complete: true,
    pointsDelta: pointsDelta,
    metricPointsToday: pointsDelta,
    message: timerMessage
  };
}

function calculateTimerPointsDelta_(setting, elapsedSeconds, multiplier) {
  var pointsConfig = setting && setting.points ? setting.points : null;
  if (!pointsConfig) {
    return 0;
  }

  var basePoints = parseStrictNumber_(pointsConfig.value);
  if (basePoints === null) {
    return 0;
  }

  var resolvedMultiplier = parseStrictNumber_(multiplier);
  if (resolvedMultiplier === null) {
    resolvedMultiplier = 1;
  }

  var roundedMinutes = Math.round(Number(elapsedSeconds || 0) / 60);
  return basePoints * roundedMinutes * resolvedMultiplier;
}

function replaceTimerMessageTokens_(template, addedSeconds, totalSeconds) {
  if (typeof template !== 'string') {
    return '';
  }

  var replacements = {
    addedTimeLong: formatDurationLong_(addedSeconds),
    addedTimeDec: formatDurationDecimalHours_(addedSeconds),
    totalTimeLong: formatDurationLong_(totalSeconds),
    totalTimeDec: formatDurationDecimalHours_(totalSeconds)
  };

  return template.replace(/\{([^}]+)\}/g, function(match, tokenName) {
    if (Object.prototype.hasOwnProperty.call(replacements, tokenName)) {
      return replacements[tokenName];
    }
    return match;
  });
}

function formatDurationLong_(durationSeconds) {
  var totalSeconds = Math.max(0, Math.floor(Number(durationSeconds || 0)));
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) {
    return minutes + 'min';
  }

  return hours + 'h ' + minutes + 'min';
}

function formatDurationDecimalHours_(durationSeconds) {
  var totalSeconds = Math.max(0, Number(durationSeconds || 0));
  return (totalSeconds / 3600).toFixed(1) + 'h';
}

function getMultiplier_(metricID, streakCountBeforeLog) {
  var settingLookup = getMetricSettingById(metricID);
  var pointsConfig = settingLookup.setting && settingLookup.setting.points ? settingLookup.setting.points : {};
  var multiplierDays = parseStrictNumber_(pointsConfig.multiplierDays);
  var maxMultiplier = parseStrictNumber_(pointsConfig.maxMultiplier);

  if (multiplierDays === null || multiplierDays <= 0) {
    multiplierDays = 1;
  }
  if (maxMultiplier === null) {
    maxMultiplier = 1;
  }
  if (maxMultiplier === 0) {
    return 0;
  }

  var streakPrior = parseStrictNumber_(streakCountBeforeLog);
  if (streakPrior === null || streakPrior < 0) {
    streakPrior = 0;
  }

  var effectiveStreak = Math.min(streakPrior, multiplierDays);
  var multiplier = (((maxMultiplier - 1) / multiplierDays) * effectiveStreak) + 1;
  return Math.min(multiplier, maxMultiplier);
}

function calculatePointsDelta_(metricID, type, value, addedValue, multiplier) {
  var settingLookup = getMetricSettingById(metricID);
  var pointsConfig = settingLookup.setting && settingLookup.setting.points ? settingLookup.setting.points : null;
  if (!pointsConfig) {
    return 0;
  }

  var basePoints = parseStrictNumber_(pointsConfig.value);
  if (basePoints === null) {
    return 0;
  }

  var resolvedMultiplier = parseStrictNumber_(multiplier);
  if (resolvedMultiplier === null) {
    resolvedMultiplier = 1;
  }

  if (type === "number") {
    var numericValue = parseStrictNumber_(addedValue !== undefined && addedValue !== null ? addedValue : value);
    if (numericValue === null) {
      return 0;
    }
    return basePoints * numericValue * resolvedMultiplier;
  }

  if (type === "duration") {
    var durationSource = addedValue !== undefined && addedValue !== null ? addedValue : value;
    var durationSeconds = parseDurationToSeconds_(durationSource, false);
    if (durationSeconds === null) {
      return 0;
    }
    var roundedMinutes = Math.round(durationSeconds / 60);
    return basePoints * roundedMinutes * resolvedMultiplier;
  }

  if (type === "timestamp" || type === "due_by") {
    return basePoints * resolvedMultiplier;
  }

  return 0;
}

function writeMetricPointsRow_(setting, pointsValue, activeColInput, trackingSheet, warnings) {
  if (!setting || !setting.points || !setting.points.pointsID) {
    return;
  }

  var rowLookup = findRowByMetricId_(setting.points.pointsID, trackingSheet);
  if (!rowLookup.row) {
    warnings.push(rowLookup.error || ("metricID not found in sheet: " + setting.points.pointsID));
    return;
  }

  trackingSheet.getRange(rowLookup.row, activeColInput).setValue(pointsValue);
}

function incrementPointsRowById_(metricID, delta, activeColInput, trackingSheet, warnings) {
  if (!metricID) {
    return;
  }

  var rowLookup = findRowByMetricId_(metricID, trackingSheet);
  if (!rowLookup.row) {
    warnings.push(rowLookup.error || ("metricID not found in sheet: " + metricID));
    return;
  }

  var targetCell = trackingSheet.getRange(rowLookup.row, activeColInput);
  var existingValue = targetCell.getValue();
  var currentNumber = parseStoredNumberForAdd_(existingValue);
  if (currentNumber === null) {
    currentNumber = 0;
  }

  targetCell.setValue(currentNumber + delta);
}

function calculateStreak_(metricID, activeColInput, lateExtensionInput, optionalSheet) {
  var trackingSheet = optionalSheet || sheet1 || getTrackingSheet_();
  var dataColumn = dataStartColumn || 3;
  var resolvedActiveCol = Number(activeColInput) || ensureTodayColumn_(trackingSheet, new Date());
  var extensionHours = lateExtensionInput !== undefined ? lateExtensionInput : (lateExtensionHours !== undefined ? lateExtensionHours : lateExtension);

  var settingLookup = getMetricSettingById(metricID);
  if (!settingLookup.setting) {
    return 0;
  }

  var rowLookup = findRowByMetricId_(metricID, trackingSheet);
  if (!rowLookup.row) {
    return 0;
  }

  var row = rowLookup.row;
  var scheduleDays = normalizeScheduledDays_(settingLookup.setting.dates);
  var useScheduleFilter = scheduleDays.length > 0;
  var streakCount = 0;

  for (var col = resolvedActiveCol - 1; col >= dataColumn; col--) {
    if (!isScheduledColumn_(trackingSheet, col, scheduleDays, useScheduleFilter, extensionHours)) {
      continue;
    }

    var historicalValue = trackingSheet.getRange(row, col).getValue();
    if (!isCompletedCellValue_(historicalValue)) {
      break;
    }

    streakCount += 1;
  }

  var todayScheduled = isScheduledColumn_(trackingSheet, resolvedActiveCol, scheduleDays, useScheduleFilter, extensionHours);
  var todayValue = trackingSheet.getRange(row, resolvedActiveCol).getValue();

  if (todayScheduled) {
    return isCompletedCellValue_(todayValue) ? streakCount + 1 : 0;
  }

  return streakCount;
}

function writeStreakToSheet_(streaksID, streakValue, activeColInput, optionalSheet) {
  var trackingSheet = optionalSheet || sheet1 || getTrackingSheet_();
  var resolvedActiveCol = Number(activeColInput) || ensureTodayColumn_(trackingSheet, new Date());

  if (!streaksID) {
    return {
      ok: false,
      error: 'Missing streaksID.'
    };
  }

  var rowLookup = findRowByMetricId_(streaksID, trackingSheet);
  if (!rowLookup.row) {
    return {
      ok: false,
      error: rowLookup.error || ('metricID not found in sheet: ' + streaksID)
    };
  }

  trackingSheet.getRange(rowLookup.row, resolvedActiveCol).setValue(streakValue);
  return {
    ok: true,
    row: rowLookup.row,
    value: streakValue
  };
}

function recomputeAllStreaks() {
  var config = getAppConfig();
  var metricSettings = Array.isArray(config.metricSettings) ? config.metricSettings : [];
  var warnings = [];
  var updated = 0;
  var skipped = 0;

  taskIdColumn = config.sheetConfig.taskIdColumn || 1;
  labelColumn = config.sheetConfig.labelColumn || (taskIdColumn + 1);
  dataStartColumn = config.sheetConfig.dataStartColumn || (labelColumn + 1);
  lateExtensionHours = config.lateExtensionHours !== undefined ? config.lateExtensionHours : (config.rows && config.rows.lateExtension !== undefined ? config.rows.lateExtension : 0);
  lateExtension = lateExtensionHours;
  trackingSheetName = config.trackingSheetName || (config.sheetConfig && config.sheetConfig.trackingSheetName);

  var trackingSheet = getTrackingSheet_();
  var now = new Date();
  var resolvedActiveCol = ensureTodayColumn_(trackingSheet, now);

  for (var i = 0; i < metricSettings.length; i++) {
    var metric = metricSettings[i] || {};
    var metricID = metric.metricID;
    var streaksID = metric.streaks && metric.streaks.streaksID;

    if (!metricID || !streaksID) {
      skipped += 1;
      continue;
    }

    var streakValue = calculateStreak_(metricID, resolvedActiveCol, lateExtensionHours, trackingSheet);
    var writeResult = writeStreakToSheet_(streaksID, streakValue, resolvedActiveCol, trackingSheet);
    if (!writeResult.ok) {
      warnings.push(writeResult.error || ('Unable to write streak for metricID: ' + metricID));
      continue;
    }

    updated += 1;
  }

  var result = {
    ok: warnings.length === 0,
    updated: updated,
    skipped: skipped,
    activeCol: resolvedActiveCol,
    warnings: warnings
  };

  console.log('recomputeAllStreaks result: ' + JSON.stringify(result));
  return result;
}

function installDailyStreakRecomputeTrigger() {
  var handlerName = 'recomputeAllStreaks';
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .atHour(1)
    .everyDays(1)
    .create();

  return {
    ok: true,
    handler: handlerName,
    scheduledAtHour: 1
  };
}

function normalizeScheduledDays_(datesConfig) {
  if (!Array.isArray(datesConfig) || datesConfig.length === 0) {
    return [];
  }

  var seen = {};
  var normalized = [];

  for (var i = 0; i < datesConfig.length; i++) {
    var entry = datesConfig[i];
    var day = null;

    if (Array.isArray(entry) && entry.length > 0) {
      day = entry[0];
    } else if (typeof entry === 'string') {
      day = entry;
    }

    if (typeof day !== 'string') {
      continue;
    }

    var normalizedDay = day.trim().toLowerCase();
    if (!normalizedDay || seen[normalizedDay]) {
      continue;
    }

    seen[normalizedDay] = true;
    normalized.push(normalizedDay);
  }

  return normalized;
}

function isScheduledColumn_(trackingSheet, col, scheduleDays, useScheduleFilter, extensionHours) {
  if (!useScheduleFilter) {
    return true;
  }

  var headerValue = trackingSheet.getRange(1, col).getValue();
  var dateValue = headerValue instanceof Date ? headerValue : new Date(headerValue);

  if (!(dateValue instanceof Date) || isNaN(dateValue.getTime())) {
    return false;
  }

  var shiftedDate = new Date(dateValue.getTime() - Number(extensionHours || 0) * 60 * 60 * 1000);
  var dayName = Utilities.formatDate(shiftedDate, Session.getScriptTimeZone(), 'EEEE').toLowerCase();
  return scheduleDays.indexOf(dayName) !== -1;
}

function isCompletedCellValue_(value) {
  return !(value === '' || value === null);
}

function validateMetricValueForRecord_(metricType, rawValue) {
  var normalizedType = metricType || "number";

  if (normalizedType === "number") {
    var parsedNumber = parseStrictNumber_(rawValue);
    if (parsedNumber === null) {
      return {
        ok: false,
        error: "Invalid number value. Expected strict numeric input without commas."
      };
    }

    return {
      ok: true,
      value: parsedNumber
    };
  }

  if (normalizedType === "duration") {
    var durationSeconds = parseDurationToSeconds_(rawValue, false);
    if (durationSeconds === null) {
      return {
        ok: false,
        error: "Invalid duration value. Use MM:SS or HH:MM:SS."
      };
    }

    return {
      ok: true,
      value: secondsToDurationString_(durationSeconds),
      seconds: durationSeconds
    };
  }

  if (normalizedType === "timestamp" ||
      normalizedType === "due_by" ||
      normalizedType === "start_timer" ||
      normalizedType === "stop_timer") {
    return {
      ok: true,
      value: new Date()
    };
  }

  return {
    ok: false,
    error: "Unsupported metric type: " + normalizedType
  };
}

function evaluateDueByWriteGate_(setting, now, extensionHours) {
  var metricType = setting && (setting.type || setting.unitType);
  if (metricType !== 'due_by') {
    return {
      isLate: false
    };
  }

  var dueByLookup = getDueByTimeForCurrentEffectiveDay_(setting && setting.dates, now || new Date(), extensionHours);
  if (dueByLookup.warning) {
    return {
      isLate: false,
      warning: dueByLookup.warning
    };
  }

  if (!dueByLookup.dueDateTime) {
    return {
      isLate: false
    };
  }

  return {
    isLate: now.getTime() > dueByLookup.dueDateTime.getTime()
  };
}

function getDueByTimeForCurrentEffectiveDay_(datesConfig, now, extensionHours) {
  if (!Array.isArray(datesConfig) || datesConfig.length === 0) {
    return {
      dueDateTime: null
    };
  }

  var extensionMs = normalizeExtensionMs_(extensionHours);
  var effectiveNow = new Date(now.getTime() - extensionMs);
  var effectiveDayName = Utilities.formatDate(effectiveNow, Session.getScriptTimeZone(), 'EEEE').toLowerCase();
  var seenDays = {};

  for (var i = 0; i < datesConfig.length; i++) {
    var entry = datesConfig[i];
    if (!Array.isArray(entry) || entry.length === 0) {
      continue;
    }

    var dayValue = entry[0];
    if (typeof dayValue !== 'string') {
      continue;
    }

    var normalizedDay = dayValue.trim().toLowerCase();
    if (!normalizedDay || seenDays[normalizedDay]) {
      continue;
    }
    seenDays[normalizedDay] = true;

    if (normalizedDay !== effectiveDayName) {
      continue;
    }

    var dueByTime = entry.length > 1 ? entry[1] : null;
    if (dueByTime === null || dueByTime === undefined || String(dueByTime).trim() === '') {
      return {
        dueDateTime: null
      };
    }

    var parsedDueByTime = parseDueByTime_(dueByTime);
    if (!parsedDueByTime) {
      return {
        dueDateTime: null,
        warning: 'Invalid dueByTime for day ' + normalizedDay + ': ' + dueByTime
      };
    }

    var dueDateTimeInEffectiveDay = new Date(
      effectiveNow.getFullYear(),
      effectiveNow.getMonth(),
      effectiveNow.getDate(),
      parsedDueByTime.hours,
      parsedDueByTime.minutes,
      0,
      0
    );

    return {
      dueDateTime: new Date(dueDateTimeInEffectiveDay.getTime() + extensionMs)
    };
  }

  return {
    dueDateTime: null
  };
}

function normalizeExtensionMs_(extensionHours) {
  var numericHours = Number(extensionHours);
  if (!isFinite(numericHours) || numericHours < 0) {
    numericHours = 0;
  }

  return numericHours * 60 * 60 * 1000;
}

function parseDueByTime_(dueByTime) {
  if (typeof dueByTime !== 'string') {
    return null;
  }

  var trimmed = dueByTime.trim();
  var matches = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!matches) {
    return null;
  }

  return {
    hours: Number(matches[1]),
    minutes: Number(matches[2])
  };
}


function normalizeRecordType_(recordType) {
  if (recordType === 2 || recordType === "2" || recordType === "keep_first") {
    return "keep_first";
  }

  if (recordType === 3 || recordType === "3" || recordType === "add") {
    return "add";
  }

  return "overwrite";
}

function parseStrictNumber_(value) {
  if (typeof value === "number") {
    return isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  var trimmed = value.trim();
  if (!trimmed || trimmed.indexOf(",") !== -1) {
    return null;
  }

  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return null;
  }

  var parsed = Number(trimmed);
  return isFinite(parsed) ? parsed : null;
}

function parseStoredNumberForAdd_(value) {
  if (value === "" || value === null) {
    return 0;
  }

  return parseStrictNumber_(value);
}

function parseStoredDurationForAdd_(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  if (value instanceof Date) {
    return null;
  }

  if (typeof value === 'number') {
    return null;
  }

  return parseDurationToSeconds_(value, true);
}

function parseDurationToSeconds_(value, allowEmptyAsZero) {
  if (value === "" || value === null || value === undefined) {
    return allowEmptyAsZero ? 0 : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  var trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  var parts = trimmed.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  for (var i = 0; i < parts.length; i++) {
    if (!/^\d+$/.test(parts[i])) {
      return null;
    }
  }

  var hours = 0;
  var minutes;
  var seconds;

  if (parts.length === 2) {
    minutes = Number(parts[0]);
    seconds = Number(parts[1]);
  } else {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    seconds = Number(parts[2]);
  }

  if (minutes > 59 || seconds > 59) {
    return null;
  }

  var totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (totalSeconds > 99 * 3600 + 59 * 60 + 59) {
    return null;
  }

  return totalSeconds;
}

function secondsToDurationString_(totalSeconds) {
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);
  var seconds = totalSeconds % 60;

  return String(hours).padStart(2, '0') + ":" +
    String(minutes).padStart(2, '0') + ":" +
    String(seconds).padStart(2, '0');
}

function getCurrentTrackingDayColumn_(optionalSheet) {
  var trackingSheet = optionalSheet || sheet1 || getTrackingSheet_();
  if (activeCol && Number(activeCol) >= (dataStartColumn || 3)) {
    return Number(activeCol);
  }

  return ensureTodayColumn_(trackingSheet, new Date());
}

function getMetricIdRowMap_(optionalSheet) {
  var trackingSheet = optionalSheet || sheet1 || getTrackingSheet_();
  var lastRow = trackingSheet.getLastRow();
  var emptyMap = {
    firstRowById: {},
    duplicateRowsById: {}
  };

  if (lastRow < 2) {
    return emptyMap;
  }

  var cacheKey = String(trackingSheet.getSheetId()) + ':' + String(lastRow);
  if (!taskIdRowMap || taskIdRowMap.cacheKey !== cacheKey) {
    var firstRowById = {};
    var duplicateRowsById = {};
    var metricIdValues = trackingSheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (var i = 0; i < metricIdValues.length; i++) {
      var rawMetricId = metricIdValues[i][0];
      var normalizedMetricId = String(rawMetricId == null ? '' : rawMetricId).trim();
      if (!normalizedMetricId) {
        continue;
      }

      var rowNumber = i + 2;
      if (!Object.prototype.hasOwnProperty.call(firstRowById, normalizedMetricId)) {
        firstRowById[normalizedMetricId] = rowNumber;
      } else {
        if (!duplicateRowsById[normalizedMetricId]) {
          duplicateRowsById[normalizedMetricId] = [firstRowById[normalizedMetricId]];
        }
        duplicateRowsById[normalizedMetricId].push(rowNumber);
      }
    }

    taskIdRowMap = {
      cacheKey: cacheKey,
      firstRowById: firstRowById,
      duplicateRowsById: duplicateRowsById
    };
  }

  return {
    firstRowById: taskIdRowMap.firstRowById || {},
    duplicateRowsById: taskIdRowMap.duplicateRowsById || {}
  };
}

function findRowByMetricId_(metricID, optionalSheet) {
  var trackingSheet = optionalSheet || sheet1 || getTrackingSheet_();
  var result = {
    row: null,
    error: null,
    warnings: []
  };

  if (typeof metricID !== "string" || !metricID.trim()) {
    result.error = "Invalid metricID for row lookup.";
    return result;
  }

  var metricLookup = getMetricIdRowMap_(trackingSheet);
  var normalizedMetricId = metricID.trim();
  var row = metricLookup.firstRowById[normalizedMetricId];

  if (!row) {
    result.error = "metricID not found in sheet: " + metricID;
    return result;
  }

  result.row = row;

  var duplicateRows = metricLookup.duplicateRowsById[normalizedMetricId];
  if (duplicateRows && duplicateRows.length > 1) {
    var warning = "Duplicate metricID found in sheet column A for " + metricID + ". Using first match at row " + duplicateRows[0] + ".";
    result.warnings.push(warning);
    Logger.log(warning);
  }

  return result;
}

function ensureRowExistsForId_(metricID, displayName, optionalSheet) {
  var lookup = findRowByMetricId_(metricID, optionalSheet);
  if (!lookup.row) {
    return {
      row: null,
      error: lookup.error || ("metricID not found in sheet: " + metricID),
      warnings: lookup.warnings || []
    };
  }

  return {
    row: lookup.row,
    error: null,
    warnings: lookup.warnings || []
  };
}

function buildHabitsV2Response(response) {
  var payload = response || {};

  return JSON.stringify({
    ok: !!payload.ok,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    results: Array.isArray(payload.results) ? payload.results : [],
    errors: Array.isArray(payload.errors) ? payload.errors : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : []
  });
}


function getTrackingSheet_() {
  var config = getAppConfig();
  var scriptProperties = PropertiesService.getScriptProperties();
  var resolvedSpreadsheetID = spreadsheetID || scriptProperties.getProperty(config.scriptProperties.spreadsheetId);
  var resolvedTrackingSheetName = trackingSheetName || config.trackingSheetName || (config.sheetConfig && config.sheetConfig.trackingSheetName);

  if (!resolvedSpreadsheetID) {
    throw new Error('Missing spreadsheet ID script property: ' + config.scriptProperties.spreadsheetId);
  }
  if (!resolvedTrackingSheetName) {
    throw new Error('Missing trackingSheetName in config.');
  }

  var trackingSheet = SpreadsheetApp.openById(resolvedSpreadsheetID).getSheetByName(resolvedTrackingSheetName);
  if (!trackingSheet) {
    throw new Error('Tracking sheet not found: ' + resolvedTrackingSheetName);
  }

  spreadsheetID = resolvedSpreadsheetID;
  trackingSheetName = resolvedTrackingSheetName;
  sheet1 = trackingSheet;
  return trackingSheet;
}

function getEffectiveDayKey_(dateObj, extensionHours) {
  var hours = Number(extensionHours);
  if (!isFinite(hours) || hours < 0) {
    hours = 0;
  }

  var shiftedDate = new Date(dateObj.getTime() - hours * 60 * 60 * 1000);
  return Utilities.formatDate(shiftedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function ensureTodayColumn_(optionalSheet, optionalNow) {
  var trackingSheet = optionalSheet || sheet1 || getTrackingSheet_();
  var now = optionalNow || new Date();

  if (trackingSheet.getRange(1, 1).getValue() === '') {
    trackingSheet.getRange(1, 1).setValue('Metric ID');
  }
  if (trackingSheet.getRange(1, 2).getValue() === '') {
    trackingSheet.getRange(1, 2).setValue('Metric');
  }

  var maxLastColumn = Math.max(trackingSheet.getLastColumn(), dataStartColumn || 3);
  var headerRangeWidth = maxLastColumn - (dataStartColumn || 3) + 1;
  var headerValues = trackingSheet.getRange(1, dataStartColumn || 3, 1, headerRangeWidth).getValues()[0];

  var lastDateHeaderCol = (dataStartColumn || 3) - 1;
  var lastHeaderValue = null;

  for (var i = headerValues.length - 1; i >= 0; i--) {
    if (headerValues[i] !== '' && headerValues[i] !== null) {
      lastDateHeaderCol = (dataStartColumn || 3) + i;
      lastHeaderValue = headerValues[i];
      break;
    }
  }

  if (lastDateHeaderCol < (dataStartColumn || 3)) {
    trackingSheet.getRange(1, dataStartColumn || 3).setValue(now);
    firstHabitofDay = 1;
    return dataStartColumn || 3;
  }

  var parsedLastHeader = lastHeaderValue instanceof Date ? lastHeaderValue : new Date(lastHeaderValue);
  if (isNaN(parsedLastHeader.getTime())) {
    trackingSheet.getRange(1, lastDateHeaderCol).setValue(now);
    return lastDateHeaderCol;
  }

  var currentDayKey = getEffectiveDayKey_(now, lateExtensionHours !== undefined ? lateExtensionHours : lateExtension);
  var lastHeaderDayKey = getEffectiveDayKey_(parsedLastHeader, lateExtensionHours !== undefined ? lateExtensionHours : lateExtension);

  if (currentDayKey === lastHeaderDayKey) {
    return lastDateHeaderCol;
  }

  var newColumn = lastDateHeaderCol + 1;
  trackingSheet.getRange(1, newColumn).setValue(now);
  firstHabitofDay = 1;
  return newColumn;
}


function loadSettings(global_key) {

  key = global_key;

  console.log("loading settings");
  var scriptProperties = PropertiesService.getScriptProperties();
  var config = getAppConfig();

  positive_push_notifications = config.positive_push_notifications; // On/Off

  taskIdColumn = config.sheetConfig.taskIdColumn || 1;
  labelColumn = config.sheetConfig.labelColumn || (taskIdColumn + 1);
  dataStartColumn = config.sheetConfig.dataStartColumn || (labelColumn + 1);

  //screen time features
  screenTimeLimit = config.screenTime.limit; //total limit (hours)
  cumulativeScreenTimeRow = config.screenTime.cumulativeRow;
  screenTimeRationing = config.screenTime.rationing; //"ON" or "OFF", acts like this: if you are 50% through the day, and you are at or above 50% of your screentime, it blocks the app the next time you open the app to "ration" or cooldown your usage until more time has passed
  screenStartTime = config.screenTime.startTime; //24h hour format, used with rationing feature
  rationDuration = config.screenTime.rationDuration; //hours until your access is 100% -> used with rationing feature. Lower number means you get more time allowed earlier in the day
  appLockSettings = Object.assign({}, config.appLockSettings);

  appCloserRow = config.rows.appCloserRow;
  personalPlanningRow = config.rows.personalPlanningRow;
  lateExtensionHours = config.lateExtensionHours !== undefined ? config.lateExtensionHours : config.rows.lateExtension;
  lateExtension = lateExtensionHours; // Backward compatible alias for existing behavior.

  trackingSheetName = config.trackingSheetName || config.sheetConfig.trackingSheetName;
  writeToNotion = !!config.writeToNotion;
  dailyPointsID = config.dailyPointsID;
  cumulativePointsID = config.cumulativePointsID;

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
  sheet1 = getTrackingSheet_();
  separatorChar = config.sheetConfig.separatorChar;  // this character should be one that you'll never use. It must match what's in your apple shortcuts. It's "Ù" by default.
  taskIdRowMap = buildTaskIdRowMap_(sheet1, taskIdColumn);

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

  if (config.legacyMetricSettings && config.legacyMetricSettings[key]) {
    return resolveMetricSettings_(config.legacyMetricSettings[key], config, taskIdRowMap);
  }

  if (config.metricSettings && !Array.isArray(config.metricSettings) && config.metricSettings[key]) {
    return resolveMetricSettings_(config.metricSettings[key], config, taskIdRowMap);
  }

  return ContentService.createTextOutput("Invalid Key. Please try again.");
}

function getMetricSettingById(metricID) {
  var config = getAppConfig();
  var settings = Array.isArray(config.metricSettings) ? config.metricSettings : [];
  var errors = [];
  var firstMatchIndex = -1;

  for (var i = 0; i < settings.length; i++) {
    if (!settings[i] || settings[i].metricID !== metricID) {
      continue;
    }
    if (firstMatchIndex === -1) {
      firstMatchIndex = i;
    } else {
      errors.push('Duplicate metricID found in metricSettings: ' + metricID + '. Using first match at index ' + firstMatchIndex + '.');
    }
  }

  return {
    setting: firstMatchIndex === -1 ? null : settings[firstMatchIndex],
    index: firstMatchIndex,
    errors: errors
  };
}

function validateConfig() {
  var config = getAppConfig();
  var errors = [];
  var warnings = [];

  if (!config.trackingSheetName && !(config.sheetConfig && config.sheetConfig.trackingSheetName)) {
    errors.push('Missing trackingSheetName.');
  }

  if (!config.dailyPointsID) {
    warnings.push('dailyPointsID is not set.');
  }
  if (!config.cumulativePointsID) {
    warnings.push('cumulativePointsID is not set.');
  }

  if (config.lateExtensionHours === undefined && !(config.rows && config.rows.lateExtension !== undefined)) {
    warnings.push('lateExtensionHours is not set. Falling back to default behavior may be inconsistent.');
  }

  var settings = Array.isArray(config.metricSettings) ? config.metricSettings : [];
  var metricIds = {};

  for (var i = 0; i < settings.length; i++) {
    var setting = settings[i] || {};
    if (!setting.metricID) {
      errors.push('metricSettings[' + i + '] is missing metricID.');
      continue;
    }
    if (metricIds[setting.metricID] !== undefined) {
      errors.push('Duplicate metricID in metricSettings: ' + setting.metricID + ' (indexes ' + metricIds[setting.metricID] + ' and ' + i + ').');
    } else {
      metricIds[setting.metricID] = i;
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

function normalizeMetricInput(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  var normalized = [];
  for (var i = 0; i < data.length; i++) {
    var entry = data[i];

    if (Array.isArray(entry)) {
      if (entry.length === 0 || entry[0] === undefined || entry[0] === null || String(entry[0]).trim() === '') {
        continue;
      }
      normalized.push(entry.length > 1 ? [String(entry[0]), entry[1]] : [String(entry[0])]);
      continue;
    }

    if (entry && typeof entry === 'object' && entry.metricID !== undefined && entry.metricID !== null) {
      var metricID = String(entry.metricID);
      if (!metricID.trim()) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'value')) {
        normalized.push([metricID, entry.value]);
      } else {
        normalized.push([metricID]);
      }
      continue;
    }

    if (entry !== undefined && entry !== null && String(entry).trim() !== '') {
      normalized.push([String(entry)]);
    }
  }

  return normalized;
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

function resolveMetricSettings_(metricSettings, config, taskIdRowMap) {
  return metricSettings.map(function (metric) {
    var resolvedMetric = Object.assign({}, metric);
    if (resolvedMetric.taskId) {
      resolvedMetric.rowNumber = resolveTaskIdRow_(resolvedMetric.taskId, taskIdRowMap);
      return resolvedMetric;
    }
    if (resolvedMetric.rowNumberKey) {
      resolvedMetric.rowNumber = config.rows[resolvedMetric.rowNumberKey];
      delete resolvedMetric.rowNumberKey;
      return resolvedMetric;
    }
    return resolvedMetric;
  });
}

function buildTaskIdRowMap_(sheet, taskIdColumn) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {};
  }

  var taskIdValues = sheet.getRange(2, taskIdColumn, lastRow - 1, 1).getValues();
  var map = {};

  taskIdValues.forEach(function (rowValue, index) {
    var rawValue = rowValue[0];
    if (rawValue === "" || rawValue === null) {
      return;
    }
    var taskId = String(rawValue).trim();
    if (!taskId) {
      return;
    }
    if (map[taskId]) {
      throw new Error("Duplicate taskID found in sheet: " + taskId);
    }
    map[taskId] = index + 2;
  });

  return map;
}

function resolveTaskIdRow_(taskId, taskIdRowMap) {
  if (!taskIdRowMap || !taskIdRowMap[taskId]) {
    throw new Error("taskID not found in sheet: " + taskId);
  }
  return taskIdRowMap[taskId];
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
    const dataRange = dataSheet.getRange(habit.row, dataStartColumn, 1, activeCol - dataStartColumn).getValues()[0];
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
  return ensureTodayColumn_(sheet1, new Date());
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
  if (activeCol < dataStartColumn + 1) {
    //return "no prior data to compare to. Complete this task tomorrow for new performance insights!";
    return "Well done! Complete this tomorrow for new performance insights.";
  }
  else if (metricSettings["dayToDayChance"] < 1 && metricSettings["dayToDayChance"] > 0 && activeCol - averageSpan + 1 < dataStartColumn) {
    metricSettings["dayToDayChance"] = 1;
  }
  else if (metricSettings["dayToDayChance"] == 0 && activeCol - averageSpan + 1 < dataStartColumn) {
    return "Nice job! Not enough data to compare averages yet.";
  }

  //if this is our first iteration
  if (dataRange.length == 0) {
    console.log("running findPerformanceInsights with: " + metricSettings["insightFirstWords"]);
    dataRange = sheet1.getRange(metricSettings["rowNumber"], dataStartColumn, 1, activeCol - dataStartColumn).getValues()[0];
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

    todaysValue = turnToNumber(metricSettings, dataRange[activeCol - dataStartColumn - 1]); //should be the last element in the array

    //iterate through all possible comparisons
    for (let i = 0; i < comparisonArray.length; i++) {

      //validate comparison is possible and grab number
      var compColumn = activeCol - comparisonArray[i][0];
      if (compColumn >= dataStartColumn && compColumn < activeCol) {

        if (chooseChance != 1) {
          chooseChance = (chooseChance / (1-chooseChance)); //chances need to go up each time
        }

        compValue = turnToNumber(metricSettings, dataRange[activeCol - dataStartColumn - 1 - comparisonArray[i][0]]); //  ASDF;LKJASDF;LKAJSDF;LKJASDF;LKJASDF;LKJASD;FLKJASD

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
      todaysValue = turnToNumber(metricSettings, dataRange[activeCol - dataStartColumn - 1]);
      var messageModifier = "today";
    }
    else {
      todaysValue = getAverage(turnArrayToNumbers(metricSettings, dataRange.slice([activeCol - dataStartColumn - averageSpan], [activeCol - dataStartColumn])));
      var messageModifier = "this " + averageSpan + " day span";
    }

    //iterate through all possible comparisons
    for (let i = 0; i < comparisonArray.length; i++) {

      //validate comparison is possible and grab number
      var compColumn = activeCol - comparisonArray[i][0];
      if ((compColumn - averageSpan + 1) >= dataStartColumn && compColumn < activeCol) {
        
        if (chooseChance != 1) {
          chooseChance = (chooseChance / (1-chooseChance)); //chances need to go up each time
        }

        compValue = getAverage(turnArrayToNumbers(metricSettings, dataRange.slice([activeCol - dataStartColumn - comparisonArray[i][0] - averageSpan], [activeCol - dataStartColumn - comparisonArray[i][0]])));

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
    var startColumn = Math.max(lastColumnWithData - range.lastXDays + 1, dataStartColumn);

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
