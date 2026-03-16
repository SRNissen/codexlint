# README

The vscode codexlint extension uses Codex CLI, Claude, or a customizable hook, to continuously monitor development from a security perspective.

## BETA RELEASE

The current state of the extension is: Ready for use, with room for improvement around efficiency.

### Roadmap

1. Add explicit README documentation for custom prompt templates and configuration examples.
2. Expand tests to cover core security-analysis behavior:
   - prompt rendering and template substitution
   - JSON/fenced-JSON parser behavior
   - finding normalization and diagnostic range conversion
   - save/debounce/skip logic for empty, oversized, and binary-like files
3. Decide and document dependency advisory policy for dev dependencies, then align scripts (`npm audit` coverage) with that policy.
4. Keep release metadata in sync on each release (`package.json` version and `CHANGELOG.md` entry).
5. Clean up `.vscodeignore` to match existing files (remove stale entries, keep packaging intent explicit).

## Credit

- Credit is extended to Codex CLI. Without it, this project would not have happened.
- Credit is also extended to Elementary ApS, for funding the AI subscription and encouraging me to work on this project.
