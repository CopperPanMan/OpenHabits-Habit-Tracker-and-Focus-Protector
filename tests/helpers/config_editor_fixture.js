const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEditor() {
  const source = fs.readFileSync(path.join(__dirname, '../../docs/app.js'), 'utf8');
  const context = vm.createContext({
    document: { querySelectorAll: () => [], getElementById: () => null },
    localStorage: { setItem() {} }
  });
  // Exercise the editor's state operations without running page initialization.
  const initialization = source.indexOf("  $('parseBtn').addEventListener");
  assert.ok(initialization > 0);
  vm.runInContext(source.slice(0, initialization) + `
    renderAll = () => {};
    publishConfiguredMetrics = () => {};
    globalThis.editor = {
      newMetric, metricFromRecipe, setFeatureEnabled, setMetricId, setSupportingId,
      generateSupportingId, pointsEnabled, ensureShape, duplicateMetric, duplicateBlock,
      getPromptRanges,
      reorderItems, itemUiKey, metricCardSummary, blockCardSummary, blockSearchText, collectValidationIssues,
      validateStorageIds, validateState, withHistory, undo, redo,
      setState: config => { state = ensureShape(config); },
      getState: () => state
    };
  })();`, context);
  return context.editor;
}

module.exports = { loadEditor };
