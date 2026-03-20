export const DEFAULT_DEBOUNCE_MS = 750;
export const DEFAULT_MIN_FILE_REANALYZE_MS = 300_000;
export const DEFAULT_MAX_FILE_BYTES = 1_000_000;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_EXCLUDED_LANGUAGE_IDS = ["markdown", "plaintext"];

export type AnalyzerPreset = "codexExec" | "claudeP" | "custom";
export type PromptTransport = "stdin" | "arg";

export interface RawConfigValues {
  analyzerCommand: unknown;
  analyzerCustomCommand: unknown;
  analyzerCustomInput: unknown;
  promptHighlightSelectedSkills: unknown;
  promptSelectedSkills: unknown;
  promptCustomPrompt: unknown;
  promptCustomPromptText: unknown;
  operationEnabled: unknown;
  operationDebounceMs: unknown;
  operationMinFileReanalyzeMs: unknown;
  operationMaxFileBytes: unknown;
  operationSkipBinaryFiles: unknown;
  operationUseLanguageExclusions: unknown;
  operationExcludedLanguageIds: unknown;
  operationShowDebugIO: unknown;
  operationTimeoutMs: unknown;
}

export interface ValidatedConfigValues {
  analyzerPreset: AnalyzerPreset;
  customCommand: string;
  customInput: PromptTransport;
  selectedSkills: string[];
  useCustomPrompt: boolean;
  customPromptText: string;
  enabled: boolean;
  debounceMs: number;
  minFileReanalyzeMs: number;
  maxFileBytes: number;
  skipBinaryFiles: boolean;
  useLanguageExclusions: boolean;
  excludedLanguageIds: string[];
  showDebugIO: boolean;
  timeoutMs: number;
}

export interface ConfigValidationIssue {
  key: string;
  message: string;
  value: unknown;
}

export class ConfigValidationError extends Error {
  readonly issues: ConfigValidationIssue[];

