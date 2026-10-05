# Developer reference

For installation and feature choices, start with [Setup](setup.md) and [Feature guides](features.md). This directory also keeps references for custom clients and maintainers.

| Reference | Use it for |
| --- | --- |
| [API keys](developer-keys.md) | JSON POST requests, supported keys, and custom client examples |
| [Lockouts server contract](lockouts-server.md) | Rule evaluation, presets, tokens, and response fields |
| [Metrics runtime](runtime.md) | Scriptable commands, files, cache, and unlock timing |
| [Shortcut action readouts](shortcut-actions/index.md) | Rebuilding/checking native shortcut wiring; these are not signed exports |
| [Known Shortcut review findings](runtime-review-notes.md) | Unimplemented timer/Insights improvements and on-device checks |
| [Metric schema migration](metric-schema-migration.md) | Migrating older configurations to current types |
| [Starter template preparation](../Examples/starter-template.md) | Assembling the public Sheet and publishing its copy link |
| [Design archive](archive/README.md) | Historical requirements and proposals, rather than installation instructions |

Current behavior is implemented in [Main.gs](../Main.gs), [Config.gs](../Config.gs), [SetupV2.gs](../SetupV2.gs), and [Lockouts.gs](../Lockouts.gs). Run automated checks with `node --test tests/*.test.js` from the repository root.
