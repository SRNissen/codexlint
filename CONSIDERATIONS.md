# CONSIDERATIONS

A history of the considerations and trade-offs for this project.

## Testing

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
