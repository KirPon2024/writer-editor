# Craftsman vNext — Библия проекта

> Важно: верхний канон управления изменениями и запрет “свободной интерпретации” — в `CANON.md`.

> Это документ‑инструкция, по которой ты сможешь **последовательно** (без опыта и без “уезда в сторону”) переделать текущий Electron‑проект в **Craftsman vNext**: сцены как сущности, rich‑text, спец‑блоки, экспорт (DOCX→PDF→EPUB), embeds (фото/майндмэпы), и позже — коллаб в одной сцене.
>
> Канон работы:
> **ChatGPT пишет ТЗ → ты отдаёшь ТЗ Codex → Codex делает коммит‑готовый PR/дифф → ты проверяешь чек‑лист → мёржишь.**

---

## 0) Что у тебя уже есть (из ZIP) и что мы сохраняем

В архиве `/writer-editor-main` у тебя уже есть:

- **Electron‑оболочка** (`src/main.js`, `preload.js`) — уже умеет:
  - меню, хоткеи, темы, размер шрифта
  - файловые операции через IPC
  - автосейв/бэкапы (есть `backupManager`, `fileManager`)
- **Дизайн и UI‑каркас** (`src/renderer/index.html`, `styles.css`, и логика `editor.js`)
  - спокойный визуал, темы, сайдбар‑дерево, тулбар, статус‑бар
  - UX для сцен/глав (уже есть `chapter-folder`, `scene`, мета‑панель, карточки)
- **Процесс и “память проекта”** (`docs/PROCESS.md`, `docs/CONTEXT.md`, `docs/templates/*`, `scripts/brain.mjs`)
- **Тесты на регрессии** (`test/*`, runner через `node --test`)

### Мы сохраняем (как “золотой слой”)

**Сохраняем дизайн и UX‑геометрию UI**, то есть:

- `src/renderer/index.html` (структуру DOM, классы)
- `src/renderer/styles.css` (переменные, темы, отступы, типографика)
- и общую компоновку: тулбар / дерево слева / редактор справа / статус‑бар.

### Мы меняем (как “двигатель”)

- `contenteditable` редактор → **Tiptap/ProseMirror** (rich‑text + узлы/marks)
- `.txt`‑файлы → **проектный формат v1** (manifest + сцены как отдельные сущности + recovery)
- “мета внутри текста” (`[meta]...`) → **мета отдельно** (чтобы экспорт/коллаб не ломался)
- готовим фундамент под **Yjs** (CRDT) *с самого начала*, чтобы потом коллаб не требовал переписывания.

---

## 1) Инварианты (то, что нельзя ломать)

Эти правила — “конституция”. В каждом ТЗ они повторяются кратко.

### Продуктовые инварианты

- **Desktop‑first, offline‑first**: приложение должно быть полезным без интернета.
- **Один продукт → две оболочки**: Desktop (offline/online) + Web (online/collab) позже.
- **Сцены — отдельные сущности**:
  - редактирование сцен изолировано
  - “цельный текст/flow” — это режим представления, не формат хранения
- **Редактирование ≠ финальная верстка**
  - Draft mode стабильный (курсор/IME не ломается)
  - Page/Print — отдельный pipeline (позже)
- **Данные не заперты**
  - есть recovery‑слепки (читаемые)
  - экспорт в популярные форматы

### Архитектурные инварианты

- **Surface (Tiptap) — это UI‑двигатель ввода**, не “источник истины продукта”
- **Core — документ/сцены/операции/структура**
- **Экспорт — отдельный слой** (core → IR → exporters)
- **Коллаб — поверх операций/CRDT (Yjs), не поверх DOM**
- **Никаких paywall‑зависимостей** (запрет `@tiptap-pro/*` + запрет приватного registry)

### Инварианты дизайна (важно для “оставить дизайн”)

- Не менять структуру `index.html` и базовые классы без отдельного ТЗ.
- Новые стили добавлять **в конце** `styles.css` и только для `.ProseMirror` / новых виджетов.
- Никаких UI‑компонент‑пакетов, которые навязывают внешний вид.

---

## 2) Определение MVP (чётко, чтобы не расползлось)

Ты хочешь крупный продукт. Но один разработчик должен доехать до “можно писать роман”.

### MVP vNext (то, что **обязательно**)

1. **Проект и сцены**
   - дерево: часть → глава → сцены
   - создание/переименование/перемещение/удаление (в “корзину”)
   - сцена открывается быстро, не грузит весь роман
