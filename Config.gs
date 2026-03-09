function getAppConfig() {
  return {
    scriptProperties: {
      spreadsheetId: 'spreadSheetID',
      homeWifiName: 'homeWifiName',
      workWifiName: 'workWifiName'
    },
    trackingSheetName: 'Tracking Data',
    writeToNotion: false,
    notion: {
      databaseIdsScriptProperty: 'notionMetricDatabaseIDs',
      pointBlockIdScriptProperty: 'pointBlock',
      insightBlockIdScriptProperty: 'insightBlock',
      outputStyles: {
        pointBlock: {
          blockType: 'heading_1',
          segments: [
            { token: 'point_total', color: 'blue' },
            { text: ' Points', color: 'default' }
          ]
        },
        insightBlock: {
          blockType: 'paragraph',
          italic: true
        }
      },
      propertyNames: {
        metricId: 'metricID',
        status: 'Status',
        streak: 'Streak',
        pointMultiplier: 'Point Multiplier',
        points: 'Points'
      },
      completeStatusName: 'Complete'
    },
    dailyPointsID: 'point_total_today',
    cumulativePointsID: 'point_total_alltime',
    lateExtensionHours: 5,
    sheetConfig: {
      trackingSheetName: 'Tracking Data',
      separatorChar: 'Ù',
      taskIdColumn: 1,
      labelColumn: 2,
      dataStartColumn: 3
    },
    positive_push_notifications: 'On',
    habitsV2Insights: {
      comparisonArray: [
        [1, 'yesterday'],
        [2, '2 days ago'],
        [3, '3 days ago'],
        [4, '4 days ago'],
        [5, '5 days ago'],
        [6, '6 days ago'],
        [7, '7 days ago'],
        [14, 'two weeks ago'],
        [21, '3 weeks ago'],
        [30, 'this day last month'],
        [60, '2 months ago'],
        [90, '3 months ago'],
        [180, '6 months ago'],
        [365, 'one year ago today'],
        [730, '2 years ago today']
      ],
      posPerformanceFreq: 0.75,
      negPerformanceFreq: 0.25,
      averageSpan: 7
    },

    // Habits V2 settings
    // dates format supports either legacy [day, dueByTime, startHour, endHour]
    // or V2 multi-window [day, dueByTime, [[startHour, endHour], ...]].
    metricSettings: [],
    keySettings: {},
    noMetricKeys: [
      'app_closer_v2',
      'positive_push_notification'
    ],
    habitChain: [],

    // Maintained only to satisfy Habits V2 loader defaults.
    screenTime: {
      limit: 2,
      cumulativeRow: 51,
      rationing: 'ON',
      startTime: 5,
      rationDuration: 12
    },
    appLockSettings: {
      quick_unlocker: 'OFF',
      use_notion_task_ID: 'ON',
      use_sheets_task_ID: 'ON',
      morning_planning_time: 9,
      personal_planning_time: 16,
      workday_planning_lockout: 'ON',
      personal_planning_lockout: 'ON',
      night_app_lockout: 'ON',
      morning_app_lockout: 'ON'
    },
    rows: {
      appCloserRow: 23,
      personalPlanningRow: 46,
      lateExtension: 5,
      lastDepartedWorkCell: 37,
      arrivedAtWorkCell: 36,
      whiteListCell: 53,
      screentimeTimeStampRow: 50
    },
    calendarOutput: 'ON',
    eventNameInput: 'ON',
    lockout: {
      morningDuration: 2,
      nightDuration: 5,
      nightStartTime: 22,
      nightMessage: 'Why not Read a Book or Grade your Day!'
    },
    lockoutOverrides: {},

    // Lockouts V2 settings
    lockoutsV2: {
      globals: {
        cumulativeScreentimeID: null,
        timeOpenedID: 'timeOpenedID',
        barLength: 20,
        presetCalendarName: ''
      },
      blocks: []
    }
  };
}

function getLockoutsV2Config_() {
  var config = getAppConfig();
  if (config && config.lockoutsV2) {
    return config.lockoutsV2;
  }

  return {
    globals: {
      cumulativeScreentimeID: null,
      timeOpenedID: 'timeOpenedID',
      barLength: 20,
      presetCalendarName: ''
    },
    blocks: []
  };
}
