function getAppConfig() {
  return {
    scriptProperties: {
      spreadsheetId: "spreadSheetID"
    },
    trackingSheetName: "Tracking Data",
    writeToNotion: false,
    notion: {
      databaseIdsScriptProperty: "notionMetricDatabaseIDs",
      pointBlockIdScriptProperty: "pointBlock",
      insightBlockIdScriptProperty: "insightBlock",
      syncFields: {
        status: true,
        streak: true,
        pointMultiplier: true,
        points: true
      },
      propertyNames: {
        metricId: "metricID",
        status: "Status",
        streak: "Streak",
        pointMultiplier: "Point Multiplier",
        points: "Points"
      },
      completeStatusName: "Complete"
    },
    dailyPointsID: "point_total_today",
    cumulativePointsID: "point_total_alltime",
    lateExtensionHours: 5,
    metricSettings: [],
    sheetConfig: {
      taskIdColumn: 1,
      labelColumn: 2,
      dataStartColumn: 3
    },
    lockouts: {
      globals: {
        cumulativeScreentimeID: null,
        barLength: 20,
        presetCalendarName: ""
      },
      blocks: []
    },
    messages: {
      firstLineMessage: [
        "Great Job!",
        "Well done!",
        "Puff your chest Up PAL!",
        "Guten Tag, King",
        "You did a good thing!",
        "One down, a lifetime to Go!",
        "STEAL THE DAY",
        "Makin 'em proud, Cowboy!"
      ],
      firstLineMessageFreq: 0,
      originalComparisonArray: [
        [1, "yesterday"],
        [2, "2 days ago"],
        [3, "3 days ago"],
        [4, "4 days ago"],
        [5, "5 days ago"],
        [6, "6 days ago"],
        [7, "7 days ago"],
        [14, "two weeks ago"],
        [21, "3 weeks ago"],
        [30, "this day last month"],
        [60, "2 months ago"],
        [90, "3 months ago"],
        [180, "6 months ago"],
        [365, "one year ago today"],
        [730, "2 years ago today"]
      ],
      posPerformanceFreq: 0.75,
      negPerformanceFreq: 0.25,
      averageSpan: 7
    },
    sheetNames: [
      { dataSheetName: "Tracking Data" },
      { targetSheetName: "Charts" },
      { dashboardSheetName: "Dashboard Data" }
    ],
    chartDataRanges: [
      {
        dataRow: 1,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 1,
        targetColumn: 2,
        dataLabel: "Last 7 Days Date Range"
      },
      {
        dataRow: 41,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 3,
        targetColumn: 2,
        dataLabel: "Time Worked"
      },
      {
        dataRow: 44,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 5,
        targetColumn: 2,
        dataLabel: "Personal Time Worked"
      },
      {
        dataRow: 34,
        labelColumn: 2,
        lastXDays: 8,
        targetRow: 7,
        targetColumn: 2,
        dataLabel: "Hours Slept"
      },
      {
        dataRow: 51,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 9,
        targetColumn: 2,
        dataLabel: "Screen Time"
      },
      {
        dataRow: 28,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 14,
        targetColumn: 2,
        dataLabel: "How Happy"
      },
      {
        dataRow: 32,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 15,
        targetColumn: 2,
        dataLabel: "Notes on Day"
      },
      {
        dataRow: 36,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 11,
        targetColumn: 2,
        dataLabel: "First began work at AS"
      },
      {
        dataRow: 37,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 12,
        targetColumn: 2,
        dataLabel: "Last ended work at AS"
      },
      {
        dataRow: 56,
        labelColumn: 2,
        lastXDays: 7,
        targetRow: 20,
        targetColumn: 2,
        dataLabel: "SAS Time Worked"
      }
    ],
    legacyMetricSettings: {
      habit_stack_1: [
        {
          taskId: "habit_stack_1_1",
          rowNumber: 4,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp"
        },
        {
          taskId: "habit_stack_1_2",
          rowNumber: 5,
          insightChance: 1,
          streakProb: 0,
          dayToDayChance: 0.25,
          dayToAvgChance: 0.5,
          rawValueChance: 0.5,
          increaseGood: 1,
          insightFirstWords: "Weight:",
          insightUnits: "lbs",
          unitType: "number",
          recordType: 1
        }
      ],
      habit_stack_2: [
        {
          taskId: "habit_stack_2_1",
          rowNumber: 8,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp"
        },
        {
          taskId: "habit_stack_2_2",
          rowNumber: 9,
          insightChance: 1,
          streakProb: 0,
          dayToDayChance: 0.25,
          dayToAvgChance: 0.5,
          rawValueChance: 0.5,
          increaseGood: 1,
          insightFirstWords: "Duration: ",
          insightUnits: "minutes",
          unitType: "minutes",
          recordType: 1
        }
      ],
      habit_stack_3: [
        {
          taskId: "habit_stack_3",
          rowNumber: 11,
          insightChance: 1,
          streakProb: 0,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      meditate: [
        {
          taskId: "meditate_1",
          rowNumber: 13,
          insightChance: 0,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "•Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp"
        },
        {
          taskId: "meditate_2",
          rowNumber: 14,
          insightChance: 1,
          streakProb: 0,
          dayToDayChance: 0.6,
          dayToAvgChance: 0.6,
          rawValueChance: 0.25,
          increaseGood: 1,
          insightFirstWords: "• Meditation Length:",
          insightUnits: "minutes",
          unitType: "minutes",
          recordType: 1
        },
        {
          taskId: "meditate_3",
          rowNumber: 15,
          insightChance: 1,
          streakProb: 0,
          dayToDayChance: 0,
          dayToAvgChance: 0.5,
          rawValueChance: 0.1,
          increaseGood: 1,
          insightFirstWords: "• Mental Calmness (beg):",
          insightUnits: "points",
          unitType: "number",
          recordType: 1
        },
        {
          taskId: "meditate_4",
          rowNumber: 16,
          insightChance: 1,
          streakProb: 0,
          dayToDayChance: 0,
          dayToAvgChance: 0.5,
          rawValueChance: 0.1,
          increaseGood: 1,
          insightFirstWords: "• Mental Calmness (end):",
          insightUnits: "points",
          unitType: "number",
          recordType: 1
        }
      ],
      habit_stack_4: [
        {
          taskId: "habit_stack_4",
          rowNumber: 19,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      "habit_stack_4.5": [
        {
          taskId: "habit_stack_4.5",
          rowNumber: 21,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      "floss_you_fools!": [
        {
          taskId: "floss_you_fools!",
          rowNumber: 25,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      macros_hit: [
        {
          taskId: "macros_hit",
          rowNumber: 24,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 2
        }
      ],
      lay_out_tomorrows_clothes: [
        {
          taskId: "lay_out_tomorrows_clothes",
          rowNumber: 48,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      plan_personal_workday: [
        {
          taskId: "plan_personal_workday",
          rowNumber: 46,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      plan_workday: [
        {
          taskId: "plan_workday",
          rowNumber: 23,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      daily_metrics: [
        {
          taskId: "daily_metrics_1",
          rowNumber: 27,
          insightChance: 0,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "•Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        },
        {
          taskId: "daily_metrics_2",
          rowNumber: 28,
          insightChance: 1,
          streakProb: 0,
          dayToDayChance: 0.6,
          dayToAvgChance: 0.25,
          rawValueChance: 0.15,
          increaseGood: 1,
          insightFirstWords: "• happiness:",
          insightUnits: "points",
          unitType: "number",
          recordType: 1
        },
        {
          taskId: "daily_metrics_3",
          rowNumber: 32,
          insightChance: 0,
          streakProb: 0,
          dayToDayChance: 0.6,
          dayToAvgChance: 0.25,
          rawValueChance: 0.15,
          increaseGood: 1,
          insightFirstWords: "• Notes on Day:",
          insightUnits: "points",
          unitType: "number",
          recordType: 1
        }
      ],
      phone_off_power: [
        {
          taskId: "phone_off_power",
          rowNumber: 2,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 2
        }
      ],
      phone_on_power: [
        {
          taskId: "phone_on_power",
          rowNumber: 34,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      phone_on_power_V2: [
        {
          taskId: "phone_on_power_V2_1",
          rowNumber: 34,
          insightChance: 0,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        },
        {
          taskId: "phone_on_power_V2_2",
          rowNumber: 35,
          insightChance: 1,
          streakProb: 1,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "On Time?:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      temporary_unlock: [
        {
          rowNumberKey: "whiteListCell",
          insightChance: 0,
          streakProb: 0.5,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp"
        },
        {
          taskId: "temporary_unlock_2",
          rowNumber: 52,
          insightChance: 0,
          streakProb: 0,
          dayToDayChance: 0.25,
          dayToAvgChance: 0.5,
          rawValueChance: 0.5,
          increaseGood: 1,
          insightFirstWords: "Weight:",
          insightUnits: "lbs",
          unitType: "number",
          recordType: 1
        }
      ],
      first_arrived_at_work: [
        {
          taskId: "first_arrived_at_work",
          rowNumber: 36,
          insightChance: 1,
          streakProb: 0.5,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Arrived:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 2
        }
      ],
      last_departed_work: [
        {
          taskId: "last_departed_work",
          rowNumber: 37,
          insightChance: 0,
          streakProb: 0.5,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: 1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      log_reading: [
        {
          taskId: "log_reading",
          rowNumber: 33,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      smoothie_time: [
        {
          taskId: "smoothie_time",
          rowNumber: 64,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      exercise_v2: [
        {
          taskId: "exercise_v2",
          rowNumber: 8,
          insightChance: 1,
          streakProb: 0.8,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 1
        }
      ],
      start_work: [
        {
          taskId: "start_work",
          rowNumber: 40,
          insightChance: 1,
          streakProb: 0.5,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 2
        }
      ],
      record_new_screentime: [
        {
          taskId: "record_new_screentime",
          rowNumber: 51,
          insightChance: 0.05,
          dayToDayChance: 0.75,
          dayToAvgChance: 0.25,
          rawValueChance: 0.5,
          increaseGood: -1,
          insightFirstWords: "Screen Time: ",
          insightUnits: "minutes",
          unitType: "minutes",
          recordType: 2
        }
      ],
      personal_start_work: [
        {
          taskId: "personal_start_work",
          rowNumber: 43,
          insightChance: 1,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 2
        }
      ],
      SAS_start_work: [
        {
          taskId: "SAS_start_work",
          rowNumber: 55,
          insightChance: 1,
          dayToDayChance: 1,
          dayToAvgChance: 0.5,
          rawValueChance: 1,
          increaseGood: -1,
          insightFirstWords: "Time Completed:",
          insightUnits: "minutes",
          unitType: "timestamp",
          recordType: 2
        }
      ]
    },
    keySettings: {
      app_closer: {
        nextActionSetting: "off",
        nextActionRow: 27,
        nextActionMessage: "Would you like to Grade your Day?",
        screentimeTimeStampRow: 50
      },
      start_work: {
        arrivedAtWorkCell: 36,
        nextActionSetting: "on",
        nextActionRow: 23,
        nextActionMessage: "Would you like to Plan your Day?"
      },
      personal_start_work: {
        arrivedAtWorkCell: 36,
        nextActionSetting: "on",
        nextActionRow: 46,
        nextActionMessage: "Would you like to Plan your (personal) Day?"
      },
      SAS_start_work: {
        arrivedAtWorkCell: 36,
        nextActionSetting: "on",
        nextActionRow: 46,
        nextActionMessage: "Would you like to Plan your (personal) Day?"
      }
    },
    timeElapsedSettings: {
      stop_work: {
        arrivedAtWorkCell: 36,
        timeElapsed: [40, 41],
        chartDataRangeIndex: 1,
        returnType: "time_elapsed"
      },
      start_stop_work: {
        arrivedAtWorkCell: 36,
        timeElapsed: [40, 41],
        chartDataRangeIndex: 1,
        returnType: "time_elapsed"
      },
      record_new_screentime: {
        timeElapsed: [50, 51],
        chartDataRangeIndex: 4,
        returnType: "metric_settings"
      },
      personal_stop_work: {
        timeElapsed: [43, 44],
        chartDataRangeIndex: 2,
        returnType: "time_elapsed"
      },
      SAS_stop_work: {
        timeElapsed: [55, 56],
        chartDataRangeIndex: 9,
        returnType: "time_elapsed"
      }
    },
    toggleSettings: {
      fanOnOff: {
        dataRow: 53,
        onOutput: "fan turned ON",
        offOutput: "fan turned OFF"
      },
      teslaPortOnOff: {
        dataRow: 54,
        onOutput: "Tesla Port OPEN",
        offOutput: "Tesla Port CLOSED"
      }
    },
    habitChain: [
      {
        row: 5,
        name: "Weight                          ",
        dates: [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        startTime: 3,
        endTime: 24,
        messagePart1: "Weigh yourself. Streak =",
        streakTerm: "days",
        messagePart2: "Get those Gains"
      },
      {
        row: 23,
        name: "Plan Workday               ",
        dates: [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        startTime: 3,
        endTime: 24,
        messagePart1: "Plan your day. Streak =",
        streakTerm: "days",
        messagePart2: "Stay organized!"
      },
      {
        row: 11,
        name: "Sunscreen                    ",
        dates: [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        startTime: 3,
        endTime: 12,
        messagePart1: "Shower and apply sunscreen. You have",
        streakTerm: "Pale Zuckerbergs",
        messagePart2: "Protect your skin!"
      },
      {
        row: 13,
        name: "Meditate                       ",
        dates: [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        startTime: 3,
        endTime: 12,
        messagePart1: "Meditation Streak =",
        streakTerm: "days",
        messagePart2: "Open your Mind."
      },
      {
        row: 64,
        name: "Smoothie                      ",
        dates: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        startTime: 3,
        endTime: 12,
        messagePart1: "Smoothie & Vitamin streak =",
        streakTerm: "days",
        messagePart2: "Get Stronger Bones."
      },
      {
        row: 46,
        name: "Plan Personal Day        ",
        dates: [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        startTime: 0,
        endTime: 24,
        messagePart1: "Plan your Personal Day. Streak =",
        streakTerm: "days",
        messagePart2: "Stay organized!"
      },
      {
        row: 8,
        name: "Exercise                        ",
        dates: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        startTime: 3,
        endTime: 22,
        messagePart1: "Exercising Streak =",
        streakTerm: "Hafthors",
        messagePart2: "Get yo Gains!"
      },
      {
        row: 24,
        name: "Macros Hit                    ",
        dates: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday"
        ],
        startTime: 19,
        endTime: 24,
        messagePart1: "MacroNutrient Goal Met. You Have",
        streakTerm: "Hungry Hafthors",
        messagePart2: "Get Those Gains!"
      },
      {
        row: 25,
        name: "Flossing                        ",
        order: 1,
        dates: [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        startTime: 0,
        endTime: 24,
        messagePart1: "Flossing: ",
        streakTerm: "days",
        messagePart2: "Keep it going!"
      },
      {
        row: 33,
        name: "Read Book                    ",
        dates: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday"
        ],
        startTime: 19,
        endTime: 24,
        messagePart1: "In Bed On Time. Streak =",
        streakTerm: "days",
        messagePart2: "Stay Rested!"
      },
      {
        row: 35,
        name: "In Bed On Time            ",
        dates: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday"
        ],
        startTime: 19,
        endTime: 24,
        messagePart1: "In Bed On Time. Streak =",
        streakTerm: "days",
        messagePart2: "Stay Rested!"
      }
    ],
    notifierSettings: {
      nighttime_notifier: [["Harold", 14, 25], 180, 60, 30],
      nighttime_away_notifier: [["Harold", 14, 25, 5, 10, 15, 15], 60, 30, 0]
    },
    noMetricKeys: [
      "app_closer",
      "app_closer",
      "is_nfc_completed",
      "positive_push_notification",
      "habit_dashboard",
      "nighttime_notifier",
      "nighttime_away_notifier"
    ]
  };
}

function getLockoutsConfig_() {
  var config = getAppConfig();
  if (config && config.lockouts) {
    return config.lockouts;
  }

  return {
    globals: {
      cumulativeScreentimeID: null,
      barLength: 20,
      presetCalendarName: ""
    },
    blocks: []
  };
}