2. **Draft editor (rich‑text)**
   - текст + абзацы + заголовки
   - **символьные стили через `styleId`** (не только bold/italic)
   - undo/redo
   - стабильный ввод
3. **Мета сцен**
   - synopsis, status, tags (POV/линия/место) — как у тебя уже в UI
4. **Flow mode (редактирование в потоке)**
   - единая прокрутка по сценам
   - но технически каждая сцена остаётся отдельным editor instance
5. **Сохранение и восстановление**
   - автосейв (debounce)
   - атомарная запись на диск
   - бэкапы
   - recovery‑слепки (читаемый текст)
6. **Экспорт v1**
   - **DOCX сначала** (абзацы/заголовки/стили/сноски минимально)
   - затем PDF, затем EPUB — но это **после** того, как DOCX стабильный

### Не входит в MVP (жёстко)

- полноценный Page/Print layout “100% книжная типографика”
- коллаб/аккаунты (мы готовим фундамент, но включим позже)
- mind maps (можно как отдельный milestone после MVP)
- “предложения/track changes” (после коллаба)

---

## 3) Технологическое решение (фиксируем, чтобы не метаться)

### Desktop

- Electron остаётся (он уже есть).
- Renderer остаётся HTML/CSS “как сейчас”, но JS будет собран bundler’ом.

### Editor surface

- **Tiptap OSS‑слой** (без Pro) как обёртка над ProseMirror.
- ProseMirror schema/marks/nodes — в нашем контроле.

### CRDT / коллаб‑готовность

- **Yjs**: по одному `Y.Doc` на сцену.
  Даже в оффлайне мы можем хранить сцену как Yjs state, чтобы потом просто добавить provider.

### Сборка renderer (важно из‑за nodeIntegration=false)

Тебе нужен бандлер, иначе Tiptap/Yjs не подключить “скриптиком”.

**Самый спокойный вариант для текущего проекта**: `esbuild` (watch + bundle в файл).
(Можно Vite позже, но сейчас важнее не усложнять Electron‑dev.)

---

## 4) Формат данных v1 (Project Format)

### Почему не .txt

Ты хочешь:

- rich‑text
- сноски/спец‑блоки
- embeds
- коллаб в одной сцене

Это не делается честно на `.txt` без боли. Поэтому внутренний формат будет сложнее, но:

> **обязателен recovery‑слепок** и экспорт в популярные форматы.

### Хранилище проекта (на диске)

Для начала **папка‑проект** (простая отладка, переносимость). Позже добавим “Экспорт/Импорт .craftsman (zip)”.

Пример:

```txt
MyNovel.craftsman/
  manifest.json
  styles.json

  scenes/
    <sceneId>.ydoc        # бинарный Yjs state (snapshot)
    <sceneId>.meta.json   # мета сцены + cards
  recovery/
    <sceneId>.md          # читаемый слепок для спасения

  assets/
    <assetId>.<ext>

  mindmaps/
    <mapId>.json
    exports/
      <mapId>.svg
      <mapId>.png

  trash/
    ... (удалённые сцены/ассеты, по желанию)
  backups/
    ... (автобэкапы)
```

### manifest.json (пример)

```json
{
  "formatVersion": 1,
  "projectId": "prj_01J...",
  "title": "Роман",
  "createdAt": "2026-01-27T10:00:00.000Z",
  "updatedAt": "2026-01-27T10:00:00.000Z",

  "tree": {
    "rootId": "root",
    "nodes": [
      { "id": "root", "type": "root", "children": ["part_1"] },
      { "id": "part_1", "type": "part", "title": "Часть I", "children": ["ch_1"] },
      { "id": "ch_1", "type": "chapter", "title": "Глава 1", "children": ["sc_1", "sc_2"] },
      { "id": "sc_1", "type": "scene", "title": "Сцена 1", "sceneId": "scn_01J..." },
      { "id": "sc_2", "type": "scene", "title": "Сцена 2", "sceneId": "scn_01J..." }
    ]
  }
}
```

### styles.json (пример)

```json
{
  "version": 1,
  "charStyles": [
    {
      "id": "normal",
      "name": "Обычный",
      "draftCss": { "fontStyle": "normal", "fontWeight": 400 },
      "docx": { "italics": false, "bold": false }
    },
    {
      "id": "emphasisThin",
      "name": "Тонкий курсив",
      "draftCss": { "fontStyle": "italic", "fontWeight": 300 },
      "docx": { "italics": true, "bold": false }
    },
    {
      "id": "strong",
      "name": "Сильное выделение",
      "draftCss": { "fontStyle": "normal", "fontWeight": 700 },
      "docx": { "italics": false, "bold": true }
    }
  ]
}
```

