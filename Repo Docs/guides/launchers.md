# Quick launchers

[Feature guides](../features.md)

First [test a logger](metrics.md) manually. A launcher runs that same logging flow.

## QR codes

Use **Shortcut QR Code Generator** in the [Config Editor](https://copperpanman.github.io/OpenHabits-Metrics/).

| Launcher type | Use it for |
| --- | --- |
| Dedicated Shortcut QR | A named installed Shortcut, including one that asks for a value or performs other actions |
| Direct Insights QR | A timestamp recorded without a dedicated logger Shortcut |

For a dedicated Shortcut, enter its exact installed name. For Direct Insights, select the metric and confirm the Insights Shortcut name. Generate the code, download its PNG, and scan it with the iPhone Camera app. Check the Sheet before printing or placing it permanently.

The generator makes the QR in your browser. Dedicated mode encodes the Shortcut name; Direct Insights mode also includes the metric ID. Neither contains your deployment URL or secret. Direct Insights sends no value: use it for timestamps. Number metrics (including completion recipes), text, and durations need a dedicated logger with an explicit value.

## NFC tags

In **Shortcuts → Automation**, add an **NFC** automation, scan/name your tag, and choose **Run Immediately** where available. Add **Run Shortcut** pointing to your logger. Scan the tag again and confirm the Sheet updates.

## Home Screen, widgets, and Siri

Use your logger Shortcut's **Add to Home Screen** option, add a Shortcuts widget and select it, or ask Siri to run it by name. These use the same logger and connection settings.

## Other automations

Choose the trigger in Shortcuts and run the desired logger. For an input-bearing logger, make sure the automation supplies the expected value or the logger asks for it. Run once with the phone unlocked to finish granting permissions before relying on unattended execution.