  constructor(issues: ConfigValidationIssue[]) {
    super(formatConfigValidationErrorMessage(issues));
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

export function formatConfigValidationErrorMessage(issues: ConfigValidationIssue[]): string {
  const detailLines = issues.map(
    (issue) => `- ${issue.key} ${issue.message}; got ${formatConfigValue(issue.value)}`
  );
  return [
    "Invalid codexlint configuration:",
    ...detailLines,
    "Fix the setting or reset it to default."
  ].join("\n");
}

export function validateConfigValues(values: RawConfigValues): ValidatedConfigValues {
  const issues: ConfigValidationIssue[] = [];

  const enabled = expectBooleanSetting(
    issues,
    "codexlint.operation.enabled",
    values.operationEnabled
  );
  if (enabled === false) {
    return {
      analyzerPreset: "codexExec",
      customCommand: "",
      customInput: "arg",
      selectedSkills: [],
      useCustomPrompt: false,
      customPromptText: "",
      enabled,
      debounceMs: DEFAULT_DEBOUNCE_MS,
      minFileReanalyzeMs: DEFAULT_MIN_FILE_REANALYZE_MS,
      maxFileBytes: DEFAULT_MAX_FILE_BYTES,
      skipBinaryFiles: true,
      useLanguageExclusions: true,
      excludedLanguageIds: [...DEFAULT_EXCLUDED_LANGUAGE_IDS],
      showDebugIO: false,
      timeoutMs: DEFAULT_TIMEOUT_MS
    };
  }

  const analyzerPreset = expectEnumSetting<AnalyzerPreset>(
    issues,
    "codexlint.analyzer.command",
    values.analyzerCommand,
    ["codexExec", "claudeP", "custom"]
  );
  const highlightSelectedSkills = expectBooleanSetting(
    issues,
    "codexlint.prompt.highlightSelectedSkills",
    values.promptHighlightSelectedSkills
  );
  const useCustomPrompt = expectBooleanSetting(
    issues,
    "codexlint.prompt.customPrompt",
    values.promptCustomPrompt
  );
  const debounceMs = expectNumberSetting(
    issues,
    "codexlint.operation.debounceMs",
    values.operationDebounceMs,
    { minimum: 0 }
  );
  const minFileReanalyzeMs = expectNumberSetting(
    issues,
    "codexlint.operation.minFileReanalyzeMs",
    values.operationMinFileReanalyzeMs,
    { minimum: 0 }
  );
  const maxFileBytes = expectNumberSetting(
    issues,
    "codexlint.operation.maxFileBytes",
    values.operationMaxFileBytes,
    { minimum: 1 }
  );
  const skipBinaryFiles = expectBooleanSetting(
    issues,
    "codexlint.operation.skipBinaryFiles",
    values.operationSkipBinaryFiles
  );
  const useLanguageExclusions = expectBooleanSetting(
    issues,
    "codexlint.operation.useLanguageExclusions",
    values.operationUseLanguageExclusions
  );
  const showDebugIO = expectBooleanSetting(
    issues,
    "codexlint.operation.showDebugIO",
    values.operationShowDebugIO
  );
  const timeoutMs = expectNumberSetting(
    issues,
    "codexlint.operation.timeoutMs",
    values.operationTimeoutMs,
    { minimum: 1 }
  );

  let customCommand = "";
  let customInput: PromptTransport = "arg";
  if (analyzerPreset === "custom") {
    const customCommandValue = expectStringSetting(
      issues,
      "codexlint.analyzer.customCommand",
      values.analyzerCustomCommand
    );
    if (customCommandValue !== undefined) {
      if (customCommandValue.trim().length === 0) {
        issues.push({
          key: "codexlint.analyzer.customCommand",
          message: 'must be a non-empty string when codexlint.analyzer.command is "custom"',
          value: values.analyzerCustomCommand
        });
      } else {
        customCommand = customCommandValue;
      }
    }

    const customInputValue = expectEnumSetting<PromptTransport>(
      issues,
      "codexlint.analyzer.customInput",
      values.analyzerCustomInput,
      ["arg", "stdin"]
    );
    if (customInputValue !== undefined) {
      customInput = customInputValue;
    }
  }

  let selectedSkills: string[] = [];
  if (highlightSelectedSkills === true) {
    const selectedSkillsValue = expectStringSetting(
      issues,
      "codexlint.prompt.selectedSkills",
      values.promptSelectedSkills
    );
    if (selectedSkillsValue !== undefined) {
      selectedSkills = parseSelectedSkills(selectedSkillsValue);
    }
  }

  let customPromptText = "";
  if (useCustomPrompt === true) {
    const customPromptValue = expectStringSetting(
      issues,
      "codexlint.prompt.customPromptText",
      values.promptCustomPromptText
    );
    if (customPromptValue !== undefined) {
      if (customPromptValue.trim().length === 0) {
        issues.push({
          key: "codexlint.prompt.customPromptText",
          message: 'must be a non-empty string when codexlint.prompt.customPrompt is enabled',
          value: values.promptCustomPromptText
        });
      } else {
        customPromptText = customPromptValue;
      }
    }
  }

  let excludedLanguageIds = [...DEFAULT_EXCLUDED_LANGUAGE_IDS];
  if (useLanguageExclusions === true) {
    const excludedLanguageIdValues = expectStringArraySetting(
      issues,
      "codexlint.operation.excludedLanguageIds",
      values.operationExcludedLanguageIds,
      { requireUniqueItems: true }
    );
    if (excludedLanguageIdValues !== undefined) {
      excludedLanguageIds = [...excludedLanguageIdValues];
    }
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    analyzerPreset: analyzerPreset ?? "codexExec",
    customCommand,
    customInput,
    selectedSkills,
    useCustomPrompt: useCustomPrompt ?? false,
    customPromptText,
    enabled: enabled ?? true,
    debounceMs: debounceMs ?? DEFAULT_DEBOUNCE_MS,
    minFileReanalyzeMs: minFileReanalyzeMs ?? DEFAULT_MIN_FILE_REANALYZE_MS,
    maxFileBytes: maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    skipBinaryFiles: skipBinaryFiles ?? true,
    useLanguageExclusions: useLanguageExclusions ?? true,
    excludedLanguageIds,
    showDebugIO: showDebugIO ?? false,
    timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS
  };
}

function expectBooleanSetting(
  issues: ConfigValidationIssue[],
  key: string,
  value: unknown
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  issues.push({
    key,
    message: "must be a boolean",
    value
  });
  return undefined;
}

function expectStringSetting(
  issues: ConfigValidationIssue[],
  key: string,
  value: unknown
): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  issues.push({
    key,
    message: "must be a string",
    value
  });
  return undefined;
}

function expectNumberSetting(
  issues: ConfigValidationIssue[],
  key: string,
  value: unknown,
  options: {
    minimum: number;
  }
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({
      key,
      message: `must be a finite number >= ${options.minimum}`,
      value
    });
    return undefined;
  }

  if (value < options.minimum) {
    issues.push({
      key,
      message: `must be >= ${options.minimum}`,
      value
    });
    return undefined;
  }

  return value;
}

function expectEnumSetting<T extends string>(
  issues: ConfigValidationIssue[],
  key: string,
  value: unknown,
  allowedValues: readonly T[]
): T | undefined {
  if (typeof value === "string" && allowedValues.includes(value as T)) {
    return value as T;
  }

  const allowedSummary = allowedValues.map((entry) => JSON.stringify(entry)).join(" or ");
  issues.push({
    key,
    message: `must be ${allowedSummary}`,
    value
  });
  return undefined;
}

function expectStringArraySetting(
  issues: ConfigValidationIssue[],
  key: string,
  value: unknown,
  options?: {
    requireUniqueItems?: boolean;
  }
): string[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      key,
      message: "must be an array of strings",
      value
    });
    return undefined;
  }

  if (!value.every((entry) => typeof entry === "string")) {
    issues.push({
      key,
      message: "must be an array of strings",
      value
    });
    return undefined;
  }

  if (options?.requireUniqueItems) {
    const uniqueCount = new Set(value).size;
    if (uniqueCount !== value.length) {
      issues.push({
        key,
        message: "must not contain duplicate entries",
        value
      });
      return undefined;
    }
  }

  return [...value];
}

function parseSelectedSkills(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatConfigValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (value === undefined) {
    return "undefined";
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }

  try {
    const json = JSON.stringify(value);
    if (json !== undefined) {
      return json;
    }
  } catch {
    // Fall back to String below.
  }

  return Object.prototype.toString.call(value);
}
