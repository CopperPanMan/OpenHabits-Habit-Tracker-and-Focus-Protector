# Allowed

Status: complete runtime-based action readout implemented by the user. Empty input
starts an unlock attempt; nonempty input handles an allowed session. This readout
targets OpenHabits Runtime 1.1.1. Arrows label magic-variable outputs, not extra
Set Variable actions. All Run Script actions use Run in App: Off.

```text
IF Shortcut Input does not have any value
    CHOOSE FROM MENU: Choose Unlock Type
        Unlock after 60 seconds
            TEXT: begin_legitimate
        Penalty unlock after 30 seconds
            TEXT: begin_penalty
        Cancel
            STOP THIS SHORTCUT
    END MENU
    RUN SCRIPT: OpenHabits Runtime
        Parameter: Menu Result
    GET DICTIONARY VALUE: notification from Script Result
    SHOW NOTIFICATION: Dictionary Value
    STOP THIS SHORTCUT
END IF
STOP PRIMARY [Jomo]
SHOW NOTIFICATION: Shortcut Input
GET SHORTCUTS: All Shortcuts
IF Shortcuts contains Start Screen Time Timer
    RUN SHORTCUT: Start Screen Time Timer
        Input: None
END IF
STOP THIS SHORTCUT
```
