import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { parseArgsStringToArgv } from "string-argv";
import {
  type AnalyzerPreset,
  type PromptTransport,
  type RawConfigValues,
  type ValidatedConfigValues,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_EXCLUDED_LANGUAGE_IDS,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MIN_FILE_REANALYZE_MS,
  DEFAULT_TIMEOUT_MS,
  validateConfigValues
} from "./configCore.js";

export const EXTENSION_NAME = "codexlint";
export const CUSTOM_ANALYZER_TRUST_BLOCK_CODE = "custom-analyzer-requires-trusted-workspace";
export const CUSTOM_ANALYZER_TRUST_BLOCK_MESSAGE =
  "codexlint custom analyzers require a trusted workspace. Trust this workspace to run the configured custom analyzer.";
export const DEFAULT_PROMPT_TEMPLATE = [
  "You are a static security reviewer for a single source file.",
  "Analyze only the file content provided below.",
  "Return JSON only.",
  "Output schema:",
  "{",
  '  "findings": [',
  "    {",
  '      "message": "string",',
  '      "severity": "error|warning|info",',
  '      "line": 1,',
  '      "column": 1,',
  '      "endLine": 1,',
  '      "endColumn": 1,',
  "    }",
  "  ]",
  "}",
  "{{selectedSkillsBlock}}",
  "",
  "File path: {{filePath}}",
  "Language: {{fileLanguage}}",
  "File content:",
  "{{fileText}}"
].join("\n");
export { ConfigValidationError } from "./configCore.js";

// package.json contributed defaults are the canonical product defaults.
// These values are only a runtime safety net if VS Code does not surface them.
const RAW_CONFIG_RUNTIME_FALLBACKS: RawConfigValues = {
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
  operationExcludedLanguageIds: DEFAULT_EXCLUDED_LANGUAGE_IDS,
  operationShowDebugIO: false,
  operationTimeoutMs: DEFAULT_TIMEOUT_MS
};

export interface CodexLintConfig {
  enabled: boolean;
  debounceMs: number;
  minFileReanalyzeMs: number;
  maxFileBytes: number;
  skipBinaryFiles: boolean;
  useLanguageExclusions: boolean;
  excludedLanguageIds: string[];
  showDebugIO: boolean;
  analysisCommand: string;
  analysisArgs: string[];
  promptTransport: PromptTransport;
  promptTemplate: string;
  selectedSkills: string[];
  timeoutMs: number;
  analysisBlock: CodexLintAnalysisBlock | undefined;
}

export interface CodexFinding {
  message: string;
  severity: vscode.DiagnosticSeverity;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  code: string | number | undefined;
}

export interface CodexLintAnalysisBlock {
  code: string;
  message: string;
  severity: vscode.DiagnosticSeverity;
}

export function getConfig(): CodexLintConfig {
  const config = vscode.workspace.getConfiguration("codexlint");
  const rawValues = readUserLevelRawConfigValues(config);
  const values = validateConfigValues(rawValues);
  return buildConfig(values);
}

function buildConfig(values: ValidatedConfigValues): CodexLintConfig {
  const { command, args, promptTransport, analysisBlock } = resolveAnalyzer(
    values.analyzerPreset,
    values.customCommand,
    values.customInput
  );
  const promptTemplate = values.useCustomPrompt ? values.customPromptText : DEFAULT_PROMPT_TEMPLATE;

  return {
    enabled: values.enabled,
    debounceMs: values.debounceMs,
    minFileReanalyzeMs: values.minFileReanalyzeMs,
    maxFileBytes: values.maxFileBytes,
    skipBinaryFiles: values.skipBinaryFiles,
    useLanguageExclusions: values.useLanguageExclusions,
    excludedLanguageIds: values.excludedLanguageIds,
    showDebugIO: values.showDebugIO,
    analysisCommand: command,
    analysisArgs: args,
    promptTransport,
    promptTemplate,
    selectedSkills: values.selectedSkills,
    timeoutMs: values.timeoutMs,
    analysisBlock
  };
}

