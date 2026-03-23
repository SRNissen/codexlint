# ROADMAP


1. Expand tests to cover core security-analysis behavior:
   - prompt rendering and template substitution
   - JSON/fenced-JSON parser behavior
   - finding normalization and diagnostic range conversion
   - save/debounce/skip logic for empty, oversized, and binary-like files
2. Add explicit README documentation for custom prompt templates and configuration examples.
3. Decide and document dependency advisory policy for dev dependencies, then align scripts (`npm audit` coverage) with that policy.
4. Keep release metadata in sync on each release (`package.json` version and `CHANGELOG.md` entry).
5. Clean up `.vscodeignore` to match existing files (remove stale entries, keep packaging intent explicit).
6. Clarify and normalize severity representation in reported output.
   - Observed mismatch/confusion: analyzer schema expects `error|warning|info`, while some surfaced diagnostics/exports can appear as numeric severity values (for example `8` shown as error in UI context).
   - Candidate remediation:
     - Document severity mapping between analyzer schema and VS Code diagnostic/export formats.
     - Normalize exported/reporting format where feasible to reduce ambiguity.
7. Only use defaults when configured to use defaults, not to replace erroneous config. For erroneous config, fail loud.