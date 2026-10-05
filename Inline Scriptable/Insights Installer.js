// Paste this into Scriptable's Run Inline Script action in Insights setup.
// Parameter: List [downloaded runtime source, optional downloaded lockouts source].
// Shortcuts performs all HTTP before calling this script. No bookmark is needed
// to install into Scriptable's own Documents directory.

const sources = Array.isArray(args.shortcutParameter)
  ? args.shortcutParameter
  : [args.shortcutParameter];

function sourceText(value, name, markers) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} download was empty or was not text.`);
  }
  if (/^\s*<(?:!doctype|html|head|body)\b/i.test(value) ||
      markers.some(marker => !value.includes(marker))) {
    throw new Error(`${name} download was not the expected script.`);
  }
  // Compile only: catch truncated/invalid JavaScript without running the script.
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  try {
    new AsyncFunction(value);
  } catch (_) {
    throw new Error(`${name} download contained invalid JavaScript.`);
  }
  return value;
}

const scripts = [{
  name: "OpenHabits Runtime.js",
  source: sourceText(sources[0], "OpenHabits Runtime.js", [
    "const RUNTIME_VERSION =",
    "Script.setShortcutOutput",
    'case "app_open"'
  ])
}];

if (sources[1] !== undefined && sources[1] !== null && sources[1] !== "") {
  scripts.push({
    name: "lockouts.js",
    source: sourceText(sources[1], "lockouts.js", [
      "lockoutsEvaluateNow",
      "Script.setShortcutOutput"
    ])
  });
}

// Validate all supplied downloads before replacing any managed script.
const fm = FileManager.iCloud();
for (const script of scripts) {
  fm.writeString(
    fm.joinPath(fm.documentsDirectory(), script.name),
    script.source
  );
}

Script.setShortcutOutput("OpenHabits scripts installed.");
Script.complete();
