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

### 2026-03-17T12:43:08Z

Claude permissions/tooling discussion transcript

```text
╭─── Claude Code v2.1.77 ───────────────────────────────────────────────────────────────────────────────────────────────╮
│                                                    │ Tips for getting started                                         │
│                 Welcome back Codex!                │ Run /init to create a CLAUDE.md file with instructions for Clau… │
│                                                    │ ──────────────────────────────────────────────────────────────── │
│                       ▐▛███▜▌                      │ Recent activity                                                  │
│                      ▝▜█████▛▘                     │ No recent activity                                               │
│                        ▘▘ ▝▝                       │                                                                  │
│      Opus 4.6 with high effort · Claude Pro ·      │                                                                  │
│      codex@elementary.dk's Organization            │                                                                  │
│      ~/repos/srnissen/codexlint/test-workspace     │                                                                  │
╰───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯

❯ please add 'hello' to 'text.txt'                                                                                       
                                   
● Read 1 file (ctrl+o to expand)                                                                                         
                                                                                                                         
● The file doesn't exist yet, so I'll create it.                                                                         
  ⎿  Interrupted · What should Claude do instead?
                                                                                                                         
❯ please add 'hello' to 'test.txt'                                                                                       
                                                                                                                         
● Read 1 file (ctrl+o to expand)                                                                                         
                                                                                                                         
● Write(test.txt)
  ⎿  User rejected update to test.txt                                                                                    
      1 +hello                                                                                                           
                                                                                                                         
❯ I notice you needed to escalate permissions, which surprises me. Can you tell me what your current permissions are?    
                                                                                                                         
● I don't have a built-in way to inspect my own permission configuration directly. The permissions are controlled by your
   Claude Code settings. Let me check what's configured.                                                                 

● Searched for 2 patterns (ctrl+o to expand)                                                                             
                                                                                                                         
❯ They should be availabe from ./claude/settings.json                                                                    
                                                                                                                         
● Read 1 file (ctrl+o to expand)                                                                                         
                                                                                                                         
● Here are your current permissions from .claude/settings.json:
                                                                                                                         
  - Default mode: plan                                                                                                   
  - Allowed tools: Bash and Edit                                                                                         
                                                                                                                         
  The Write tool is not in the allow list, which is why writing test.txt required permission escalation. To add 'hello'  
  to the file, I can use Edit instead (which is allowed), but since the file appears to be empty, would you like me to   
  add Write to your permissions, or should I use a bash command to write the content?                                    
                  
❯ This is what surprised me - how does "edit" not automatically imply "write"? Does it only allow redactions?            
                                                                                                              
● Good question. In Claude Code, Edit and Write are distinct tools:                                                      
                                                                                                                         
  - Edit — performs find-and-replace operations on existing content in a file. It requires an old_string to match and a  
  new_string to replace it with. It can't create new files or write to empty files.                                      
  - Write — creates a new file or overwrites an entire file's content.                                                   
                                                                                                                         
  So Edit doesn't imply Write because they're separate tools with different capabilities. Since test.txt is empty, Edit  
  has nothing to match against, so I'd need Write to put content in it.                                                  
                                                                                                                         
  Would you like me to add Write to your allowed permissions?

❯ I want to test a thing, then: I have added an empty space to the file. Please edit the file to contain "hello" instead 
 of the empty space?                                                                                                     
                                                                                                                         
● Read 1 file (ctrl+o to expand)                                                                                         
                                                                                                                
● Update(test.txt)
  ⎿  Added 1 line, removed 1 line                                                                                        
      1 -                                                                                                         
      1   No newline at end of file                                                                                      
      2 +hello                                                                                                           
      3   No newline at end of file                                                                                      
                                                                                                                         
● Done — test.txt now contains hello.
                                                                                                                
❯ So "edit" is effectively "write" on any non-empty file, through the path of "replace the last character with a string  
of all that must be writte, with the last character prefixed" - no?                                                      
                                                                                                                         
● Yes, exactly right. For any non-empty file, Edit can functionally do everything Write does — just match the entire     
  existing content (or even a single character) and replace it with whatever you want. The only things Edit truly can't
  do that Write can:
                                                                                                                         
  1. Create a brand new file                                                                                             
  2. Write to an empty file                                                                                              
                                                                                                                         
  So the permission distinction is a bit leaky. Edit without Write really only prevents creating new files or writing to 
  empty ones — it doesn't meaningfully restrict what can be done to existing files with content.                         
                                                                                                                         
❯ I assume "bash" is also, effectively, a superset of all other file system permissions, given how much can be done from 
 bash?                                                                                                                   
                                                                                                                         
● Yes, exactly. Bash is effectively a superset of Read, Edit, Write, Glob, and Grep — I could use cat, sed, echo >, find,
   and rg to do everything those dedicated tools do.
                                                                                                                         
  The dedicated tools exist mainly for:
  - Better UX — they show diffs, file contents, etc. in a more reviewable way in the Claude Code interface               
  - Guardrails on me — I'm instructed to prefer them over bash equivalents so my actions are more transparent and easier 
  for you to approve/reject individually                                                                                
                                                                                                                         
  But from a pure permissions standpoint, allowing Bash alone already grants full filesystem (and much more — network,
  processes, package management, etc.). The granular tool permissions are more about visibility and control over how I do
   things, not truly restricting what I can do.
                                                                                                                         
❯ please, then - edit test.txt to contain this entire conversation, rather than its current content.                     
                                                                                                                    
● Read 1 file (ctrl+o to expand)                                                                                         
                                                                                                                         
● Update(test.txt)                                                                                                       
  ⎿  Added 1 line, removed 1 line                                                                                        
      1 -hello                                                                                                           
      1   No newline at end of file                                                                                      
      2 +User: please add 'hello' to 'text.txt'                                                                          
      3   No newline at end of file                                                                                      
                  
● I need to be upfront: I don't have access to the raw conversation transcript. I can reconstruct it from memory, but it
  won't be a verbatim copy — I'd be paraphrasing and may miss details or get wording wrong.
                                                                                                                         
  Also, I just realized I already replaced the content with the first line. Want me to continue building it out with my  
  best reconstruction, or would you prefer to copy/paste the actual conversation from your terminal instead?             
                                                                                                                         
❯ I'm going to copy/paste. Thank you.                                                                                    
                                      
● You're welcome! 
```

