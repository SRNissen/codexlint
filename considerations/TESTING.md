# TESTING

A history of the considerations and trade-offs for this project.

As a history, remember that anything mentioned in this document was relevant at the time of writing, not necessarily at the time of reading.

# 2024-06-13T15:22:00Z

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

# 2026-03-16T13:40:00Z

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


# npm scripts

1. I never want an "npm run ..." to result in a package, unless we are green on truly everything - audit, lint, compile, tests (except those gated behind flags). This goal is mandatory, but the current solution is replacable if you have better suggestions.
2. I don't want to be *surprised* if step 1 fails - I would like most of those steps to be part of the regular dev work, so I don't end up believing I am ready to package, and suddenly catch a mistake I could have caught hours ago, but have instead built on top of due to not knowing. This goal is not mandatory, it is "merely" a QoL issue during development, rather than a safety gate for our users.
  2.1 npm audit can be an issue when there are e.g. network problems or, when I'm working with you, it can cause network boundary permission escalations. I am very open to moving it out of the normal flow, but I would still like it to be called very regularly. I have some thoughts on a change, but I would love to hear a couple of suggestions on how you would solve this.
3. Testing currently cleans before and after the full test, rather than having cleanup in the individual test scripts. The goal is easy inspection of test artifacts when tests fail. I am aware that this can cause test aberrations if there is a name conflict in test resources or artifacts. I have decide to handle this with unique names for each test artifact. I am open to other suggestions.

# 2026-03-18T15:30:00Z

Goal-level summary from script-design discussion:

1) Packaging/release is a special action
- Creating a distributable artifact should be gated more strictly than ordinary development commands.
- A package/release command should not succeed unless all mandatory quality and safety checks are green.
- At minimum that means lint, buildability/type-checking, tests, and dependency-policy/audit checks.
- Flag-gated or manual probes can remain outside that mandatory gate.

2) Failures should be discovered before release time
- Most failures that would block packaging should ideally be discovered during normal development rather than only when preparing a release.
- The workflow should encourage regular checkpointing so mistakes are caught before more work accumulates on top of them.
- This is partly a safety goal and partly a quality-of-life goal.

3) Audit is important, but different in character from lint/build/test
- Dependency auditing matters enough that it should be run regularly rather than treated as a rare release-only task.
- At the same time, audit is network-bound and can fail for reasons unrelated to repository correctness.
- That makes audit awkward to hide inside routine behavioral test commands.
- The desired long-term policy is: audit should remain frequent enough to form a habit, without making routine local correctness checks misleading or brittle.

4) Script names matter less than honest boundaries
- The surrounding ecosystem does not appear to have a stable consensus on `build` vs `compile` naming.
- Therefore exact names are negotiable; what matters more is semantic honesty.
- Script names should describe responsibilities clearly rather than quietly bundling unrelated pipelines together.
- In particular, build-like commands, test-like commands, audit-like commands, and package/release commands should remain meaningfully distinguishable.

5) Watch is convenience, not the correctness model
- `watch` is a convenience for fast iteration, not itself a correctness gate.
- A healthy project should support both styles of work:
  - continuous background rebuilds during editing
  - deliberate one-shot checkpoint commands
- Lack of familiarity with watch-heavy JavaScript/TypeScript workflows is not itself a design problem; the workflow should still make sense to someone who prefers explicit checkpoints.

6) Local editor workflow is legitimate local-only state
- Local editor/task convenience files such as `.vscode` are legitimate local-only state.
- It is acceptable to keep machine-specific editor workflow details out of git.
- Repository-level workflow conventions should avoid machine-specific assumptions and avoid unnecessary contributor churn in editor metadata.

# 2026-03-19T10:24:05Z

My current goals at this timestamp:

- Get the strange unit test setup under control - currently, the only "real" unit test lives under the integration test setup because that was significantly more convenient, and "unit during integration" is better than "no unit at all" - but I'd like to actually have it separated. The current setup was not designed, it evolved.
- Stop seeing "pending" in the integration results, it looks like a test timed out. This goal has a bit more complexity that I'll specify later.
- Write tests for the trusted/untrusted repo paths

On "pending" tests: There are four gated tests. The two smoke tests are gated because they're not relevant unless the others fail - they're diagnostic in nature, to be launched if the other gated tests fail, to see if the setup even works. The non-smoke gated integration tests are gated because they're pretty expensive in both time and computation. They each spin up an agent and challenge that agent to find a way to mutate the repository - this is a task of arbitrary time complexity. It is *important*, and must be run before the extension is packaged and shipped, but cannot be part of the regular test flow.


- Better design for unit tests
- Distinction of the expensive tests
- New tests for trusted/untrusted repo paths.

# 2026-03-20T11:28:08Z

Test cleanup and artifact retention clarification:

1) `clean:test-output` and `clean:test-workspace` do not serve the same purpose.
- `clean:test-output` removes `out/test`.
- That directory contains compiled test JavaScript and sourcemaps emitted by `build:tests`.
- It is build output, not runtime test data.

- `clean:test-workspace` removes `test-workspace`.
- That directory contains files created while the VS Code-hosted tests run, such as generated analyzer scripts, counters, and target files.
- It is runtime test artifact state, not compiled output.

2) `reset:test-workspace` is distinct from `clean:test-workspace`.
- `clean:test-workspace` deletes the directory and leaves it absent.
- `reset:test-workspace` deletes the directory and recreates it empty.
- This is useful when tests expect a known-empty workspace to exist before the run starts.

3) Current success-path behavior
- `build:dist-no-audit` currently does:
  - `npm run clean`
  - `npm run reset:test-workspace`
  - `npm run test:integration`
- That means successful runs start with an empty `test-workspace`, but do not clean it again afterward.
- Therefore integration test artifacts remain available after a successful run.

4) Current regression framing
- If the intended policy is "preserve test-workspace artifacts on failure, but clear them on success", the current regression is not confusion between the two cleanup scripts.
- The actual gap is the lack of a final success-only cleanup step for `test-workspace`.
