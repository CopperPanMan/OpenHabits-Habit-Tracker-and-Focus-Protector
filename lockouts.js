// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: magic;
/*
 * Pure-input Lockouts V2 evaluator for Scriptable.
 *
 * Rules:
 * - Uses ONLY the input passed in
 * - No file reads
 * - No file writes
 * - No calendar access
 * - No external lookups of any kind
 *
 * Accepted shortcut input shapes:
 * A) Full input object:
 *    { now, presetOverride, timezone, cache }
 *
 * B) Raw cache object only:
 *    { schemaVersion, config, metricState, ... }
 */

function lockoutsDefaultNow() {
  return new Date();
}

function deepClone_(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function looksLikeCacheObject_(obj) {
  return !!(
    obj &&
    typeof obj === 'object' &&
    (
      obj.schemaVersion ||
      obj.config ||
      obj.metricState ||
      obj.metricIDGroups
    )
  );
}

function parseShortcutInput_(rawInput) {
  if (rawInput == null) return null;

  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return {
        __parseError: error && error.message ? error.message : String(error),
        __rawString: trimmed,
      };
    }
  }

  if (typeof rawInput === 'object') {
    try {
      return deepClone_(rawInput);
    } catch (error) {
      return rawInput;
    }
  }

  return null;
}

function buildRuntimeInput_(rawInput) {
  const incoming = parseShortcutInput_(rawInput);
  const base = {
    now: null,
    presetOverride: null,
    timezone: null,
    cache: {},
  };

  if (!incoming) {
    return base;
  }

  if (incoming.__parseError) {
    base.__inputParseError = incoming.__parseError;
    return base;
  }

  // Full wrapper object:
  // { now, presetOverride, timezone, cache }
  if (incoming && typeof incoming === 'object' && incoming.cache) {
    if (incoming.now != null) base.now = incoming.now;
    if (incoming.presetOverride != null) base.presetOverride = incoming.presetOverride;
    if (incoming.timezone != null) base.timezone = incoming.timezone;
    base.cache = incoming.cache || {};
    return base;
  }

  // Raw cache object:
  // { schemaVersion, config, metricState, ... }
  if (looksLikeCacheObject_(incoming)) {
    base.cache = incoming;
    return base;
  }

  // Partial override object
  if (incoming && typeof incoming === 'object') {
    if (incoming.now != null) base.now = incoming.now;
    if (incoming.presetOverride != null) base.presetOverride = incoming.presetOverride;
    if (incoming.timezone != null) base.timezone = incoming.timezone;
    return base;
  }

  return base;
}

async function lockoutsEvaluateNow(input) {
  const normalizedInput = buildRuntimeInput_(input);

  const now = normalizedInput.now != null
    ? new Date(normalizedInput.now)
    : lockoutsDefaultNow();

  const isValidNow = now instanceof Date && !isNaN(now.getTime());

  const cache = normalizedInput.cache || {};
  const config = cache && cache.config ? cache.config : { globals: {}, blocks: [] };

  const ctx = {
    now,
    tz: normalizedInput.timezone || cache.timezone || null,
    todayValuesByMetricID: mapMetricStateToValues(
      cache && cache.metricState && cache.metricState.allByID
    ),
  };

  const response = {
    status: 'allowed',
    block: null,
    ui: {
      showMessage: false,
      message: '',
    },
    shortcut: {
      name: '',
      input: '',
    },
    debug: {
      preset: normalizedInput.presetOverride || null,
      serverTimeISO: isValidNow ? now.toISOString() : '',
      errors: [],
    },
  };

  if (normalizedInput.__inputParseError) {
    response.debug.errors.push(`Shortcut input parse error: ${normalizedInput.__inputParseError}`);
  }

  if (!isValidNow) {
    response.status = 'error';
    response.debug.errors.push('Invalid input.now value.');
    return response;
  }

  const configValidation = validateConfig(config);
  if (!configValidation.isValid) {
    response.status = 'error';
    response.debug.errors = response.debug.errors.concat(configValidation.errors);
    return response;
  }

  const preset = normalizedInput.presetOverride || null;

  const evalResult = evaluateBlocks(now, preset, config.blocks || [], ctx);
  response.debug.errors = response.debug.errors.concat(evalResult.debugErrors || []);

  if (evalResult.status === 'error') {
    response.status = 'error';
    return response;
  }

  if (evalResult.status === 'blocked' && evalResult.winningBlock) {
    const blocked = buildBlockedUi(
      now,
      evalResult.winningBlock,
      evalResult.uiComputedFields,
      config,
      ctx
    );

    response.status = 'blocked';
    response.block = blocked.block;
    response.ui = blocked.ui;
    response.shortcut = blocked.shortcut;
    response.debug.errors = response.debug.errors.concat(blocked.errors || []);
    return response;
  }

  response.status = 'allowed';
  response.ui = buildAllowedUi(now, preset, config, ctx, response.debug.errors);
  return response;
}

