# CONSIDERATIONS

A history of the considerations and trade-offs for this project.

As a history, remember that anything mentioned in this document was relevant at the time of writing, not necessarily at the time of reading.

## Testing 

### 2024-06-13T15:22:00Z

1) Test intent over implementation details
- Tests should verify user-visible/desired behavior.
- Avoid assertions that depend on transient/internal states unless that state is part of the requirement.

2) Generated test artifacts vs checked-in fixtures
- Runtime generation of tiny analyzer scripts/counters is acceptable here.
- Benefits:
  - Better test isolation and cleanup per run.
  - Less fixture sprawl for one-off scripts.
  - Runtime-safe path construction.
- Tradeoff acknowledged: static fixtures can be easier to inspect.

3) Integration invocation budget
- Keep full linter invocations low to improve reliability and runtime.
- Consolidate behavior checks where practical.
- Current target direction: one integration linter invocation for save-triggered behavior + cooldown, and move pure parsing checks out of linter-invoking path.

4) Timeouts and wait behavior
- Fixed short waits (for example 5 seconds) are too brittle for this project.
- Default polling wait should be tied to linter timeout:
  - waitFor default = codexlint.operation.timeoutMs + 5000 ms

5) Failure interpretation guidance
- A timeout in waitFor means expected state was not observed in time; it does not automatically mean analyzer timeout.
- Distinguish:
  - Harness/setup/network failures (e.g. npm audit)
  - Analyzer execution failures
  - Diagnostic state race conditions

6) Diagnostic assertions
- Prefer filtering by source == "codexlint" to avoid interference from other diagnostics.
- For asynchronous flows, wait for semantic terminal conditions, not only diagnostic counts.

7) Non-JSON parser behavior
- parseJsonLenient behavior is a pure/unit concern and does not require full linter invocation.
- Keep parser fallback expectations covered without spending integration invocation budget.

8) Environment notes observed
- VS Code test harness currently launches with --disable-extensions by design.
- Seeing "all extensions disabled" in that harness is expected behavior, not itself a regression.

### 2026-03-16T13:40:00Z

9) Test coverage map and next priorities

Covered behavior (high confidence):
- Extension activates in VS Code host.
- Save-triggered analysis produces codexlint diagnostics.
- Cooldown gate suppresses immediate rerun.
- parseJsonLenient handles direct JSON, fenced JSON, embedded JSON, non-JSON, and empty output.

Not directly covered yet (with reason):
- `src/debug.ts#printEnv` and debug command visibility toggling:
  - Reason: not yet covered; user-facing debug behavior.
- `src/shared.ts#getConfig` branch coverage (preset selection, prompt toggles, selected skill parsing edges):
  - Reason: not yet covered; behavioral config interpretation.
- `src/shared.ts#runProcessWithTimeout` failure branches (spawn error, non-zero exit, timeout):
  - Reason: not yet covered; behavioral reliability path.
- `src/saveCoordinator.ts#shouldAnalyzeDocument` branch coverage (non-file, empty, too large, binary, skipBinaryFiles=false):
  - Reason: not yet covered; behavioral gating rules.
- `src/saveCoordinator.ts` analysis failure diagnostic path (`analysis-command-failed`):
  - Reason: not yet covered; behavioral error handling.
- `src/saveCoordinator.ts` debug IO logging branch:
  - Reason: not yet covered; optional but behaviorally meaningful.
- `src/saveCoordinator.ts` stale-run suppression via sequence map:
  - Reason: not yet covered; behavioral concurrency guard.
- `src/saveCoordinator.ts#toRange` edge clamping behavior:
  - Reason: partly covered indirectly, edge behavior not explicit.
- `src/analyze.ts` normalization/severity mapping edge cases:
  - Reason: mostly not yet covered; parser and mapping behavior.
- `src/analyze.ts` unexpected schema rejection path:
  - Reason: not yet covered; parse guard behavior.
- `src/extension.ts` resource disposal and no-op deactivate:
  - Reason: mostly incidental lifecycle plumbing; low direct user-visible behavior.
- `test/unit/hello.unit.test.mjs`:
  - Reason: placeholder, not product behavior.

Prioritized next-test sequence (correctness first, low flake):
1. Unit tests for `getConfig` branch behavior (`src/shared.ts`).
2. Unit tests for `runProcessWithTimeout` failure/success paths with tiny local helper scripts.
3. Integration tests for `shouldAnalyzeDocument` gating rules (non-file/empty/oversized/binary).
4. Integration test for `analysis-command-failed` diagnostic on analyzer failure.
5. Unit tests for normalize/mapping behavior from `src/analyze.ts` (severity, defaults, invalid finding filtering).
6. Integration tests for stale-run suppression and range-clamping edges.
7. Debug command tests (`printEnv` and visibility context), if still considered worth the runtime cost.
8. Remove or replace `hello.unit.test.mjs` with behavioral tests only.

## Hardening

### 2026-03-16T14:00:00Z

Trust model hardening direction for analyzer command execution:

1) Manifest-level restriction
- Mark risky analyzer settings as restricted in untrusted workspaces:
  - `codexlint.analyzer.command`
  - `codexlint.analyzer.customCommand`
  - `codexlint.analyzer.customInput`

