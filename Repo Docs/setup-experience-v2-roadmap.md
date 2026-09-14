# OpenHabits Setup Experience V2 Roadmap

## 1. Purpose

This document defines the product direction for the next OpenHabits setup and configuration experience. It is intended to give future development sessions enough context to design focused changes and pull requests without having to reconstruct the motivation behind them.

This roadmap is about the **user experience around installing, configuring, and extending OpenHabits**. It does not replace the Habits V2 or Lockouts V2 behavioral specifications. Existing logging and lockout behavior should remain compatible unless a separately approved specification says otherwise.

The central goal is:

> A reasonably motivated person with basic phone and computer skills, but no coding skills, should be able to install and customize OpenHabits without feeling as though they are taking a computer-science exam.

OpenHabits does not need to be as simple to install as a conventional app. Its setup may reasonably be more involved because it provides a self-controlled Google Sheet data store, Apple Shortcuts integrations, flexible metrics, insights, timers, and optional focus protection. The remaining complexity should earn its place through visible user value; implementation details should not become user chores.

## 2. Target user and desired experience

The target user:

- has seen a demonstration and understands what OpenHabits can do;
- is motivated enough to follow a clear 20–30 minute setup process;
- can copy a Google Sheet, import an Apple Shortcut, paste a value, and follow illustrated settings instructions;
- may be willing to configure automations for advanced focus-protection features;
- is not expected to edit JavaScript, understand API payloads, manage database references, or debug Apps Script source.

The desired product experience is:

1. Copy the OpenHabits Sheet.
2. Authorize its bundled/bound Apps Script.
3. Complete the unavoidable web-app deployment step once.
4. Import starter Shortcuts whose metric IDs already match starter Sheet data and configuration.
5. Run a timestamp, additive-number, and timer example immediately and watch the Sheet update.
6. Open the Config Editor from the Sheet.
7. Add a metric using a recipe, accept or edit a generated metric ID, and select optional features.
8. Click **Save and Apply**.
9. Have OpenHabits save and activate the configuration and create all missing Sheet rows automatically.
10. Receive the metric ID and/or a ready-to-use QR launcher for the newly added metric.

The user should never have to redeploy Apps Script merely because a metric or lockout setting changed.

## 3. Current pain points

The current workflow exposes too much incidental implementation complexity:

- Apps Script files must be copied into a project.
- Configuration is represented as executable `Config.gs` source.
- Editing normally involves opening the hosted editor, pasting or recreating config, exporting code, replacing `Config.gs`, saving, and redeploying.
- Metric IDs must be kept consistent across configuration, the Tracking Data Sheet, Shortcuts, and any points, streak, timer, or lockout references.
- Missing or mistyped Sheet rows are discovered only when an operation fails.
- Common metric fields and specialist settings have similar visual prominence.
- Large configurations require extensive scrolling and are difficult to scan.
- Imported populated metrics currently tend to expose their Advanced sections, making mature configurations especially dense.
- Users receive their first meaningful success only after several independently fallible systems are connected.

This roadmap distinguishes between:

- **Domain complexity**, which is valuable: choosing how repeat logs behave, defining schedules, points, streaks, insights, timers, and unlock rules.
- **Incidental complexity**, which should be removed: editing source code, redeploying config changes, manually synchronizing IDs, and diagnosing internal plumbing.

## 4. Existing Shortcut architecture and compatibility

The Shortcut-side architecture is already substantially centralized:

- Individual logging Shortcuts need only provide the metric ID or list of metric IDs they want to log.
- They pass those IDs to the **Insights** Shortcut.
- Insights retrieves the deployment URL and shared secret from `Shortcuts/OpenHabits/OpenHabits Tracker/settings.json` in iCloud and performs the common request/response work.
- Insights already accepts a list of metric IDs, so it is effectively the shared logging dispatcher.

Future work must preserve this useful architecture. Some current setup documentation incorrectly implies that every individual logger must contain its own deployment URL and secret; that documentation should be corrected in a dedicated documentation change.

