import assert from "node:assert/strict";
import test from "node:test";
import {
  type ConfigValidationIssue,
  ConfigValidationError,
  type RawConfigValues,
  type ValidatedConfigValues,
  validateConfigValues
} from "../../src/configCore.ts";

type ValidCase = {
  name: string;
  raw: RawConfigValues;
  expected: ValidatedConfigValues;
};

type InvalidCase = {
  name: string;
  raw: RawConfigValues;
  expectedIssues: ConfigValidationIssue[];
};

const rootGateValidCases = [
  {
    name: "disabled ignores invalid descendants",
    raw: {
      analyzerCommand: "custom",
      analyzerCustomCommand: 42,
      analyzerCustomInput: "pipe",
      promptHighlightSelectedSkills: true,
      promptSelectedSkills: 7,
      promptCustomPrompt: true,
      promptCustomPromptText: false,
      operationEnabled: false,
      operationDebounceMs: -1,
      operationMinFileReanalyzeMs: -1,
      operationMaxFileBytes: 0,
      operationSkipBinaryFiles: "yes",
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: [1, "markdown"],
      operationShowDebugIO: "no",
      operationTimeoutMs: 0
    } satisfies RawConfigValues,
    expected: {
      analyzerPreset: "codexExec",
      customCommand: "",
      customInput: "arg",
      selectedSkills: [],
      useCustomPrompt: false,
      customPromptText: "",
      enabled: false,
      debounceMs: 750,
      minFileReanalyzeMs: 300000,
      maxFileBytes: 1000000,
      skipBinaryFiles: true,
      useLanguageExclusions: true,
      excludedLanguageIds: ["markdown", "plaintext"],
      showDebugIO: false,
      timeoutMs: 120000
    } satisfies ValidatedConfigValues
  }
] satisfies ValidCase[];

