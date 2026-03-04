# README

The vscode codexlint extension uses Codex CLI to continuously monitor development from a security perspective.

## Current state


The current state of codexlint is that it works - on every file save, the entire file is passed to `codex exec` for evaluation.

## Future development goals

Experimenting with the impact of various alternatives

- Keeping one thread running that has the entire project in context, sending only file diffs.
- Using multiple threads in parallel to split work
- Examining what instructions best convey intent to the linting thread.