There is no need to force a choice between “one logger Shortcut” and “one Shortcut per metric.” All of the following should remain valid launch interfaces for the same Insights-based logging path:

- a dedicated, friendly named Shortcut containing one or more metric IDs;
- a custom Shortcut that performs HealthKit, device, Focus mode, or other actions and then passes metric IDs to Insights;
- a QR code that launches Insights with metric ID input;
- an NFC or automation that calls Insights with metric ID input;
- an optional generic Quick Log Shortcut that lets a user choose from available metrics.

Dedicated duplicatable Shortcuts should remain the beginner-friendly default. A generic Quick Log interface may be offered as an optional convenience for testing and infrequently used metrics, not as a required replacement.

## 5. Product principles

Implementations under this roadmap should follow these principles:

1. **First success before customization.** A copied installation must contain working examples that demonstrate value immediately.
2. **Define a metric once.** The system should propagate its identity to configuration, Sheet rows, derived rows, and launch helpers.
3. **No code editing for users.** Source remains an implementation and development concern.
4. **No redeployment for data-like configuration.** Deployments update application code; Save and Apply updates user configuration.
5. **Progressive disclosure.** Ordinary choices are prominent; specialist properties are available but collapsed.
6. **Strict logging, explicit administration.** Unknown logging IDs should remain errors. Row creation happens through an owner-authorized Save/Sync operation, never silently because of a typo in a logging request.
7. **Preserve user data.** Removing config must not automatically delete historical Sheet rows.
8. **Visible, actionable outcomes.** Save, validation, synchronization, and setup checks must say what succeeded, changed, or needs attention.
9. **Backward compatibility.** Existing endpoints, callers, configs, and Shortcuts should continue to work while new paths are introduced.
10. **Optional systems stay optional.** Notion, Scriptable, lockouts, and Chrome setup should not obstruct the basic habit-logging path.

## 6. Proposed configuration architecture

### 6.1 Source of truth

Move mutable user configuration out of deployed `Config.gs` code and into durable data associated with the copied Sheet. The preferred initial source of truth is a hidden/protected tab such as `_OpenHabits Config`, containing at least:

- schema version;
- active configuration revision;
- last-updated timestamp;
- serialized plain JSON configuration;
- last-known-good revision/configuration or enough information to restore it.

Secrets such as the shared request secret should not be stored in this ordinary configuration JSON. Continue to use an appropriate private property store for secrets.

Plain JSON should become the storage/interchange format. Runtime configuration loading must not require evaluating arbitrary JavaScript.

### 6.2 Loading and caching

The Sheet-backed configuration is authoritative; any cache is disposable.

An initial MVP may read and validate the config from the Sheet on each request if measurement shows that performance is acceptable. Do not add cache complexity before it is needed.

If caching is beneficial, use Apps Script's script-level cache for the validated serialized configuration:

1. Look for the active config in the script cache.
2. On a hit, parse/use it.
3. On a miss, read the authoritative JSON from the config tab, validate it, cache it, and use it.
4. On Save and Apply, replace/invalidate the cache immediately.
5. If the cache is evicted or expires, transparently reload from the Sheet.

The cache must never be the only copy. An invalid newly written configuration must not replace the last-known-good runtime configuration.

### 6.3 Save and Apply

The normal editor action should be one **Save and Apply** operation, not separate mandatory Save, Export, Deploy, and Sync actions. It should:

1. Validate the entire proposed config.
2. Verify uniqueness and references.
3. Determine required primary and derived Sheet rows.
4. Present a change preview when changes are consequential.
5. Preserve the previous valid revision.
6. Save the new JSON and increment its revision.
7. Reconcile missing Sheet rows.
8. Activate/refresh the runtime cache.
9. Return a clear report of the revision and all Sheet changes.

Advanced actions may include Preview Sheet Changes, Save Without Row Changes, Reconcile All Rows, Restore Previous Revision, and Export Backup JSON.

### 6.4 Backward-compatible migration