function evaluateBlocks(now, preset, blocks, ctx) {
  const debugErrors = [];

  if (!(now instanceof Date) || isNaN(now.getTime())) {
    return {
      status: 'error',
      winningBlock: null,
      uiComputedFields: {},
      debugErrors: ['Invalid now value passed to evaluateBlocks.']
    };
  }

  const list = Array.isArray(blocks) ? blocks : [];
  for (let i = 0; i < list.length; i++) {
    const block = list[i];
    if (!block || typeof block !== 'object') continue;

    if (preset != null) {
      if (!Array.isArray(block.presets) || block.presets.indexOf(preset) === -1) {
        continue;
      }
    }

    const validation = validateBlock(block);
    if (!validation.isValid) {
      debugErrors.push(...validation.errors.map((e) => `Block ${String(block.id || i)} invalid: ${e}`));
      continue;
    }

    if (!isNowInTimesWindow(now, block.times)) continue;

    if (block.type === 'task_block') {
      const r = evaluateTaskBlock(block, ctx);
      if ((r.errors || []).length) debugErrors.push(...r.errors);
      if (r.shouldBlock) {
        return {
          status: 'blocked',
          winningBlock: block,
          uiComputedFields: r.uiComputedFields || {},
          debugErrors
        };
      }
      continue;
    }

    if (block.type === 'duration_block') {
      const r = evaluateDurationBlock(now, block, ctx);
      if ((r.errors || []).length) debugErrors.push(...r.errors);
      if (r.shouldBlock) {
        return {
          status: 'blocked',
          winningBlock: block,
          uiComputedFields: r.uiComputedFields || {},
          debugErrors
        };
      }
      continue;
    }

    if (block.type === 'firstXMinutesAfterTimestamp_block') {
      const r = evaluateFirstXAfterTimestampBlock(now, block, ctx);
      if ((r.errors || []).length) debugErrors.push(...r.errors);
      if (r.shouldBlock) {
        return {
          status: 'blocked',
          winningBlock: block,
          uiComputedFields: r.uiComputedFields || {},
          debugErrors
        };
      }
      continue;
    }

    debugErrors.push(`Unknown block type ignored: ${String(block.type || '')}`);
  }

  return {
    status: 'allowed',
    winningBlock: null,
    uiComputedFields: {},
    debugErrors
  };
}

function evaluateTaskBlock(block, ctx) {
  const ids = block && block.typeSpecific && Array.isArray(block.typeSpecific.task_block_IDs)
    ? block.typeSpecific.task_block_IDs
    : [];

  for (let i = 0; i < ids.length; i++) {
    const lookup = readTodayValueByMetricID(ids[i], ctx);
    const v = lookup.value;
    if (!lookup.found || v === '' || v == null) {
      return { shouldBlock: true, uiComputedFields: {}, errors: [] };
    }
  }

  return { shouldBlock: false, uiComputedFields: {}, errors: [] };
}

