# AGPL Source Offer (Corresponding Source Policy)

This document defines how Craftsman satisfies AGPL-3.0-or-later source-availability obligations.

## 1) Corresponding Source scope
For this project, "Corresponding Source" includes at minimum:
- Full repository source code for the distributed/hosted version.
- Build scripts and packaging scripts used to produce distributable artifacts.
- Configuration files required to build and run the same version.
- License and notices required to reproduce compliance state.

The scope explicitly maps to this repository content at an exact commit.

## 2) Canonical publication location
Corresponding Source is published at:
- Repository: https://github.com/KirPon2024/writer-editor
- Immutable reference: release tag and/or commit SHA for the distributed/hosted build.

Each release/distribution must resolve to a concrete Git commit.

## 3) Network-use trigger (AGPL)
If a hosted/network-accessible version is provided, the user-facing UI must expose a visible "Source" link that points to the exact repository ref (tag or commit) of the running version.

## 4) Desktop distribution rule
For desktop release artifacts, release notes and/or in-app license information must include a source link (repository + exact tag/commit) for the corresponding distributed binary.

## 5) Binary version to source binding
Every released binary version must be traceable to one exact commit SHA.
Recommended release metadata:
- App version
- Git tag (if used)
- Commit SHA
- Source URL to tag/commit

## 6) SPDX headers policy
Per-file SPDX headers are optional for now and may be introduced incrementally in a separate task.
