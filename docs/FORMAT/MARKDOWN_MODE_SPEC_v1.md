# Markdown Mode Spec v1

## Scope
Markdown v1 is an import/export surface over the canonical scene model. Scene model remains source of truth.

## Dialect
This spec intentionally supports a constrained subset and does not claim full CommonMark or GFM compatibility.
Explicitly unsupported in v1:
- Tables
- Task lists (`- [ ]`)
- Footnotes
- Raw HTML passthrough
- Remote image fetch behavior

## Supported Blocks
- Paragraph
- Heading levels 1..6
- Thematic break (`---`)
- Blockquote (`>`)
- Ordered list
- Unordered list
- Fenced code block
- Blank lines

## Supported Inlines
- Plain text
- Emphasis (`*text*`, `_text_`)
- Strong (`**text**`, `__text__`)
- Inline code (`` `code` ``)
- Link (`[label](target)`)
- Hard break (two trailing spaces + newline)

## Escaping Rules
- Backslash escaping is preserved for markdown control characters.
- Unknown escape sequences remain verbatim.
- Backticks inside inline code are preserved via deterministic fence widening in serializer.

## Deterministic Serialization Rules
- Output line endings are LF only.
- Exactly one trailing newline is enforced.
- Ordered list numbering is normalized to sequential `1..N` inside each list.
- Fenced code blocks use triple backticks.
- Fence language info is trimmed and lowercased.
- Consecutive blank lines are collapsed to one.

## Limits
- Max input size must be enforced before parse.
- Max nesting depth must be enforced.
- Max token/node count must be enforced.
- Parse time budget must be enforced.
- Limit values are finalized in M2 implementation, but limit enforcement is mandatory.

## Examples
1. Heading
   - Input: `# Title`
   - Output: `# Title`
2. Ordered list normalization
   - Input: `3. a\n9. b`
   - Output: `1. a\n2. b`
3. Code fence language normalization
   - Input: ```` ``` JS ````
   - Output: ```` ```js ````
4. CRLF normalization
   - Input lines with CRLF
   - Output lines with LF
5. Hard break preservation
   - Input: `line1  \nline2`
   - Output preserves hard break semantics
6. Unsupported table
   - Input table syntax
   - Output follows loss-policy with deterministic warning
