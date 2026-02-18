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

// Establishing global variables used by Habits V2 / Lockouts V2.
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
var firstHabitofDay = 0;
var lateExtension;
var lateExtensionHours;
var trackingSheetName;
var writeToNotion;
var dailyPointsID;
var cumulativePointsID;
var positive_push_notifications;

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
  if (key === "app_closer_v2") {
    var lockoutsTrackingSheet = getTrackingSheet_();
    var lockoutsTodayCol = getCurrentTrackingDayColumn_(lockoutsTrackingSheet);
    return respondJson_(lockoutsV2_handleAppCloser_({
      data: request.dataRaw
    }, {
      now: currentTimeStamp,
      trackingSheet: lockoutsTrackingSheet,
      todayCol: lockoutsTodayCol,
      activeCol: lockoutsTodayCol,
      tz: Session.getScriptTimeZone(),
      config: getLockoutsV2Config_()
    }));
  }

  return respondText_('Unsupported key: ' + key);
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
    var messageTemplate = getPpnMessageTemplate_(metric);

    if (!messageTemplate) {
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
    var message = composePpnMessage_(messageTemplate, streakCount, metric.streaks && metric.streaks.unit);

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

function getPpnMessageTemplate_(metric) {
  if (!metric || typeof metric !== 'object') {
    return null;
  }

  if (metric.ppnMessage === undefined || metric.ppnMessage === null || metric.ppnMessage === '') {
    return null;
  }

  return metric.ppnMessage;
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

    var hourRanges = parsePpnHourRanges_(entry);
    if (!hourRanges) {
      return true;
    }

    return isCurrentHourWithinAnyRange_(now, hourRanges);
  }

  return !hasDayEntries;
}

function parsePpnHourRanges_(dateEntry) {
  if (!Array.isArray(dateEntry) || dateEntry.length < 3) {
    return null;
  }

  var explicitRanges = dateEntry[2];
  var legacyStart = parseOptionalHour_(explicitRanges);
  var legacyEnd = parseOptionalHour_(dateEntry.length > 3 ? dateEntry[3] : null);

  if (Array.isArray(explicitRanges)) {
    var parsedRanges = [];

    for (var i = 0; i < explicitRanges.length; i++) {
      var rangeEntry = explicitRanges[i];
      if (!Array.isArray(rangeEntry) || rangeEntry.length < 2) {
        continue;
      }

      var startHour = parseOptionalHour_(rangeEntry[0]);
      var endHour = parseOptionalHour_(rangeEntry[1]);

      if (startHour === null || endHour === null) {
        continue;
      }

      parsedRanges.push([startHour, endHour]);
    }

    return parsedRanges.length > 0 ? parsedRanges : null;
  }

  if (legacyStart === null || legacyEnd === null) {
    return null;
  }

  return [[legacyStart, legacyEnd]];
}

