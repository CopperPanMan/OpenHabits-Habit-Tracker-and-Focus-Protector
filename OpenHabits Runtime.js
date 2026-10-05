// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: code;

const RUNTIME_VERSION = "1.1.1";

// Clock alarms are scheduled to whole minutes. Advance both the calendar
// event end and local access expiry so an alarm cannot precede local expiry.
const SESSION_END_ADVANCE_MINUTES = 1;
const MINUTE_MS = 60000;

const RULES = {
  legitimate_unlock: { wait: 60, minutes: 20 },
  penalty_unlock: { wait: 30, minutes: 10 }
};

function object(value, label) {
  if (typeof value === "string") {
    value = JSON.parse(value);
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value;
}

function date(value) {
  return typeof value === "string" && value.trim()
    ? Date.parse(value)
    : NaN;
}

function offsetMinutes(value) {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(String(value));

  if (!m || +m[2] > 23 || +m[3] > 59) {
    throw new Error("Invalid timezone offset.");
  }

  return (m[1] === "-" ? -1 : 1) *
    (+m[2] * 60 + +m[3]);
}

function offset(now) {
  const n = -now.getTimezoneOffset();

  return (n < 0 ? "-" : "+") +
    String(Math.floor(Math.abs(n) / 60)).padStart(2, "0") +
    String(Math.abs(n) % 60).padStart(2, "0");
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function storage() {
  const fm = FileManager.iCloud();
  let root;

  try {
    root = fm.bookmarkedPath("Shortcuts");
  } catch (_) {}

  if (!root && typeof FileManager.bookmarkedPath === "function") {
    try {
      root = FileManager.bookmarkedPath("Shortcuts");
    } catch (_) {}
  }

  if (!root) {
    throw new Error(
      "Create a Scriptable bookmark named Shortcuts " +
      "pointing to iCloud Drive/Shortcuts."
    );
  }

  const dir = fm.joinPath(
    fm.joinPath(root, "OpenHabits"),
    "OpenHabits Metrics"
  );

  return {
    read(name) {
      const path = fm.joinPath(dir, name);

      if (!fm.fileExists(path)) {
        return null;
      }

      // Do not wait for iCloud inside the short execution window.
      if (
        typeof fm.isFileDownloaded === "function" &&
        !fm.isFileDownloaded(path)
      ) {
        throw new Error(
          `${name} is not downloaded. Download it in Files.`
        );
      }

      const text = fm.readString(path);

      return text.trim() ? JSON.parse(text) : null;
    },

    write(name, value) {
      if (!fm.fileExists(dir)) {
        fm.createDirectory(dir, true);
      }

      fm.writeString(
        fm.joinPath(dir, name),
        JSON.stringify(value)
      );
    }
  };
}

function unlockState(s, now) {
  const old = s.read("lockouts.json");

  if (old !== null && old !== undefined) {
    if (
      !Number.isFinite(date(old.unlockedUntil)) ||
      !Number.isFinite(date(old.unlockWait)) ||
      typeof old.unlockType !== "string"
    ) {
      throw new Error(
        "Invalid lockouts.json. Repair the file before retrying."
      );
    }

    return old;
  }

  const past = new Date(+now - 60000).toISOString();

  // Initialize in memory; persist only when state changes.
  return {
    unlockedUntil: past,
    unlockWait: past,
    unlockType: ""
  };
}

function validateCache(raw) {
  const c = object(raw, "Cache");

  if (
    c.ok !== true ||
    c.schemaVersion !== "lockouts_cache_v1" ||
    !Number.isFinite(date(c.lastUpdated))
  ) {
    throw new Error("Invalid OpenHabits cache response.");
  }

  object(c.config, "Cache config");

  if (!Array.isArray(c.config.blocks)) {
    throw new Error("Cache config.blocks must be a list.");
  }

  object(c.metricState, "Metric state");
  object(c.metricState.allByID, "Metric entries");
  object(c.virtualDay, "Virtual day");

  if (c.virtualDay.timezoneOffsetRFC2822 !== "") {
    offsetMinutes(c.virtualDay.timezoneOffsetRFC2822);
  }

  return c;
}

function appOpen(s, now) {
  const state = unlockState(s, now);

  const remaining =
    date(state.unlockedUntil) - +now;

  if (remaining > 0) {
    const minutes = Math.ceil(remaining / 60000);

    return {
      route: "allow",
      notification:
        `Unlocked for ${minutes} more ` +
        `${minutes === 1 ? "minute" : "minutes"}.`
    };
  }

  const rule = Object.prototype.hasOwnProperty.call(
    RULES,
    state.unlockType
  )
    ? RULES[state.unlockType]
    : null;

  const elapsed = +now - date(state.unlockWait);

  if (rule && elapsed <= 300000) {
    if (elapsed < rule.wait * 1000) {
      state.unlockWait = now.toISOString();

      s.write("lockouts.json", state);

      return {
        route: "block",
        notification:
          "Early entry reset the timer. " +
          `Wait ${rule.wait} seconds before reopening the app.`
      };
    }

    const penalty = state.unlockType === "penalty_unlock";

    const sessionMinutes = rule.minutes - SESSION_END_ADVANCE_MINUTES;
    const deadline = Math.floor(
      (+now + sessionMinutes * MINUTE_MS) / MINUTE_MS
    ) * MINUTE_MS;

    state.unlockedUntil = new Date(deadline).toISOString();

    state.unlockType = "";

    s.write("lockouts.json", state);

    const end = new Date(
      state.unlockedUntil
    ).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });

    return {
      route: "allow",
      calendarEnd: state.unlockedUntil,
      calendarMinutes: sessionMinutes,
      penalty,
      notification:
        `${penalty ? "10 points deducted. " : ""}` +
        `Unlocked until ${end}.`
    };
  }

  // Expired attempts fall through without clearing their fields.
  // Supply the existing evaluator's cache without Shortcut file I/O.
  const cache = validateCache(s.read("lockoutCache.json"));

  return {
    route: "evaluate",
    cacheJSON: JSON.stringify(cache)
  };
}

