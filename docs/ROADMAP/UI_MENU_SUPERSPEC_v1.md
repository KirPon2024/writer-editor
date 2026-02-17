# UI Menu SuperSpec v1 (Craftsman)

`researchOnly: true`  
`implementationBinding: false`  
`canonClass: ADVISORY_NORTH_STAR`  
`createdAt: 2026-02-17`

## Policy Notes (Research-Only)
Этот документ фиксирует целевую продуктовую спецификацию меню и UI‑поверхностей.

- Не является прямым обязательством на разработку.
- Не заменяет `CANON.md`, `docs/corex/COREX.v1.md`, `docs/BIBLE.md`.
- Любое внедрение в код: только отдельным execution‑тикетом.
- При конфликте приоритет у канона проекта.

## 0) Input Sources (fact basis)
- `/Volumes/Work/Драфт писательской программы/writer-editor/CANON.md`
- `/Volumes/Work/Драфт писательской программы/writer-editor/docs/corex/COREX.v1.md`
- `/Volumes/Work/Драфт писательской программы/writer-editor/docs/BIBLE.md`
- `/Volumes/Work/Драфт писательской программы/writer-editor/src/menu/menu-config.v1.json`
- `/Volumes/Work/Технический писатель/craftsman/меню, команды /app_snapshots_2026-02-14.zip`
- `/Volumes/Work/Технический писатель/craftsman/меню, команды /craft-lesson-plan-slideshow_snapshot_2026-02-14.zip`
- `/Volumes/Work/Технический писатель/craftsman/меню, команды /catalog_matrix_2026-02-14.csv`
- `/Volumes/Work/Технический писатель/craftsman/меню, команды /voice_links_2026-02-14(1).csv`

Research signals used:
- Typora: `commands=191`, `shortcuts=62`, `settings=25`
- Google Docs: `commands=51`, `shortcuts=19`, `settings=10`
- XMind: `commands=43`, `shortcuts=25`, `settings=9`
- Craft lesson-plan snapshot: `commands=225`, `shortcuts=131`, `settings=24`
- Voice dataset: `97` links, основные боли: offline/sync, stability, performance, export portability, pricing/paywall.

## 1) Canon Alignment (must not violate)
1. Desktop-first, offline-first (MVP): никакой обязательной сети.
2. Scene = atomic unit: все действия редактора и планирования привязаны к сценам.
3. UI не источник истины: все действия идут через command bus (`cmd.*`).
4. Recovery и atomic write: в меню есть явные операции backup/restore/recovery.
5. DOCX-first export baseline: DOCX всегда в первом контуре экспорта.
6. Security: никаких команд, ведущих к remote code / unsafe navigation.
7. Stage-gated expansion: network-collab, cloud AI, executable plugins скрыты/disabled до разрешённой стадии.

## 2) Product Shell (full interaction map)

### 2.1 Launch Screen
Блоки:
- Quick Actions: `Создать проект`, `Открыть проект`, `Недавние`, `Восстановить`.
- Recent Projects list: название, путь, дата, статус (clean/dirty/recovery available).
- Recovery Alerts: найденные recovery snapshots и быстрые действия.
- Templates strip: пустой проект, роман, сценарий, non-fiction.
- Diagnostics footer: версия, профиль запуска, путь данных.

### 2.2 Main Workspace
Обязательные зоны:
- Top: Menubar + adaptive toolbar.
- Left: Sidebar (navigation + structure + search facets).
- Center: Editor surface (Scene/Draft/Flow).
- Right: Inspector (scene meta, cards, review, plan details).
- Bottom: Status rail (save state, mode, diagnostics, zoom, word stats).

### 2.3 Overlays (global)
- Command Palette.
- Quick Open (scene/file/entity jump).
- Global Search (project scope, cross-scene filters).
- Go To (line/scene/chapter/entity/comment).
- Diagnostics & Recovery panel.
- Export Wizard.
- Conflict Resolver (local-first).

## 3) Modes and Profiles

