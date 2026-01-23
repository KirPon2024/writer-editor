# Reference: markmap

- URL: https://github.com/markmap/markmap
- License: MIT
- Tags: mindmap, markdown, visualization, web, export
- Last checked: 2026-01-23

## Summary (1–3 bullets)
- JS‑инструмент для визуализации Markdown как mindmap.
- Потенциальная база для будущей фичи “интеллект‑карты/майнд‑мэп” (мы уже используем Markdown‑like маркеры).
- MIT → при желании можно переиспользовать (но не тащить зависимости в MVP без прямого запроса).

## Relevant parts (where to look)
- Документация: `docs` и сайт `markmap.js.org` (для API/форматов).

## MVP Now (что можно взять прямо сейчас)
- Ничего (если майнд‑мэпы не входят в текущий MVP‑срез).

## Later (идеи на будущее, без внедрения сейчас)
- Отдельный режим/панель “Mindmap” для заголовков/структуры.
- Экспорт mindmap в SVG/HTML (если нужно).

## License / usage notes
- Можно ли копировать код? **Да** (MIT), но лучше держать интеграцию минимальной/изолированной.

## Risks / pitfalls
- Зависимости/размер: аккуратно, не раздувать MVP.

## How to adapt in Craftsman (конкретно)
- Начать с простого: mindmap только из заголовков (`#`, `##`, `###`) текущего документа.

