# AGENTS

This file captures project context that is not obvious from code alone.

## Project intent

Project intent and high-level behavior are described in `README.md`.

## Code style preferences

It is unacceptable for a security extension to introduce security problems. Introduce as few packages as possible, and only packages that are maintained and up to date.

## Important environment caveat

The VS Code Extension Host environment can differ from vscode's integrated terminal environment.

A command that works in the integrated terminal (for example `codex`) may still fail in the extension runtime if PATH is missing dependencies.

During local debugging, if you use `.vscode/launch.json`, you can inject the path to your local codex instance by adding `env` to the in the `configurations` array:

```json
{
    "configurations": [
        {
            "env": {
                "PATH": "/absolute/path/to/node/bin:${env:PATH}"
            }
        }
    ]
}
```

## Debug tooling currently included

A debug command is contributed:

- Command ID: `codexlint.debugEnvironment`
- Purpose: logs extension host env details and `which` lookups for `node` and configured `codex` command to the `codexlint` output channel.

This command is useful for local troubleshooting, but is subject to change or removal at any time without prior notice.

## Recommended near-term work

The README.md file contains a roadmap. Contributions within the roadmap will be given serious consideration. Contributions outside the roadmap are likely to be ignored.
