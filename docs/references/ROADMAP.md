# References — Roadmap (features → projects)

Этот файл — “навигация по базе знаний” в `docs/references/projects/*.md`.
Используем перед началом фичи: выбираем 1–2 референса (UX/паттерны), **не копируем GPL‑код**.

Подсказка: перед ТЗ можно быстро найти похожие заметки через:
`npm run brain:refs -- "keywords"`

---

## MVP Now (актуально для текущего Craftsman)

### Global search / Find in project
- `docs/references/projects/novelwriter.md` — “Find in Project”, лимиты/выдача/GUI‑паттерны.
- `docs/references/projects/bibisco.md` — SearchService + find/replace по DOM (как идея).
- `docs/references/projects/ghostwriter.md` — Find/Replace UX в Markdown‑редакторе.

### Editor core: plain text + визуальные стили поверх маркеров
- `docs/references/projects/ghostwriter.md` — визуальный Markdown (UX) + “distraction free”.
- `docs/references/projects/novelwriter.md` — “минимальная разметка” + метаданные (концепт).
- `docs/references/projects/bibisco.md` — Electron‑паттерны: contenteditable, search/highlight.

### Бэкапы/автосейвы (локально)
- `docs/references/projects/bibisco.md` — авто‑бэкап на события (концепт).
- `docs/references/projects/manuskript.md` — хранение как набор файлов (идея устойчивого формата).

---

## MVP+ (скорее сразу после MVP)

### История версий / snapshots
- `docs/references/projects/plume-creator.md` — “snapshots” как концепт (но там другая архитектура).
- `docs/references/projects/novelwriter.md` — формат проекта дружит с git/синком (идея, не фича).

### Метрики письма (тайминг, скорость, цели)
- `docs/references/projects/bibisco.md` — word/character count и “сервисы” вокруг текста.
- `docs/references/projects/quollwriter.md` — идеи по тренировкам/прогрессу (UX).

---

## Later (когда будем расширять функционал)

### Проекты из множества документов (книга/сцены/заметки)
- `docs/references/projects/novelwriter.md` — сильный референс по проектному формату.
- `docs/references/projects/manuskript.md` — outliner/index cards + экспорт.
- `docs/references/projects/plume-creator.md` — item/folder модель + планы на whiteboard.

### Экспорт (много форматов)
- `docs/references/projects/ghostwriter.md` — экспорт через внешние процессоры (идея пайплайна).
- `docs/references/projects/manuskript.md` — много экспортов (идея UX‑настроек).
- `docs/references/projects/plume-creator.md` — экспорт/печать (но другой стек).

### Майнд‑мэпы / интеллект‑карты
- `docs/references/projects/markmap.md` — Markdown → mindmap (MIT, JS).
- `docs/references/projects/manuskript.md` — есть импортеры mind map (как ориентир).

### Spellcheck / словари (оффлайн)
- `docs/references/projects/typora-dictionaries.md` — готовые словари, но **у каждого свой license**.
- `docs/references/projects/ghostwriter.md` — использует KDE/Qt‑инфраструктуру для spellcheck (как концепт).

---

## “Не наш домен” / низкий приоритет
- `docs/references/projects/caret.md` — это не текстовый редактор, а инструмент из другого домена.

