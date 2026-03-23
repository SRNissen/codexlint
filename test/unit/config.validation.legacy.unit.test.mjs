// Legacy coverage for the pre-consistency-graph configuration model.
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_EXCLUDED_LANGUAGE_IDS,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MIN_FILE_REANALYZE_MS,
  DEFAULT_TIMEOUT_MS,
  ConfigValidationError,
  validateConfigValues
} from "../../src/configCore.ts";

function createValidRawConfigValues() {
  return {
    analyzerCommand: "codexExec",
    analyzerCustomCommand: "",
    analyzerCustomInput: "arg",
    promptHighlightSelectedSkills: false,
    promptSelectedSkills: "",
    promptCustomPrompt: false,
    promptCustomPromptText: "",
    operationEnabled: true,
    operationDebounceMs: DEFAULT_DEBOUNCE_MS,
    operationMinFileReanalyzeMs: DEFAULT_MIN_FILE_REANALYZE_MS,
    operationMaxFileBytes: DEFAULT_MAX_FILE_BYTES,
    operationSkipBinaryFiles: true,
    operationUseLanguageExclusions: true,
    operationExcludedLanguageIds: [...DEFAULT_EXCLUDED_LANGUAGE_IDS],
    operationShowDebugIO: false,
    operationTimeoutMs: DEFAULT_TIMEOUT_MS
  };
}

test("legacy: validateConfigValues ignores invalid custom analyzer transport when a built-in analyzer is selected", () => {
  const values = createValidRawConfigValues();
  values.analyzerCustomInput = "pipe";

  const resolved = validateConfigValues(values);

  assert.equal(resolved.analyzerPreset, "codexExec");
  assert.equal(resolved.customInput, "arg");
});

test("legacy: validateConfigValues ignores unrelated invalid analysis settings when the extension is disabled", () => {
  const values = createValidRawConfigValues();
  values.operationEnabled = false;
  values.analyzerCommand = "custom";
  values.analyzerCustomCommand = 42;
  values.analyzerCustomInput = "pipe";
  values.operationDebounceMs = -1;

  const resolved = validateConfigValues(values);

  assert.equal(resolved.enabled, false);
});

test("legacy: validateConfigValues rejects invalid custom analyzer transport when custom analyzer mode is active", () => {
  const values = createValidRawConfigValues();
  values.analyzerCommand = "custom";
  values.analyzerCustomCommand = "node analyzer.js";
  values.analyzerCustomInput = "pipe";

  assert.throws(
    () => validateConfigValues(values),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /codexlint\.analyzer\.customInput/);
      assert.match(error.message, /"arg" or "stdin"/);
      return true;
    }
  );
});

test("legacy: validateConfigValues rejects an empty custom prompt when custom prompt mode is enabled", () => {
  const values = createValidRawConfigValues();
  values.promptCustomPrompt = true;
  values.promptCustomPromptText = "   ";

  assert.throws(
    () => validateConfigValues(values),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /codexlint\.prompt\.customPromptText/);
      assert.match(error.message, /non-empty string/);
      return true;
    }
  );
});