function evaluateDurationBlock(now, block, ctx) {
  const durationCfg = block.typeSpecific.duration || {};
  const maxMinutes = Math.max(0, Number(durationCfg.maxMinutes) || 0);
  const usedMinutes = readDurationMinutesByMetricID(durationCfg.screenTimeID, ctx);

  if (usedMinutes == null) {
    return {
      shouldBlock: false,
      uiComputedFields: {},
      errors: [`duration_block metric missing/invalid: ${String(durationCfg.screenTimeID || '')}`],
    };
  }

  const rationing = durationCfg.rationing || {};
  const rationingOn = !!rationing.isON;
  let allowedNowMinutes = maxMinutes;

  if (rationingOn) {
    const bounds = getWindowBoundsForNow(now, block.times);
    allowedNowMinutes = computeAllowedSoFar(
      now,
      bounds.windowStart,
      bounds.windowEnd,
      maxMinutes,
      {
        begMinutes: Number(rationing.begMinutes) || 0,
        endMinutes: Number(rationing.endMinutes) || 0,
      }
    );
  }

  return {
    shouldBlock: usedMinutes >= allowedNowMinutes,
    uiComputedFields: {
      usedMinutes,
      maxMinutes,
      allowedNowMinutes,
      usedHuman: humanizeMinutes(usedMinutes),
      maxHuman: humanizeMinutes(maxMinutes),
      allowedNowHuman: humanizeMinutes(allowedNowMinutes),
      rationingOn,
    },
    errors: [],
  };
}

function evaluateFirstXAfterTimestampBlock(now, block, ctx) {
  const cfg = block.typeSpecific.firstXMinutes || {};
  const lookup = readTodayValueByMetricID(cfg.timestampID, ctx);

  if (!lookup.found || lookup.value === '' || lookup.value == null) {
    return { shouldBlock: false, uiComputedFields: {}, errors: [] };
  }

  const ts = lookup.value instanceof Date ? lookup.value : new Date(lookup.value);
  if (!(ts instanceof Date) || isNaN(ts.getTime())) {
    return {
      shouldBlock: false,
      uiComputedFields: {},
      errors: [`firstXMinutes timestamp invalid for metricID: ${String(cfg.timestampID || '')}`]
    };
  }

  const minutes = Math.max(0, Number(cfg.minutes) || 0);
  const cutoff = new Date(ts.getTime() + minutes * 60000);

  return {
    shouldBlock: now.getTime() < cutoff.getTime(),
    uiComputedFields: {
      timestampISO: ts.toISOString(),
      cutoffISO: cutoff.toISOString(),
      remainingMinutes: Math.max(0, (cutoff.getTime() - now.getTime()) / 60000),
    },
    errors: [],
  };
}

function buildBlockedUi(now, block, uiComputedFields, config, ctx) {
  const globals = (config && config.globals) || {};
  const barLength = Number(globals.barLength) || 20;
  const tokenMap = buildTokenMap(now, block, uiComputedFields || {}, barLength, ctx);
  const onBlock = block.onBlock || {};
  const messageTemplate = typeof onBlock.message === 'string' ? onBlock.message : '';
  const finalMessage = tokenSubstitute(messageTemplate, tokenMap);

  const ui = {
    showMessage: true,
    message: finalMessage
  };
  mergeUiFields(ui, tokenMap);

  return {
    block: {
      id: String(block.id || ''),
      type: String(block.type || ''),
      message: finalMessage,
    },
    ui,
    shortcut: {
      name: String(onBlock.shortcutName || ''),
      input: String(onBlock.shortcutInput || ''),
    },
    errors: [],
  };
}

function buildAllowedUi(now, resolvedPreset, config, ctx, debugErrors) {
  const globals = (config && config.globals) || {};
  const barLength = Number(globals.barLength) || 20;
  const blocks = Array.isArray(config && config.blocks) ? config.blocks : [];

  const durationCtx = findFirstApplicableDurationContext(now, resolvedPreset, blocks, ctx);
  if (durationCtx) {
    const tokenMap = buildTokenMap(
      now,
      durationCtx.block,
      durationCtx.uiComputedFields || {},
      barLength,
      ctx
    );

    const remainingMinutes = Math.max(
      0,
      Number(tokenMap.maxMinutes || 0) - Number(tokenMap.usedMinutes || 0)
    );

    return {
      showMessage: true,
      message:
        String(tokenMap.screenTimeBar || '') + '\n' +
        String(tokenMap.usedHuman || '0m') + ' used, ' +
        humanizeMinutes(remainingMinutes) + ' remaining',
      usedMinutes: tokenMap.usedMinutes,
      maxMinutes: tokenMap.maxMinutes,
      allowedNowMinutes: tokenMap.allowedNowMinutes,
      screenTimeBar: tokenMap.screenTimeBar,
      endTimeISO: tokenMap.endTimeISO,
    };
  }

  if (globals.cumulativeScreentimeID) {
    const usedMinutes = readDurationMinutesByMetricID(globals.cumulativeScreentimeID, ctx);
    if (usedMinutes == null) {
      debugErrors.push(`cumulativeScreentimeID metric missing/invalid: ${globals.cumulativeScreentimeID}`);
    } else {
      const capped = Math.max(0, Math.min(24 * 60, usedMinutes));
      const screenTimeBar = renderBar({
        usedMinutes: capped,
        maxMinutes: 24 * 60,
        allowedNowMinutes: 24 * 60,
        barLength,
        showMarker: false,
      });

      return {
        showMessage: true,
        message: `${screenTimeBar}\n${humanizeMinutes(usedMinutes)} used`,
        usedMinutes,
        maxMinutes: 24 * 60,
        allowedNowMinutes: 24 * 60,
        screenTimeBar,
      };
    }
  }

  return { showMessage: false, message: '' };
}

