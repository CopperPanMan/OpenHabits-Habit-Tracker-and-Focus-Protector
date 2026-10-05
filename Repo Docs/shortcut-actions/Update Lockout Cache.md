# Update Lockout Cache

Status: complete runtime-based action readout implemented by the user. Input is
empty for refresh, `fetch_new_cache` for forced refresh, or a metric response for
local patching. Output is 1 only when a local patch changed values, otherwise
empty text. Arrows label magic-variable outputs. Run in App is Off.

```text
TEXT: cache_prepare
LIST
    Item 1: Text
    Item 2: Shortcut Input
RUN SCRIPT: OpenHabits Runtime
    Parameter: List
    -> PrepareResult
GET DICTIONARY VALUE: notification from PrepareResult
IF Dictionary Value has any value
    SHOW NOTIFICATION: Dictionary Value
END IF
GET DICTIONARY VALUE: url from PrepareResult
    -> RequestURL
IF RequestURL has any value
    GET SHORTCUTS: All Shortcuts
    IF Shortcuts contains Calendar Alarm Engine
        RUN SHORTCUT: Calendar Alarm Engine
            Input: None
    END IF
    GET DICTIONARY VALUE: secret from PrepareResult
        -> Secret
    GET DICTIONARY VALUE: clientNow from PrepareResult
        -> ClientNow
    GET CONTENTS OF URL: RequestURL
        Method: POST
        Request Body: JSON
            key: config_snapshot
            secret: Secret
            clientNow: ClientNow
        -> ServerResponse
    TEXT: cache_commit
    LIST
        Item 1: Text
        Item 2: ServerResponse
    RUN SCRIPT: OpenHabits Runtime
        Parameter: List
    GET DICTIONARY VALUE: notification from Script Result
    IF Dictionary Value has any value
        SHOW NOTIFICATION: Dictionary Value
    END IF
END IF
GET DICTIONARY VALUE: updatedState from PrepareResult
STOP AND OUTPUT: Dictionary Value
```
