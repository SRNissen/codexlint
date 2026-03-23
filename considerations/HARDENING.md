# HARDENING

A history of the considerations and trade-offs for this project.

As a history, remember that anything mentioned in this document was relevant at the time of writing, not necessarily at the time of reading.


# 2026-03-16T14:00:00Z

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

# Extras

- Security is most important in untrusted repos
- ...but this analyzer runs "on save" - do I intend to use it while EDITING an untrusted repo?
- Possibly it should have a trigger to kick it off without saving a file?
- "Trust" can be a lose word. I find myself hitting "I trust this folder" on projects I wouldn't strictly say I *trust*, but there's no button labelled "I don't trust this repository, but none of my extensions have an attack surface that matters in this context and I need the convenience of the things that are enabled by the button that says 'trust' so I'm hitting it."
- Would this extension be such an attack surface? It certainly shouldn't be.
- Is it ever valid to have repo-level settings for this extension? We don't need the repo to tell us in the settings that it's a C++ repository, we read that from the file name.
- A repo-level prompt though... a project might have unusual security considerations, or it might just be reasonable to allow the repository to say what skills could be relevant for linting this repo
- Wait, also: I have repositories that I trust, but if somebody makes a pull request and I check out that PR to my local machine - if I already trust that repo, am I not then trusting the potentially-hostile PR as well? I have never given this any thought before, but surely that's been an issue since forever? That's not an LLM issue, that's a fully general vscode extension issue? Or not?
- Possibly per-repo settings can still be stored outside of the repo? Say a user needs a specialized prompt for a specific repo. The *user's* settings.json could have multiple prompts configured, and then the linter pulls a prompt from a list-of-prompts based on the path/name of this repository rather than from a setting controlled within the repository?

# 2026-03-16T14:10:00Z

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

# 2026-03-16T14:20:00Z

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

# 2026-03-17T12:43:08Z

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

# Why the custom command should be gated behind "trusted repos only" even if it is in principle the same as the built-in commands

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

# 2026-03-23T16:59:48Z

Manifest-metadata follow-up closure:

Two possible follow-up hardening steps were considered:

1) Add stricter configuration `scope` metadata for analyzer execution settings in `package.json`.
2) Add `restrictedConfigurations` metadata for analyzer execution settings in untrusted workspaces.

Decision:
- Neither is worth doing at this time.

Reasoning:
- The important runtime hardening is already in place:
  - workspace settings are ignored in favor of user/global values
  - custom analyzers are blocked in untrusted workspaces
  - built-in presets run with explicitly constrained defaults
- Adding `restrictedConfigurations` would now be mostly redundant with the runtime behavior and would create another list to keep in sync.
- Adding stricter `scope` metadata would mainly be schema/UI alignment, not a material security improvement, and would introduce user-facing configuration friction.
- In particular, `application` scope would be too restrictive for remote environments, while `machine` scope would trade away settings sync convenience for a relatively small gain now that runtime enforcement already exists.

Conclusion:
- Treat the remaining manifest-metadata ideas as lower-value polish, not unfinished hardening work.
- Roadmap hardening should not remain blocked on them.

## Addendum

Neither is worth doing - at all. There's no actual `scope` value that for correct semantics here, and `restrictedConfigurations` is... all of it. This is a decision that can be revisited if the design changes, but not as we stand.