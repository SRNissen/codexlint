# ROADMAP

1. Harden analyzer command trust model (workspace settings + command execution):
   - `codexlint.analyzer.customCommand` can currently execute arbitrary command text when used from workspace settings.
   - Priority rationale: this is a potential RCE class issue in a security extension and should be resolved before broader feature work.
   - Candidate remediation directions:
     - Require trusted workspace checks before any analyzer execution.
     - Restrict dangerous execution settings to user/machine scope.
     - Consider an explicit first-run consent/allowlist for custom analyzer commands.
     - Add tests for untrusted-workspace and workspace-setting abuse scenarios.
2. Expand tests to cover core security-analysis behavior:
   - prompt rendering and template substitution
   - JSON/fenced-JSON parser behavior
   - finding normalization and diagnostic range conversion
   - save/debounce/skip logic for empty, oversized, and binary-like files
3. Add explicit README documentation for custom prompt templates and configuration examples.
4. Decide and document dependency advisory policy for dev dependencies, then align scripts (`npm audit` coverage) with that policy.
5. Keep release metadata in sync on each release (`package.json` version and `CHANGELOG.md` entry).
6. Clean up `.vscodeignore` to match existing files (remove stale entries, keep packaging intent explicit).
7. Clarify and normalize severity representation in reported output.
   - Observed mismatch/confusion: analyzer schema expects `error|warning|info`, while some surfaced diagnostics/exports can appear as numeric severity values (for example `8` shown as error in UI context).
   - Candidate remediation:
     - Document severity mapping between analyzer schema and VS Code diagnostic/export formats.
     - Normalize exported/reporting format where feasible to reduce ambiguity.
