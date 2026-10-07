// The immutable, code-backed configuration remains the compatibility fallback.
function getCodeBackedAppConfig() {
  return {
    scriptProperties: {
      spreadsheetId: 'spreadSheetID'
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
      taskIdColumn: 1,
      labelColumn: 2,
      dataStartColumn: 3
    },
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


    // Lockouts settings
    lockouts: {
      globals: {
        barLength: 20,
        presetCalendarName: '',
        defaultBlockTimezoneMode: 'fixed',
        cacheTimezoneMode: 'script'
      },
      blocks: []
    }
  };
}

function getAppConfig() {
  // Only reuse config inside an authenticated API request. Editor operations
  // still load the current revision, and the next request starts fresh.
  var context = typeof openHabitsRequestContext_ !== 'undefined' ? openHabitsRequestContext_ : null;
  if (context && context.config) {
    return context.config;
  }
  // Existing installations that have not copied SetupV2.gs remain functional.
  var config = typeof openHabitsLoadAppConfig_ === 'function'
    ? openHabitsLoadAppConfig_()
    : getCodeBackedAppConfig();
  if (context) {
    context.config = config;
  }
  return config;
}
