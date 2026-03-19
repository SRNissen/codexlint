# README

The vscode codexlint extension uses Codex CLI, Claude, or a customizable hook, to continuously monitor development from a security perspective.

## BETA RELEASE

The current state of the extension is: Ready for use, with room for improvement around efficiency.

## Credit

- Credit is extended gpt-5.3, gpt-5.4, and Opus 4.6. Without them, this project would not have happened.
- Credit is also extended to Elementary ApS, for funding AI subscriptions and encouraging me to work on this project.

## How to use

By default, codexlint will use a read-only invocation of `codex exec`, reviewing your files on save, with a prompt that has found real security problems in production code.

You can configure codexlint to use `claude -p` instead, or a custom command of your choice.

You can also highlight skills that you find extra relevant, or replace the prompt entirely.

### Restricted settings

Configure codexlint in user settings, not workspace settings. The extension intentionally ignores workspace settings, even in trusted workspaces.

### Exmaples

Example user settings for Codex CLI:

```json
{
  "codexlint.analyzer.command": "codexExec"
}
```

Example user settings for Claude:

```json
{
  "codexlint.analyzer.command": "claudeP"
}
```

Example user settings for a custom analyzer:

```json
{
  "codexlint.analyzer.command": "custom",
  "codexlint.analyzer.customCommand": "my-security-analyzer --json",
  "codexlint.analyzer.customInput": "stdin"
}
```

Custom analyzers must return JSON. The expected shape is:

```json
{
  "findings": [
    {
      "message": "string",
      "severity": "error",
      "line": 1,
      "column": 1,
      "endLine": 1,
      "endColumn": 1,
      "code": "optional-code"
    }
  ]
}
```

### Reviewing untrusted code

The custom command should be reserved for linting your own trusted code for mistakes. 

When working in an untrusted workspace with a custom linter command, the linter is not invoked. Instead, an informational is printed in the `PROBLEMS` section.

The built-in `codex exec` and `claude -p` commands are read-only by design, to reduce the attack surface when analyzing untrusted code. They remain available in untrusted workspaces.

### Troubleshooting

If `codex` or `claude` works in the integrated terminal but not in codexlint, the extension host may have a different `PATH`.

If that doesn't solve your problem, enable `codexlint.operation.showDebugCommand`, then run `codexlint: Debug Environment` to inspect the current settings.

