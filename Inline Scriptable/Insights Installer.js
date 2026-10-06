// Paste this into Scriptable's Run Inline Script action in Insights setup.
// No parameter is needed: this script downloads and installs both managed files.
// No bookmark is needed to install into Scriptable's own Documents directory.
const baseURL = "https://raw.githubusercontent.com/CopperPanMan/OpenHabits-Metrics/main/";

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
  source: sourceText(await new Request(baseURL + "OpenHabits%20Runtime.js").loadString(), "OpenHabits Runtime.js", [
    "const RUNTIME_VERSION =",
    "Script.setShortcutOutput",
    'case "app_open"'
  ])
}, {
  name: "lockouts.js",
  source: sourceText(await new Request(baseURL + "lockouts.js").loadString(), "lockouts.js", [
    "lockoutsEvaluateNow",
    "Script.setShortcutOutput"
  ])
}];

// Download and validate both scripts before replacing either managed script.
const fm = FileManager.iCloud();
for (const script of scripts) {
  fm.writeString(
    fm.joinPath(fm.documentsDirectory(), script.name),
    script.source
  );
}

Script.setShortcutOutput("OpenHabits scripts installed.");
Script.complete();
