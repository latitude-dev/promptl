# PromptL Syntax Checker

A standalone tool to recursively check PromptL files for syntax errors.

## Installation

```bash
pnpm install
```

## Usage

```bash
pnpm check <path> [--ext <extension>]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `path` | Path to file or directory to check |
| `--ext` | File extension to check (default: `.promptl`) |

### Examples

```bash
# Check all .promptl files in a directory
pnpm check ./prompts

# Check a specific file
pnpm check ./prompts/my-prompt.promptl

# Check files with a different extension
pnpm check ./prompts --ext .txt
```

## Prompt References

Prompts can reference each other using the `<prompt path="..." />` tag:

```plaintext
<!-- shared.promptl -->
You are a helpful assistant.

<!-- main.promptl -->
<system>
<prompt path="shared" />
</system>
```

References are resolved:
- Relative to the current file's directory
- Without the file extension (e.g., `path="shared"` resolves to `shared.promptl`)
- Within the scanned directory tree

Missing references will produce a `reference-not-found` error.

## Output

The tool outputs:
- Human-readable error messages with file location and code frame to stdout
- A JSON summary to stderr for programmatic use

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No errors found |
| `1` | One or more syntax errors found |

### JSON Output Format

```json
{
  "filesChecked": 3,
  "filesWithErrors": 1,
  "totalErrors": 2,
  "errors": [
    {
      "file": "/path/to/file.promptl",
      "line": 10,
      "column": 3,
      "code": "error-code",
      "message": "Error description",
      "frame": "code context..."
    }
  ]
}
```