function readUserLevelRawConfigValues(config: vscode.WorkspaceConfiguration): RawConfigValues {
  return {
    analyzerCommand: getUserLevelConfigValue(
      config,
      "analyzer.command",
      RAW_CONFIG_RUNTIME_FALLBACKS.analyzerCommand
    ),
    analyzerCustomCommand: getUserLevelConfigValue(
      config,
      "analyzer.customCommand",
      RAW_CONFIG_RUNTIME_FALLBACKS.analyzerCustomCommand
    ),
    analyzerCustomInput: getUserLevelConfigValue(
      config,
      "analyzer.customInput",
      RAW_CONFIG_RUNTIME_FALLBACKS.analyzerCustomInput
    ),
    promptHighlightSelectedSkills: getUserLevelConfigValue(
      config,
      "prompt.highlightSelectedSkills",
      RAW_CONFIG_RUNTIME_FALLBACKS.promptHighlightSelectedSkills
    ),
    promptSelectedSkills: getUserLevelConfigValue(
      config,
      "prompt.selectedSkills",
      RAW_CONFIG_RUNTIME_FALLBACKS.promptSelectedSkills
    ),
    promptCustomPrompt: getUserLevelConfigValue(
      config,
      "prompt.customPrompt",
      RAW_CONFIG_RUNTIME_FALLBACKS.promptCustomPrompt
    ),
    promptCustomPromptText: getUserLevelConfigValue(
      config,
      "prompt.customPromptText",
      RAW_CONFIG_RUNTIME_FALLBACKS.promptCustomPromptText
    ),
    operationEnabled: getUserLevelConfigValue(
      config,
      "operation.enabled",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationEnabled
    ),
    operationDebounceMs: getUserLevelConfigValue(
      config,
      "operation.debounceMs",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationDebounceMs
    ),
    operationMinFileReanalyzeMs: getUserLevelConfigValue(
      config,
      "operation.minFileReanalyzeMs",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationMinFileReanalyzeMs
    ),
    operationMaxFileBytes: getUserLevelConfigValue(
      config,
      "operation.maxFileBytes",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationMaxFileBytes
    ),
    operationSkipBinaryFiles: getUserLevelConfigValue(
      config,
      "operation.skipBinaryFiles",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationSkipBinaryFiles
    ),
    operationUseLanguageExclusions: getUserLevelConfigValue(
      config,
      "operation.useLanguageExclusions",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationUseLanguageExclusions
    ),
    operationExcludedLanguageIds: getUserLevelConfigValue(
      config,
      "operation.excludedLanguageIds",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationExcludedLanguageIds
    ),
    operationShowDebugIO: getUserLevelConfigValue(
      config,
      "operation.showDebugIO",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationShowDebugIO
    ),
    operationTimeoutMs: getUserLevelConfigValue(
      config,
      "operation.timeoutMs",
      RAW_CONFIG_RUNTIME_FALLBACKS.operationTimeoutMs
    )
  };
}

export function getUserLevelConfigValue<T>(
  config: vscode.WorkspaceConfiguration,
  key: string,
  defaultValue: T
): T {
  const inspected = config.inspect<T>(key);
  if (inspected?.globalLanguageValue !== undefined) {
    return inspected.globalLanguageValue;
  }
  if (inspected?.globalValue !== undefined) {
    return inspected.globalValue;
  }
  if (inspected?.defaultLanguageValue !== undefined) {
    return inspected.defaultLanguageValue;
  }
  if (inspected?.defaultValue !== undefined) {
    return inspected.defaultValue;
  }
  return defaultValue;
}

function resolveAnalyzer(
  preset: AnalyzerPreset,
  customCommand: string,
  customInput: PromptTransport
): {
  command: string;
  args: string[];
  promptTransport: PromptTransport;
  analysisBlock: CodexLintAnalysisBlock | undefined;
} {
  if (preset === "codexExec") {
    return {
      command: "codex",
      args: ["exec", "--sandbox", "read-only"],
      promptTransport: "arg",
      analysisBlock: undefined
    };
  }

  if (preset === "claudeP") {
    return {
      command: "claude",
      args: ["-p", "--permission-mode", "dontAsk", "--tools", "Read"],
      promptTransport: "arg",
      analysisBlock: undefined
    };
  }

  if (!vscode.workspace.isTrusted) {
    return {
      command: "",
      args: [],
      promptTransport: customInput,
      analysisBlock: {
        code: CUSTOM_ANALYZER_TRUST_BLOCK_CODE,
        message: CUSTOM_ANALYZER_TRUST_BLOCK_MESSAGE,
        severity: vscode.DiagnosticSeverity.Information
      }
    };
  }

  const parsed = parseArgsStringToArgv(customCommand.trim());
  const [command, ...args] = parsed;
  if (command === undefined) {
    return { command: "", args: [], promptTransport: customInput, analysisBlock: undefined };
  }

  return { command, args, promptTransport: customInput, analysisBlock: undefined };
}

export function runProcessWithTimeout(options: {
  command: string;
  args: string[];
  stdin: string;
  timeoutMs: number;
  cwd: string | undefined;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, Math.max(1, options.timeoutMs));

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new Error(`analysis command timed out after ${options.timeoutMs}ms`));
        return;
      }

      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`analysis command failed: ${detail}`));
        return;
      }

      resolve(stdout);
    });

    child.stdin.write(options.stdin);
    child.stdin.end();
  });
}
