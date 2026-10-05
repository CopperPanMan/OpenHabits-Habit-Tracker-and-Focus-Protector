# Toggle Timer Template publication notes

The shared template is itself the timer demo. Use this configured metric Text:

```text
TEXT: [["time_working"]]
```

Keep the timer's native start/stop flow and elapsed-duration submission to Insights. This Text identifies the duration metric; it is not a no-value recording request. The client stores its start instant and supplies the duration when stopped. No separate demo shortcut download is needed.

Replace the historical opening comment with:

```text
COMMENT:
    Run once to start timing and again to stop and add elapsed time to
    Time Working. Starting alone does not write a duration to the Sheet.
    Duplicate this template for another duration metric and replace its ID.
    Input "start" or "stop" requests that operation instead of toggling.
    Choose optional calendar, Focus, and other actions in the comments below.
```

The [original action transcription](source-transcriptions/Toggle%20Timer%20Template.txt) is provenance, not a newly verified export. Check the [timer review findings](../runtime-review-notes.md#toggle-timer) against the actual shared shortcut before publication, especially initialization, pending-time handling, and failed submissions. These notes do not implement a timer refactor or claim recovery issues have been fixed.
