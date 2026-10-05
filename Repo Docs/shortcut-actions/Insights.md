# Insights

Status: normalized logging/setup readout from the user, with the proposed
installer wiring integrated below. The native installer edit is not an editable
iOS Shortcut export and has not been applied on the user's phone by this PR.
The logging path is still native, not a new runtime operation. Keep Scriptable
optional for users without Locked until a separate Insights/timer refactor is
implemented. The original action transcription (trailing whitespace normalized) is preserved alongside this
readout. Arrows label magic-variable outputs; Set Variable lines are real actions.

Run Inline Script below means paste the entire `Inline Scriptable/Insights
Installer.js` source into that action, not a URL or a filesystem path. Run in App
is Off. HTTP downloads happen in Shortcuts, before the installer runs.

```text
GET FILE FROM SHORTCUTS
    Path: /OpenHabits/OpenHabits Metrics/settings.json
    Error If Not Found: Off
    -> SettingsFile
IF Shortcut Input does not have any value
    IF SettingsFile has any value
        GET DICTIONARY FROM INPUT: SettingsFile
            -> Settings
        GET DICTIONARY VALUE: openHabitsSecret from Settings
        SET VARIABLE: openHabitsSecret = Dictionary Value
        GET DICTIONARY VALUE: webAppId from Settings
        SET VARIABLE: webAppId = Dictionary Value
        SET VARIABLE: fileFound = 1
    OTHERWISE
        SHOW ALERT:
            Welcome to OpenHabits Metrics!
            There are a few simple questions to get set up.
            You can change these settings at any time by running this shortcut again.
        SET VARIABLE: fileFound = 0
    END IF
    SET VARIABLE: endRepeat = 0
    REPEAT 10 TIMES
        IF endRepeat is 0
            CHOOSE FROM MENU: What would you like to setup or change?
                Secret
                    ASK FOR INPUT: Text
                        Prompt: Please enter your OpenHabits Metrics secret:
                        Default: openHabitsSecret
                    SET VARIABLE: openHabitsSecret = Provided Input
                Web App Id
                    ASK FOR INPUT: Text
                        Prompt: Please enter your OpenHabits Metrics web app Id:
                        Default: webAppId
                    SET VARIABLE: webAppId = Provided Input
                More Info
                    SHOW ALERT:
                        Your Secret is the "password" you set in your Google Sheet's settings.
                        Your web app ID is shown under your active Apps Script deployment.
                        Think of it like the address to send a letter to, and in this case,
                        the letter is a logging request from your phone.
                I'm Finished
                    SET VARIABLE: endRepeat = 1
            END MENU
        END IF
    END REPEAT
    DICTIONARY
        openHabitsSecret: openHabitsSecret
        webAppId: webAppId
    SAVE FILE: Dictionary
        Path: /OpenHabits/OpenHabits Metrics/settings.json
        Ask Where to Save: Off
        Overwrite If File Exists: On
    GET SHORTCUTS: All Shortcuts
    IF Shortcuts contains Locked
        TEXT: https://raw.githubusercontent.com/CopperPanMan/OpenHabits-Metrics/main/OpenHabits%20Runtime.js
        GET CONTENTS OF URL: Text
            Method: GET
        GET TEXT FROM INPUT: Contents of URL
            -> RuntimeSource
        TEXT: https://raw.githubusercontent.com/CopperPanMan/OpenHabits-Metrics/main/lockouts.js
        GET CONTENTS OF URL: Text
            Method: GET
        GET TEXT FROM INPUT: Contents of URL
            -> EvaluatorSource
        LIST
            Item 1: RuntimeSource
            Item 2: EvaluatorSource
        RUN INLINE SCRIPT: Insights Installer
            Parameter: List
    END IF
    SHOW NOTIFICATION: Settings Updated!
    STOP THIS SHORTCUT
END IF
IF SettingsFile has any value
    GET DICTIONARY FROM INPUT: SettingsFile
        -> Settings
    GET DICTIONARY VALUE: openHabitsSecret from Settings
        -> Secret
    GET DICTIONARY VALUE: webAppId from Settings
        -> WebAppId
OTHERWISE
    SHOW NOTIFICATION: Warning: no OpenHabits settings found. Please run Insights and follow setup.
    STOP THIS SHORTCUT
END IF
SET VARIABLE: debug = false
TEXT: https://script.google.com/macros/s/[WebAppId]/exec
    -> RequestURL
TEXT:
    {
      "key": "record_metric_iOS",
      "secret": "[Secret]",
      "data": [Shortcut Input]
    }
    -> RecordBody
GET CONTENTS OF URL: RequestURL
    Method: POST
    Headers: Content-Type = application/json
    Request Body: File = RecordBody
    -> RecordResponse
IF RecordResponse does not contain metricsByID
    SHOW NOTIFICATION:
        Error: unable to access Google Drive at this time. Please try again later.
        [RecordResponse]
    STOP THIS SHORTCUT
END IF
GET SHORTCUTS: All Shortcuts
    -> InstalledShortcuts
IF InstalledShortcuts contains Update Lockout Cache
    RUN SHORTCUT: Update Lockout Cache
        Input: RecordResponse
END IF
IF InstalledShortcuts contains Calendar Alarm Engine
    RUN SHORTCUT: Calendar Alarm Engine
        Input: RecordResponse
END IF
IF debug is true
    GET DICTIONARY VALUE: errors from RecordResponse
    IF Dictionary Value has any value
        SHOW NOTIFICATION: Dictionary Value
    END IF
    SHOW RESULT: RecordResponse
END IF
GET DICTIONARY VALUE: metricsByID from RecordResponse
    -> Metrics
GET DICTIONARY VALUE: todayPoints from RecordResponse
    -> TodayPoints
ROUND NUMBER: TodayPoints to Tenths
    -> RoundedTotal
GET DICTIONARY VALUE: pointsDelta from RecordResponse
    -> PointsDelta
ROUND NUMBER: PointsDelta to Tenths
    -> RoundedDelta
GET DICTIONARY VALUE: messages from RecordResponse
    -> Messages
IF Messages has any value
    IF ANY ARE TRUE: TodayPoints > 0, PointsDelta > 0
        SHOW NOTIFICATION: [Messages] (+[RoundedDelta]pts = [RoundedTotal])
    OTHERWISE
        SHOW NOTIFICATION: Messages
    END IF
END IF
SET VARIABLE: updateNotion = 0
REPEAT WITH EACH ITEM IN Metrics
    GET DICTIONARY VALUE: writeToNotion from Repeat Item
    IF Dictionary Value is Yes
        SET VARIABLE: updateNotion = 1
    END IF
END REPEAT
IF updateNotion is Yes
    TEXT:
        {
          "key": "update_metric_notion",
          "secret": "[Secret]",
          "data": [Shortcut Input]
        }
    GET CONTENTS OF URL: RequestURL
        Method: POST
        Headers: Content-Type = application/json
        Request Body: File = Text
END IF
STOP AND OUTPUT: RecordResponse
```

Logging return is explicitly the first HTTP response. The transcription's last
`Contents of URL` binding was ambiguous; this prevents a Notion response from
replacing it. Response-success checks, points formatting, and setup validation
remain follow-up work recorded in `../runtime-review-notes.md`.
