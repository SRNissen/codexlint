# Primary Checklist

This mirrors the current test:integration suite only, not the adversarial/package-only tests. It is
derived from test/integration/startup.behavior.test.cts, test/integration/analysis.behavior.test.cts,
test/integration/config.scope.behavior.test.cts, and test/integration/language-
exclusion.behavior.test.cts.

Shared Setup

- [ ] Install the built .vsix into a normal VS Code instance and reload.
- [ ] Open a real folder workspace, not just a loose file.
- [ ] Trust the workspace, because the integration checks use custom analyzers.
- [ ] Prepare one custom analyzer that increments a counter file and emits one fixed warning finding.
- [ ] Prepare one custom analyzer that waits about 100 ms before emitting one fixed warning finding.
- [ ] For checks that compare User vs Workspace settings, plan to put codexlint settings in both User
  settings and .vscode/settings.json with intentionally conflicting values.

Startup Behavior

- [ ] Opening the workspace is enough for codexlint to activate; no manual activation step is required.
- [ ] The extension is present and active in the real installation.
- [ ] There is no startup failure caused by “expected a workspace folder” or a failed extension
  activation.

Baseline Analysis Behavior

- [ ] With codexlint.operation.enabled = true, debounceMs = 0, and minFileReanalyzeMs = 300000, saving a
  non-empty .ts file runs analysis.
- [ ] The analyzer’s warning appears as a VS Code diagnostic sourced from codexlint.
- [ ] The diagnostic carries the expected message and code from the custom analyzer output.
- [ ] Saving the same file again during the cooldown window does not rerun the analyzer.
- [ ] The analyzer counter stays unchanged on that second save.
- [ ] The existing finding remains visible rather than being replaced by a failure diagnostic.

Config Scope Behavior

- [ ] With conflicting codexlint settings in User and Workspace scope, effective behavior follows the User
  setting rather than the Workspace setting.
- [ ] User operation.enabled = true beats Workspace false; saving still triggers analysis.
- [ ] User operation.debounceMs = 0 beats a very large Workspace debounce; analysis starts immediately
  after save.
- [ ] User operation.minFileReanalyzeMs beats the Workspace value.
- [ ] User operation.maxFileBytes beats the Workspace value.
- [ ] User operation.skipBinaryFiles beats the Workspace value.
- [ ] User operation.timeoutMs beats the Workspace value.
- [ ] User operation.showDebugIO = true beats Workspace false; request/response logs appear in the
  codexlint output channel.
- [ ] User analyzer.command beats the Workspace analyzer preset.
- [ ] User analyzer.customCommand beats the Workspace custom command.
- [ ] User analyzer.customInput beats the Workspace custom input mode.
- [ ] User prompt.customPrompt and prompt.customPromptText beat the Workspace prompt settings.
- [ ] User prompt.highlightSelectedSkills and prompt.selectedSkills beat the Workspace skill-highlighting
  settings.
- [ ] The request template logged to the output channel contains the User custom prompt text, not the
  Workspace prompt text.
- [ ] The request template logged to the output channel contains the User selected-skills block, not the
  Workspace selected-skills block.
- [ ] With a delayed analyzer, User timeoutMs = 5000 and Workspace timeoutMs = 1, the analyzer is allowed
  to finish and return its finding.
- [ ] In that same timeout scenario, no analysis-command-failed diagnostic appears.
- [ ] In that same delayed run, the temporary analysis-in-progress diagnostic appears and then disappears
  when the final finding arrives.

Language Exclusion Behavior

- [ ] In Settings, Use Language Exclusions defaults to true.
- [ ] In Settings, Excluded Language IDs defaults to markdown and plaintext.
- [ ] A .md file opens in VS Code as language markdown.
- [ ] A .ts file opens in VS Code as language typescript.
- [ ] With exclusions enabled and the list set to ["markdown"], saving the markdown file does not run the
  analyzer.
- [ ] In that excluded-markdown case, the analyzer counter does not increase.
- [ ] In that excluded-markdown case, codexlint produces no diagnostics for the markdown file.
- [ ] With exclusions still enabled, saving the TypeScript file does run the analyzer.
- [ ] In that included-TypeScript case, the counter increases and the expected finding appears.
- [ ] Turning Use Language Exclusions off without changing the list causes the markdown file to be
  analyzed on the next save.
- [ ] With the toggle off, saving the markdown file increases the counter and shows the expected finding.
- [ ] With the toggle still off, saving the TypeScript file again increases the counter again.