### 3.1 Modes (UI behavior, not data model)
- `Write`: минимум шума, быстрый ввод, структура проекта всегда доступна.
- `Plan`: entity graph, timeline, scene cards, continuity checks.
- `Review`: comments, changes, compare, acceptance flow.

### 3.2 Profiles
- `Minimal`: только ядро письма/сохранения/поиска/экспорта DOCX.
- `Pro`: + планирование, review-lite, расширенные фильтры.
- `Guru`: + полная настройка layout/hotkeys/panels/diagnostics.

### 3.3 Availability rules
- Любая команда имеет `enabledWhen`.
- Если команда stage-gated, UI показывает disabled с причиной.
- В `Minimal` сложные панели не удаляются физически, а скрываются в UI.

## 4) Menu Architecture (master)

### 4.1 File
Groups and commands:

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Project | New Project | `cmd.file.project.new` | `Cmd/Ctrl+Shift+N` | Создать проект-папку v1 |
| Project | Open Project | `cmd.file.project.open` | `Cmd/Ctrl+O` | Открыть проект |
| Project | Open Recent | `cmd.file.project.openRecent` |  | Список + pin/unpin |
| Project | Close Project | `cmd.file.project.close` | `Cmd/Ctrl+Shift+W` | Закрыть без выхода |
| Project | Project Settings | `cmd.file.project.settings` | `Cmd/Ctrl+,` | Параметры проекта |
| Scene | New Scene | `cmd.file.scene.new` | `Cmd/Ctrl+Alt+N` | В текущем разделе |
| Scene | Duplicate Scene | `cmd.file.scene.duplicate` | `Cmd/Ctrl+Shift+D` | Без потери meta |
| Scene | Move Scene | `cmd.file.scene.move` |  | Между главами/частями |
| Scene | Archive Scene | `cmd.file.scene.archive` |  | В trash |
| Save | Save | `cmd.file.save` | `Cmd/Ctrl+S` | Сцена/проект (dirty-aware) |
| Save | Save All | `cmd.file.saveAll` | `Cmd/Ctrl+Alt+S` | Все dirty entities |
| Save | Save As Snapshot | `cmd.file.saveSnapshot` |  | Ручной snapshot |
| Recovery | Backup Now | `cmd.file.backup.now` |  | Немедленный backup |
| Recovery | Open Backup Folder | `cmd.file.backup.openFolder` |  | Локальная папка |
| Recovery | Restore Project | `cmd.file.recovery.restore` |  | Диалог выбора snapshot |
| Recovery | Recovery Report | `cmd.file.recovery.report` |  | Последняя проверка восстановления |
| Import | Import TXT/MD | `cmd.file.import.text` |  | Scene mapping wizard |
| Import | Import DOCX | `cmd.file.import.docx` |  | Stage-gated parser quality |
| Import | Import Structured JSON | `cmd.file.import.json` |  | Для миграций/bridges |
| Export | Export DOCX (Baseline) | `cmd.file.export.docx` | `Cmd/Ctrl+Shift+E` | Всегда доступно в MVP |
| Export | Export PDF | `cmd.file.export.pdf` |  | После DOCX pipeline |
| Export | Export EPUB | `cmd.file.export.epub` |  | Stage-gated |
| Export | Export Markdown Bundle | `cmd.file.export.mdBundle` |  | Сцены + assets |
| Export | Export Preview | `cmd.file.export.preview` |  | Diff-risk meter |
| Window/App | New Window | `cmd.file.window.new` | `Cmd/Ctrl+Shift+M` | Доп. рабочее окно |
| Window/App | Quit | `cmd.file.app.quit` | `Cmd/Ctrl+Q` | Graceful shutdown |

