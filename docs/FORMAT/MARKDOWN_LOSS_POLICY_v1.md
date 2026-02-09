# Markdown Loss Policy v1

## Loss Principles
- No silent loss is allowed.
- Every lossy conversion must produce deterministic loss records.
- Loss handling must be stable for identical input.

## Loss Report Format
Minimum record fields:
- `code`
- `severity`
- `path`
- `message`
- `evidence`

## Roundtrip Guarantees
- Supported subset aims for stable roundtrip parse->serialize->parse.
- Unsupported features may be downgraded or escaped with loss records.
- Exact roundtrip is not promised outside supported subset.
- Threshold policy: any `severity=ERROR` loss blocks import/export; `severity=WARN` losses are reported but do not block.

## Mapping Table
- Unsupported table syntax -> `DOWNGRADE` + `E_MD_LOSS_TABLE_UNSUPPORTED`
- Inline HTML -> `DROP` or `ESCAPE` per security policy + `E_MD_LOSS_RAW_HTML`
- Task list markers -> `DOWNGRADE` to plain list + `E_MD_LOSS_TASK_LIST`
- Footnotes -> `WARN_ONLY` + `E_MD_LOSS_FOOTNOTE`

## Examples
- HTML tag removed: produce `E_MD_LOSS_RAW_HTML` with tag snippet in `evidence`.
- Table collapsed: produce `E_MD_LOSS_TABLE_UNSUPPORTED` with location path.
- Unsupported extension kept as plain text: produce deterministic warning record.