Do not remove `getAppConfig()` or break existing deployments in the first change. Introduce a loader that can prefer Sheet-backed config when present and fall back to the existing code-backed config. Provide a deliberate one-time import/migration from an existing `Config.gs` configuration into the new JSON store.

Migration must validate before activation and preserve the prior behavior if import fails.

## 7. Sheet-hosted editor

The copied Sheet should expose an **OpenHabits** custom menu. Potential items include:

- Edit Configuration
- Add a Metric
- Setup Status
- Sync Metric Rows
- Test Starter Metrics
- Diagnostics

The preferred UX is a hybrid:

- A lightweight Sheet sidebar or dialog provides status, onboarding, and quick actions.
- A full-page Apps Script-hosted editor provides enough space for complex configurations.

Opening the editor from the Sheet should establish which installation is being edited and remove paste/export steps. The interface may open in another browser tab while still feeling owned and launched by the Sheet.

Access to config-writing functions must be owner-authorized and clearly separated from public logging endpoints.

## 8. Automatic Sheet-row reconciliation

Saving config should automatically discover all configured IDs that require rows, including where applicable:

- primary `metricID` values;
- streak metric IDs;
- per-metric points IDs;
- timer start metric IDs;
- timer duration metric IDs;
- daily and cumulative points IDs;
- lockout screen-time metric IDs;
- timestamp IDs used by lockout rules;
- other future references whose contract requires a Tracking Data row.

The reconciliation operation should:

- append missing rows rather than inserting/reordering by default;
- place the ID in column A and a clear label in column B;
- preserve existing rows and history;
- detect duplicate IDs and refuse or prominently warn;
- optionally fill blank labels, but not overwrite customized labels silently;
- report configured IDs with no row and rows no longer referenced by config;
- never automatically delete unreferenced rows;
- never create an unknown ID as a side effect of a normal logging call.

If a config metric is removed, report that its historical Sheet row was retained.

## 9. Starter installation

The copyable Sheet/config package should ship with three understandable, fully working examples:

1. A timestamp metric.
2. A number metric using additive recording.
3. A start/stop timer metric with all required supporting rows.

The downloadable starter Shortcuts must use IDs that exactly match these bundled examples. Treat those IDs as stable public starter contracts.

The examples should tell a coherent story and demonstrate real value—for example a “Started Work” timestamp, “Glasses of Water” additive counter, and “Focus Session” timer—rather than appearing as abstract test fixtures.

The first-run goal is: copy, authorize/connect, import, tap, and immediately watch a real value change. Users should not create a test metric or edit config before seeing this success.

## 10. Config Editor UX improvements

### 10.1 Progressive disclosure

Keep these metric controls prominent:

- display name;
- metric ID;
- type/recipe;
- repeated-log behavior.

Move these to Advanced or show them contextually:

- row-number override;
- timezone mode (surface contextually for timestamp, due-by, and scheduled behavior);
- per-metric Notion integration (hide when global Notion integration is off);
- detailed date, points, streak, insight, and timer properties.

Use user-facing labels such as “When today already has a value” instead of exposing internal names such as `recordType` without explanation.

### 10.2 Expansion behavior

- After importing/loading a config, begin with all metric Advanced and nested sections closed.
- Clear stale index-based expansion state when a different config is loaded.
- Provide Expand All and Collapse All controls.
- Consider allowing an entire metric card to collapse.
- Show a useful summary in collapsed headings, such as type, timezone, points, or validation status.

### 10.3 Visual separation and navigation

- Give top-level metric cards stronger visual separation through spacing, borders, neutral alternating surfaces, or accessible accent bars.
- Do not rely on color as the only distinction.
- Visually distinguish nested cards from top-level metrics.
- Add a searchable metric navigator/table of contents showing display name, ID, type, and validation status.
- Clicking a navigator entry should scroll to and highlight that metric.
- On narrow screens, use a drawer or “Jump to metric” control rather than a permanent sidebar.

### 10.4 Recipes

Add recipe-based metric creation. Initial recipes may include:

