/**
 * Lockouts V2 module.
 *
 * This file contains read-only evaluation helpers for `key="app_closer_v2"`.
 * Existing V1 app_closer behavior is intentionally untouched.
 */

/**
 * Handler for the Lockouts V2 app_closer flow.
 *
 * @param {*} payload Lockouts V2 payload (preset override, app info, etc.)
 * @param {*} ctx Execution context object for shared services/helpers.
 * @return {!Object} Lockouts V2 response-shaped JSON object.
 */
function lockoutsV2_handleAppCloser_(payload, ctx) {
  var context = ctx || {};
  var debugErrors = [];
  var now = context.now instanceof Date ? context.now : new Date();
  var response = {
    status: 'allowed',
    block: null,
    ui: {
      showMessage: false,
      message: ''
    },
    shortcut: {
      name: '',
      input: ''
    },
    debug: {
      preset: null,
      serverTimeISO: now.toISOString(),
      errors: []
    }
  };

  var config = context.config || getLockoutsV2Config_();
  var configValidation = lockoutsV2_validateConfig_(config);
  if (!configValidation.isValid) {
    response.status = 'error';
    debugErrors = debugErrors.concat(configValidation.errors);
    response.debug.errors = debugErrors;
    return response;
  }

  var presetResolution = lockoutsV2_resolvePreset_(payload, {
    now: now,
    config: config,
    calendarLookup: context.calendarLookup
  });
  debugErrors = debugErrors.concat(presetResolution.errors);
  response.debug.preset = presetResolution.preset;

  var evalResult = lockoutsV2_evaluateBlocks_(
    now,
    presetResolution.preset,
    config.blocks,
    context
  );
  debugErrors = debugErrors.concat(evalResult.debugErrors || []);

  if (evalResult.status === 'error') {
    response.status = 'error';
    response.debug.errors = debugErrors;
    return response;
  }

  if (evalResult.status === 'blocked' && evalResult.winningBlock) {
    var blockedPayload = lockoutsV2_buildBlockedUi_(now, evalResult.winningBlock, evalResult.uiComputedFields, config, context);
    response.status = 'blocked';
    response.block = blockedPayload.block;
    response.ui = blockedPayload.ui;
    response.shortcut = blockedPayload.shortcut;
    debugErrors = debugErrors.concat(blockedPayload.errors);
    response.debug.errors = debugErrors;
    return response;
  }

  response.status = 'allowed';
  response.ui = lockoutsV2_buildAllowedUi_(now, presetResolution.preset, config, context, debugErrors);
  response.debug.errors = debugErrors;
  return {
    status: response.status,
    block: response.block,
    ui: response.ui,
    shortcut: response.shortcut,
    debug: response.debug
  };
}

/**
 * Preset resolver for Lockouts V2.
 *
 * @param {*} payload Lockouts V2 payload.
 * @param {*} ctx Execution context object.
 * @return {{preset: (string|null), source: string, errors: !Array<string>}}
 */
function lockoutsV2_resolvePreset_(payload, ctx) {
  var context = ctx || {};
  var config = context.config || {};
  var errors = [];
  var overridePreset = lockoutsV2_parsePresetOverride_(payload && payload.data);

  if (overridePreset) {
    return {
      preset: overridePreset,
      source: 'override',
      errors: errors
    };
  }

  var calendarName = config.globals && config.globals.presetCalendarName;
  if (!calendarName) {
    return {
      preset: null,
      source: 'none',
      errors: errors
    };
  }

  var calendarResult = lockoutsV2_lookupCalendarPreset_(calendarName, context.now, config, context.calendarLookup);
  errors = errors.concat(calendarResult.errors || []);
  return {
    preset: calendarResult.preset,
    source: calendarResult.preset ? 'calendar' : 'none',
    errors: errors
  };
}

function lockoutsV2_parsePresetOverride_(rawData) {
  if (rawData == null) {
    return null;
  }

  var trimmed = String(rawData).trim();
  if (!trimmed) {
    return null;
  }

  if ((trimmed.charAt(0) === '"' && trimmed.charAt(trimmed.length - 1) === '"') ||
      (trimmed.charAt(0) === '\'' && trimmed.charAt(trimmed.length - 1) === '\'')) {
    try {
      var parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string' && parsed.trim()) {
        return parsed.trim();
      }
    } catch (err) {
      // Best-effort only; fall through to plain string handling.
    }
  }

  return trimmed;
}

function lockoutsV2_lookupCalendarPreset_(calendarName, now, config, overrideLookupFn) {
  var errors = [];
  var presetNames = lockoutsV2_getPresetNamesFromBlocks_(config && config.blocks);
  var resolvedPreset = null;

  try {
    var lookupFn = typeof overrideLookupFn === 'function' ? overrideLookupFn : lockoutsV2_defaultCalendarLookup_;
    var matches = lookupFn(calendarName, now, presetNames) || [];
    if (matches.length > 1) {
      errors.push('Multiple preset calendar events matched; using first: ' + matches.join(', '));
    }
    if (matches.length > 0) {
      resolvedPreset = matches[0];
    }
  } catch (error) {
    errors.push('Preset calendar lookup failed: ' + (error && error.message ? error.message : String(error)));
  }

  return {
    preset: resolvedPreset,
    errors: errors
  };
}