> Важно: в Draft мы можем отрисовать `fontWeight:300`, а в DOCX “тонкий” может быть ограничен возможностями Word/шрифта — но `styleId` останется семантикой, и ты сможешь маппить как угодно.

---

## 5) Rich‑Doc v1 (структура сцены)

### Цель

- Внутри сцены хранится **структура**, пригодная для:
  - стабильного редактирования
  - экспорта (DOCX)
  - коллаба
  - якорей комментариев

### Минимальная схема узлов (Tiptap/ProseMirror)

- `doc`
- `paragraph`
- `heading` (level 1..3)
- `text`
- `sceneBreak` (блок)
- `imageEmbed` (блок, атомарный)
- `mindmapEmbed` (блок, атомарный)
- `footnoteRef` (inline, атомарный)

### Marks

- `charStyle` (attr: `styleId`)
- `link` (опционально)

---

## 6) Коллаб‑готовность (без коллаба в MVP)

### Решение

- **каждая сцена = отдельный `Y.Doc`**
- Tiptap подключается через Collaboration extension к `Y.XmlFragment`

В MVP:

- provider **не подключаем**
- сохраняем `Y.Doc` на диск
- якоря (комментарии позже) проектируем через RelativePosition

---

## 7) Экспорт‑pipeline (DOCX сначала)

### Принцип

Draft editor не обязан быть “идеальным для печати”.
Экспорт делает “компиляцию”:

```txt
manifest + scenes (Yjs) -> ProseMirror JSON -> IR -> DOCX exporter
```

### IR (Intermediary Representation) — минимально

IR нужен, чтобы:

- exporter не зависел от ProseMirror напрямую
- типографику можно было улучшать не трогая ввод

Пример IR‑элементов:

- Paragraph { runs[] }
- Run { text, styleId }
- Heading { level, runs[] }
- Footnote { id, blocks[] }
- Embed { type, assetId/mapId, caption?, layout? }

---

## 8) Anti‑paywall политика (обязательная)

### Запрещено

- `@tiptap-pro/*`
- любой `.npmrc` / registry на `registry.tiptap.dev`
- токены Pro (например `TIPTAP_PRO_TOKEN`)

### Обязательный CI‑гейт

Добавь скрипт (и он должен быть **первой задачей в плане**):

`scripts/check-no-paid-tiptap.mjs`

```js
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IGNORE = new Set(['node_modules', '.git', 'dist', 'out', 'build']);

const BLOCKED_PREFIXES = ['@tiptap-pro/', '@tiptap-cloud/'];
const BLOCKED_STRINGS = ['registry.tiptap.dev', 'TIPTAP_PRO_TOKEN'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (IGNORE.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

function fail(msg) {
  console.error('\n❌ OSS policy violation:\n' + msg + '\n');
  process.exit(1);
}

function scanText(file, txt) {
  for (const s of BLOCKED_STRINGS) if (txt.includes(s)) fail(`Found "${s}" in ${file}`);
  for (const p of BLOCKED_PREFIXES) if (txt.includes(p)) fail(`Found "${p}" in ${file}`);
}

function scanPackageJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  scanText(file, raw);
  const json = JSON.parse(raw);

  const buckets = ['dependencies','devDependencies','optionalDependencies','peerDependencies'];
  for (const b of buckets) {
    const deps = json[b] || {};
    for (const name of Object.keys(deps)) {
      if (BLOCKED_PREFIXES.some(p => name.startsWith(p))) {
        fail(`Forbidden dep ${name} in ${file}`);
      }
    }
  }
}

const files = walk(ROOT);
for (const f of files.filter(f => path.basename(f) === 'package.json')) scanPackageJson(f);

for (const f of files.filter(f => ['pnpm-lock.yaml','package-lock.json','yarn.lock','.npmrc','.yarnrc.yml'].includes(path.basename(f)))) {
  scanText(f, fs.readFileSync(f, 'utf8'));
}

console.log('✅ OSS policy OK: no Tiptap Pro / no private registry');
```

И в CI:

- чек перед install
- чек после install (по lockfile)

---

