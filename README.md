# codexlint

The codexlint extension

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Compile once:

   ```bash
   npm run compile
   ```

3. Start TypeScript watch mode (optional while developing):

   ```bash
   npm run watch
   ```

4. Run the extension in a development host:
   - Open this folder in VS Code.
   - Press `F5` and choose `Run Extension`.

## Quality checks

- Lint:

  ```bash
  npm run lint
  ```

- Format check:

  ```bash
  npm run format:check
  ```

- Tests:

  ```bash
  npm test
  ```

## Current behavior

- On file save, runs pre-check filters:
  - file URI only
  - non-empty file
  - max file size threshold
  - optional binary-file skip
- If the file passes filters, runs `codex exec` and converts JSON findings to VS Code diagnostics.

## codex output contract

codexlint expects `codex exec` to return JSON in this shape:

```json
{
  "findings": [
        {
          "message": "string",
          "severity": "error|warning|info",
          "line": 1,
          "column": 1,
          "endLine": 1,
          "endColumn": 1,
        }
      ]
}
```

Allowed `severity` values are `error`, `warning`, and `info`.

## Settings

- `codexlint.onSave.enabled`
- `codexlint.onSave.debounceMs`
- `codexlint.onSave.maxFileBytes`
- `codexlint.onSave.skipBinaryFiles`
- `codexlint.codex.command`
- `codexlint.codex.args`
- `codexlint.codex.timeoutMs`
