# File Extension Exclusions

A history of the considerations and trade-offs for this project.

As a history, remember that anything mentioned in this document was relevant at the time of writing, not necessarily at the time of reading.

# 2026-03-20T09:04:25Z

Goal-level summary from file-type exclusion discussion:

## 1 Goal
- Add a quality-of-life feature that lets the user exclude selected file extensions from save-triggered linting.
- The current motivating examples are text-like files such as `md` and `txt`.
- This is primarily about reducing unnecessary analyzer runs, not changing the analyzer trust model.

## 2 Viable configuration shapes

### 2.1 List only
One editable list setting, for example `codexlint.operation.excludedFileExtensions`.
With that shape, the default could be `["md", "txt"]`, and an empty list would effectively disable the feature.

Benefits:
- Minimal settings surface.
- Minimal implementation and documentation burden.
- No redundant state between a toggle and a list.

Tradeoff acknowledged:
- "Feature disabled" is represented indirectly by an empty list rather than an explicit boolean.

### 2.2 List + toggle
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

## 3 Current preference
- If the primary goal is clear TDD around the four desired scenarios, the toggle-plus-list design is the cleanest fit.
- If the primary goal is minimal surface area, the list-only design is the smallest acceptable shape.

## 4 Semantics to decide before the failing test
1. Should matching be case-insensitive?
2. Should settings/documentation prefer `md` or `.md` as the canonical entry format?
3. How should dotfiles such as `.gitignore` be treated?
4. How should multi-part suffixes such as `tar.gz` be treated?
5. Should these settings follow the existing user/global-preferred configuration model, rather than allowing repository workspace settings to control them?

# Information gathering

On header 4, "Semantics to decide before the failing test"

## 4.1: Matching should probably be case-insensitive.

Before carving that in stone, I want to do a survey:
- Do there exist file formats where two disparate file types use the same extension, separated only by case?
- Do there exist file formats where there's only one type, but it expects the extension to be non-lowercase?

## 4.2, 4.3 and 4.4: Extension format

If I implemented this without help or research, I would match on end-of-file-name. `[re]` would match any file that ended in `re`, including `file.xre` and `.gitignore`. This has advantages beyond ease of implementation, for example it settles the dotfiles question. However, I haven't given it much thought yet, and I am doing it *with* help and a willingness to do research, so I think this merits more thought.

## 4.5: Configuration model

We are definitely sticking to the existing configuration model. We can't have a hostile pull request evade linting by adding attacked files to the local exclude list.

# Copied from further discussion with gpt-5.4 xhigh

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

# What even are the requirements?

Good guidance, answers all my questions. It has also made me feel that maybe I'm attacking this from the
  wrong angle entirely, but I'm not sure if that's real, or just avoidance so I can delay making a
  tradeoff.

  Let me expand on the actual problem I'm trying to solve: Good source files are short, but long files do
  occur. Good *text* can be very very long indeed, and will not contain security problems, unless perhaps
  it contains code examples with wrong code in them (and those will be caught once copied into source
  files).

  So I don't want the linter to spend a lot of time examining text files, and I thought "maybe the user
  knows more text formats than I do" so I wanted it configurable. For my own purposes, I'd just filter
  `.md`, `.txt`, `.MD` and `.TXT` explicitly and be done with it.

  Disregarding our previous conversation then and starting just from that problem, how would you approach a
  solution?


• I would reframe the requirement first:

  The real problem is not “extension parsing.” The real problem is “documents that are overwhelmingly prose
  are low-value and potentially high-cost to analyze.”

  From that framing, I would not start with a general extension-skip feature. I would start with a narrow,
  problem-shaped gate.

  My first-choice approach would be:

  1. Skip obvious prose document kinds by default.

  - In this codebase, that means adding a gate in src/saveCoordinator.ts alongside the existing empty/size/
    binary checks.
  - I would base it on document.languageId, not raw filename suffixes.
  - Initial defaults: markdown and plaintext.

  Why:

  - It solves your actual cost problem directly.
  - It avoids the case-sensitivity mess almost entirely.
  - It avoids the “re matches SECRET_WIRE” problem entirely.
  - It matches what VS Code already knows about the document, instead of re-implementing filetype logic
    ourselves.

  If I wanted a setting at the same time, I would make it correspond to that problem shape, not to arbitrary
  suffix matching. For example:

  - codexlint.operation.skipProseDocuments default true

  or, if you want it extensible from day one:

  - codexlint.operation.excludedLanguageIds default ["markdown", "plaintext"]

  Between those two, I would start even smaller:

  - one boolean, hard-coded behavior for markdown/plaintext

  Then only add configurability if it turns out to be needed.

  If you do want configurability immediately, I would still prefer language IDs over extensions:

  - excludedLanguageIds is semantically cleaner than excludedFileExtensions
  - it avoids .md vs md
  - it avoids case sensitivity in the setting
  - it avoids dotfile semantics
  - it avoids final-suffix vs whole-name debates

  The main downside is that it is slightly less familiar for users than extensions. But for this repo, I
  think the correctness and clarity win is worth it.

  There is one alternative I would seriously consider:

  2. Separate size limits for prose-like files.

  - Keep analyzing markdown/plaintext when small.
  - Skip them only above a lower threshold than source files.

  I would choose this only if you care about short docs being linted for embedded code examples or risky
  snippets. If, as you said, prose files are basically not valuable targets, this is unnecessary complexity.

  So my actual recommendation is:

  - First cut: skip markdown and plaintext by default, using document.languageId
  - Prefer a simple boolean setting if you want a user-visible knob now
  - Avoid a general extension list unless a real need remains after that

  That is the smallest solution that matches the problem you described, rather than the proxy problem we
  started designing around.

  If you want, the next requirement-gathering step can be to compare these three shapes before the failing
  test:

  - hard-coded markdown/plaintext skip
  - boolean toggle for markdown/plaintext skip
  - configurable excludedLanguageIds
