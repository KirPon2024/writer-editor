# Doctor Invariants

This file records operational doctor invariants and their enforcement mode.

## STRICT REQUIRED
- `TOKEN_CATALOG_IMMUTABLE_OK=1` — Token catalog immutability lock matches `TOKEN_CATALOG_LOCK.json`

## DEV OPTIONAL
- `TOKEN_CATALOG_IMMUTABLE_OK=1` — advisory in dev mode (warn on mismatch)
