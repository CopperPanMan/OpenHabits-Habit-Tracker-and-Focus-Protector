/**
 * Lockouts V2 skeleton module.
 *
 * NOTE:
 * - This file intentionally defines only placeholder helpers.
 * - No calls are wired into doGet(e) yet.
 * - Existing app_closer behavior remains unchanged.
 */

/**
 * Placeholder handler for the Lockouts V2 app_closer flow.
 *
 * @param {*} payload Lockouts V2 payload (preset override, app info, etc.)
 * @param {*} ctx Execution context object for shared services/helpers.
 * @return {!Object} Lockouts V2 response-shaped JSON object.
 */
function lockoutsV2_handleAppCloser_(payload, ctx) {
  return {
    status: 'error',
    ui: {
      showMessage: false,
      message: ''
    },
    block: null,
    shortcut: {
      name: '',
      input: ''
    },
    debug: {
      preset: null,
      serverTimeISO: new Date().toISOString(),
      errors: ['Lockouts V2 skeleton is defined but not wired into doGet(e).']
    }
  };
}

/**
 * Placeholder preset resolver for Lockouts V2.
 *
 * @param {*} payload Lockouts V2 payload.
 * @param {*} ctx Execution context object.
 * @return {{preset: (string|null), source: string, errors: !Array<string>}}
 */
function lockoutsV2_resolvePreset_(payload, ctx) {
  return {
    preset: null,
    source: 'none',
    errors: []
  };
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
 * Placeholder block validation helper.
 *
 * @param {!Object} block Lockouts V2 block configuration object.
 * @return {{ok: boolean, errors: !Array<string>}}
 */
function lockoutsV2_validateBlock_(block) {
  return {
    ok: true,
    errors: []
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
