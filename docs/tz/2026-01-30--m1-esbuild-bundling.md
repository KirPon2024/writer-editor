# M1: esbuild bundling (renderer), UI no-diff

## Goal
- Собрать renderer через esbuild (bundling).
- UI/поведение не менять.

## Allowlist (ONLY)
- package.json
- package-lock.json (только через CI-политику, если потребуется)
- scripts/** (если нужно)
- build/** (если появятся сборочные файлы)
- .github/workflows/** (только если нужно для CI под сборку)
- docs/tz/2026-01-30--m1-esbuild-bundling.md

## Forbidden
- src/** (любой файл)
- любые UI/стили/поведение
- новые зависимости, кроме esbuild (если его ещё нет)

## Definition of Done
- renderer собирается через esbuild
- runtime-поведение идентично
- diff в UI = 0
- CI зелёный