## 9) Процесс работы “ChatGPT → Codex” (как не уехать в хаос)

У тебя уже есть `docs/PROCESS.md` и шаблоны. Мы просто **усиливаем дисциплину** под большой рефактор.

### Роли

- **ChatGPT**: пишет ТЗ, разбивает на этапы, фиксирует инварианты и DoD.
- **Codex**: реализует строго по ТЗ в рамках “diff budget”.
- **Ты**: запускаешь тесты, смотришь UI, мёржишь.

### Правило №1: “Одна задача — один вертикальный срез”

Никаких “заодно”.

### Правило №2: “Сначала тест или проверка, потом код”

Минимум:

- unit tests (node --test) для core/persistence
- ручной UI‑чеклист для editor UX

### Правило №3: “Diff budget”

Каждое ТЗ должно содержать:

- какие файлы можно менять
- какие нельзя
- сколько новых файлов максимум
- запрет “рефакторинга ради красоты”

### Правило №4: “Гейт на этап”

Переходим к следующему milestone только если:

- все тесты зелёные
- recovery работает
- проект открывается и сохраняется
- в `docs/WORKLOG.md` добавлен пункт “что сделали”

---

## 10) Как брифовать Codex (шаблон ТЗ)

Сохрани это как `docs/templates/CODEX_TASK.md` (или просто копируй в задачах).

```md
# ТЗ: <короткий заголовок>

## Контекст
- Репо: craftsman (Electron)
- Цель: <1 предложение>
- Инварианты: (список 3–7 пунктов, обязательно)

## Ограничения
- Разрешённые файлы для изменения:
  - ...
- Запрещено менять:
  - ...
- Diff budget:
  - не более N файлов, не более ~X строк вне нужного места
- Новые зависимости:
  - запрещены (или перечислить разрешённые)

## Что сделать (детерминированно)
1) ...
2) ...
3) ...

## Acceptance criteria (Definition of Done)
- [ ] ...
- [ ] ...

## Тесты/проверки
- Авто:
  - `npm test`
  - + что добавить/обновить в test/*
- Ручные:
  - шаги 1..5 что кликнуть/проверить

## Примечания
- Нельзя трогать дизайн (index.html, styles.css) кроме добавления минимальных `.ProseMirror` правил.
```

---

## 11) Дорожная карта (Milestones → задачи)

Ниже — **последовательность**, которая минимизирует “сломать всё сразу”.
Каждый milestone — это 2–6 небольших задач для Codex.

---

# Milestone 0 — “Заморозить новую реальность” (документы + гейты)

### Цель

Перед кодом мы фиксируем: формат, rich‑doc, зависимости, гейты.

### Задачи

**M0.1 — Обновить `docs/CONTEXT.md` под vNext**

- Убрать “формат .txt — MVP” и заменить на:
  - проект‑папка с manifest/styles/scenes
  - rich‑text + styleId
  - DOCX экспорт первый
  - Yjs фундамент

**M0.2 — Обновить `agents.md`**

- Новые ограничения:
  - запрет Tiptap Pro
  - запрет сетевых запросов в MVP
  - запрет изменения дизайна без ТЗ
  - обязательный recovery

**M0.3 — Добавить OSS‑guard (скрипт + CI)**

- `scripts/check-no-paid-tiptap.mjs`
- workflow в `.github/workflows/oss-policy.yml`

**M0.4 — Добавить “BIBLE.md” в repo**

- этот документ как `docs/BIBLE.md`

### DoD milestone 0

- CI падает, если кто‑то добавил `@tiptap-pro/*`
- есть актуальный CONTEXT и agents.md
- есть `docs/BIBLE.md`

---

# Milestone 1 — Сборка renderer (чтобы можно было подключить Tiptap)

## Почему это отдельно

Сейчас renderer — “голый JS”. Tiptap/Yjs так не подключаются из‑за `nodeIntegration:false`.

### Решение

Подключаем **esbuild** и собираем `src/renderer/editor.bundle.js`.

### Задачи

**M1.1 — Добавить esbuild сборку**

- Добавить devDependency: `esbuild`
- Добавить скрипты:
  - `build:renderer` (bundle)
  - `build:renderer:watch`
- Источник: новый файл `src/renderer/app/index.ts` (или `.js`)
- Выход: `src/renderer/editor.bundle.js`
- В `index.html` заменить подключение `editor.js` → `editor.bundle.js`
- На этом этапе функциональность редактора может остаться прежней (контент editable), цель — только инфраструктура.

