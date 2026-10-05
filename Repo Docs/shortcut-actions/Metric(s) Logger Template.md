# Metric(s) Logger Template

Publication readout for the shared template and setup demo. These instructions do not modify installed or signed Shortcut exports. The historical source transcription is retained separately.

```text
VIBRATE DEVICE
TEXT: [["glass_of_water",1],["last_drank"]]
    -> MetricText
COMMENT:
    Run this template to add a glass of water and record the latest drink time.
    For your own logger, duplicate it and replace the entries in Text.
    Each entry is ["metricID",value]; timestamps can omit the value.
    Numbers require an explicit value. Text/duration values use JSON quotes.
    Add Ask for Input when you want a value entered each time, and use its
    magic variable. See the logger guide for escaping free-form text.
RUN SHORTCUT: Insights
    Input: MetricText
```

The three executable native actions remain Vibrate, Text, and Run Shortcut. See [logger examples](../guides/metrics.md) for customization. Verify the Run Shortcut binding when publishing or importing.