- completion/checkbox-style habit;
- number that adds;
- number that replaces;
- timestamp;
- duration;
- start/stop timer;
- due-by task;
- advanced/custom.

Recipes should select sensible defaults and show only relevant initial questions. After creation, the metric remains ordinary editable config; recipes are starting points, not permanent runtime abstractions.

### 10.5 Generated IDs and references

- Generate a normalized metric ID from the display name.
- Let the user edit it.
- Stop automatically changing it after the user manually edits it.
- Validate duplicates immediately.
- Preview generated supporting IDs.
- Warn strongly before changing the ID of a previously saved metric.
- Prefer searchable selectors over free-text entry when a config field references an existing metric.

A later migration feature may rename an ID across config references and the existing Sheet row while preserving historical data; this is not required for the first implementation.

## 11. QR codes and logging launchers

Because Insights already accepts a list of metric IDs, the editor should support QR generation that launches Insights with the selected metric ID or IDs as input.

Offer at least:

- **Dedicated Shortcut QR:** launch an existing named Shortcut, preserving current behavior.
- **Direct Insights QR:** launch Insights with one or more selected metric IDs.

Do not place the shared secret or private deployment credentials in QR payloads. Insights should continue reading them from `Shortcuts/OpenHabits/OpenHabits Tracker/settings.json` in iCloud.

After saving a metric, provide a success screen with:

- the metric ID and a copy button;
- the appropriate duplicatable logger template;
- an optional direct Insights QR;
- concise instructions for custom or multi-metric Shortcuts.

## 12. Setup status instead of a large wizard

A polished multi-system wizard is not an initial requirement. A focused setup-status experience is likely to provide most of the benefit within a limited implementation budget.

An initial Setup Status dialog should check:

- expected Sheet/tab structure;
- valid stored configuration;
- unique IDs in config and column A;
- presence of all required primary and derived rows;
- script timezone;
- required non-optional properties;
- starter metrics;
- ability to perform a safe test write or invoke the logging path;
- deployment connection where feasible.

It should show clear pass, warning, and failure states with direct repair actions when safe. Suggested staged scope:

- **Day 1 scope:** read-only checks and an understandable status report.
- **Day 2 scope:** safe repairs for missing tabs, headers, starter rows, and config rows.
- **Day 3 scope:** guided starter tests, concise deployment help, and “create your first metric.”

Do not delay structural simplifications in order to build a sophisticated wizard. Removing steps is more valuable than explaining unnecessary steps.

## 13. Documentation changes

Documentation should be rewritten around one canonical happy path after the underlying features exist:

1. Copy the Sheet.
2. Open Setup Status.
3. Authorize/deploy once.
4. Install starter Shortcuts.
5. Log starter examples.
6. Create the first custom metric.
7. Add optional lockouts, Chrome, or Notion later.

Correct the Shortcut documentation to explain that individual logger Shortcuts pass metric ID lists to Insights, while Insights obtains URL/secret settings from `Shortcuts/OpenHabits/OpenHabits Tracker/settings.json` in iCloud.

Technical migration/export documentation should remain available for advanced users, but it should not be the primary onboarding path.

## 14. Phased delivery plan

### Phase 0: foundations and decisions

- Confirm the stable JSON schema/version strategy.
- Decide config-tab shape and backup/revision behavior.
- Define all Sheet-row-producing config references.
- Define access control for editor save operations.
- Add tests for loader fallback and reconciliation rules before changing defaults.

### Phase 1: low-risk editor improvements

- Collapse Advanced sections after load.
- Move specialist fields under Advanced/contextual UI.
- Improve metric-card visual hierarchy.
- Add searchable metric navigation.
- Generate IDs from names.
- Add initial recipes.
- Add selectors for references to existing metrics.

This phase can improve the existing hosted editor without changing runtime configuration storage.

### Phase 2: Sheet row reconciliation

- Implement a pure config-to-required-rows collector.
- Implement dry-run reconciliation reporting.
- Append missing rows safely.
- Detect duplicates and preserve unused/history rows.
- Integrate reconciliation into a controlled admin action.