function beginUnlock(s, now, type) {
  const state = unlockState(s, now);

  state.unlockType = type;
  state.unlockWait = now.toISOString();

  s.write("lockouts.json", state);

  const rule = RULES[type];

  return {
    notification:
      (type === "penalty_unlock"
        ? `${rule.wait}s timer started. You will lose 10pts by continuing.`
        : `${rule.wait}s timer started for legitimate unlock.`) +
      "\nValid for 5 minutes. Attempting early entry will reset the timer."
  };
}

function prepareCache(s, now, input) {
  let cache;

  try {
    cache = s.read("lockoutCache.json");
  } catch (e) {
    // Malformed JSON can be replaced.
    // An unavailable iCloud file must not be overwritten.
    if (e.name !== "SyntaxError") {
      throw e;
    }
  }

  let valid = false;

  try {
    validateCache(cache);
    valid = true;
  } catch (_) {}

  const current = offset(now);

  const age = valid
    ? +now - date(cache.lastUpdated)
    : NaN;

  const previous = valid
    ? cache.virtualDay.timezoneOffsetRFC2822
    : "";

  const hasInput =
    input !== undefined &&
    input !== null &&
    input !== "";

  const fresh =
    valid &&
    age >= 0 &&
    age <= 18000000 &&
    sameDay(new Date(cache.lastUpdated), now) &&
    previous === current;

  if (fresh && hasInput && input !== "fetch_new_cache") {
    const response = object(input, "Metric response");

    if (
      response.ok === false ||
      !Array.isArray(response.metricsByID)
    ) {
      throw new Error(
        "Metric response must contain metricsByID."
      );
    }

    let changed = false;
    const entries = cache.metricState.allByID;

    for (const item of response.metricsByID) {
      if (
        !item ||
        typeof item.metricID !== "string" ||
        !Object.prototype.hasOwnProperty.call(
          entries,
          item.metricID
        )
      ) {
        continue;
      }

      const entry = entries[item.metricID];

      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        item.value === undefined ||
        item.value === null ||
        item.value === ""
      ) {
        continue;
      }

      if (String(entry.value) !== String(item.value)) {
        entry.value = item.value;
        changed = true;
      }
    }

    // One write for all changed metrics.
    // Preserve the snapshot's original lastUpdated.
    if (changed) {
      s.write("lockoutCache.json", cache);
    }

    return {
      updatedState: changed ? 1 : ""
    };
  }

  // Preserve the existing throttle, including forced refreshes.
  if (valid && age >= 0 && age <= 15000) {
    return {
      updatedState: ""
    };
  }

  const settings = s.read("settings.json");

  if (
    !settings ||
    typeof settings.webAppId !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(settings.webAppId) ||
    typeof settings.openHabitsSecret !== "string" ||
    !settings.openHabitsSecret.trim()
  ) {
    throw new Error(
      "OpenHabits settings missing or invalid. " +
      "Please run Insights and follow setup."
    );
  }

  const result = {
    updatedState: "",
    url:
      `https://script.google.com/macros/s/${settings.webAppId}/exec`,
    secret: settings.openHabitsSecret,
    clientNow: new Date(
      +now + offsetMinutes(current) * 60000
    )
      .toUTCString()
      .replace("GMT", current)
  };

  if (valid && previous && previous !== current) {
    const hours = (
      offsetMinutes(previous) -
      offsetMinutes(current)
    ) / 60;

    result.notification =
      "OpenHabits updating cache for new timezone " +
      `(UTC ${current}, ${hours >= 0 ? "+" : ""}${hours}h).`;
  }

  return result;
}