2) Runtime trust gate
- Before analyzer execution, require workspace trust for custom command mode at minimum.

3) Configuration scope hardening
- Move risky settings to user/machine scope so repository workspace settings cannot inject command execution behavior.

4) Safe fallback behavior
- If execution is blocked by trust policy:
  - do not execute analyzer
  - surface clear diagnostics/output explaining why
  - provide clear next-step guidance (trust workspace or use safer settings)

5) TDD acceptance criteria
- Untrusted workspace + workspace custom command => analyzer does not execute.
- Trusted workspace + valid custom command => analyzer executes.
- Untrusted workspace + built-in preset behavior follows defined policy.
- Settings precedence confirms workspace cannot override restricted risky values.

Policy recommendation noted:
- Preferred default: balanced policy (allow built-in presets in untrusted workspaces, block custom command execution).
- Alternative stricter policy: block all analyzer execution in untrusted workspaces.

#### Extras

- Security is most important in untrusted repos
- ...but this analyzer runs "on save" - do I intend to use it while EDITING an untrusted repo?
- Possibly it should have a trigger to kick it off without saving a file?
- "Trust" can be a lose word. I find myself hitting "I trust this folder" on projects I wouldn't strictly say I *trust*, but there's no button labelled "I don't trust this repository, but none of my extensions have an attack surface that matters in this context and I need the convenience of the things that are enabled by the button that says 'trust' so I'm hitting it."
- Would this extension be such an attack surface? It certainly shouldn't be.
- Is it ever valid to have repo-level settings for this extension? We don't need the repo to tell us in the settings that it's a C++ repository, we read that from the file name.
- A repo-level prompt though... a project might have unusual security considerations, or it might just be reasonable to allow the repository to say what skills could be relevant for linting this repo
- Wait, also: I have repositories that I trust, but if somebody makes a pull request and I check out that PR to my local machine - if I already trust that repo, am I not then trusting the potentially-hostile PR as well? I have never given this any thought before, but surely that's been an issue since forever? That's not an LLM issue, that's a fully general vscode extension issue? Or not?
- Possibly per-repo settings can still be stored outside of the repo? Say a user needs a specialized prompt for a specific repo. The *user's* settings.json could have multiple prompts configured, and then the linter pulls a prompt from a list-of-prompts based on the path/name of this repository rather than from a setting controlled within the repository?

### 2026-03-16T14:10:00Z

Hardening decision matrix (proposed defaults)

1) Analyzer execution command and mode
- `codexlint.analyzer.command`:
  - Workspace scope: disallow.
  - User/machine scope: allow.
- `codexlint.analyzer.customCommand`:
  - Workspace scope: disallow.
  - User/machine scope: allow.
- `codexlint.analyzer.customInput`:
  - Workspace scope: disallow.
  - User/machine scope: allow.
- Rationale: repository-controlled settings should not be able to choose executable command behavior.

2) Trust model usage
- Do not treat workspace trust alone as a sufficient security boundary for custom command execution.
- Even in trusted workspace mode, retain user/machine ownership of executable command settings.

3) Prompt and skill-related configuration
- Prompt/skill hints are lower-risk than executable command settings, but can still influence behavior.
- Candidate default:
  - Workspace scope allowed for informational prompt/skill hints, with clear limits/guardrails.
  - Sensitive execution settings remain user/machine only.
- Follow-up required: define explicit allowed keys and guardrails.

4) Trigger mode
- Keep current on-save behavior for default workflow.
- Consider optional manual trigger mode for hardened workflows/untrusted-code review usage.
- Follow-up required: decide whether this is in scope for current hardening milestone.

5) Repo trust vs PR trust reality
- Trusting a repository does not imply all future checked-out branches/PRs are equally trusted.
- Extension hardening should assume hostile code can appear after trust is granted.
- Therefore, execution-critical settings should remain external to repository control.

6) Per-repo customization without repository control
- Consider user-side mapping for repo-specific prompt profiles (path/name keyed), stored outside repo settings.
- This can preserve customization while avoiding repository-injected command/prompt control.
- Follow-up required: decide if this is immediate scope or later enhancement.

### 2026-03-16T14:20:00Z

Analyzer process write-capability observations

1) Extension-level "read-only behavior" test caveat
- Current read-only integration test verifies that extension code does not directly edit files.
- It does not by itself prove analyzer subprocess cannot write files.
- In test host context, analyzer permissions may be implicitly more restricted than real user context.

2) Codex CLI execution behavior
- `codex exec "please add the word 'hey' to text.txt"` can write files when run in a trusted/writable Codex CLI context.
- `codex exec --sandbox read-only "please add the word 'hey' to text.txt"` fails to write, which is desired for analyzer safety defaults.

3) Hardening direction
- Prefer explicit read-only analyzer execution defaults at process invocation level, not assumptions based on host context.
- For Codex analyzer preset, evaluate defaulting to read-only sandbox args.

4) Follow-up research item
- Determine equivalent args/flags for `claude -p` to enforce read-only behavior (or nearest secure default).
- Document capability gaps if strict read-only cannot be enforced for one analyzer family.