**M1.2 — Dev режим**

- `npm run dev` должен:
  - запустить сборку renderer (watch)
  - запустить electron `--dev`

(Можно через `concurrently`, или два процесса — как тебе проще. В MVP допускается “два терминала”, если хочешь меньше зависимостей.)

### DoD milestone 1

- Приложение запускается
- UI выглядит так же
- Логика работает как раньше
- В репо появилась сборка renderer

---

# Milestone 2 — Встроить Tiptap вместо contenteditable (без смены формата хранения)

### Цель

Сделать первый “живой” rich‑text ввод, но пока можно сохранять как plain text (временный мост).

### Задачи

**M2.1 — Минимальный Tiptap editor**

- Поднять Tiptap на `#editor`
- Extensions минимум:
  - doc/paragraph/text
  - history (undo/redo)
  - bold/italic (как тест)
- Убедиться: курсор/IME стабильны

**M2.2 — Bridge “plain text ↔ tiptap” (временно)**

- При `editor:set-text` → конвертировать текст в doc:
  - пустые строки = новый paragraph
- При save/autosave → конвертировать doc в plain text
- **Важно:** это временно, чтобы не переписать всё сразу.

### DoD milestone 2

- Печать в редакторе работает
- Undo/redo работает
- Открытие/сохранение (пока как текст) не сломаны
- UI/дизайн не изменились (кроме CSS для `.ProseMirror`)

---

# Milestone 3 — Новый формат проекта v1 (manifest + scenes + recovery)

Теперь мы меняем “сердце”: сцены как сущности и новый формат.

### Цель

Перейти от “файлов/папок” к **manifest‑управляемому проекту** и сценам.

### Задачи

**M3.1 — `core/project` (без UI)**

- В `src/core/` (или `src/domain/`) создать модуль:
  - createProject(rootPath, title)
  - loadProject(rootPath)
  - saveManifest(rootPath, manifest)
  - id генератор (`crypto.randomUUID()`)
- Добавить tests: roundtrip manifest

**M3.2 — Scene storage (файлы сцены)**

- Сцена хранится как:
  - `scenes/<sceneId>.json` (пока) или `.ydoc` (если готов Yjs)
  - `scenes/<sceneId>.meta.json`
  - `recovery/<sceneId>.md`
- Добавить атомарную запись через существующий `fileManager.writeFileAtomic`

**M3.3 — IPC API “project v1”**

- Добавить новые IPC методы (или переиспользовать старые):
  - `ui:open-project`
  - `ui:create-project`
  - `ui:get-tree` (из manifest)
  - `ui:open-scene`
  - `ui:save-scene`
- На этом шаге UI дерева можно оставить прежним, но источник данных — manifest.

### DoD milestone 3

- Создаётся проект‑папка `.craftsman/`
- Дерево строится из manifest
- Сцена открывается и сохраняется
- recovery файл создаётся

---

# Milestone 4 — Yjs per scene (CRDT‑хранение с самого начала)

### Цель

Сцена хранится как `Y.Doc`, даже оффлайн.

### Задачи

**M4.1 — Включить Yjs хранение**

- Добавить зависимости: `yjs`, `y-prosemirror` (если нужно), tiptap collab binding
- Для каждой сцены:
  - при открытии: читаем бинарь, `Y.applyUpdate`
  - при сохранении: `Y.encodeStateAsUpdate`
- Формат файла: `scenes/<sceneId>.ydoc` (binary)

**M4.2 — Tiptap ↔ Yjs bind (offline)**

- Использовать `@tiptap/extension-collaboration` с локальным `Y.Doc`
- Undo/redo через yjs UndoManager (что даёт совместимость с будущим коллабом)

**M4.3 — Recovery exporter**

- Из ProseMirror doc извлекать plain text/markdown и писать `recovery/<sceneId>.md`

### DoD milestone 4

- Оффлайн редактирование идёт через Yjs
- Сцена после перезапуска восстанавливается идеально
- recovery создаётся и обновляется

---

# Milestone 5 — Character Styles через `styleId`

### Цель

Твой “тонкий курсив” и любые стили должны быть нормой.

### Задачи

**M5.1 — Mark `charStyle(styleId)`**

- Создать кастомный mark:
  - attrs: `{ styleId: string }`
  - команда: `setCharStyle(styleId)`