function findFirstApplicableDurationContext(now, preset, blocks, ctx) {
  const list = Array.isArray(blocks) ? blocks : [];

  for (let i = 0; i < list.length; i++) {
    const block = list[i];
    if (!block || block.type !== 'duration_block') continue;

    if (preset != null) {
      if (!Array.isArray(block.presets) || block.presets.indexOf(preset) === -1) {
        continue;
      }
    }

    const validation = validateBlock(block);
    if (!validation.isValid) continue;
    if (!isNowInTimesWindow(now, block.times)) continue;

    const durationEval = evaluateDurationBlock(now, block, ctx);
    if ((durationEval.errors || []).length > 0) continue;

    return { block, uiComputedFields: durationEval.uiComputedFields || {} };
  }

  return null;
}

function buildTokenMap(now, block, computed, barLength, ctx) {
  const tokenMap = {
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
    endTimeISO: '',
    rationMarker: computed.rationingOn === true ? '·' : '',
  };

  if (computed.usedMinutes != null && computed.maxMinutes != null) {
    tokenMap.remainingMinutes = Math.max(
      0,
      Number(computed.maxMinutes) - Number(computed.usedMinutes)
    );
    tokenMap.remainingHuman = humanizeMinutes(tokenMap.remainingMinutes);
    tokenMap.screenTimeBar = renderBar({
      usedMinutes: computed.usedMinutes,
      maxMinutes: computed.maxMinutes,
      allowedNowMinutes: computed.allowedNowMinutes,
      barLength,
      showMarker: computed.rationingOn === true,
    });
  }

  if (block && block.type === 'firstXMinutesAfterTimestamp_block' && computed.cutoffISO) {
    const cutoff = new Date(computed.cutoffISO);
    tokenMap.endTimeISO = cutoff.toISOString();
    tokenMap.endTime = formatTime12(cutoff, ctx && ctx.tz);
  } else if (block && block.type === 'duration_block' && block.times) {
    const bounds = getWindowBoundsForNow(now, block.times);
    tokenMap.endTimeISO = bounds.windowEnd.toISOString();
    tokenMap.endTime = formatTime12(bounds.windowEnd, ctx && ctx.tz);
  }

  return tokenMap;
}

function mergeUiFields(ui, tokenMap) {
  if (tokenMap.usedMinutes != null) ui.usedMinutes = tokenMap.usedMinutes;
  if (tokenMap.maxMinutes != null) ui.maxMinutes = tokenMap.maxMinutes;
  if (tokenMap.allowedNowMinutes != null) ui.allowedNowMinutes = tokenMap.allowedNowMinutes;
  if (tokenMap.screenTimeBar) ui.screenTimeBar = tokenMap.screenTimeBar;
  if (tokenMap.endTimeISO) ui.endTimeISO = tokenMap.endTimeISO;
}

function tokenSubstitute(template, tokenMap) {
  if (template == null) return '';
  const source = String(template);
  if (!tokenMap || typeof tokenMap !== 'object') return source;

  return source.replace(/\{([^{}]+)\}/g, (match, tokenName) => {
    if (!Object.prototype.hasOwnProperty.call(tokenMap, tokenName)) return match;
    const replacement = tokenMap[tokenName];
    return replacement == null ? '' : String(replacement);
  });
}

