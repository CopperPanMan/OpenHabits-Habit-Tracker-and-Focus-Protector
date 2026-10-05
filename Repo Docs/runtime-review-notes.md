# Metrics review notes and outstanding work

## Implemented lockout refactor

- Shared local runtime and pure lockouts evaluator remain separate.
- Text commands and native Lists avoid request envelopes and response encoding.
- Complete notification strings are constructed in code.
- All state paths consistently use OpenHabits/OpenHabits Metrics.
- Duplicate cache refresh during recursive task_block handling was removed.
- Half/quarter-hour timezone arithmetic is correct; metric patches write once.
- Early attempts reset the timer; expired attempts fall through without reset.
- Error handling stays in code rather than adding a native branch per failure.
- Penalty logging and Calendar Alarms integration remain optional.
- An empty evaluator allow message uses a nonempty fallback so Allowed does not
  accidentally open its empty-input unlock menu.
- Compared with the original transcription, early-entry blocking also starts
  the optional blocking-app session and pauses media, messages are reformatted, and remaining minutes round
  upward. Calendar notes were reconstructed for the described silent Home action
  and event creation explicitly invokes Calendar Alarm Engine to sync.

## Reviewed but not implemented

Insights and Toggle Timer are good candidates for extending this same runtime;
the three-action Metric(s) Logger should remain native. Making Scriptable a
standard Metrics dependency is a proposed future decision, not implemented by
this checkpoint. No Insights/timer runtime commands are invented here.

### Toggle Timer

- The transcription clears startTime and saves before calling Insights but does
  not show a write of the elapsed duration into pendingSeconds. Failure can lose
  the stopped interval. Persist pending time before submitting; subtract the
  acknowledged submitted amount only after that metric succeeds.
- Reading `pendingSeconds` differs from initialization/clearing of the per-metric
  `metricId_pendingSeconds` key. Confirm the actual Shortcut binding.
- A missing-file initialization Otherwise appears absent in the transcription.
  Confirm actual nesting before implementing changes; appending a second JSON
  object to an existing state file is not a valid state update.
- Explicit stop with no active timer should not initialize a running timer.
- The template comment describes server start_timer/stop_timer requests, but the
  transcribed implementation tracks locally and submits an elapsed duration.
- Keep calendar prompts, events, wallpaper, Focus, and native timers editable in
  Shortcuts. Move state transitions and duration payload formatting into code.
- Durable pending time does not by itself make retries safe after an ambiguous
  HTTP timeout: a server may already have recorded the additive duration. Do not
  add automatic replay without a corresponding deduplication design.

### Insights

- Mere presence of metricsByID is not successful logging: the server response
  builder includes it in error responses, and individual metric entries can fail
  even when top-level ok is true. Timer acknowledgement must check its own metric.
- Return the first recording response, not a later Notion-sync HTTP result. The
  normalized readout explicitly binds RecordResponse; verify the installed action.
- Negative pointsDelta with a positive total can display `+-10pts`. Use signed
  formatting, and avoid repeating points already included in duration messages.
- Show actionable recording errors outside the disabled debug branch; do not
  treat failed metrics as successful logs or Notion-sync candidates.
- Sending the notification before Notion sync gives earlier feedback, but the
  Shortcut/caller still waits for the second request. It is not background work.
- Validate secret/deployment ID before saving. Repeat 10 can reach save without
  selecting I'm Finished. fileFound appears unused; confirm actual references.
- Building request JSON by interpolating quoted secrets/text can fail on quotes
  or backslashes. Future runtime request preparation should serialize values.
- Preserve native initial setup until the runtime exists; Scriptable must not be
  asked to perform the network download that installs its own runtime.

These findings describe the runtime checkpoint preceding the documentation cleanup.
The publication readouts now use optional blocking-app comments; installed native
Shortcut exports still require their own update. Timer/Insights findings above
remain open and do not describe functionality implemented by the new guides.