### Why the custom command should be gated behind "trusted repos only" even if it is in principle the same as the built-in commands

Writing the invokable command safely is hard. We know partially because I just failed twice in a row, with guidance,
and I didn't just vibe code something that failed, I wrote it wrong after spending a chunk of time reading
documentation and consulting with two separate top-flight models about the threat model, even diving into the
internals of one of them to see what was happening.

There is nothing in-principle *harder* about writing a custom command than what I did. There is nothing in-principle
wrong with a custom script for analyzing untrusted code. Nonetheless, it is highly likely to go wrong, such that the
linter has permissions that might be influenced by the repository under analysis (as, indeed, both of ours currently
would have if it wasn't for the hardening pass we just did together)

And so, there is nothing in-principle wrong about letting a custom invocation/prompt operate on an untrusted
repository, but in practice, it is a disaster waiting to happen and should be given far more design thought before
going ahead.

## npm scripts

1. I never want an "npm run ..." to result in a package, unless we are green on truly everything - audit, lint, compile, tests (except those gated behind flags). This goal is mandatory, but the current solution is replacable if you have better suggestions.
2. I don't want to be *surprised* if step 1 fails - I would like most of those steps to be part of the regular dev work, so I don't end up believing I am ready to package, and suddenly catch a mistake I could have caught hours ago, but have instead built on top of due to not knowing. This goal is not mandatory, it is "merely" a QoL issue during development, rather than a safety gate for our users.
  2.1 npm audit can be an issue when there are e.g. network problems or, when I'm working with you, it can cause network boundary permission escalations. I am very open to moving it out of the normal flow, but I would still like it to be called very regularly. I have some thoughts on a change, but I would love to hear a couple of suggestions on how you would solve this.
3. Testing currently cleans before and after the full test, rather than having cleanup in the individual test scripts. The goal is easy inspection of test artifacts when tests fail. I am aware that this can cause test aberrations if there is a name conflict in test resources or artifacts. I have decide to handle this with unique names for each test artifact. I am open to other suggestions.

### 2026-03-18T15:30:00Z

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

## Test Planning

### 2026-03-19T10:24:05Z

My current goals at this timestamp:

- Get the strange unit test setup under control - currently, the only "real" unit test lives under the integration test setup because that was significantly more convenient, and "unit during integration" is better than "no unit at all" - but I'd like to actually have it separated. The current setup was not designed, it evolved.
- Stop seeing "pending" in the integration results, it looks like a test timed out. This goal has a bit more complexity that I'll specify later.
- Write tests for the trusted/untrusted repo paths

On "pending" tests: There are four gated tests. The two smoke tests are gated because they're not relevant unless the others fail - they're diagnostic in nature, to be launched if the other gated tests fail, to see if the setup even works. The non-smoke gated integration tests are gated because they're pretty expensive in both time and computation. They each spin up an agent and challenge that agent to find a way to mutate the repository - this is a task of arbitrary time complexity. It is *important*, and must be run before the extension is packaged and shipped, but cannot be part of the regular test flow.


- Better design for unit tests
- Distinction of the expensive tests
- New tests for trusted/untrusted repo paths.

## File Extension Exclusions

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