function mapMetricStateToValues(metricStateByID) {
  const out = {};
  const source = metricStateByID || {};
  const ids = Object.keys(source);

  for (let i = 0; i < ids.length; i++) {
    out[ids[i]] = source[ids[i]] ? source[ids[i]].value : null;
  }

  return out;
}

function readTodayValueByMetricID(metricID, ctx) {
  const sourceMap = ctx && ctx.todayValuesByMetricID ? ctx.todayValuesByMetricID : {};
  if (Object.prototype.hasOwnProperty.call(sourceMap, metricID)) {
    return { found: true, value: sourceMap[metricID] };
  }
  return { found: false, value: null };
}

function readDurationMinutesByMetricID(metricID, ctx) {
  const lookup = readTodayValueByMetricID(metricID, ctx);
  if (!lookup.found) return null;
  return parseDurationCellToMinutes(lookup.value);
}

function parseDurationCellToMinutes(value) {
  if (value === '' || value === null || value === undefined) return 0;
  if (typeof value === 'number' && isFinite(value)) return value * 24 * 60;

  const trimmed = String(value).trim();
  if (!trimmed) return 0;

  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (!m) return null;

  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);

  if (minutes > 59 || seconds > 59) return null;
  return hours * 60 + minutes + (seconds / 60);
}

function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { isValid: false, errors: ['Missing Lockouts V2 config object.'] };
  }

  if (!Array.isArray(config.blocks)) {
    errors.push('Lockouts V2 config.blocks must be an array.');
  }

  const globals = config.globals || {};
  if (!isFinite(Number(globals.barLength))) {
    errors.push('Lockouts V2 globals.barLength must be numeric.');
  }

  return { isValid: errors.length === 0, errors };
}

function validateBlock(block) {
  const errors = [];

  if (!block || typeof block !== 'object') {
    return { isValid: false, errors: ['Block must be an object.'] };
  }

  if (typeof block.id !== 'string' || !block.id.trim()) {
    errors.push('Block id must be a non-empty string.');
  }

  if (typeof block.type !== 'string') {
    errors.push('Block type must be a string.');
  }

  if (!block.times || typeof block.times !== 'object') {
    errors.push('Block times must be an object with beg/end.');
  }

  if (parseHHMMToMinutes(block.times && block.times.beg) == null) {
    errors.push('Block times.beg must be valid HH:MM.');
  }

  if (parseHHMMToMinutes(block.times && block.times.end) == null) {
    errors.push('Block times.end must be valid HH:MM.');
  }

  const typeSpecific = block.typeSpecific || {};

  if (block.type === 'task_block') {
    if (!Array.isArray(typeSpecific.task_block_IDs) || typeSpecific.task_block_IDs.length === 0) {
      errors.push('task_block requires typeSpecific.task_block_IDs (non-empty array).');
    }
  }

  if (block.type === 'duration_block') {
    const d = typeSpecific.duration || {};
    if (!isFinite(Number(d.maxMinutes))) {
      errors.push('duration_block requires numeric typeSpecific.duration.maxMinutes.');
    }
    if (typeof d.screenTimeID !== 'string' || !d.screenTimeID.trim()) {
      errors.push('duration_block requires typeSpecific.duration.screenTimeID.');
    }
  }

  if (block.type === 'firstXMinutesAfterTimestamp_block') {
    const f = typeSpecific.firstXMinutes || {};
    if (!isFinite(Number(f.minutes))) {
      errors.push('firstXMinutesAfterTimestamp_block requires firstXMinutes.minutes.');
    }
    if (typeof f.timestampID !== 'string' || !f.timestampID.trim()) {
      errors.push('firstXMinutesAfterTimestamp_block requires firstXMinutes.timestampID.');
    }
  }

  return { isValid: errors.length === 0, errors };
}

function isNowInTimesWindow(now, times) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const beg = parseHHMMToMinutes(times && times.beg);
  const end = parseHHMMToMinutes(times && times.end);

  if (beg == null || end == null) return false;
  if (beg === end) return true;
  if (beg < end) return nowMinutes >= beg && nowMinutes < end;
  return nowMinutes >= beg || nowMinutes < end;
}

function parseHHMMToMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;

  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;

  const h = Number(m[1]);
  const mm = Number(m[2]);

  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function getWindowBoundsForNow(now, times) {
  const beg = parseHHMMToMinutes(times.beg);
  const end = parseHHMMToMinutes(times.end);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(beg / 60),
    beg % 60,
    0,
    0
  );

  let finish = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(end / 60),
    end % 60,
    0,
    0
  );

  const dayMs = 24 * 60 * 60 * 1000;

  if (beg > end && nowMinutes < end) {
    start = new Date(start.getTime() - dayMs);
  }

  if (beg > end && nowMinutes >= beg) {
    finish = new Date(finish.getTime() + dayMs);
  }

  if (beg === end) {
    finish = new Date(start.getTime() + dayMs);
  }

  return { windowStart: start, windowEnd: finish };
}

function computeAllowedSoFar(now, windowStart, windowEnd, maxMinutes, rationing) {
  const max = Math.max(0, Number(maxMinutes) || 0);
  const beginRamp = Math.max(0, Number(rationing && rationing.begMinutes) || 0);
  const endRamp = Math.max(0, Number(rationing && rationing.endMinutes) || 0);

  const totalMs = Math.max(1, windowEnd.getTime() - windowStart.getTime());
  const elapsedMs = Math.max(0, Math.min(totalMs, now.getTime() - windowStart.getTime()));
  const progress = elapsedMs / totalMs;
  const ramp = beginRamp + (endRamp - beginRamp) * progress;

  return Math.max(0, Math.min(max, ramp));
}

function renderBar(input) {
  const used = Math.max(0, Number(input.usedMinutes) || 0);
  const max = Math.max(1, Number(input.maxMinutes) || 1);
  const allowed = Math.max(0, Number(input.allowedNowMinutes) || 0);
  const len = Math.max(1, Math.floor(Number(input.barLength) || 20));
  const showMarker = input.showMarker === true;

  const fillCount = Math.max(0, Math.min(len, Math.round((used / max) * len)));
  const markerPos = Math.max(0, Math.min(len - 1, Math.round((allowed / max) * (len - 1))));

  const chars = [];
  for (let i = 0; i < len; i++) {
    chars.push(i < fillCount ? '▓' : '░');
  }

  if (showMarker) chars[markerPos] = '·';
  return chars.join('');
}

function humanizeMinutes(mins) {
  const rounded = Math.max(0, Math.round(Number(mins) || 0));
  if (rounded < 60) return `${rounded}m`;

  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatTime12(dateObj, tz) {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: tz || undefined,
      }).format(dateObj);
    }
  } catch (error) {
    // fallback below
  }

  let h = dateObj.getHours();
  const m = String(dateObj.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

// Optional exports for non-Scriptable environments.
if (typeof module !== 'undefined') {
  module.exports = {
    lockoutsEvaluateNow,
    evaluateBlocks,
    buildRuntimeInput_,
  };
}

async function main() {
  try {
    const rawInput = (typeof args !== 'undefined' && args && args.shortcutParameter != null)
      ? args.shortcutParameter
      : null;

    const result = await lockoutsEvaluateNow(rawInput);

    if (typeof Script !== 'undefined' && typeof Script.setShortcutOutput === 'function') {
      Script.setShortcutOutput(result);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const failure = {
      status: 'error',
      block: null,
      ui: {
        showMessage: true,
        message: `ERR: ${error && error.message ? error.message : String(error)}`
      },
      shortcut: {
        name: '',
        input: ''
      },
      debug: {
        preset: null,
        serverTimeISO: new Date().toISOString(),
        errors: [
          error && error.stack ? String(error.stack) : String(error)
        ]
      }
    };

    if (typeof Script !== 'undefined' && typeof Script.setShortcutOutput === 'function') {
      Script.setShortcutOutput(failure);
    }

    console.error(failure.ui.message);
    if (failure.debug.errors[0]) console.error(failure.debug.errors[0]);
  } finally {
    if (typeof Script !== 'undefined' && typeof Script.complete === 'function') {
      Script.complete();
    }
  }
}

await main();
