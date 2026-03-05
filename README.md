# README

The vscode codexlint extension uses Codex CLI to continuously monitor development from a security perspective.

## EARLY ALPHA

The current state of codexlint is that it works - on every file save, the entire file is passed to `codex exec` for evaluation.

The extension still has obvious problems.
- it sends *every* file
  - (do you need your CHANGELOG.md sent for security evaluation?)
- on *every* save
  - (do you need your file sent after inserting a single comment? Do you need it sent *again* if you change the comment's format?)

### Future development goals

- Better CI
- Experimenting with the impact of various alternatives
  - Keeping one thread running that has the entire project in context, sending only file diffs.
  - Using multiple threads in parallel to split work
  - Examining what prompt best convey intent to the linting thread.
  - Making the prompt configurable
  - Making the extension less dependent on specifically Codex CLI - much as I like it, other users might have different preferences
  - Check if there's a way to make the linter independent of the system-wide AGENTS.md file so it can run the same on various systems (and checking whether this is even a preferable way to do things.)
- Add a test that validates what actually ends up in the distribution package

## Credit

- Credit is extended to Codex CLI. Without it, this project would not have happened.
- Credit is also extended to Elementary ApS, for funding the AI subscription and encouraging me to work on this project.