- UI: пока можно сделать простые кнопки/меню без финального дизайна (но в твоих визуальных рамках)

**M5.2 — styles.json + применение в Draft**

- Прочитать styles.json проекта
- В Draft применить `draftCss` через CSS classes:
  - например `.cs--emphasisThin { font-style: italic; font-weight: 300; }`
- Маппинг: mark styleId → className

### DoD milestone 5

- Можно выделить текст и назначить `styleId`
- Стиль видно в Draft
- Сохраняется/загружается корректно

---

# Milestone 6 — Спец‑блоки + сноски (минимум)

### Цель

Подготовить DOCX экспорт и реальную “писательскую” структуру.

### Задачи

**M6.1 — Узлы**

- `heading` (level)
- `sceneBreak` (аналог HR, но семантический)
- `footnoteRef` (inline atom) с `footnoteId`

**M6.2 — Footnotes storage**

- В `scenes/<sceneId>.meta.json` хранить:
  - `footnotes: { [footnoteId]: { content: ProseMirrorJSON | plainText } }`
- UI: панель списка сносок + редактор сноски (можно простой)

### DoD milestone 6

- Сноски вставляются
- Редактируются отдельно
- Сохраняются и не ломают текст

---

# Milestone 7 — Flow mode (редактирование “в потоке” без мега‑дока)

### Цель

Один скролл, но сцены изолированы.

### Решение

- Каждая сцена = отдельный Tiptap instance
- UI склеивает их в один поток

### Задачи

**M7.1 — Flow view (read)**

- Отрисовать подряд сцены в контейнере
- Прокрутка единая
- Клик в сцену фокусирует её

**M7.2 — Flow edit**

- Переход курсора между сценами:
  - стрелка вниз в конце → фокус следующей
  - backspace в начале → фокус предыдущей
- Copy/paste между сценами: сначала можно “вставка как plain text” (потом улучшить)

**M7.3 — Виртуализация (если нужно)**

- Если сцен много — рендерить только видимые

### DoD milestone 7

- Можно редактировать роман “как один текст”
- Сцены остаются отдельными файлами

---

# Milestone 8 — Экспорт DOCX v1 (первый “настоящий” вывод)

### Цель

Сделать экспорт пригодным для Word/Google Docs.

### Задачи

**M8.1 — IR + exporter каркас**

- Core → IR
- IR → DOCX (через выбранную библиотеку)
- Минимум:
  - параграфы
  - заголовки
  - `charStyle` маппинг
  - сноски (минимально корректно)
  - sceneBreak (как пустая строка или разделитель)

**M8.2 — Golden tests**

- Snapshot‑подход:
  - один “эталонный” документ сцен
  - экспорт → файл
  - проверка ключевых маркеров (не обязательно бинарный diff)

### DoD milestone 8

- DOCX открывается без ошибок
- Стили предсказуемы
- Сноски на месте

---

# Milestone 9 — Фото embeds v1

### Цель

Фото видны в тексте и экспортируются.

### Задачи

- `imageEmbed` node:
  - attrs: assetId, mode (reference/layout), caption?, width?
- импорт файла → копирование в `assets/`
- в Draft: карточка изображения
- в DOCX: вставка изображения (без обтекания в v1)

### DoD milestone 9

- фото вставляется и видно
- сохраняется
- попадает в DOCX

---

# Milestone 10 — Mind maps v1 (после MVP)

### Цель

Разные типы карт + экспорт SVG/PNG.

### Задачи

- `mindmapEmbed` node с mapId
- редактор карт (отдельный модуль/окно)
- экспорт:
  - SVG = “истина”
  - PNG = растр из SVG

---

# Milestone 11 — PDF/Print (после DOCX)

### Цель

“Достаточно красиво”, потом улучшения.

### Решение v1

- HTML/CSS представление → Chromium printToPDF (через Electron)

---

# Milestone 12 — Коллаб v1 (самый поздний, но без переписываний)

### Условия входа

- Yjs хранение стабильно
- anchors готовы (RelativePosition)
- сцены изолированы

### Состав

- realtime редактирование одной сцены
- presence (курсоры)
- комментарии с anchored positions
- без track changes (позже)

---

## 12) Первый пакет ТЗ, который ты можешь сразу отдавать Codex

Ниже — прям “очередь №1” (в правильном порядке). Это то, что даст тебе контролируемый рефактор без потери дизайна.

