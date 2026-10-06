# Locked

Status: runtime-based action readout adapted for publication. The original native
sequence was implemented by the user; this version replaces blocking-app actions
with optional comments. It does not update installed or shared Shortcut exports.
Runtime 1.2.0 adds expected-preset tracking behind these existing calls; the native sequence remains compatible.
Arrows label magic-variable outputs. All Run Script actions use Run in App: Off.
The ending calendar alarm uses `calendarEnd` directly, with zero offset; do not
subtract another minute in the event notes or native actions.

```text
AUTOMATION
    When Instagram, Facebook, Chrome, TikTok, Safari, or YouTube is opened
        Run Locked
TEXT: app_open
LIST
    Item 1: Text
    Item 2: Shortcut Input
RUN SCRIPT: OpenHabits Runtime
    Parameter: List
    -> OpenResult
GET DICTIONARY VALUE: route from OpenResult
    -> Route
IF Route is evaluate
    FIND CALENDAR EVENTS
        Start Date is Today
        Calendar is App Lockout Settings
        Is All Day is true
        Limit: 1
    GET DETAILS OF CALENDAR EVENTS: Title
        -> PresetTitle
    TEXT: evaluator_input
    LIST
        Item 1: Text
        Item 2: OpenResult
        Item 3: PresetTitle
    RUN SCRIPT: OpenHabits Runtime
        Parameter: List
    RUN SCRIPT: lockouts
        Parameter: Previous Script Result
        -> Evaluation
    GET DICTIONARY VALUE: status from Evaluation
        -> Status
    IF Status is blocked
        GET DICTIONARY VALUE: block from Evaluation
            -> Block
        GET DICTIONARY VALUE: message from Block
            -> BlockMessage
        GET DICTIONARY VALUE: type from Block
            -> BlockType
        IF Shortcut Input is not task_block
            COMMENT: Optional — start a blocking session in the blocking app of your choice.
            PAUSE MEDIA
            GET DICTIONARY VALUE: shortcut from Evaluation
                -> BlockShortcut
            GET DICTIONARY VALUE: name from BlockShortcut
                -> ShortcutName
            IF ShortcutName has any value
                GET DICTIONARY VALUE: input from BlockShortcut
                    -> BlockShortcutInput
                RUN SHORTCUT: ShortcutName
                    Input: BlockShortcutInput
            OTHERWISE
                GO TO HOME SCREEN
            END IF
            SHOW NOTIFICATION: BlockMessage
            IF BlockType is task_block
                TEXT: fetch_new_cache
                RUN SHORTCUT: Update Lockout Cache
                    Input: Text
                TEXT: task_block
                RUN SHORTCUT: Locked
                    Input: Text
            END IF
        OTHERWISE
            IF BlockType is not task_block
                SHOW NOTIFICATION: BlockMessage
            END IF
        END IF
        STOP THIS SHORTCUT
    OTHERWISE
        IF Status is allowed
            GET DICTIONARY VALUE: ui from Evaluation
                -> UI
            GET DICTIONARY VALUE: message from UI
                -> AllowedMessage
            IF AllowedMessage has any value
                TEXT: [AllowedMessage]
            OTHERWISE
                TEXT: Apps are allowed.
            END IF
            RUN SHORTCUT: Allowed
                Input: If Result
            STOP THIS SHORTCUT
        OTHERWISE
            COMMENT: Optional — start a blocking session in the blocking app of your choice.
            PAUSE MEDIA
            GO TO HOME SCREEN
            SHOW NOTIFICATION: OpenHabits: lockout evaluation failed.
            STOP THIS SHORTCUT
        END IF
    END IF
OTHERWISE
    IF Route is allow
        COMMENT: Optional — stop the blocking session in the blocking app of your choice.
        GET DICTIONARY VALUE: calendarEnd from OpenResult
            -> CalendarEnd
        IF CalendarEnd has any value
            GET SHORTCUTS: All Shortcuts
                -> InstalledShortcuts
            GET DICTIONARY VALUE: penalty from OpenResult
            IF Dictionary Value is true
                IF InstalledShortcuts contains Log Screen Time Lock Off
                    RUN SHORTCUT: Log Screen Time Lock Off
                        Input: None
                END IF
            END IF
            IF InstalledShortcuts contains Calendar Alarm Engine
                GET DATES FROM INPUT: CalendarEnd
                    -> UnlockEnd
                CURRENT DATE
                    -> EventStart
                ADD NEW EVENT
                    Title: Apps Unlocked
                    Start Date: EventStart
                    End Date: UnlockEnd
                    Calendar: App Lockout Settings
                    All Day: Off
                    Alert: None
                    Show Compose Sheet: Off
                    Notes:
                        [
                          {
                            "alarmName": "Apps Unlocked Ends",
                            "status": "ON",
                            "reference": "end",
                            "offsetMin": 0,
                            "silenceAlarm": true,
                            "shortcutsOnTrigger": [
                              {
                                "name": "Calendar Alarms Actions",
                                "input": [
                                  "{\"action\":\"open\",\"operation\":\"home_screen\"}"
                                ]
                              }
                            ]
                          }
                        ]
                RUN SHORTCUT: Calendar Alarm Engine
                    Input: None
            END IF
        END IF
    OTHERWISE
        COMMENT: Optional — start a blocking session in the blocking app of your choice.
        PAUSE MEDIA
        GO TO HOME SCREEN
    END IF
    GET DICTIONARY VALUE: notification from OpenResult
    SHOW NOTIFICATION: Dictionary Value
    STOP THIS SHORTCUT
END IF
```
