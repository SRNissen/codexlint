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

# File Extension Exclusions

### 2026-03-20T09:04:25Z

Goal-level summary from file-type exclusion discussion:

#### 1 Goal
- Add a quality-of-life feature that lets the user exclude selected file extensions from save-triggered linting.
- The current motivating examples are text-like files such as `md` and `txt`.
- This is primarily about reducing unnecessary analyzer runs, not changing the analyzer trust model.

#### 2 Viable configuration shapes

##### 2.1 List only
One editable list setting, for example `codexlint.operation.excludedFileExtensions`.
With that shape, the default could be `["md", "txt"]`, and an empty list would effectively disable the feature.

Benefits:
- Minimal settings surface.
- Minimal implementation and documentation burden.
- No redundant state between a toggle and a list.

Tradeoff acknowledged:
- "Feature disabled" is represented indirectly by an empty list rather than an explicit boolean.

##### 2.2 List + toggle
An explicit boolean toggle plus an editable list, for example:
- `codexlint.operation.useExtensionExclusions`
- `codexlint.operation.excludedFileExtensions`

With that shape, the defaults could be:
- toggle = `true`
- list = `["md", "txt"]`

Benefits:
- Matches the intended four-case test matrix directly.
- Lets a user temporarily disable the behavior without losing their configured list.
- Makes the feature more self-discoverable in settings UI.

Tradeoff acknowledged:
- Slightly larger settings surface, and the toggle overlaps somewhat with the "empty list" interpretation.

#### 3 Current preference
- If the primary goal is clear TDD around the four desired scenarios, the toggle-plus-list design is the cleanest fit.
- If the primary goal is minimal surface area, the list-only design is the smallest acceptable shape.

#### 4 Semantics to decide before the failing test
1. Should matching be case-insensitive?
2. Should settings/documentation prefer `md` or `.md` as the canonical entry format?
3. How should dotfiles such as `.gitignore` be treated?
4. How should multi-part suffixes such as `tar.gz` be treated?
5. Should these settings follow the existing user/global-preferred configuration model, rather than allowing repository workspace settings to control them?

### Information gathering

On header 4, "Semantics to decide before the failing test"


#### 4.1: Matching should probably be case-insensitive.

Before carving that in stone, I want to do a survey:
- Do there exist file formats where two disparate file types use the same extension, separated only by case?
- Do there exist file formats where there's only one type, but it expects the extension to be non-lowercase?

#### 4.2, 4.3 and 4.4: Extension format

If I implemented this without help or research, I would match on end-of-file-name. `[re]` would match any file that ended in `re`, including `file.xre` and `.gitignore`. This has advantages beyond ease of implementation, for example it settles the dotfiles question. However, I haven't given it much thought yet, and I am doing it *with* help and a willingness to do research, so I think this merits more thought.

#### 4.5: Configuration model

We are definitely sticking to the existing configuration model. We can't have a hostile pull request evade linting by adding attacked files to the local exclude list.

### Copied from further discussion with gpt-5.4 xhigh

I also see a combined issue - maybe case insensitivity is fine for actual extensions, but as soon as the
  semantics shift to working on the whole file name, `re` also excludes a file like `SECRET_WIRE` which
  probably isn't the user's intention.

  Please make suggestions that take all these into account. I would like a list far longer than the actual
  number of reasonable suggestions, as a kind of brain-storming exercise to get every impulse and stray
  idea into the light. Please make twenty different suggestions on how to manage these concerns.


• These are intentionally broader than the shortlist I would actually recommend. Several are mutually
  exclusive; the point here is to get the impulses into the open.

  1. Keep the requirement strict: define the feature as matching the file’s extension, not an arbitrary end-
     of-file-name suffix. That avoids re excluding SECRET_WIRE.
  2. Match extensions case-insensitively, but only after you have already decided what the extension is.
     That gives README.MD and README.md the same treatment without widening semantics.
  3. Accept both md and .md in settings, but normalize internally to one canonical form such as md. That is
     forgiving for users without making the implementation ambiguous.
  4. Document dotfiles like .gitignore as “no extension” unless you later decide otherwise. That matches
     common intuition better than treating the whole basename as a suffix bucket.
  5. If dotfiles need their own control later, add a separate exact-filename exclusion setting rather than
     teaching the extension list strange rules. That keeps one setting from doing two jobs badly.
  6. Support only the final extension at first, so archive.tar.gz is treated as gz. It is the simplest rule,
     and simplicity matters more than perfect cleverness here.
  7. If compound suffixes matter later, add that as an explicit follow-up feature instead of smuggling it
     into v1 semantics. tar.gz support is reasonable, but it is not free.
  8. Prefer the toggle-plus-list design if you want the four-case test matrix to map directly onto the
     configuration model. It makes TDD cleaner.
  9. Prefer list-only if you want the smallest possible surface area and are willing to say “an empty list
     means off.” It is leaner, but slightly less expressive.
  10. Name the list something narrow like excludedFileExtensions or ignoredFileExtensions, not skiplist. The
     name should teach the intended semantics.
  11. Keep the setting under operation, because this is another pre-analysis gate alongside size, binary
     detection, debounce, and cooldown. That keeps the model coherent.
  12. Keep the existing user/global-preferred configuration model. A repository should not be able to
     locally decide which attacker-chosen files escape analysis.
  13. Validate entries conservatively. At minimum, ignore empty strings; possibly also reject values
     containing path separators or whitespace-only input.
  14. Be liberal in what you accept, but conservative in what you mean. Accept .MD, .md, and md; still
     interpret all of them as the same extension token.
  15. Extract the extension from path.basename(...), not from the whole path string. That avoids weird path-
     based accidental matches.
  16. Add one explicit non-example to the docs: re does not mean “any filename ending in re.” That is the
     exact misunderstanding you are trying to head off.
  17. Decide up front whether a leading dot without another dot counts as an extension. My recommendation is
     “no,” because users usually do not think of .gitignore as having extension gitignore.
  18. If you choose case-insensitive semantics, lock that in with an eventual uppercase-extension test case.
     Otherwise the policy remains a vibe rather than a requirement.
  19. If you choose strict extension semantics, lock that in with an eventual dotfile test case. That
     prevents later drift toward filename-suffix matching.
  20. If you think users may eventually want broader matching, reserve that for a separate future feature
     like exact filenames or globs. Do not overload “extension exclusions” until it means almost anything.