### 4.2 Edit

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| History | Undo | `cmd.edit.undo` | `Cmd/Ctrl+Z` | Scene-local timeline |
| History | Redo | `cmd.edit.redo` | `Cmd/Ctrl+Shift+Z` |  |
| History | Undo History Panel | `cmd.edit.history.open` | `Alt+Cmd/Ctrl+Z` | Визуальный стек |
| Clipboard | Cut | `cmd.edit.cut` | `Cmd/Ctrl+X` |  |
| Clipboard | Copy | `cmd.edit.copy` | `Cmd/Ctrl+C` |  |
| Clipboard | Paste | `cmd.edit.paste` | `Cmd/Ctrl+V` |  |
| Clipboard | Paste as Plain Text | `cmd.edit.pastePlain` | `Cmd/Ctrl+Shift+V` | Paste policy |
| Selection | Select All | `cmd.edit.selectAll` | `Cmd/Ctrl+A` |  |
| Selection | Expand Selection | `cmd.edit.select.expand` | `Alt+Shift+Right` | Semantic expansion |
| Selection | Shrink Selection | `cmd.edit.select.shrink` | `Alt+Shift+Left` |  |
| Find | Find | `cmd.edit.find` | `Cmd/Ctrl+F` | Scene scope |
| Find | Replace | `cmd.edit.replace` | `Cmd/Ctrl+H` | Scene scope |
| Find | Find in Project | `cmd.edit.findProject` | `Cmd/Ctrl+Shift+F` | Global |
| Find | Find Next/Prev | `cmd.edit.find.next`,`cmd.edit.find.prev` | `Enter` / `Shift+Enter` | In find mode |