# Secondary Checklist

• This is the complement to the primary checklist: mostly behavior that test:integration does not cover,
plus a few areas that are only covered by unit/adversarial tests but are still worth checking in a real
install. It is derived from README.md, ROADMAP.md, considerations/HARDENING.md, considerations/TESTING.md,
considerations/FILE_EXCLUSIONS.md, and the runtime paths in src/shared.ts, src/saveCoordinator.ts, src/
debug.ts, and src/analyzeCore.ts.

- [ ] In a restricted/untrusted workspace, analyzer.command = custom does not execute the custom command.
- [ ] In that untrusted-custom case, codexlint shows a clear informational diagnostic explaining that
  custom analyzers require a trusted workspace.
- [ ] In a restricted/untrusted workspace, analyzer.command = codexExec still analyzes saved files.
- [ ] In a restricted/untrusted workspace, analyzer.command = claudeP still analyzes saved files.
- [ ] A malicious analyzer prompt cannot cause the codexExec preset to modify, delete, or create workspace
  files.
- [ ] A malicious analyzer prompt cannot cause the claudeP preset to modify, delete, or create workspace
  files.
- [ ] User settings still beat .vscode/settings.json for the new language-exclusion settings, not just the
  older settings.
- [ ] An empty saved file does not trigger analysis.
- [ ] A file larger than operation.maxFileBytes does not trigger analysis.
- [ ] A binary-like file containing NUL bytes is skipped when operation.skipBinaryFiles = true.
- [ ] That same binary-like file is analyzed when operation.skipBinaryFiles = false.
- [ ] Rapid repeated saves with a nonzero debounce collapse into one analyzer run rather than many.
- [ ] A slow first analysis followed by a newer save does not leave stale diagnostics from the older run.
- [ ] An analyzer timeout produces an analysis-command-failed diagnostic rather than hanging forever.
- [ ] A missing command or other spawn failure produces an analysis-command-failed diagnostic.
- [ ] A nonzero analyzer exit produces an analysis-command-failed diagnostic.
- [ ] excludedLanguageIds matching is exact, not normalized: for example, Markdown does not exclude
  markdown.
- [ ] Adding a real extra prose language such as asciidoc to excludedLanguageIds actually suppresses
  analysis for AsciiDoc files.
- [ ] Turning Use Language Exclusions off preserves the configured list and resumes analysis immediately.
- [ ] operation.showDebugCommand actually shows and hides codexlint: Debug Environment in the Command
  Palette.
- [ ] Running codexlint: Debug Environment logs process.execPath, PATH, NODE, the configured analyzer
  command, and which/where lookups to the codexlint output channel.
- [ ] operation.showDebugIO = true logs analyzer request and response text to the output channel.
- [ ] That request log redacts file contents rather than dumping the full file text.
- [ ] prompt.selectedSkills works with both comma-separated and newline-separated entries.
- [ ] prompt.highlightSelectedSkills = false keeps selected skills out of the rendered prompt.
- [ ] prompt.highlightSelectedSkills = true injects the selected-skills block into the rendered prompt.
- [ ] prompt.customPrompt = true and prompt.customPromptText actually affect the analyzer request.
- [ ] The custom prompt placeholders for file path, language, and file text are substituted correctly.
- [ ] A custom analyzer works correctly with analyzer.customInput = arg.
- [ ] A custom analyzer works correctly with analyzer.customInput = stdin.
- [ ] Fenced JSON analyzer output is accepted in a real run, not just in unit tests.
- [ ] Analyzer output with surrounding text plus embedded JSON is accepted in a real run.
- [ ] Empty analyzer output produces a warning diagnostic explaining that the command returned empty
  output.
- [ ] Non-JSON analyzer output produces a warning diagnostic explaining that the command returned non-JSON
  output.
- [ ] Severity values error, warning, and info map to sensible VS Code diagnostic severities in the
  Problems view.
- [ ] Unexpected severity values do not crash the extension and degrade predictably.
- [ ] Findings with out-of-range line/column values land on a sensible clamped range instead of breaking
  diagnostics.
- [ ] Findings with partially missing positional fields still produce a stable diagnostic rather than
  crashing.
- [ ] An empty custom analyzer command fails loudly rather than silently appearing to work.
- [ ] Bad configuration entered directly in settings.json is worth probing, because ROADMAP.md explicitly
  calls out “fail loud” as a desired future direction.