function lockoutsV2_defaultCalendarLookup_(calendarName, now, presetNames) {
  var calendars = CalendarApp.getCalendarsByName(String(calendarName));
  if (!calendars || calendars.length === 0) {
    return [];
  }

  var localNow = now instanceof Date ? now : new Date();
  var events = calendars[0].getEventsForDay(localNow);
  var validPreset = {};
  for (var i = 0; i < presetNames.length; i++) {
    validPreset[presetNames[i]] = true;
  }

  var matches = [];
  for (var e = 0; e < events.length; e++) {
    var title = String(events[e].getTitle() || '').trim();
    if (title && validPreset[title]) {
      matches.push(title);
    }
  }

  return matches;
}

function lockoutsV2_getPresetNamesFromBlocks_(blocks) {
  var list = [];
  var seen = {};
  var effectiveBlocks = Array.isArray(blocks) ? blocks : [];
  for (var i = 0; i < effectiveBlocks.length; i++) {
    var presets = effectiveBlocks[i] && effectiveBlocks[i].presets;
    if (!Array.isArray(presets)) {
      continue;
    }
    for (var j = 0; j < presets.length; j++) {
      var preset = String(presets[j] || '').trim();
      if (!preset || seen[preset]) {
        continue;
      }
      seen[preset] = true;
      list.push(preset);
    }
  }
  return list;
}

/**
 * Placeholder for Lockouts V2 time window checks.
 *
 * @param {!Date} now Current instant.
 * @param {{beg: string, end: string}} times Local time bounds (HH:MM).
 * @param {string} tz IANA/Apps Script timezone string.
 * @return {boolean} True when now is inside the configured window.
 */
function lockoutsV2_isNowInTimesWindow_(now, times, tz) {
  if (!(now instanceof Date) || isNaN(now.getTime())) {
    return false;
  }
  if (!times || typeof times !== 'object') {
    return false;
  }

  var windowStartMinutes = lockoutsV2_parseHHMMToMinutes_(times.beg);
  var windowEndMinutes = lockoutsV2_parseHHMMToMinutes_(times.end);
  if (windowStartMinutes == null || windowEndMinutes == null) {
    return false;
  }

  var effectiveTz = tz || Session.getScriptTimeZone();
  var hourText = Utilities.formatDate(now, effectiveTz, 'H');
  var minuteText = Utilities.formatDate(now, effectiveTz, 'm');
  var nowMinutes = Number(hourText) * 60 + Number(minuteText);

  // beg == end means 24-hour active window.
  if (windowStartMinutes === windowEndMinutes) {
    return true;
  }

  // beg < end means same-day [beg, end).
  if (windowStartMinutes < windowEndMinutes) {
    return windowStartMinutes <= nowMinutes && nowMinutes < windowEndMinutes;
  }

  // beg > end means a midnight-crossing window.
  return nowMinutes >= windowStartMinutes || nowMinutes < windowEndMinutes;
}

/**
 * Parses an HH:MM time into local minutes since midnight.
 *
 * @param {*} hhmm HH:MM formatted string.
 * @return {(number|null)} Minutes since midnight, or null for invalid input.
 */
