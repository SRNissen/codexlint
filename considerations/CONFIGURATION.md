# CONFIGURATION

A history of the considerations and trade-offs for this project.

As a history, remember that anything mentioned in this document was relevant at the time of writing, not necessarily at the time of reading.

# 2026-03-20T15:41:06Z

Configuration validation discussion summary:

## Settled points

1) `package.json` defaults are part of the trusted configuration contract.
- If a user has not explicitly set a value, and the effective value comes from the extension's contributed default in `package.json`, that is valid.
- The goal is not "all values must be explicit."
- The goal is "default when unspecified is fine; wrong when explicitly configured is not."

2) Configuration errors should surface on save, not as background extension noise.
- codexlint is one extension among many.
- It should not behave as though it is the center of the user's environment.
- A configuration error should therefore be surfaced when codexlint is actually invoked by a save, not proactively at startup or while idle.

3) Repetition is preferred over suppression memory.
- If the configuration is invalid and a save happens, codexlint should report that again.
- There should be no "already told the user once, so stay quiet now" state.
- If the user decides the extension is too noisy, disabling it is an acceptable explicit expression of "I do not care right now."

4) Old successful findings should remain visible if a later save fails because of configuration.
- Example:
  - file `a.ts` was analyzed successfully and has findings
  - the user later breaks config
  - the user saves `a.ts` again
- Desired behavior:
  - the old findings remain
  - the configuration error is added
  - findings are only replaced by a later successful analysis, or by explicit disable behavior if that is chosen

5) Configuration validity should be considered upstream of analysis gating.
- The current preference is that if codexlint considers the configuration invalid, that error should surface on every save.
- This includes saves of files that would otherwise have been skipped by normal analysis gates.
- Motivation:
  - avoid a class of failures where misconfiguration quietly suppresses all signals
  - avoid paths where a bad config effectively means "codexlint never tells you anything is wrong"

## Tension discovered, not yet resolved

The conversation surfaced a real conflict in desired behavior:

1) It feels correct that any invalid codexlint setting should count as a configuration error.
2) It also feels correct that inactive branches should not break active workflows.

Concrete example:
- `codexlint.analyzer.command = "codexExec"`
- `codexlint.analyzer.customInput = "pipe"` is invalid

Two competing instincts:
- "That is an invalid codexlint setting, so codexlint should complain."
- "That setting is inactive under the current analyzer choice, so codexExec should still work."

This was not resolved in the discussion.

The conflict can be phrased as:
- "It has to be any invalid setting."
- "It can't be any invalid setting."

That contradiction needs deliberate design thought before further work in this area.

## Additional note

The current runtime implementation validates only settings that are relevant to the active path.
- This matches part of the stated preference.
- It does not yet match the stronger instinct that "any invalid setting" may need to be surfaced.

This document exists so that future work can resume from the actual design tension, rather than from an oversimplified memory of the conversation.

# 2026-03-23T09:42:47Z

Consistency-graph framing for configuration validation:

## Summary

The preferred mental model is no longer:
- "Is the entire config valid?"
or
- "Are the settings relevant to this save valid?"

Instead, the preferred model is:
- "Is the active configuration graph internally consistent?"

This matters because VS Code settings are presented as a flat list, but codexlint's settings have real dependency structure.
Thinking in terms of that structure gives a more stable design rule for future development.

## Root rule

`codexlint.operation.enabled` is the root gate.

- If it is `false`, do not check the rest of the configuration for consistency.
- If it is `true`, the rest of the active configuration graph must be internally consistent before codexlint is considered configured.

## Dependency graph

```text
operation.enabled
├── analyzer.command
│   ├── analyzer.customCommand
│   └── analyzer.customInput
├── prompt.highlightSelectedSkills
│   └── prompt.selectedSkills
├── prompt.customPrompt
│   └── prompt.customPromptText
├── operation.debounceMs
├── operation.minFileReanalyzeMs
├── operation.maxFileBytes
├── operation.skipBinaryFiles
├── operation.useLanguageExclusions
│   └── operation.excludedLanguageIds
├── operation.timeoutMs
├── operation.showDebugCommand
└── operation.showDebugIO
```

## Reading the graph

1) Root gate
- `operation.enabled` decides whether configuration validation continues at all.

2) Branch selectors
- `analyzer.command`
  - If `custom`, then `analyzer.customCommand` and `analyzer.customInput` must also be consistent.
  - If `codexExec` or `claudeP`, those children are ignored for consistency purposes.
- `prompt.highlightSelectedSkills`
  - If `true`, `prompt.selectedSkills` must be consistent.
  - If `false`, `prompt.selectedSkills` is ignored for consistency purposes.
- `prompt.customPrompt`
  - If `true`, `prompt.customPromptText` must be consistent.
  - If `false`, `prompt.customPromptText` is ignored for consistency purposes.
- `operation.useLanguageExclusions`
  - If `true`, `operation.excludedLanguageIds` must be consistent.
  - If `false`, `operation.excludedLanguageIds` is ignored for consistency purposes.

3) Leaves
- Once `operation.enabled` is `true`, the remaining operation settings stand on their own:
  - `operation.debounceMs`
  - `operation.minFileReanalyzeMs`
  - `operation.maxFileBytes`
  - `operation.skipBinaryFiles`
  - `operation.timeoutMs`
  - `operation.showDebugCommand`
  - `operation.showDebugIO`

## Example

The intended example that motivated this framing:

- If `prompt.highlightSelectedSkills` is disabled, then malformed `prompt.selectedSkills` should not count as an inconsistency.
- If `prompt.highlightSelectedSkills` is enabled, then malformed `prompt.selectedSkills` should count as an inconsistency.

That example is not primarily about saves or documents. It is about parent-child consistency within the config itself.

## Why this style is preferred

1) It resolves the wrong abstraction boundary
- "Relevant to this save" mixes configuration validation with runtime document flow.
- The consistency graph separates:
  - configuration structure
  - runtime save/analysis behavior

2) It matches how codexlint is actually designed
- Even though VS Code presents settings flatly, codexlint has conditional branches.
- Some settings only mean anything when another setting enables their branch.

3) It gives a future-proof rule
- New settings can be added by deciding where they belong in the graph:
  - root-gated leaf
  - child of a branch selector
  - possibly a new branch selector of their own
- This is more stable than deciding ad hoc whether a setting happens to matter for one specific save path.

4) It preserves the important intuition from the earlier discussion
- Not every invalid string anywhere in the settings file should necessarily poison the extension.
- But any inconsistency inside the active configuration graph should.

## Boundary note

This graph is about configuration dependencies only.

It does not include runtime/environment conditions such as:
- workspace trust
- current document language
- file size
- binary detection
- debounce timing
- cooldown timing

Those are later runtime gates, not parents in the configuration graph.
