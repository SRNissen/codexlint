# AGENTS

This file captures project context that is not obvious from code alone.

## Project intent

Project intent and high-level behavior are described in `README.md`.

## Code style preferences

It is unacceptable for a security extension to introduce security problems. Introduce as few packages as possible, and only packages that are maintained and up to date.

## Important environment caveat

The VS Code Extension Host environment can differ from the integrated terminal environment.

A command that works in terminal (for example `codex`) may still fail in extension runtime if PATH is missing dependencies (for example Node needed by shebang wrappers).

During local debugging, `.vscode/launch.json` prepends a Node path to PATH for the extension host profile.

## Debug tooling currently included

A debug command is contributed:

- Command ID: `codexlint.debugEnvironment`
- Purpose: logs extension host env details and `which` lookups for `node` and configured `codex` command to the `codexlint` output channel.

This command is useful for local troubleshooting, but may or may not belong in the eventual published surface.

## Recommended near-term work

- Add tests for parse/range mapping and stale-run behavior.
- Decide publish stance for debug command (`keep`, `hide`, or remove).
- Evaluate alternatives to full-file analysis (diff-based, persistent context thread, parallel workers).