function lockoutsV2_parseHHMMToMinutes_(hhmm) {
  if (typeof hhmm !== 'string') {
    return null;
  }

  var match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Debug helper for representative time-window cases.
 * Logs pass/fail results for quick manual verification.
 */
function lockoutsV2__debugTimesTests_() {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var year = Number(Utilities.formatDate(now, tz, 'yyyy'));
  var monthIndex = Number(Utilities.formatDate(now, tz, 'M')) - 1;
  var dayOfMonth = Number(Utilities.formatDate(now, tz, 'd'));

  var testCases = [
    {
      name: 'same-day window includes lower bound',
      nowHHMM: '09:00',
      times: { beg: '09:00', end: '17:00' },
      expected: true
    },
    {
      name: 'same-day window excludes upper bound',
      nowHHMM: '17:00',
      times: { beg: '09:00', end: '17:00' },
      expected: false
    },
    {
      name: 'midnight crossing includes late-night time',
      nowHHMM: '23:30',
      times: { beg: '22:00', end: '06:00' },
      expected: true
    },
    {
      name: 'midnight crossing includes early-morning time',
      nowHHMM: '05:30',
      times: { beg: '22:00', end: '06:00' },
      expected: true
    },
    {
      name: 'midnight crossing excludes daytime time',
      nowHHMM: '12:00',
      times: { beg: '22:00', end: '06:00' },
      expected: false
    },
    {
      name: 'equal bounds behave as 24-hour window',
      nowHHMM: '14:45',
      times: { beg: '00:00', end: '00:00' },
      expected: true
    }
  ];

  var passed = 0;
  for (var i = 0; i < testCases.length; i++) {
    var testCase = testCases[i];
    var parsedNowMinutes = lockoutsV2_parseHHMMToMinutes_(testCase.nowHHMM);
    if (parsedNowMinutes == null) {
      console.log('FAIL | invalid test case nowHHMM=' + testCase.nowHHMM);
      continue;
    }

    var testNow = new Date(
      year,
      monthIndex,
      dayOfMonth,
      Math.floor(parsedNowMinutes / 60),
      parsedNowMinutes % 60,
      0,
      0
    );
    var actual = lockoutsV2_isNowInTimesWindow_(testNow, testCase.times, tz);
    var ok = actual === testCase.expected;

    if (ok) {
      passed++;
    }

    console.log((ok ? 'PASS' : 'FAIL') + ' | ' +
      testCase.name + ' | now=' + testCase.nowHHMM + ' | times=' +
      testCase.times.beg + '-' + testCase.times.end + ' | expected=' +
      testCase.expected + ' | actual=' + actual);
  }

  console.log('lockoutsV2__debugTimesTests_: ' + passed + '/' + testCases.length + ' passed.');
}

/**
 * Validates a Lockouts V2 block config object.
 *
 * @param {!Object} block Lockouts V2 block configuration object.
 * @return {{isValid: boolean, errors: !Array<string>}}
 */
function lockoutsV2_validateBlock_(block) {
  var errors = [];
  var allowedTypes = {
    duration_block: true,
    task_block: true,
    firstXMinutesAfterTimestamp_block: true
  };

  if (!block || typeof block !== 'object') {
    return {
      isValid: false,
      errors: ['Block must be an object.']
    };
  }

  if (typeof block.id !== 'string' || block.id.trim() === '') {
    errors.push('Missing required field: id (non-empty string).');
  }

  if (typeof block.type !== 'string' || !allowedTypes[block.type]) {
    errors.push('Missing/invalid required field: type.');
  }

  if (!block.times || typeof block.times !== 'object') {
    errors.push('Missing required field: times.');
  } else {
    if (lockoutsV2_parseHHMMToMinutes_(block.times.beg) == null) {
      errors.push('Invalid required field: times.beg (HH:MM).');
    }
    if (lockoutsV2_parseHHMMToMinutes_(block.times.end) == null) {
      errors.push('Invalid required field: times.end (HH:MM).');
    }
  }

  if (block.presets !== undefined && !Array.isArray(block.presets)) {
    errors.push('Invalid field: presets must be an array when provided.');
  }

  var typeSpecific = block.typeSpecific || {};

  if (block.type === 'task_block') {
    if (!Array.isArray(typeSpecific.task_block_IDs) || typeSpecific.task_block_IDs.length === 0) {
      errors.push('task_block requires typeSpecific.task_block_IDs (non-empty array).');
    }
  }

  if (block.type === 'duration_block') {
    var durationCfg = typeSpecific.duration;
    if (!durationCfg || typeof durationCfg !== 'object') {
      errors.push('duration_block requires typeSpecific.duration object.');
    } else {
      var maxMinutes = Number(durationCfg.maxMinutes);
      if (!isFinite(maxMinutes) || maxMinutes < 0) {
        errors.push('duration_block requires typeSpecific.duration.maxMinutes >= 0.');
      }

      if (typeof durationCfg.screenTimeID !== 'string' || durationCfg.screenTimeID.trim() === '') {
        errors.push('duration_block requires typeSpecific.duration.screenTimeID.');
      }

      if (durationCfg.rationing !== undefined && durationCfg.rationing !== null) {
        if (typeof durationCfg.rationing !== 'object') {
          errors.push('duration_block rationing must be an object when provided.');
        } else {
          if (durationCfg.rationing.isON !== undefined && typeof durationCfg.rationing.isON !== 'boolean') {
            errors.push('duration_block rationing.isON must be boolean when provided.');
          }
          if (durationCfg.rationing.begMinutes !== undefined && !isFinite(Number(durationCfg.rationing.begMinutes))) {
            errors.push('duration_block rationing.begMinutes must be numeric when provided.');
          }
          if (durationCfg.rationing.endMinutes !== undefined && !isFinite(Number(durationCfg.rationing.endMinutes))) {
            errors.push('duration_block rationing.endMinutes must be numeric when provided.');
          }
        }
      }
    }
  }

  if (block.type === 'firstXMinutesAfterTimestamp_block') {
    var firstXCfg = typeSpecific.firstXMinutes;
    if (!firstXCfg || typeof firstXCfg !== 'object') {
      errors.push('firstXMinutesAfterTimestamp_block requires typeSpecific.firstXMinutes object.');
    } else {
      var xMinutes = Number(firstXCfg.minutes);
      if (!isFinite(xMinutes) || xMinutes < 0) {
        errors.push('firstXMinutesAfterTimestamp_block requires firstXMinutes.minutes >= 0.');
      }
      if (typeof firstXCfg.timestampID !== 'string' || firstXCfg.timestampID.trim() === '') {
        errors.push('firstXMinutesAfterTimestamp_block requires firstXMinutes.timestampID.');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Evaluates Lockouts V2 blocks and returns first matching block.
 *
 * @param {!Date} now Current time.
 * @param {(string|null)} preset Resolved preset, null means no preset filtering.
 * @param {!Array<!Object>} blocks Lockout block configs in priority order.
 * @param {!Object=} ctx Context overrides for reads/timezone.
 * @return {{status:string,winningBlock:(Object|null),uiComputedFields:Object,debugErrors:!Array<string>}}
 */
function lockoutsV2_evaluateBlocks_(now, preset, blocks, ctx) {
  var context = ctx || {};
  var effectiveNow = now instanceof Date ? now : new Date(now);
  var effectiveBlocks = Array.isArray(blocks) ? blocks : [];
  var debugErrors = [];
  var uiComputedFields = {};
  var tz = context.tz || Session.getScriptTimeZone();

  if (!(effectiveNow instanceof Date) || isNaN(effectiveNow.getTime())) {
    return {
      status: 'error',
      winningBlock: null,
      uiComputedFields: {},
      debugErrors: ['Invalid now value passed to lockoutsV2_evaluateBlocks_.']
    };
  }

  for (var i = 0; i < effectiveBlocks.length; i++) {
    var block = effectiveBlocks[i];
    var blockId = block && block.id ? String(block.id) : ('index_' + i);

    if (preset != null) {
      if (!Array.isArray(block && block.presets) || block.presets.indexOf(preset) === -1) {
        continue;
      }
    }

    var validation = lockoutsV2_validateBlock_(block);
    if (!validation.isValid) {
      debugErrors.push('Block ' + blockId + ' invalid: ' + validation.errors.join(' | '));
      continue;
    }

    if (!lockoutsV2_isNowInTimesWindow_(effectiveNow, block.times, tz)) {
      continue;
    }

    if (block.type === 'task_block') {
      var taskEval = lockoutsV2_evaluateTaskBlock_(block, context);
      debugErrors = debugErrors.concat(taskEval.errors);
      if (taskEval.shouldBlock) {
        uiComputedFields = taskEval.uiComputedFields;
        return {
          status: 'blocked',
          winningBlock: block,
          uiComputedFields: uiComputedFields,
          debugErrors: debugErrors
        };
      }
      continue;
    }

    if (block.type === 'duration_block') {
      var durationEval = lockoutsV2_evaluateDurationBlock_(effectiveNow, block, context, tz);
      debugErrors = debugErrors.concat(durationEval.errors);
      if (durationEval.shouldBlock) {
        uiComputedFields = durationEval.uiComputedFields;
        return {
          status: 'blocked',
          winningBlock: block,
          uiComputedFields: uiComputedFields,
          debugErrors: debugErrors
        };
      }
      continue;
    }

    if (block.type === 'firstXMinutesAfterTimestamp_block') {
      var firstXEval = lockoutsV2_evaluateFirstXAfterTimestampBlock_(effectiveNow, block, context);
      debugErrors = debugErrors.concat(firstXEval.errors);
      if (firstXEval.shouldBlock) {
        uiComputedFields = firstXEval.uiComputedFields;
        return {
          status: 'blocked',
          winningBlock: block,
          uiComputedFields: uiComputedFields,
          debugErrors: debugErrors
        };
      }
      continue;
    }
  }

  return {
    status: 'allowed',
    winningBlock: null,
    uiComputedFields: uiComputedFields,
    debugErrors: debugErrors
  };
}

function lockoutsV2_evaluateTaskBlock_(block, ctx) {
  var metricIDs = block.typeSpecific.task_block_IDs;
  var incompleteMetricIDs = [];
  var errors = [];

  for (var i = 0; i < metricIDs.length; i++) {
    var metricID = String(metricIDs[i] || '').trim();
    if (!metricID) {
      continue;
    }

    var cellValue = lockoutsV2_readTodayValueByMetricID_(metricID, ctx);
    if (!cellValue.found) {
      errors.push('task_block metric not found: ' + metricID);
      incompleteMetricIDs.push(metricID);
      continue;
    }

    if (!isCompletedCellValue_(cellValue.value)) {
      incompleteMetricIDs.push(metricID);
    }
  }

  return {
    shouldBlock: incompleteMetricIDs.length > 0,
    uiComputedFields: {
      incompleteMetricIDs: incompleteMetricIDs
    },
    errors: errors
  };
}

function lockoutsV2_evaluateDurationBlock_(now, block, ctx, tz) {
  var durationCfg = block.typeSpecific.duration;
  var usedMinutes = lockoutsV2_readDurationMinutesByMetricID_(durationCfg.screenTimeID, ctx);
  var errors = [];

  if (usedMinutes == null) {
    errors.push('duration_block metric missing/invalid: ' + durationCfg.screenTimeID);
    return {
      shouldBlock: false,
      uiComputedFields: {},
      errors: errors
    };
  }

  var maxMinutes = Math.max(0, Number(durationCfg.maxMinutes) || 0);
  var rationing = durationCfg.rationing || {};
  var rationingOn = rationing.isON === true;
  var allowedNowMinutes = maxMinutes;

  if (rationingOn) {
    var bounds = lockoutsV2_getWindowBoundsForNow_(now, block.times, tz);
    allowedNowMinutes = lockoutsV2_computeAllowedSoFar_(
      now,
      bounds.windowStart,
      bounds.windowEnd,
      maxMinutes,
      rationing
    );
  }

  var ui = {
    usedMinutes: usedMinutes,
    maxMinutes: maxMinutes,
    allowedNowMinutes: allowedNowMinutes,
    usedHuman: lockoutsV2_humanizeMinutes_(usedMinutes),
    maxHuman: lockoutsV2_humanizeMinutes_(maxMinutes),
    allowedNowHuman: lockoutsV2_humanizeMinutes_(allowedNowMinutes),
    rationingOn: rationingOn
  };

  return {
    shouldBlock: usedMinutes >= allowedNowMinutes,
    uiComputedFields: ui,
    errors: errors
  };
}

function lockoutsV2_evaluateFirstXAfterTimestampBlock_(now, block, ctx) {
  var config = block.typeSpecific.firstXMinutes;
  var timestampLookup = lockoutsV2_readTodayValueByMetricID_(config.timestampID, ctx);
  if (!timestampLookup.found || timestampLookup.value === '' || timestampLookup.value === null) {
    return {
      shouldBlock: false,
      uiComputedFields: {},
      errors: []
    };
  }

  var timestamp = timestampLookup.value instanceof Date ? timestampLookup.value : new Date(timestampLookup.value);
  if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) {
    return {
      shouldBlock: false,
      uiComputedFields: {},
      errors: ['firstXMinutes timestamp invalid for metricID: ' + config.timestampID]
    };
  }

  var xMinutes = Math.max(0, Number(config.minutes) || 0);
  var cutoff = new Date(timestamp.getTime() + xMinutes * 60000);
  return {
    shouldBlock: now.getTime() < cutoff.getTime(),
    uiComputedFields: {
      timestampISO: timestamp.toISOString(),
      cutoffISO: cutoff.toISOString(),
      remainingMinutes: Math.max(0, (cutoff.getTime() - now.getTime()) / 60000)
    },
    errors: []
  };
}

function lockoutsV2_readTodayValueByMetricID_(metricID, ctx) {
  var context = ctx || {};
  var sourceMap = context.todayValuesByMetricID;
  if (sourceMap && Object.prototype.hasOwnProperty.call(sourceMap, metricID)) {
    return {
      found: true,
      value: sourceMap[metricID]
    };
  }

  var trackingSheet = context.trackingSheet || context.sheet || sheet1 || getTrackingSheet_();
  var todayCol = Number(context.todayCol) || Number(context.activeCol) || getCurrentTrackingDayColumn_(trackingSheet);
  var rowLookup = findRowByMetricId_(metricID, trackingSheet);
  if (!rowLookup || !rowLookup.row) {
    return {
      found: false,
      value: null
    };
  }

  return {
    found: true,
    value: trackingSheet.getRange(rowLookup.row, todayCol).getValue()
  };
}

function lockoutsV2_getWindowBoundsForNow_(now, times, tz) {
  var effectiveTz = tz || Session.getScriptTimeZone();
  var year = Number(Utilities.formatDate(now, effectiveTz, 'yyyy'));
  var month = Number(Utilities.formatDate(now, effectiveTz, 'M')) - 1;
  var day = Number(Utilities.formatDate(now, effectiveTz, 'd'));
  var nowMinutes = Number(Utilities.formatDate(now, effectiveTz, 'H')) * 60 + Number(Utilities.formatDate(now, effectiveTz, 'm'));
  var begMinutes = lockoutsV2_parseHHMMToMinutes_(times.beg);
  var endMinutes = lockoutsV2_parseHHMMToMinutes_(times.end);

  var dayMs = 24 * 60 * 60 * 1000;
  var start = new Date(year, month, day, Math.floor(begMinutes / 60), begMinutes % 60, 0, 0);
  var end = new Date(year, month, day, Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

  if (begMinutes > endMinutes && nowMinutes < endMinutes) {
    start = new Date(start.getTime() - dayMs);
  }
  if (begMinutes > endMinutes && nowMinutes >= begMinutes) {
    end = new Date(end.getTime() + dayMs);
  }
  if (begMinutes === endMinutes) {
    end = new Date(start.getTime() + dayMs);
  }

  return {
    windowStart: start,
    windowEnd: end
  };
}

/**
 * Debug helper for block evaluation using in-memory metric values.
 */
function lockoutsV2__debugEvalTests_() {
  var now = new Date('2026-01-01T09:30:00Z');
  var blocks = [
    {
      id: 'task_morning',
      type: 'task_block',
      presets: ['workday'],
      times: { beg: '08:00', end: '12:00' },
      typeSpecific: { task_block_IDs: ['planWorkday', 'sunscreen'] }
    },
    {
      id: 'screen_cap',
      type: 'duration_block',
      presets: ['workday'],
      times: { beg: '08:00', end: '22:00' },
      typeSpecific: {
        duration: {
          maxMinutes: 120,
          screenTimeID: 'screenTimeToday',
          rationing: { isON: true, begMinutes: 0, endMinutes: 90 }
        }
      }
    },
    {
      id: 'wake_cooldown',
      type: 'firstXMinutesAfterTimestamp_block',
      presets: ['workday'],
      times: { beg: '00:00', end: '23:59' },
      typeSpecific: { firstXMinutes: { minutes: 30, timestampID: 'wakeTs' } }
    },
    {
      id: 'broken_block',
      type: 'duration_block',
      presets: ['workday'],
      times: { beg: 'bogus', end: '22:00' },
      typeSpecific: { duration: { maxMinutes: 10, screenTimeID: '' } }
    }
  ];

  var ctx = {
    tz: 'Etc/UTC',
    todayValuesByMetricID: {
      planWorkday: '',
      sunscreen: 'done',
      wakeTs: '2026-01-01T09:10:00Z',
      screenTimeToday: '01:10:00'
    }
  };

  var resultWorkday = lockoutsV2_evaluateBlocks_(now, 'workday', blocks, ctx);
  var resultNoPreset = lockoutsV2_evaluateBlocks_(now, null, blocks, ctx);

  console.log('workday result => ' + JSON.stringify(resultWorkday));
  console.log('no-preset result => ' + JSON.stringify(resultNoPreset));

  return {
    workday: resultWorkday,
    noPreset: resultNoPreset
  };
}

/**
 * Reads today's duration value for a metricID and returns used minutes.
 *
 * @param {string} metricID Metric ID in Tracking Data column A.
 * @param {!Object=} ctx Optional execution context overrides.
 * @return {(number|null)} Parsed minutes, or null when lookup/parsing fails.
 */
function lockoutsV2_readDurationMinutesByMetricID_(metricID, ctx) {
  var context = ctx || {};
  var map = context.todayValuesByMetricID;

  if (map && Object.prototype.hasOwnProperty.call(map, metricID)) {
    return lockoutsV2_parseDurationCellToMinutes_(map[metricID]);
  }

  var trackingSheet = context.trackingSheet || context.sheet || sheet1 || getTrackingSheet_();
  var todayCol = Number(context.todayCol) || Number(context.activeCol) || getCurrentTrackingDayColumn_(trackingSheet);
  var rowLookup = findRowByMetricId_(metricID, trackingSheet);

  if (!rowLookup || !rowLookup.row) {
    return null;
  }

  var durationCell = trackingSheet.getRange(rowLookup.row, todayCol);
  var displayValue = durationCell.getDisplayValue();
  var fallbackValue = durationCell.getValue();
  var parsedMinutes = lockoutsV2_parseDurationCellToMinutes_(displayValue);

  if (parsedMinutes == null) {
    parsedMinutes = lockoutsV2_parseDurationCellToMinutes_(fallbackValue);
  }

  return parsedMinutes;
}

/**
 * Parses common sheet duration cell representations into minutes.
 *
 * @param {*} value Raw/display duration cell value.
 * @return {(number|null)}
 */
function lockoutsV2_parseDurationCellToMinutes_(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'string') {
    var trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }

    var hhmmssMatch = /^\d{1,3}:[0-5]\d:[0-5]\d$/.exec(trimmed);
    if (hhmmssMatch) {
      // Reuse existing V1 helper where format is known-safe.
      return convertTimeToMs(trimmed) / 60000;
    }

    return lockoutsV2_parseHHMMSSMinutesSafe_(trimmed);
  }

  if (typeof value === 'number' && isFinite(value)) {
    // Spreadsheet durations can be numeric day-fractions.
    return value * 24 * 60;
  }

  return null;
}

/**
 * Safe parser for HH:MM:SS duration strings.
 *
 * @param {string} value Duration-like text.
 * @return {(number|null)}
 */
function lockoutsV2_parseHHMMSSMinutesSafe_(value) {
  var match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(String(value || '').trim());
  if (!match) {
    return null;
  }

  var hours = Number(match[1]);
  var minutes = Number(match[2]);
  var seconds = Number(match[3]);
  return hours * 60 + minutes + (seconds / 60);
}

/**
 * Computes rationed minutes allowed so far in a lockout window.
 *
 * @param {!Date} now Current time.
 * @param {!Date} windowStart Window start instant.
 * @param {!Date} windowEnd Window end instant.
 * @param {number} maxMinutes Absolute hard cap.
 * @param {{begMinutes:number, endMinutes:number}=} rationing Ration settings.
 * @return {number}
 */
function lockoutsV2_computeAllowedSoFar_(now, windowStart, windowEnd, maxMinutes, rationing) {
  var maxCap = Math.max(0, Number(maxMinutes) || 0);
  var begMinutes = Number(rationing && rationing.begMinutes);
  var endMinutes = Number(rationing && rationing.endMinutes);

  if (!isFinite(begMinutes)) {
    begMinutes = 0;
  }
  if (!isFinite(endMinutes)) {
    endMinutes = maxCap;
  }

  var startMs = windowStart instanceof Date ? windowStart.getTime() : NaN;
  var endMs = windowEnd instanceof Date ? windowEnd.getTime() : NaN;
  var nowMs = now instanceof Date ? now.getTime() : NaN;

  if (!isFinite(startMs) || !isFinite(endMs) || !isFinite(nowMs)) {
    return Math.min(maxCap, Math.max(0, begMinutes));
  }

  if (endMs <= startMs) {
    endMs += 24 * 60 * 60 * 1000;
    if (nowMs < startMs) {
      nowMs += 24 * 60 * 60 * 1000;
    }
  }

  var windowLenMinutes = (endMs - startMs) / 60000;
  if (windowLenMinutes <= 0) {
    return Math.min(maxCap, Math.max(0, begMinutes));
  }

  var elapsedMinutes = (nowMs - startMs) / 60000;
  var clampedElapsed = Math.max(0, Math.min(windowLenMinutes, elapsedMinutes));
  var progress = clampedElapsed / windowLenMinutes;
  var rationCap = begMinutes + (endMinutes - begMinutes) * progress;

  return Math.min(maxCap, Math.max(0, rationCap));
}

/**
 * Builds a lockouts progress bar with optional ration marker.
 *
 * @param {{usedMinutes:number,maxMinutes:number,allowedNowMinutes:number,barLength:number,showMarker:boolean}} input
 * @return {string}
 */
function lockoutsV2_renderBar_(input) {
  var options = input || {};
  var barLength = Math.max(1, Math.floor(Number(options.barLength) || 20));
  var usedMinutes = Math.max(0, Number(options.usedMinutes) || 0);
  var maxMinutes = Math.max(0, Number(options.maxMinutes) || 0);
  var allowedNowMinutes = Math.max(0, Number(options.allowedNowMinutes) || 0);
  var showMarker = options.showMarker === true;

  var fillRatio = maxMinutes > 0 ? Math.max(0, Math.min(1, usedMinutes / maxMinutes)) : 0;
  var filledCells = Math.round(fillRatio * barLength);
  var chars = [];

  for (var i = 0; i < barLength; i++) {
    chars.push(i < filledCells ? '▓' : '░');
  }

  if (showMarker && maxMinutes > 0) {
    var markerRatio = Math.max(0, Math.min(1, allowedNowMinutes / maxMinutes));
    var markerIndex = Math.round(markerRatio * (barLength - 1));
    chars[markerIndex] = '·';
  }

  return chars.join('');
}

/**
 * Formats minutes into compact human text.
 *
 * @param {number} mins
 * @return {string}
 */
function lockoutsV2_humanizeMinutes_(mins) {
  var rounded = Math.max(0, Math.round(Number(mins) || 0));
  if (rounded < 60) {
    return rounded + 'm';
  }

  var hours = Math.floor(rounded / 60);
  var minutes = rounded % 60;
  return minutes === 0 ? (hours + 'h') : (hours + 'h ' + minutes + 'm');
}

function lockoutsV2_validateConfig_(config) {
  var errors = [];
  if (!config || typeof config !== 'object') {
    return {
      isValid: false,
      errors: ['Missing Lockouts V2 config object.']
    };
  }

  if (!Array.isArray(config.blocks)) {
    errors.push('Lockouts V2 config.blocks must be an array.');
  }

  var globals = config.globals || {};
  if (!isFinite(Number(globals.barLength))) {
    errors.push('Lockouts V2 globals.barLength must be numeric.');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

function lockoutsV2_buildBlockedUi_(now, block, uiComputedFields, config, ctx) {
  var blockOn = block.onBlock || {};
  var globals = (config && config.globals) || {};
  var barLength = Number(globals.barLength) || 20;
  var computed = uiComputedFields || {};
  var ui = {
    showMessage: true,
    message: ''
  };
  var tokenMap = lockoutsV2_buildTokenMap_(now, block, computed, barLength, ctx);
  var messageTemplate = typeof blockOn.message === 'string' ? blockOn.message : '';
  var finalMessage = lockoutsV2_tokenSubstitute_(messageTemplate, tokenMap);

  ui.message = finalMessage;
  lockoutsV2_mergeUiFields_(ui, tokenMap);

  return {
    block: {
      id: String(block.id || ''),
      type: String(block.type || ''),
      message: finalMessage
    },
    ui: ui,
    shortcut: {
      name: String(blockOn.shortcutName || ''),
      input: String(blockOn.shortcutInput || '')
    },
    errors: []
  };
}

function lockoutsV2_buildAllowedUi_(now, resolvedPreset, config, ctx, debugErrors) {
  var globals = (config && config.globals) || {};
  var barLength = Number(globals.barLength) || 20;
  var blocks = Array.isArray(config && config.blocks) ? config.blocks : [];
  var tz = ctx && ctx.tz ? ctx.tz : Session.getScriptTimeZone();

  var durationCtx = lockoutsV2_findFirstApplicableDurationContext_(now, resolvedPreset, blocks, ctx, tz);
  if (durationCtx) {
    var durationTokenMap = lockoutsV2_buildTokenMap_(now, durationCtx.block, durationCtx.uiComputedFields, barLength, ctx);
    var remainingMinutes = Math.max(0, Number(durationTokenMap.maxMinutes || 0) - Number(durationTokenMap.usedMinutes || 0));
    return {
      showMessage: true,
      message: String(durationTokenMap.screenTimeBar || '') + '\n' +
        String(durationTokenMap.usedHuman || '0m') + ' used, ' +
        lockoutsV2_humanizeMinutes_(remainingMinutes) + ' remaining',
      usedMinutes: durationTokenMap.usedMinutes,
      maxMinutes: durationTokenMap.maxMinutes,
      allowedNowMinutes: durationTokenMap.allowedNowMinutes,
      screenTimeBar: durationTokenMap.screenTimeBar,
      endTimeISO: durationTokenMap.endTimeISO
    };
  }

  var cumulativeMetricID = globals.cumulativeScreentimeID;
  if (cumulativeMetricID) {
    var usedMinutes = lockoutsV2_readDurationMinutesByMetricID_(cumulativeMetricID, ctx);
    if (usedMinutes == null) {
      debugErrors.push('cumulativeScreentimeID metric missing/invalid: ' + cumulativeMetricID);
    } else {
      var capped = Math.max(0, Math.min(24 * 60, usedMinutes));
      var screenTimeBar = lockoutsV2_renderBar_({
        usedMinutes: capped,
        maxMinutes: 24 * 60,
        allowedNowMinutes: 24 * 60,
        barLength: barLength,
        showMarker: false
      });
      return {
        showMessage: true,
        message: screenTimeBar + '\n' + lockoutsV2_humanizeMinutes_(usedMinutes) + ' used',
        usedMinutes: usedMinutes,
        maxMinutes: 24 * 60,
        allowedNowMinutes: 24 * 60,
        screenTimeBar: screenTimeBar
      };
    }
  }

  return {
    showMessage: false,
    message: ''
  };
}

function lockoutsV2_findFirstApplicableDurationContext_(now, resolvedPreset, blocks, ctx, tz) {
  var effectiveBlocks = Array.isArray(blocks) ? blocks : [];
  for (var i = 0; i < effectiveBlocks.length; i++) {
    var block = effectiveBlocks[i];
    if (!block || block.type !== 'duration_block') {
      continue;
    }

    if (resolvedPreset != null) {
      if (!Array.isArray(block.presets) || block.presets.indexOf(resolvedPreset) === -1) {
        continue;
      }
    }

    var validation = lockoutsV2_validateBlock_(block);
    if (!validation.isValid) {
      continue;
    }

    if (!lockoutsV2_isNowInTimesWindow_(now, block.times, tz)) {
      continue;
    }

    var durationEval = lockoutsV2_evaluateDurationBlock_(now, block, ctx || {}, tz);
    if (durationEval.errors && durationEval.errors.length > 0) {
      continue;
    }

    return {
      block: block,
      uiComputedFields: durationEval.uiComputedFields || {}
    };
  }

  return null;
}

function lockoutsV2_buildTokenMap_(now, block, uiComputedFields, barLength, ctx) {
  var computed = uiComputedFields || {};
  var tokenMap = {
    usedMinutes: computed.usedMinutes,
    maxMinutes: computed.maxMinutes,
    allowedNowMinutes: computed.allowedNowMinutes,
    usedHuman: computed.usedHuman,
    maxHuman: computed.maxHuman,
    allowedNowHuman: computed.allowedNowHuman,
    screenTimeBar: '',
    remainingMinutes: null,
    remainingHuman: null,
    endTime: '',
    endTimeISO: ''
  };

  if (computed.usedMinutes != null && computed.maxMinutes != null) {
    tokenMap.remainingMinutes = Math.max(0, Number(computed.maxMinutes) - Number(computed.usedMinutes));
    tokenMap.remainingHuman = lockoutsV2_humanizeMinutes_(tokenMap.remainingMinutes);
    tokenMap.screenTimeBar = lockoutsV2_renderBar_({
      usedMinutes: computed.usedMinutes,
      maxMinutes: computed.maxMinutes,
      allowedNowMinutes: computed.allowedNowMinutes,
      barLength: barLength,
      showMarker: computed.rationingOn === true
    });
  }

  if (block && block.type === 'firstXMinutesAfterTimestamp_block' && computed.cutoffISO) {
    var tz = ctx && ctx.tz ? ctx.tz : Session.getScriptTimeZone();
    var cutoffDate = new Date(computed.cutoffISO);
    tokenMap.endTimeISO = cutoffDate.toISOString();
    tokenMap.endTime = Utilities.formatDate(cutoffDate, tz, 'h:mm a');
  } else if (block && block.type === 'duration_block' && block.times) {
    var bounds = lockoutsV2_getWindowBoundsForNow_(now, block.times, ctx && ctx.tz ? ctx.tz : Session.getScriptTimeZone());
    tokenMap.endTimeISO = bounds.windowEnd.toISOString();
    tokenMap.endTime = Utilities.formatDate(bounds.windowEnd, ctx && ctx.tz ? ctx.tz : Session.getScriptTimeZone(), 'h:mm a');
  }

  tokenMap.rationMarker = computed.rationingOn === true ? '·' : '';
  return tokenMap;
}

function lockoutsV2_mergeUiFields_(ui, tokenMap) {
  if (tokenMap.usedMinutes != null) {
    ui.usedMinutes = tokenMap.usedMinutes;
  }
  if (tokenMap.maxMinutes != null) {
    ui.maxMinutes = tokenMap.maxMinutes;
  }
  if (tokenMap.allowedNowMinutes != null) {
    ui.allowedNowMinutes = tokenMap.allowedNowMinutes;
  }
  if (tokenMap.screenTimeBar) {
    ui.screenTimeBar = tokenMap.screenTimeBar;
  }
  if (tokenMap.endTimeISO) {
    ui.endTimeISO = tokenMap.endTimeISO;
  }
}

/**
 * Debug helper for deterministic rationing/math outputs.
 */
function lockoutsV2__debugRationingTests_() {
  var tests = [
    {
      name: '25% through window with 0→120 ramp',
      now: new Date('2026-01-01T10:00:00Z'),
      windowStart: new Date('2026-01-01T08:00:00Z'),
      windowEnd: new Date('2026-01-01T16:00:00Z'),
      maxMinutes: 180,
      rationing: { begMinutes: 0, endMinutes: 120 },
      expected: 30
    },
    {
      name: 'clamps to maxMinutes when ramp exceeds max',
      now: new Date('2026-01-01T14:00:00Z'),
      windowStart: new Date('2026-01-01T08:00:00Z'),
      windowEnd: new Date('2026-01-01T16:00:00Z'),
      maxMinutes: 60,
      rationing: { begMinutes: 0, endMinutes: 120 },
      expected: 60
    },
    {
      name: 'midnight-crossing window early morning',
      now: new Date('2026-01-02T02:00:00Z'),
      windowStart: new Date('2026-01-01T22:00:00Z'),
      windowEnd: new Date('2026-01-01T06:00:00Z'),
      maxMinutes: 120,
      rationing: { begMinutes: 0, endMinutes: 120 },
      expected: 60
    }
  ];

  var passed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    var actual = lockoutsV2_computeAllowedSoFar_(t.now, t.windowStart, t.windowEnd, t.maxMinutes, t.rationing);
    var ok = Math.abs(actual - t.expected) < 1e-9;
    if (ok) {
      passed++;
    }

    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + t.name + ' | expected=' + t.expected + ' | actual=' + actual);
  }

  console.log('renderBar sample | ' + lockoutsV2_renderBar_({
    usedMinutes: 27,
    maxMinutes: 120,
    allowedNowMinutes: 48,
    barLength: 20,
    showMarker: true
  }));
  console.log('humanize sample | 27 => ' + lockoutsV2_humanizeMinutes_(27) + ' | 72 => ' + lockoutsV2_humanizeMinutes_(72));
  console.log('lockoutsV2__debugRationingTests_: ' + passed + '/' + tests.length + ' passed.');
}

/**
 * Placeholder token substitution helper.
 *
 * @param {string} template Message template containing tokens like {tokenName}.
 * @param {!Object<string, *>} tokenMap Mapping of token names to replacement values.
 * @return {string}
 */
function lockoutsV2_tokenSubstitute_(template, tokenMap) {
  if (template == null) {
    return '';
  }

  var source = String(template);
  if (!tokenMap || typeof tokenMap !== 'object') {
    return source;
  }

  return source.replace(/\{([^{}]+)\}/g, function(match, tokenName) {
    if (!Object.prototype.hasOwnProperty.call(tokenMap, tokenName)) {
      return match;
    }
    var replacement = tokenMap[tokenName];
    return replacement == null ? '' : String(replacement);
  });
}