1. **ТЗ‑001: OSS‑guard (скрипт + CI)**
2. **ТЗ‑002: docs/BIBLE.md + обновить CONTEXT + agents.md**
3. **ТЗ‑003: esbuild bundling renderer, заменить editor.js → editor.bundle.js**
4. **ТЗ‑004: подключить Tiptap минимально (bold/italic/undo)**
5. **ТЗ‑005: временный мост text↔tiptap (чтобы не сломать open/save)**
6. **ТЗ‑006: core/project + manifest.json (без UI) + тесты**
7. **ТЗ‑007: tree из manifest (вместо fs‑дерева)**
8. **ТЗ‑008: scene storage + recovery**
9. **ТЗ‑009: Yjs per scene + Tiptap collaboration offline**
10. **ТЗ‑010: charStyle(styleId) + styles.json**

---

## 13) Мини‑правила “чтобы не сойти с ума”

- Любая большая цель режется до задачи, которую Codex может сделать **за один дифф**.
- Если в задаче появляются слова “и ещё” — это уже две задачи.
- Пока не сделан Milestone 4 (Yjs), **не начинай** комменты/коллаб — иначе перепишешь.
- Пока не сделан Milestone 8 (DOCX), не делай PDF/EPUB — иначе экспорт расползётся.
- Дизайн сохраняется по умолчанию. Любое изменение UI — только по отдельному ТЗ.

---

## 14) Где хранить код/релизы/инфру (коротко, без лишнего)

- **Код**: GitHub (публичный репо) — норм навсегда.
- **Сборки**: GitHub Releases.
- **Сервер** нужен только для коллаба, и его можно сделать *self-hosted first*, чтобы у тебя не было постоянных расходов.

---

## 15) Что делать прямо сейчас (следующий шаг)

Сделай так:

1. Скопируй этот документ в репо как `docs/BIBLE.md`.
2. Создай задачу через brain:
   - `npm run brain:new-task -- "OSS guard: запретить Tiptap Pro"`
3. Отдай этот файл‑ТЗ Codex по шаблону из раздела 10.

---

## Политики vNext (финальный пакет)

## DOCX v1
- Одна JS-библиотека
- Без CLI / бинарей
- Поддержка:
  - runs
  - headings
  - footnotes
  - images

DOCX v1 — формат импорта/экспорта (import/export adapter).
DOCX НЕ влияет на внутреннюю модель документа.
DOCX — адаптер представления, а не источник архитектурных решений.

---

# 10. SECURITY_POLICY

## Electron
- CSP обязателен
- navigation blocked
- new-window blocked
- no remote code

## IPC
- allowlist каналов
- payload validation
- запрет путей/команд

---

# 11. DEPENDENCY_POLICY

## Allowlist (MVP)
- esbuild
- @tiptap/* (OSS)
- yjs
- DOCX lib (одна)

## Forbidden
- @tiptap-pro/*
- UI frameworks
- state managers

## CI
- npm audit
- OSS-guard

---

# 12. YJS FALLBACK

Если `.ydoc` повреждён:
- сцена read-only
- показывается recovery.md
- возможна пересборка сцены

---

# 13. PERFORMANCE POLICY

## KPI (уточняются позже)
- Scene open < X ms
- Memory < Y MB
- Flow mode virtualized

---

# 14. CODEX_CHECKLIST (ОБЯЗАТЕЛЬНО)

- Stage корректен
- Активные правила соблюдены
- UI не изменён
- Новых зависимостей нет
- Paste policy соблюдена
- Atomic write используется
- Recovery создаётся
- Тесты проходят
- Diff-budget соблюдён

---

# 15. ARCH_DIFF_LOG (ИСКЛЮЧЕНИЯ)

Любое исключение:
- фиксируется
- имеет причину
- имеет rollback
- временное

Исключение без записи = ошибка.

---

# 16. ОБЩИЙ DEFINITION OF DONE

- Проект открывается без ошибок
- Данные переживают рестарт
- Recovery читаем
- Нет сетевых запросов (MVP)
- Канон соблюдён

---

# 17. ФИНАЛЬНЫЙ СТАТУС

- Архитектура: зафиксирована
- Безопасность: встроена
- Процесс: детерминирован
- Масштабирование: возможно
- Свобода интерпретации: отсутствует

---

## ИТОГ

**Это не описание проекта.  
Это операционная система проекта.**

Любая дальнейшая работа:
- ссылается на этот канон
- проверяется этим каноном
- не выходит за его рамки
