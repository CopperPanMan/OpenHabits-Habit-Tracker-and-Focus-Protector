function getAppConfig() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var rawConfig = scriptProperties.getProperty('config');

  if (!rawConfig) {
    throw new Error('Missing required script property "config". Set it to a valid JSON object before using the API.');
  }

  var parsedConfig;
  try {
    parsedConfig = JSON.parse(rawConfig);
  } catch (error) {
    throw new Error('Invalid JSON in script property "config": ' + error.message);
  }

  if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
    throw new Error('Script property "config" must be a JSON object.');
  }

  assertAppConfigShape_(parsedConfig);
  return parsedConfig;
}

function assertAppConfigShape_(config) {
  if (!config.scriptProperties || typeof config.scriptProperties !== 'object' || Array.isArray(config.scriptProperties)) {
    throw new Error('config.scriptProperties must be an object.');
  }

  if (typeof config.scriptProperties.spreadsheetId !== 'string' || !config.scriptProperties.spreadsheetId.trim()) {
    throw new Error('config.scriptProperties.spreadsheetId must be a non-empty string.');
  }

  if (!config.sheetConfig || typeof config.sheetConfig !== 'object' || Array.isArray(config.sheetConfig)) {
    throw new Error('config.sheetConfig must be an object.');
  }

  if (typeof config.sheetConfig.taskIdColumn !== 'number' ||
      typeof config.sheetConfig.labelColumn !== 'number' ||
      typeof config.sheetConfig.dataStartColumn !== 'number') {
    throw new Error('config.sheetConfig.taskIdColumn, labelColumn, and dataStartColumn must be numbers.');
  }

  if (!Array.isArray(config.metricSettings)) {
    throw new Error('config.metricSettings must be an array.');
  }

  if (!config.lockoutsV2 || typeof config.lockoutsV2 !== 'object' || Array.isArray(config.lockoutsV2)) {
    throw new Error('config.lockoutsV2 must be an object.');
  }

  if (!config.lockoutsV2.globals || typeof config.lockoutsV2.globals !== 'object' || Array.isArray(config.lockoutsV2.globals)) {
    throw new Error('config.lockoutsV2.globals must be an object.');
  }

  if (!Array.isArray(config.lockoutsV2.blocks)) {
    throw new Error('config.lockoutsV2.blocks must be an array.');
  }
}
