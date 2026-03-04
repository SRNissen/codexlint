# README

The vscode codexlint extension uses Codex CLI to continuously monitor development from a security perspective.

## Current state


The current state of codexlint is that it works - on every file save, the entire file is passed to `codex exec` for evaluation.

## Future development goals

- Better CI
- Experimenting with the impact of various alternatives
  - Keeping one thread running that has the entire project in context, sending only file diffs.
  - Using multiple threads in parallel to split work
  - Examining what prompt best convey intent to the linting thread.
  - Making the prompt configurable
  - Making the extension less dependent on specifically Codex CLI - much as I like it, other users might have different preferences
  - Checking if there's a way to make the linter independent of the system-wide AGENTS.md file so it can run the same on various systems (and checking whether this is even a preferable way to do things.)

## Credit

- Credit is extended to Codex CLI. Without it, this project would not have happened.
- Credit is also extended to Elementary ApS, for funding the subscription.