### Phase 3: Sheet-backed configuration

- Add versioned JSON loading with `Config.gs` fallback.
- Add last-known-good behavior.
- Add migration/import from existing config.
- Add Save and Apply.
- Measure performance; add script caching only if justified.
- Remove redeployment from the normal config-change workflow.

### Phase 4: Sheet-launched experience

- Add the OpenHabits custom menu.
- Add Setup Status/sidebar.
- Host or connect the full editor to the bound Sheet.
- Add owner-authorized save calls and clear reports.
- Add starter test actions.

### Phase 5: starter package and launch helpers

- Finalize stable example metrics and matching Shortcuts.
- Add direct Insights QR input generation.
- Add post-save “use this metric” guidance.
- Optionally provide a Quick Log menu Shortcut.
- Rewrite onboarding documentation and demos around the new happy path.

Phases may be divided into smaller pull requests. Avoid a single all-or-nothing rewrite.

## 15. Success measures and acceptance criteria

### Basic installation

A motivated non-coder should be able to reach a successful starter log:

- ideally within 10–15 minutes;
- acceptably within 20–30 minutes;
- without editing source code;
- without creating a test metric manually;
- without diagnosing a raw API/config error.

### First custom metric

A user should be able to create and log:

- a simple metric in 1–3 minutes;
- a timer in 3–5 minutes;
- a metric with points or a schedule in 5–10 minutes.

For a normal addition, one Save and Apply action should leave configuration and required Sheet rows consistent.

### Maintenance

- Config changes do not require redeployment.
- Missing derived rows are created or clearly reported.
- Historical rows are never deleted automatically.
- Existing logger Shortcuts and endpoints continue to function.
- Users can restore the previous valid configuration.

### Qualitative standard

At every step, a user should be answering questions about their habits and desired automation—not questions about how OpenHabits happens to be implemented.

## 16. Non-goals for the initial push

- Making installation identical to a one-tap App Store install.
- Eliminating the one-time Apps Script authorization/deployment requirement at any cost.
- Replacing all dedicated logger Shortcuts with one mandatory generic Shortcut.
- Dynamically reproducing arbitrary HealthKit, smart-device, or Focus actions from server config.
- Automatically deleting or restructuring historical user data.
- Requiring Notion, Scriptable, lockouts, or Chrome for basic tracking.
- Building a broad external OAuth application solely so the public GitHub Pages editor can write to Sheets.
- Combining every phase into one risky change.

## 17. Risks and open decisions

Future implementation work should explicitly address:

- Whether a Sheet sidebar/dialog or an Apps Script-hosted full page provides the best editor experience.
- Whether copied bound scripts still require any manual project/deployment preparation that cannot be bundled.
- How editor write operations authenticate the owner without weakening public logging endpoint security.
- Whether config reads are measurably slow enough to require script caching.
- Storage limits and safe backup depth for config revisions.
- How formulas or formatting should be applied to newly appended derived rows.
- How to name starter IDs so they remain useful rather than looking like disposable test data.
- How to encode list input in QR launch URLs robustly across supported iOS versions.
- How existing code-backed configs migrate without behavioral changes.
- Which field references require Sheet rows, and how future schema changes declare that relationship.

## 18. Guidance for future pull requests

Each pull request implementing this roadmap should:

- identify the roadmap phase and narrow user problem it addresses;
- preserve current API/Shortcut behavior unless an explicit migration is included;
- include tests for validation, migration, or reconciliation logic as appropriate;
- describe any new persistent data and its rollback strategy;
- avoid placing secrets in Sheet config, browser storage, QR codes, or exported JSON;
- include screenshots for perceptible editor/Sheet UI changes;
- update user documentation only for behavior actually delivered;
- prefer incremental compatibility paths over replacing existing behavior in one step.

This document records product intent, not permission to implement every item without design review. Open questions should be resolved in the focused pull request that first depends on them.
