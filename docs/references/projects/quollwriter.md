# Reference: Quoll Writer

- URL: https://github.com/garybentley/quollwriter
- License: Apache-2.0 (code under `src`/`data`)
- Tags: writing, stats, goals, projects, prompts, idea-board, backup, export
- Last checked: 2026-01-23

## Summary (1–3 bullets)
- Десктоп‑приложение для письма с фокусом на тексте, идеями/промптами/проектами.
- Интересно как UX‑референс для “прогресс/навыки/статистика” и “идея‑борд”.
- Лицензия Apache‑2.0 позволяет копирование кода (с условиями), но стек/хранилище не совпадают с нашим MVP.

## Relevant parts (where to look)
- Общая архитектура описана в README (Environment/AbstractProjectViewer).
- Данные/проекты: `src/com/quollwriter/data/*`, БД: `src/com/quollwriter/db/*` (H2).
- Промпты: `data/prompts/`

## MVP Now (что можно взять прямо сейчас)
- Идеи UX для статистики письма и “режимов фокуса”.

## Later (идеи на будущее, без внедрения сейчас)
- “Idea board”, prompts, цели/прогресс и метрики (тайминг/скорость).

## License / usage notes
- Можно ли копировать код? **Да**, в рамках Apache‑2.0 (нужно сохранить лицензию/NOTICE).
- Для Craftsman разумнее сначала перенять UX‑идею, а реализацию писать проще/локально.

## Risks / pitfalls
- Quoll Writer использует БД (H2) → у нас `.txt`, поэтому прямое заимствование архитектуры не подходит.

## How to adapt in Craftsman (конкретно)
- Метрики: лог активности + скорость печати + цели на день/неделю (после MVP, но можно планировать UX).