function commitCache(s, response) {
  let cache;

  try {
    cache = validateCache(response);
  } catch (_) {
    return {
      notification:
        "Error: unable to access Google Drive at this time. " +
        "Invalid OpenHabits cache response. Previous cache retained."
    };
  }

  s.write("lockoutCache.json", cache);

  return {};
}

function dispatch(raw, s, now) {
  const list = Array.isArray(raw) ? raw : [raw];

  const command = typeof list[0] === "string"
    ? list[0].trim()
    : "";

  switch (command) {
    case "app_open": {
      // The recursive task-block pass only reevaluates the cache.
      // It neither refreshes the cache nor processes unlock state.
      if (list[1] === "task_block") {
        const cache = validateCache(
          s.read("lockoutCache.json")
        );

        return {
          route: "evaluate",
          cacheJSON: JSON.stringify(cache)
        };
      }

      return appOpen(s, now);
    }

    case "evaluator_input": {
      const result = object(list[1], "App-open result");
      const cache = validateCache(result.cacheJSON);

      const title = typeof list[2] === "string"
        ? list[2]
        : "";

      return JSON.stringify({
        cache,
        presetOverride: title || null
      });
    }

    case "begin_legitimate":
      return beginUnlock(s, now, "legitimate_unlock");

    case "begin_penalty":
      return beginUnlock(s, now, "penalty_unlock");

    case "cache_prepare":
      return prepareCache(s, now, list[1]);

    case "cache_commit":
      return commitCache(s, list[1]);

    default:
      throw new Error("Unknown OpenHabits Runtime command.");
  }
}

async function main() {
  let result;

  try {
    result = dispatch(
      args.shortcutParameter,
      storage(),
      new Date()
    );
  } catch (error) {
    result = {
      route: "block",
      updatedState: "",
      notification:
        `OpenHabits: ${error.message || String(error)}`
    };
  }

  Script.setShortcutOutput(result);
  Script.complete();
}

await main();