### 4.3 View

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Layout | Toggle Sidebar | `cmd.view.sidebar.toggle` | `Cmd/Ctrl+\` |  |
| Layout | Toggle Inspector | `cmd.view.inspector.toggle` | `Cmd/Ctrl+.` |  |
| Layout | Toggle Status Rail | `cmd.view.status.toggle` |  |  |
| Layout | Focus Mode | `cmd.view.focus` | `F9` | Только editor |
| Layout | Typewriter Mode | `cmd.view.typewriter` | `F10` | Active line lock |
| Layout | Fullscreen | `cmd.view.fullscreen` | `F11` |  |
| Navigation | Outline Panel | `cmd.view.panel.outline` | `Cmd/Ctrl+1` | Left tab |
| Navigation | Scenes Panel | `cmd.view.panel.scenes` | `Cmd/Ctrl+2` | Left tab |
| Navigation | Entities Panel | `cmd.view.panel.entities` | `Cmd/Ctrl+3` | Left tab |
| Navigation | Review Panel | `cmd.view.panel.review` | `Cmd/Ctrl+4` | Right tab |
| Scale | Zoom In | `cmd.view.zoom.in` | `Cmd/Ctrl+=` |  |
| Scale | Zoom Out | `cmd.view.zoom.out` | `Cmd/Ctrl+-` |  |
| Scale | Zoom Reset | `cmd.view.zoom.reset` | `Cmd/Ctrl+0` | 100% |
| Theme | Theme Light | `cmd.view.theme.light` |  |  |
| Theme | Theme Dark | `cmd.view.theme.dark` |  |  |
| Theme | Theme Auto | `cmd.view.theme.auto` |  | OS sync |

### 4.4 Insert

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Structure | Insert Scene Break | `cmd.insert.sceneBreak` | `Cmd/Ctrl+Enter` | Scene semantic marker |
| Structure | Insert Chapter Marker | `cmd.insert.chapterMarker` |  |  |
| Writing | Insert Comment Anchor | `cmd.insert.commentAnchor` | `Cmd/Ctrl+Alt+M` | Review |
| Writing | Insert Footnote | `cmd.insert.footnote` | `Cmd/Ctrl+Alt+F` |  |
| Writing | Insert Link | `cmd.insert.link` | `Cmd/Ctrl+K` |  |
| Writing | Insert Reference | `cmd.insert.reference` |  | Entity reference |
| Media | Insert Image | `cmd.insert.image` |  | Local file only in MVP |
| Media | Insert Table | `cmd.insert.table` |  |  |
| Media | Insert Separator | `cmd.insert.separator` |  |  |
| Metadata | Insert Tag | `cmd.insert.tag` |  | POV/line/place |
| Metadata | Insert Card | `cmd.insert.card` |  | Scene cards |

### 4.5 Format

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Paragraph | Paragraph | `cmd.format.paragraph` | `Cmd/Ctrl+Alt+0` |  |
| Paragraph | Heading 1..3 | `cmd.format.h1`,`cmd.format.h2`,`cmd.format.h3` | `Cmd/Ctrl+Alt+1..3` |  |
| Inline | Bold | `cmd.format.bold` | `Cmd/Ctrl+B` |  |
| Inline | Italic | `cmd.format.italic` | `Cmd/Ctrl+I` |  |
| Inline | Underline | `cmd.format.underline` | `Cmd/Ctrl+U` |  |
| Inline | Inline Code | `cmd.format.inlineCode` | ``Cmd/Ctrl+` `` |  |
| Lists | Bullet List | `cmd.format.list.bullet` | `Cmd/Ctrl+Shift+8` |  |
| Lists | Numbered List | `cmd.format.list.numbered` | `Cmd/Ctrl+Shift+7` |  |
| Lists | Checklist | `cmd.format.list.check` |  |  |
| Alignment | Left/Center/Right/Justify | `cmd.format.align.*` | `Cmd/Ctrl+Shift+L/E/R/J` |  |
| Typography | Clear Formatting | `cmd.format.clear` | `Cmd/Ctrl+\` |  |
| Typography | Character Style | `cmd.format.charStyle.set` |  | styleId binding |
| Typography | Line Height | `cmd.format.lineHeight` |  |  |

### 4.6 Plan

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Entities | Characters | `cmd.plan.characters.open` | `Alt+1` |  |
| Entities | Places | `cmd.plan.places.open` | `Alt+2` |  |
| Entities | Threads | `cmd.plan.threads.open` | `Alt+3` |  |
| Timeline | Timeline Board | `cmd.plan.timeline.open` | `Alt+4` |  |
| Timeline | Add Event | `cmd.plan.timeline.event.add` |  |  |
| Scene Design | Scene Cards | `cmd.plan.cards.open` | `Alt+5` |  |
| Scene Design | Continuity Check | `cmd.plan.continuity.run` |  | report only |
| Visual | Mind Map | `cmd.plan.mindmap.open` | `Alt+6` | Stage-gated in MVP |
| Visual | Plot Graph | `cmd.plan.plotGraph.open` |  | Stage-gated |

### 4.7 Review

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Comments | Add Comment | `cmd.review.comment.add` | `Cmd/Ctrl+Alt+M` |  |
| Comments | Resolve Comment | `cmd.review.comment.resolve` | `Cmd/Ctrl+Alt+R` |  |
| Comments | Reopen Comment | `cmd.review.comment.reopen` |  |  |
| Changes | Toggle Track Changes | `cmd.review.track.toggle` | `Cmd/Ctrl+Shift+T` | Stage-gated |
| Changes | Accept Change | `cmd.review.change.accept` | `Cmd/Ctrl+Alt+]` |  |
| Changes | Reject Change | `cmd.review.change.reject` | `Cmd/Ctrl+Alt+[` |  |
| Compare | Compare Scene Versions | `cmd.review.compare.scene` |  |  |
| Compare | Compare Project Snapshots | `cmd.review.compare.project` |  |  |
| History | Open Version History | `cmd.review.history.open` | `Cmd/Ctrl+Alt+H` |  |
| Export | Export Review Report | `cmd.review.export.report` |  |  |

### 4.8 Tools

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Writing Metrics | Word Count | `cmd.tools.metrics.wordCount` | `Cmd/Ctrl+Shift+W` |  |
| Writing Metrics | Writing Goals | `cmd.tools.metrics.goals` |  |  |
| Language | Spellcheck | `cmd.tools.language.spellcheck` | `F7` | local-first |
| Language | Style Check | `cmd.tools.language.stylecheck` |  | local-first |
| Reliability | Conflict Resolver | `cmd.tools.conflicts.open` |  | local-only in MVP |
| Reliability | Diagnostics | `cmd.tools.diagnostics.open` | `Cmd/Ctrl+Shift+D` |  |
| Reliability | Recovery Drill | `cmd.tools.recovery.drill` |  | smoke test |
| Productivity | Command Palette | `cmd.tools.palette.open` | `Cmd/Ctrl+Shift+P` |  |
| Productivity | Quick Open | `cmd.tools.quickOpen` | `Cmd/Ctrl+P` | scene/entity jump |
| Automation | Batch Rename Scenes | `cmd.tools.batch.renameScenes` |  |  |
| Automation | Normalize Project | `cmd.tools.normalize.project` |  | guarded |

### 4.9 Window

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Windows | New Window | `cmd.window.new` | `Cmd/Ctrl+Shift+M` |  |
| Windows | Next Window | `cmd.window.next` | `Cmd/Ctrl+Tab` |  |
| Windows | Previous Window | `cmd.window.prev` | `Cmd/Ctrl+Shift+Tab` |  |
| Layouts | Split View | `cmd.window.splitView` | `Cmd/Ctrl+Alt+S` |  |
| Layouts | Save Workspace Layout | `cmd.window.layout.save` |  | Guru |
| Layouts | Restore Workspace Layout | `cmd.window.layout.restore` |  | Guru |
| Window State | Minimize | `cmd.window.minimize` | `Cmd/Ctrl+M` |  |

### 4.10 Help

| Group | Command | ID | Default hotkey | Notes |
|---|---|---|---|---|
| Learn | Quick Start | `cmd.help.quickStart` |  | local docs |
| Learn | Keyboard Shortcuts | `cmd.help.shortcuts` | `F1` |  |
| Learn | Docs | `cmd.help.docs` |  | local docs |
| Support | Report Issue | `cmd.help.reportIssue` |  | creates diagnostics bundle |
| Support | Open Logs | `cmd.help.openLogs` |  |  |
| Support | System Diagnostics | `cmd.help.systemDiagnostics` |  |  |
| About | About Craftsman | `cmd.help.about` |  | version/license |

## 5) Toolbar Specification

### 5.1 Primary row (always visible)
- Project quicks: `New`, `Open`, `Save`.
- Editor controls: style preset, font, size, weight, line-height.
- Alignment: left/center/right/justify.
- Mode switch: `Write | Plan | Review`.
- Compact toggle: `min/max`.

### 5.2 Secondary row
- Word count and session metrics.
- Zoom controls.
- Save state chip (`Saved`, `Saving…`, `Unsaved`, `Recovery available`).
- Current scope chip (`Scene`, `Flow`, `Review`).

### 5.3 Contextual toolbar segments
- Selection context: inline formatting, comments, link, footnote.
- Plan context: card/timeline/entity actions.
- Review context: accept/reject/resolve actions.

## 6) Sidebar Specification (left)

Tabs:
- `Project` (tree: part/chapter/scene, drag/drop, filters).
- `Outline` (headings/scene headings).
- `Entities` (characters, places, threads).
- `Timeline` (event list with jumps).
- `Search` (saved queries + global filters).

Tree row context menu:
- New scene/chapter/part.
- Rename.
- Duplicate.
- Move.
- Archive.
- Add to favorites.
- Reveal in Finder/Explorer.

## 7) Inspector Specification (right)

Sections:
- Scene Meta: synopsis, status, tags, target words, estimate duration.
- Scene Cards: notes/cards linked to scene.
- References: linked entities and backlinks.
- Review: comments thread list, unresolved filter.
- History: scene operation timeline and snapshots.
- Export preview hints: risks before DOCX/PDF export.

## 8) Status Rail (bottom)
Fields:
- Project path (click → copy/open).
- Active scene id/title.
- Save status + last saved timestamp.
- Recovery indicator.
- Mode/profile indicator.
- Validation indicator (errors/warnings count).
- Background tasks (indexing/export) with progress.

## 9) Command Palette Model
Rules:
- Единый вход: только `cmd.*` через command bus.
- Pallete sections: Recent, Core, Scene, Plan, Review, Tools.
- Поиск по `label`, `aliases`, `id`, `tags`.
- Показывает причины disabled (stage/profile/mode constraint).

Command metadata fields:
- `id`
- `label`
- `aliases[]`
- `surface[]`
- `modeGate`
- `profileGate`
- `stageGate`
- `enabledWhen`
- `failSignals[]`

## 10) Settings Information Architecture

### 10.1 General
- Language (`ru`, `en`), locale formatting.
- Startup behavior (`launch screen`, `reopen last`).
- Recent projects retention limit.

### 10.2 Editor
- Font family, size, line-height.
- Typewriter/focus defaults.
- Smart punctuation and spellcheck policy.
- Paste policy (`plain`, `preserve-basic`, `strict-normalize`).

### 10.3 Project & Storage
- Default project location.
- Autosave interval.
- Snapshot interval and retention.
- Recovery drill reminders.

### 10.4 Export
- DOCX style map preset.
- PDF/EPUB defaults.
- Export validation strictness.

### 10.5 Review
- Comment author display.
- Resolved comment visibility.
- Change acceptance defaults.

### 10.6 Plan
- Entity card templates.
- Timeline granularity.
- Scene card density.

### 10.7 Interface
- Theme / contrast / panel density.
- Sidebar width and inspector width memory.
- Toolbar compact threshold.

### 10.8 Shortcuts
- Per-command rebinding.
- Conflict detection and override policy.
- Import/export keymaps.

### 10.9 Privacy & Security
- External links confirmation.
- Local diagnostics bundle policy.
- Clipboard sensitive-content warning.

### 10.10 Advanced
- Performance mode (`balanced`, `low-latency`, `battery`).
- Dev diagnostics toggles (non-default).
- Reset UI state / reset all preferences.

## 11) Error & Recovery UX Contract
1. Любой critical failure показывает действие: `Retry`, `Open Snapshot`, `Save As`, `Abort`.
2. Save/export failure никогда не теряет текущий editor buffer.
3. Любая IO error отображает path-safe сообщение (без утечки запрещённых путей).
4. Recovery dialog всегда указывает возраст и источник snapshot.

## 12) MVP Minimal Blocking Menu Pack
Обязательные команды MVP:
- `cmd.file.project.new`
- `cmd.file.project.open`
- `cmd.file.save`
- `cmd.file.export.docx`
- `cmd.file.backup.now`
- `cmd.file.recovery.restore`
- `cmd.edit.undo`
- `cmd.edit.redo`
- `cmd.edit.find`
- `cmd.tools.palette.open`
- `cmd.tools.diagnostics.open`
- `cmd.help.openLogs`

## 13) Stage-Gated Expansion Map
- X0/X1: full write shell + local plan + review local + DOCX baseline.
- X2: web subset (no canon break for offline-first desktop domain).
- X3: mobile subset (scene-first and recovery-safe).
- X4+: transport/collab network, replay/conflict security.

## 14) Implementation Tickets (recommended split)
1. `UI-MENU-01`: command registry expansion (`cmd.*`) + palette grouping.
2. `UI-MENU-02`: menu-config schema v2 (mode/profile/stage gates).
3. `UI-MENU-03`: File/Edit/View/Insert/Format full pass.
4. `UI-MENU-04`: Plan/Review/Tools full pass.
5. `UI-MENU-05`: settings IA and persistence wiring.
6. `UI-MENU-06`: context menus + inspector actions.
7. `UI-MENU-07`: diagnostics/recovery UX and fail-signal mapping.

## 15) Done Criteria for this spec artifact
- Full top-level menu map is defined.
- All user-facing UI blocks are defined.
- Command IDs and grouping model are defined.
- Mode/profile/stage gating is defined.
- MVP mandatory command set is explicit.
- No conflict with offline-first and scene-first canon.
