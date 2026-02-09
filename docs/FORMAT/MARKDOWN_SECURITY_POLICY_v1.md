# Markdown Security Policy v1

## Raw HTML Policy
- Raw HTML is unsupported by default and must be rejected or escaped deterministically.
- Scriptable tags and event handlers are always forbidden.

## Links and URIs Policy
- `javascript:` is always blocked.
- `data:` is blocked in v1.
- Remote links must not trigger network fetch side effects.
- Relative/local targets are allowed subject to path validation in later implementation phases.

## Code Blocks Policy
- Code fences are treated as plain text content.
- No execution, evaluation, or language-specific runtime behavior is allowed.

## Sanitization Responsibility
- Sanitization/validation is enforced in markdown import/export pipeline layers, not in UI rendering path.
- Typed errors must be emitted with `E_MD_SECURITY_*` codes for policy violations.

## Limits
- Max input bytes must be enforced.
- Max nesting depth and max token/node counts must be enforced.
- Parse time budget must be enforced to prevent DoS behavior.
- Any limit violation must return typed error without partial unsafe output.