function isCurrentHourWithinAnyRange_(now, ranges) {
  for (var i = 0; i < ranges.length; i++) {
    if (isCurrentHourWithinRange_(now, ranges[i][0], ranges[i][1])) {
      return true;
    }
  }

  return false;
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

      var timerInsightMessage = findPerformanceInsightsV2_(setting, trackingSheet, activeCol);
      if (timerInsightMessage) {
        resultEntry.insight = timerInsightMessage;
        messages.push(timerInsightMessage);
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
        var numberAddInsightMessage = findPerformanceInsightsV2_(setting, trackingSheet, activeCol);
        if (numberAddInsightMessage) {
          resultEntry.insight = numberAddInsightMessage;
          messages.push(numberAddInsightMessage);
        }
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
      var durationAddInsightMessage = findPerformanceInsightsV2_(setting, trackingSheet, activeCol);
      if (durationAddInsightMessage) {
        resultEntry.insight = durationAddInsightMessage;
        messages.push(durationAddInsightMessage);
      }
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

    var overwriteInsightMessage = findPerformanceInsightsV2_(setting, trackingSheet, activeCol);
    if (overwriteInsightMessage) {
      resultEntry.insight = overwriteInsightMessage;
      messages.push(overwriteInsightMessage);
    }

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

function resolveInsightsConfig_(setting) {
  if (!setting || typeof setting !== 'object') {
    return null;
  }

  var insights = setting.insights || setting.metricInsightSettings;
  if (!insights || typeof insights !== 'object') {
    return null;
  }

  var normalized = {};
  for (var keyName in insights) {
    if (Object.prototype.hasOwnProperty.call(insights, keyName)) {
      normalized[keyName] = insights[keyName];
    }
  }

  if (normalized.firstWords === undefined && normalized.insightFirstWords !== undefined) {
    normalized.firstWords = normalized.insightFirstWords;
  }
  if (normalized.insightFirstWords === undefined && normalized.firstWords !== undefined) {
    normalized.insightFirstWords = normalized.firstWords;
  }

  return normalized;
}

function findPerformanceInsightsV2_(setting, optionalSheet, optionalActiveCol, dataRange, foundNegativeComp, foundPositiveComp) {
  var trackingSheet = optionalSheet || sheet1 || getTrackingSheet_();
  var resolvedActiveCol = Number(optionalActiveCol) || activeCol || getCurrentTrackingDayColumn_(trackingSheet);
  var insights = resolveInsightsConfig_(setting);

  if (!insights) {
    return '';
  }

  if (insights.insightChance !== undefined && Math.random() > Number(insights.insightChance)) {
    return '';
  }

  if (foundNegativeComp === undefined) {
    foundNegativeComp = 0;
  }
  if (foundPositiveComp === undefined) {
    foundPositiveComp = 0;
  }

  var appConfig = getAppConfig();
  var v2InsightsConfig = appConfig && appConfig.habitsV2Insights ? appConfig.habitsV2Insights : {};
  var originalComparisonArray = Array.isArray(v2InsightsConfig.comparisonArray) ? v2InsightsConfig.comparisonArray : [];
  var comparisonArray = originalComparisonArray.slice();
  var averageSpan = Number(v2InsightsConfig.averageSpan);
  if (!isFinite(averageSpan) || averageSpan < 1) {
    averageSpan = 7;
  }

  var posPerformanceFreq = Number(v2InsightsConfig.posPerformanceFreq);
  if (!isFinite(posPerformanceFreq)) {
    posPerformanceFreq = 1;
  }
  var negPerformanceFreq = Number(v2InsightsConfig.negPerformanceFreq);
  if (!isFinite(negPerformanceFreq)) {
    negPerformanceFreq = 1;
  }

  if (Math.random() <= Number(insights.streakProb || 0)) {
    var extensionHours = lateExtensionHours !== undefined ? lateExtensionHours : lateExtension;
    var streakCount = calculateStreak_(setting.metricID, resolvedActiveCol, extensionHours, trackingSheet);
    return 'streak +1. Now = ' + streakCount + ' days';
  }

  var validSettings = checkInsightsSettingsV2_(insights);
  if (validSettings !== 1) {
    return validSettings;
  }

  if (resolvedActiveCol < 4) {
    return 'Well done! Complete this tomorrow for new performance insights.';
  } else if (Number(insights.dayToDayChance) < 1 && Number(insights.dayToDayChance) > 0 && resolvedActiveCol - averageSpan + 1 < 2) {
    insights.dayToDayChance = 1;
  } else if (Number(insights.dayToDayChance) === 0 && resolvedActiveCol - averageSpan + 1 < 2) {
    return 'Nice job! Not enough data to compare averages yet.';
  }

  var chooseChance;
  if (!Array.isArray(dataRange) || dataRange.length === 0) {
    var resolvedRow = (typeof setting.rowNumber === 'number' && setting.rowNumber > 0) ? setting.rowNumber : null;
    if (!resolvedRow) {
      var rowLookup = findRowByMetricId_(setting.metricID, trackingSheet);
      resolvedRow = rowLookup.row;
    }

    if (!resolvedRow) {
      return '';
    }

    dataRange = trackingSheet.getRange(resolvedRow, 2, 1, resolvedActiveCol - 1).getValues()[0];
    chooseChance = Math.round(1 / maxPossibleComparisonsV2_(insights, originalComparisonArray, averageSpan) * 100) / 100;
  } else {
    chooseChance = 1;
    comparisonArray = shuffleV2_(comparisonArray);
    posPerformanceFreq = 1;
    negPerformanceFreq = 1;
  }

  var todaysValue;
  var compValue;

  if (Math.random() <= Number(insights.dayToDayChance)) {
    todaysValue = turnToNumberV2_(setting, dataRange[resolvedActiveCol - 2]);

    for (var i = 0; i < comparisonArray.length; i++) {
      var compColumn = resolvedActiveCol - comparisonArray[i][0];
      if (compColumn > 1 && compColumn < resolvedActiveCol) {
        if (chooseChance !== 1) {
          chooseChance = chooseChance / (1 - chooseChance);
        }

        compValue = turnToNumberV2_(setting, dataRange[resolvedActiveCol - 2 - comparisonArray[i][0]]);
        if (compValue > 0) {
          if ((todaysValue - compValue) * Number(insights.increaseGood) > 0) {
            foundPositiveComp = 1;
            if (Math.random() <= posPerformanceFreq * chooseChance) {
              return insights.firstWords + ' ' + findMessageValueV2_(insights, todaysValue, compValue) + ' vs ' + comparisonArray[i][1] + '!';
            }
          } else {
            foundNegativeComp = 1;
            if (Math.random() <= negPerformanceFreq * chooseChance) {
              return insights.firstWords + ' ' + findMessageValueV2_(insights, todaysValue, compValue) + ' vs ' + comparisonArray[i][1] + ' ';
            }
          }
        }
      }
    }
  } else {
    var messageModifier;
    if (Math.random() <= Number(insights.dayToAvgChance)) {
      todaysValue = turnToNumberV2_(setting, dataRange[resolvedActiveCol - 2]);
      messageModifier = 'today';
    } else {
      todaysValue = getAverageV2_(turnArrayToNumbersV2_(setting, dataRange.slice(resolvedActiveCol - 2 - averageSpan + 1, resolvedActiveCol - 2 + 1)));
      messageModifier = 'this ' + averageSpan + ' day span';
    }

    for (var j = 0; j < comparisonArray.length; j++) {
      var avgCompColumn = resolvedActiveCol - comparisonArray[j][0];
      if ((avgCompColumn - averageSpan + 1) >= 2 && avgCompColumn < resolvedActiveCol) {
        if (chooseChance !== 1) {
          chooseChance = chooseChance / (1 - chooseChance);
        }

        compValue = getAverageV2_(turnArrayToNumbersV2_(setting, dataRange.slice(resolvedActiveCol - 2 - comparisonArray[j][0] - averageSpan + 1, resolvedActiveCol + 1 - 2 - comparisonArray[j][0])));
        if (compValue !== 0) {
          if ((todaysValue - compValue) * Number(insights.increaseGood) > 0) {
            foundPositiveComp = 1;
            if (Math.random() <= posPerformanceFreq * chooseChance) {
              return insights.firstWords + ' ' + findMessageValueV2_(insights, todaysValue, compValue) + ' ' + messageModifier + ' vs ' + averageSpan + ' day span concluding ' + comparisonArray[j][1] + '!';
            }
          } else {
            foundNegativeComp = 1;
            if (Math.random() <= negPerformanceFreq * chooseChance) {
              return insights.firstWords + ' ' + findMessageValueV2_(insights, todaysValue, compValue) + ' ' + messageModifier + ' vs ' + averageSpan + ' day span concluding ' + comparisonArray[j][1] + ' ';
            }
          }
        }
      }
    }
  }

  if (foundNegativeComp === 0 && foundPositiveComp === 0) {
    return 'Complete tomorrow for new performance comparisons!';
  }

  if ((foundPositiveComp === 0 && negPerformanceFreq === 0) || (foundNegativeComp === 0 && posPerformanceFreq === 0)) {
    return '';
  }

  return findPerformanceInsightsV2_(setting, trackingSheet, resolvedActiveCol, dataRange, foundNegativeComp, foundPositiveComp);
}

function findMessageValueV2_(insights, todaysValue, compValue) {
  var units = insights.insightUnits;

  if (units === 'minutes' && (todaysValue - compValue > 60 || compValue - todaysValue > 60)) {
    units = 'hours';
    todaysValue = todaysValue / 60;
    compValue = compValue / 60;
  }

  if (Math.random() <= Number(insights.rawValueChance)) {
    var rawDelta = Math.round((todaysValue - compValue) * 100) / 100;
    if (rawDelta > 0) {
      return '+' + String(rawDelta) + ' ' + units;
    }
    return String(rawDelta) + ' ' + units;
  }

  var percentDelta = Math.round(((todaysValue / compValue - 1) * 100) * 100) / 100;
  if (percentDelta > 0) {
    return '+' + String(percentDelta) + '%';
  }
  return String(percentDelta) + '%';
}

function checkInsightsSettingsV2_(insights) {
  if (!insights.firstWords) {
    return 'Insights config error: missing insights.firstWords.';
  }

  var requiredNumericKeys = ['streakProb', 'dayToDayChance', 'dayToAvgChance', 'rawValueChance', 'increaseGood'];
  for (var i = 0; i < requiredNumericKeys.length; i++) {
    var keyName = requiredNumericKeys[i];
    var numeric = Number(insights[keyName]);
    if (!isFinite(numeric)) {
      return 'Insights config error: insights.' + keyName + ' must be numeric.';
    }
    insights[keyName] = numeric;
  }

  if (!insights.insightUnits) {
    return 'Insights config error: missing insights.insightUnits.';
  }

  return 1;
}

function maxPossibleComparisonsV2_(insights, comparisonArray, averageSpan) {
  var dayToDayChance = Number(insights.dayToDayChance);
  var dayToAvgChance = Number(insights.dayToAvgChance);
  var dayToDayCount = Array.isArray(comparisonArray) ? comparisonArray.length : 1;
  var avgCount = Array.isArray(comparisonArray) ? comparisonArray.length : 1;

  if (!isFinite(dayToDayChance) || dayToDayChance < 0) {
    dayToDayChance = 0;
  }
  if (!isFinite(dayToAvgChance) || dayToAvgChance < 0) {
    dayToAvgChance = 0;
  }
  if (!isFinite(averageSpan) || averageSpan < 1) {
    averageSpan = 7;
  }

  var weighted = dayToDayChance * dayToDayCount + (1 - dayToDayChance) * avgCount;
  if (weighted <= 0) {
    weighted = 1;
  }

  return weighted;
}

function turnToNumberV2_(setting, value) {
  var metricType = setting && (setting.type || setting.unitType) || 'number';
  if (metricType === 'duration') {
    var seconds = parseDurationToSeconds_(value, false);
    if (seconds === null) {
      return 0;
    }
    return seconds / 60;
  }

  var numeric = parseStrictNumber_(value);
  return numeric === null ? 0 : numeric;
}

function turnArrayToNumbersV2_(setting, arr) {
  var result = [];
  if (!Array.isArray(arr)) {
    return result;
  }

  for (var i = 0; i < arr.length; i++) {
    result.push(turnToNumberV2_(setting, arr[i]));
  }

  return result;
}

function getAverageV2_(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return 0;
  }

  var total = 0;
  var count = 0;
  for (var i = 0; i < arr.length; i++) {
    var numeric = Number(arr[i]);
    if (!isFinite(numeric)) {
      continue;
    }
    total += numeric;
    count += 1;
  }

  return count ? total / count : 0;
}

function shuffleV2_(arr) {
  if (!Array.isArray(arr)) {
    return [];
  }

  var copy = arr.slice();
  for (var i = copy.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
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

  console.log('loading settings');
  var scriptProperties = PropertiesService.getScriptProperties();
  var config = getAppConfig();

  positive_push_notifications = config.positive_push_notifications || 'On';

  taskIdColumn = config.sheetConfig && config.sheetConfig.taskIdColumn || 1;
  labelColumn = config.sheetConfig && config.sheetConfig.labelColumn || (taskIdColumn + 1);
  dataStartColumn = config.sheetConfig && config.sheetConfig.dataStartColumn || (labelColumn + 1);

  lateExtensionHours = config.lateExtensionHours !== undefined ? config.lateExtensionHours :
    (config.rows && config.rows.lateExtension !== undefined ? config.rows.lateExtension : 0);
  lateExtension = lateExtensionHours; // Backward-compatible alias.

  trackingSheetName = config.trackingSheetName || (config.sheetConfig && config.sheetConfig.trackingSheetName) || 'Tracking Data';
  writeToNotion = !!config.writeToNotion;
  dailyPointsID = config.dailyPointsID;
  cumulativePointsID = config.cumulativePointsID;

  spreadsheetID = scriptProperties.getProperty(config.scriptProperties.spreadsheetId);
  sheet1 = getTrackingSheet_();
  separatorChar = (config.sheetConfig && config.sheetConfig.separatorChar) || 'Ù';
  taskIdRowMap = buildTaskIdRowMap_(sheet1, taskIdColumn);

  return [];
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
