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
