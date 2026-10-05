# Metrics Shortcut readouts

| Shortcut | Source/status |
| --- | --- |
| Locked | Runtime 1.1.1 sequence in [Locked.md](Locked.md), adapted with optional blocking-app comments for publication |
| Allowed | Runtime sequence in [Allowed.md](Allowed.md), adapted with an optional blocking-app comment |
| Update Lockout Cache | Complete two-phase native HTTP sequence; implemented by the user |
| Insights | Normalized readout in [Insights.md](Insights.md); installer runs when Update Lockout Cache is present; logging remains native |
| Toggle Timer Template | [Publication notes](Toggle%20Timer%20Template.md) preload time_working; historical transcription retained, timer not refactored |
| Metric(s) Logger Template | [Publication readout](Metric%28s%29%20Logger%20Template.md) preloads the water/count and latest-timestamp demo; historical transcription retained |

The original Insights transcription and its legacy installer are also preserved
under source-transcriptions for provenance. The legacy installer uses Request
and skips existing files; it is historical source, not the recommended installer.
Use Inline Scriptable/Insights Installer.js and the continuous Insights action list.

Trailing whitespace was normalized in the source snapshots; repository URLs
were updated after the repository rename. Other source content was retained. Original
transcriptions may have omitted indentation, typos, or a missing branch.
Their ambiguity is recorded in ../runtime-review-notes.md, not silently fixed.
These documents are manual action specifications; there are no editable/signed
iOS Shortcut exports in this checkpoint. Published iCloud links belong on
[Downloads](../downloads.md); updating a readout does not change installed shortcuts.
Calendar Alarms is a separate repo;
this checkpoint documents the optional integration and changes no CA source.