const analyzerBranchValidCases = [
  {
    name: "built-in preset ignores invalid customInput",
    raw: {
      analyzerCommand: "codexExec",
      analyzerCustomCommand: "",
      analyzerCustomInput: "pipe",
      promptHighlightSelectedSkills: false,
      promptSelectedSkills: "",
      promptCustomPrompt: false,
      promptCustomPromptText: "",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expected: {
      analyzerPreset: "codexExec",
      customCommand: "",
      customInput: "arg",
      selectedSkills: [],
      useCustomPrompt: false,
      customPromptText: "",
      enabled: true,
      debounceMs: 750,
      minFileReanalyzeMs: 300000,
      maxFileBytes: 1000000,
      skipBinaryFiles: true,
      useLanguageExclusions: true,
      excludedLanguageIds: ["markdown", "plaintext"],
      showDebugIO: false,
      timeoutMs: 120000
    } satisfies ValidatedConfigValues
  }
] satisfies ValidCase[];

const analyzerBranchInvalidCases = [
  {
    name: "custom preset requires valid customInput",
    raw: {
      analyzerCommand: "custom",
      analyzerCustomCommand: "node analyzer.js",
      analyzerCustomInput: "pipe",
      promptHighlightSelectedSkills: false,
      promptSelectedSkills: "",
      promptCustomPrompt: false,
      promptCustomPromptText: "",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expectedIssues: [
      {
        key: "codexlint.analyzer.customInput",
        message: 'must be "arg" or "stdin"',
        value: "pipe"
      }
    ] satisfies ConfigValidationIssue[]
  }
] satisfies InvalidCase[];

const selectedSkillsBranchValidCases = [
  {
    name: "disabled ignores legacy comma-separated selectedSkills format",
    raw: {
      analyzerCommand: "codexExec",
      analyzerCustomCommand: "",
      analyzerCustomInput: "arg",
      promptHighlightSelectedSkills: false,
      promptSelectedSkills: "cpp-security,api-hardening",
      promptCustomPrompt: false,
      promptCustomPromptText: "",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expected: {
      analyzerPreset: "codexExec",
      customCommand: "",
      customInput: "arg",
      selectedSkills: [],
      useCustomPrompt: false,
      customPromptText: "",
      enabled: true,
      debounceMs: 750,
      minFileReanalyzeMs: 300000,
      maxFileBytes: 1000000,
      skipBinaryFiles: true,
      useLanguageExclusions: true,
      excludedLanguageIds: ["markdown", "plaintext"],
      showDebugIO: false,
      timeoutMs: 120000
    } satisfies ValidatedConfigValues
  },
  {
    name: "enabled accepts an empty selectedSkills array",
    raw: {
      analyzerCommand: "codexExec",
      analyzerCustomCommand: "",
      analyzerCustomInput: "arg",
      promptHighlightSelectedSkills: true,
      promptSelectedSkills: [],
      promptCustomPrompt: false,
      promptCustomPromptText: "",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expected: {
      analyzerPreset: "codexExec",
      customCommand: "",
      customInput: "arg",
      selectedSkills: [],
      useCustomPrompt: false,
      customPromptText: "",
      enabled: true,
      debounceMs: 750,
      minFileReanalyzeMs: 300000,
      maxFileBytes: 1000000,
      skipBinaryFiles: true,
      useLanguageExclusions: true,
      excludedLanguageIds: ["markdown", "plaintext"],
      showDebugIO: false,
      timeoutMs: 120000
    } satisfies ValidatedConfigValues
  },
  {
    name: "enabled accepts a valid selectedSkills array",
    raw: {
      analyzerCommand: "codexExec",
      analyzerCustomCommand: "",
      analyzerCustomInput: "arg",
      promptHighlightSelectedSkills: true,
      promptSelectedSkills: ["cpp-security", "api-hardening"],
      promptCustomPrompt: false,
      promptCustomPromptText: "",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expected: {
      analyzerPreset: "codexExec",
      customCommand: "",
      customInput: "arg",
      selectedSkills: ["cpp-security", "api-hardening"],
      useCustomPrompt: false,
      customPromptText: "",
      enabled: true,
      debounceMs: 750,
      minFileReanalyzeMs: 300000,
      maxFileBytes: 1000000,
      skipBinaryFiles: true,
      useLanguageExclusions: true,
      excludedLanguageIds: ["markdown", "plaintext"],
      showDebugIO: false,
      timeoutMs: 120000
    } satisfies ValidatedConfigValues
  }
] satisfies ValidCase[];

const selectedSkillsBranchInvalidCases = [
  {
    name: "enabled rejects an empty string selected skill",
    raw: {
      analyzerCommand: "codexExec",
      analyzerCustomCommand: "",
      analyzerCustomInput: "arg",
      promptHighlightSelectedSkills: true,
      promptSelectedSkills: [""],
      promptCustomPrompt: false,
      promptCustomPromptText: "",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expectedIssues: [
      {
        key: "codexlint.prompt.selectedSkills",
        message:
          "must be an array of skill IDs (max 64 chars; lowercase letters, numbers, and hyphens only; no leading or trailing hyphen) when codexlint.prompt.highlightSelectedSkills is enabled",
        value: [""]
      }
    ] satisfies ConfigValidationIssue[]
  },
  {
    name: "enabled rejects a selected skill whose name violates the skill ID spec",
    raw: {
      analyzerCommand: "codexExec",
      analyzerCustomCommand: "",
      analyzerCustomInput: "arg",
      promptHighlightSelectedSkills: true,
      promptSelectedSkills: ["Bad-skill"],
      promptCustomPrompt: false,
      promptCustomPromptText: "",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expectedIssues: [
      {
        key: "codexlint.prompt.selectedSkills",
        message:
          "must be an array of skill IDs (max 64 chars; lowercase letters, numbers, and hyphens only; no leading or trailing hyphen) when codexlint.prompt.highlightSelectedSkills is enabled",
        value: ["Bad-skill"]
      }
    ] satisfies ConfigValidationIssue[]
  },
  {
    name: "enabled rejects legacy comma-separated selectedSkills text",
    raw: {
      analyzerCommand: "codexExec",
      analyzerCustomCommand: "",
      analyzerCustomInput: "arg",
      promptHighlightSelectedSkills: true,
      promptSelectedSkills: "cpp-security,api-hardening",
      promptCustomPrompt: false,
      promptCustomPromptText: "",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expectedIssues: [
      {
        key: "codexlint.prompt.selectedSkills",
        message:
          "must be an array of skill IDs (max 64 chars; lowercase letters, numbers, and hyphens only; no leading or trailing hyphen) when codexlint.prompt.highlightSelectedSkills is enabled",
        value: "cpp-security,api-hardening"
      }
    ] satisfies ConfigValidationIssue[]
  }
] satisfies InvalidCase[];

const customPromptBranchInvalidCases = [
  {
    name: "enabled custom prompt requires non-empty prompt text",
    raw: {
      analyzerCommand: "codexExec",
      analyzerCustomCommand: "",
      analyzerCustomInput: "arg",
      promptHighlightSelectedSkills: false,
      promptSelectedSkills: "",
      promptCustomPrompt: true,
      promptCustomPromptText: "   ",
      operationEnabled: true,
      operationDebounceMs: 750,
      operationMinFileReanalyzeMs: 300000,
      operationMaxFileBytes: 1000000,
      operationSkipBinaryFiles: true,
      operationUseLanguageExclusions: true,
      operationExcludedLanguageIds: ["markdown", "plaintext"],
      operationShowDebugIO: false,
      operationTimeoutMs: 120000
    } satisfies RawConfigValues,
    expectedIssues: [
      {
        key: "codexlint.prompt.customPromptText",
        message: 'must be a non-empty string when codexlint.prompt.customPrompt is enabled',
        value: "   "
      }
    ] satisfies ConfigValidationIssue[]
  }
] satisfies InvalidCase[];

registerValidCases("root gate", rootGateValidCases);
registerValidCases("analyzer branch", analyzerBranchValidCases);
registerInvalidCases("analyzer branch", analyzerBranchInvalidCases);
registerValidCases("selected skills branch", selectedSkillsBranchValidCases, true);
registerInvalidCases("selected skills branch", selectedSkillsBranchInvalidCases, true);
registerInvalidCases("custom prompt branch", customPromptBranchInvalidCases);

function registerValidCases(branchName: string, cases: ValidCase[], skip = false): void {
  for (const scenario of cases) {
    const register = skip ? test.skip : test;
    register(`validateConfigValues/${branchName}: ${scenario.name}`, () => {
      const actual = validateConfigValues(scenario.raw);
      assert.deepEqual(actual, scenario.expected);
    });
  }
}

function registerInvalidCases(branchName: string, cases: InvalidCase[], skip = false): void {
  for (const scenario of cases) {
    const register = skip ? test.skip : test;
    register(`validateConfigValues/${branchName}: ${scenario.name}`, () => {
      const actual = normalizeIssues(captureValidationIssues(scenario.raw));
      const expected = normalizeIssues(scenario.expectedIssues);
      assert.deepEqual(actual, expected);
    });
  }
}

function captureValidationIssues(raw: RawConfigValues): ConfigValidationIssue[] {
  try {
    const result = validateConfigValues(raw);
    assert.fail(`expected ConfigValidationError, but got result: ${JSON.stringify(result)}`);
  } catch (error) {
    assert.ok(error instanceof ConfigValidationError);
    return error.issues;
  }
}

function normalizeIssues(issues: ConfigValidationIssue[]): ConfigValidationIssue[] {
  return [...issues].sort((left, right) =>
    compareStrings(issueSortKey(left), issueSortKey(right))
  );
}

function issueSortKey(issue: ConfigValidationIssue): string {
  return `${issue.key}\n${issue.message}\n${JSON.stringify(issue.value)}`;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
