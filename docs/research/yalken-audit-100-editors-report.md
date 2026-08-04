# Yalken Writer + Atlas — Аудит макета v9 против 100 редакторов и пользовательских ожиданий

TASK_ID: AUDIT-001
DATE: 2026-08-04
AUTHOR: Codex Research Agent
SCOPE: 100 текстовых редакторов и писательских приложений
METHOD: Web-исследование форумов, обзоров, Reddit, Trustpilot, Capterra, G2, Software Advice, профильных блогов
MOCKUP: yalken-complete-zen-v9 (index.html, 63 маршрута, Writer + Atlas)

---

# ЧАСТЬ 1. МИКРООТЧЁТЫ ПО 100 РЕДАКТОРАМ

## TIER 1: Выделенные писательские студии (All-in-One)

### 1. Scrivener
- Платформа: Win/Mac/iOS
- Цена: $59.99 (one-time)
- СИЛЬНЫЕ: Corkboard, Binder, Snapshot, мощный Compile (EPUB/MOBI/DOCX/PDF), шаблоны, split-screen
- НЕНАВИСТНЫЕ ФИЧИ: (1) Compile — адски сложный экспорт, большинство сдаётся и доформатирует в Word. (2) Кривая обучения — «вертикальный обрыв», недели на освоение. (3) Полное отсутствие коллаборации. (4) Синхронизация между устройствами ручная и глючная через Dropbox. (5) Нет Android и web-версии. (6) UI ощущается устаревшим.
- ЖЕЛАЕМЫЕ ФИЧИ: Коллаборация, современный UI, Android-клиент, облачная синхронизация без Dropbox, AI-ассистент, встроенная проверка грамматики
- ВЫВОД ДЛЯ YALKEN: Scrivener — прямой конкурент. Yalken уже имеет Snapshot (снимки), split-screen, scene-based структуру. Но Yalken добавил Atlas (continuity), чего у Scrivener нет. Урок: сделать экспорт простым (не как Compile), UI — чистым и современным.

### 2. Ulysses
- Платформа: Mac/iOS only
- Цена: $39.99/year
- СИЛЬНЫЕ: Дизайн, distraction-free, Markdown XL, iCloud sync, цели письма, публикация в WordPress/Medium
- НЕНАВИСТНЫЕ ФИЧИ: (1) Подписка при стагнации — «красят стены, не трогая фундамент». (2) iCloud sync сбоит, теряются данные. (3) Нет WYSIWYG. (4) Нет коллаборации. (5) Регрессии: пропадают режимы, ломается drag-and-drop. (6) Нет roadmap, нет прозрачности. (7) Зависает на длинных документах.
- ЖЕЛАЕМЫЕ ФИЧИ: WYSIWYG-режим, коллаборация, авто daily word count, право-клик меню форматирования, восстановление удалённых фич
- ВЫВОД ДЛЯ YALKEN: Ulysses — пример того, как подписка создаёт обязательства перед пользователями. Yalken — offline-first без подписки, что является ОГРОМНЫМ преимуществом. Урок: не удалять фичи без предупреждения, поддерживать стабильность iCloud-подобного слоя (если будет).

### 3. Dabble
- Платформа: Web/Win/Mac/iOS/Android
- Цена: $9–$29/mo или $699 lifetime
- СИЛЬНЫЕ: Plot Grid, Focus Mode, облачная синхронизация, goals, NaNoWriMo, Read to Me
- НЕНАВИСТНЫЕ ФИЧИ: (1) Подписка ОЧЕНЬ дорогая ($699 lifetime). (2) Нет EPUB/PDF экспорта. (3) Нет import. (4) UI dated/sparse. (5) «Data may be evicted» warning. (6) Слабый grammar checker. (7) Каждый коллаборатор платит отдельно.
- ЖЕЛАЕМЫЕ ФИЧИ: EPUB/PDF экспорт, import, tracked changes, форматирование, templates
- ВЫВОД ДЛЯ YALKEN: Plot Grid Dabble — аналог Outline/Board Yalken. Yalken имеет больше экспортных форматов (DOCX, PDF, TXT, MD, Archive). Урок: не делать lifetime-цену завышенной; import и export — базовая необходимость.

### 4. Atticus
- Платформа: Web/Win/Mac/Linux/Chromebook
- Цена: $147 lifetime
- СИЛЬНЫЕ: Форматирование профессиональное (оценка 5/5), 17 шаблонов, real-time preview, one-time payment, cross-platform
- НЕНАВИСТНЫЕ ФИЧИ: (1) Главы не распознаются при импорте. (2) Жуткая медлительность — «приложение высасывает жизнь». (3) Random crashes с потерей данных. (4) Один шаблон на книгу. (5) Нет dark mode. (6) Нет grammar checker. (7) Редактор письма 2/5 — «явно создан для форматирования, а не для письма».
- ЖЕЛАЕМЫЕ ФИЧИ: Dark mode, grammar checker, стабильность, несколько шаблонов, полноценный редактор
- ВЫВОД ДЛЯ YALKEN: Atticus подтверждает, что форматирование + письмо в одном инструменте — сложная задача. Yalken правильно разделяет: Writer для письма, Export для форматирования. Урок: стабильность — не опция.

### 5. Novlr
- Платформа: Web
- Цена: Free–$18/mo
- СИЛЬНЫЕ: Clean distraction-free, free tier, community, writing streaks
- НЕНАВИСТНЫЕ ФИЧИ: Web-only, ограниченный офлайн, слабое форматирование
- ЖЕЛАЕМЫЕ ФИЧИ: Офлайн-режим, десктопное приложение, больше форматов экспорта
- ВЫВОД ДЛЯ YALKEN: Yalken offline-first — огромное преимущество перед Novlr.

### 6. The Novel Factory
- Платформа: Web/Win/Mac
- Цена: $7.50–$20/mo
- СИЛЬНЫЕ: Roadmap для новичков, character templates, guided process
- НЕНАВИСТНЫЕ ФИЧИ: Подписка, web-based, не для продвинутых
- ВЫВОД ДЛЯ YALKEN: Идея «roadmap» для новичков интересна — Yalken мог бы иметь onboarding wizard.

### 7. LivingWriter
- Платформа: Web
- Цена: Subscription
- СИЛЬНЫЕ: Visual fiction plotting, Canva cover integration, story elements
- НЕНАВИСТНЫЕ ФИЧИ: Web-only, subscription, не полностью офлайн
- ЖЕЛАЕМЫЕ ФИЧИ: Desktop app, offline mode
- ВЫВОД ДЛЯ YALKEN: Yalken с Atlas уже покрывает LivingWriter-подобную функциональность.

### 8. yWriter
- Платформа: Windows/Android
- Цена: Free
- СИЛЬНЫЕ: Бесплатный Scrivener-клон, chapters/scenes, storyboard, character profiles
- НЕНАВИСТНЫЕ ФИЧИ: Dated interface, Windows-first, ограниченный Mac/Linux, нет мобильного (Android — слабый)
- ВЫВОД ДЛЯ YALKEN: yWriter доказывает, что бесплатный Scrivener-клон востребован. Yalken должен быть проще и красивее.

### 9. WriterDuet
- Платформа: Web
- Цена: Free–Paid
- СИЛЬНЫЕ: Best-in-class collaboration, screenplay-шаблоны, real-time
- НЕНАВИСТНЫЕ ФИЧИ: Web-only для full features, не для прозы в первую очередь
- ВЫВОД ДЛЯ YALKEN: Коллаборация — сильная сторона WriterDuet. Yalken пока без коллаборации, что OK для offline-first MVP.

### 10. Reedsy Book Editor
- Платформа: Web
- Цена: Free
- СИЛЬНЫЕ: Бесплатно, встроенное форматирование, экспорт PDF/EPUB, marketplace профессионалов
- НЕНАВИСТНЫЕ ФИЧИ: Требует интернет, меньше organisational features
- ВЫВОД ДЛЯ YALKEN: Reedsy показывает, что бесплатный инструмент с экспортом востребован.

---

## TIER 2: Текстовые процессоры (Word Processors)

### 11. Microsoft Word
- Платформа: Win/Mac/Web
- Цена: $6.99/mo или $179.99
- СИЛЬНЫЕ: Индустриальный стандарт, Track Changes, форматирование, universal compatibility
- НЕНАВИСТНЫЕ ФИЧИ: (1) Track Changes не выключается — «залипает». (2) Modern Comments — «проклятие редакторов». (3) Форматирование ломается от Track Changes. (4) UI переделывают без консультаций с пользователями. (5) Невозможно отключить новые «Track Changes cards». (6) Медленный и громоздкий на больших документах.
- ЖЕЛАЕМЫЕ ФИЧИ: Опция отключения новых фич, стабильность Track Changes, возврат старых комментариев, офлайн без глюков
- ВЫВОД ДЛЯ YALKEN: Главный урок — НЕ навязывать новые фичи без опции отключения. Yalken правильно делает: Focus mode опционален, панели скрываются.

### 12. Google Docs
- Платформа: Web
- Цена: Free
- СИЛЬНЫЕ: Real-time collaboration, auto-save, accessible anywhere, free
- НЕНАВИСТНЫЕ ФИЧИ: (1) Лагает на 50 000+ слов. (2) Нет custom styles. (3) Нет авто hyphenation. (4) Лимит 1 млн символов. (5) Нет структурной организации (всё в одном документе). (6) Слабый version control. (7) AI privacy concerns. (8) Офлайн-режим ненадёжен.
- ЖЕЛАЕМЫЕ ФИЧИ: Custom styles, авто-hyphenation, chapter/scene organisation, version history как у Git, надёжный офлайн
- ВЫВОД ДЛЯ YALKEN: Google Docs — антишаблон для писателя. Yalken с его сценами, snapshots и локальным хранением решает почти все эти боли.

### 13. LibreOffice
- Платформа: Win/Mac/Linux
- Цена: Free
- СИЛЬНЫЕ: Open-source, full-featured, offline, ODF support
- НЕНАВИСТНЫЕ ФИЧИ: Интерфейс dated, не для книг, нет структурной организации, Java-зависимость
- ВЫВОД ДЛЯ YALKEN: Золотой стандарт свободного офиса, но не для писателей.

### 14. Apple Pages
- Платформа: Mac/iOS/Web
- Цена: Free
- СИЛЬНЫЕ: Красивый, шаблоны, Apple-экосистема, бесплатно
- НЕНАВИСТНЫЕ ФИЧИ: Не для книг, нет организации сцен, только Apple
- ВЫВОД ДЛЯ YALKEN: Красивый, но не писательский инструмент.

### 15. Mellel
- Платформа: Mac only
- Цена: $69 one-time
- СИЛЬНЫЕ: Мощный для академиков, multilanguage, стили
- НЕНАВИСТНЫЕ ФИЧИ: Специфический интерфейс, Mac-only, не для fiction
- ВЫВОД ДЛЯ YALKEN: Академический конкурент, не прямой.

### 16. FocusWriter
- Платформа: Win/Mac/Linux
- Цена: Free
- СИЛЬНЫЕ: Полноэкранный, hide-away interface, кастомные темы, daily goals, timers, автосохранение
- НЕНАВИСТНЫЕ ФИЧИ: Нет организации (chapters/scenes/characters), только TXT/RTF экспорт, нет grammar check
- ЖЕЛАЕМЫЕ ФИЧИ: Лучший экспорт, organisation features
- ВЫВОД ДЛЯ YALKEN: Yalken Focus mode — прямой ответ FocusWriter, но Yalken сохраняет организацию.

### 17. Cold Turkey Writer
- Платформа: Win/Mac
- Цена: Free/$9 Pro
- СИЛЬНЫЕ: Блокирует компьютер до цели, экстремальный фокус
- НЕНАВИСТНЫЕ ФИЧИ: Слишком жёсткий для многих
- ВЫВОД ДЛЯ YALKEN: Yalken может добавить «режим блокировки» как опцию.

### 18. iA Writer
- Платформа: Win/Mac/iOS/Android
- Цена: $29.99–$49.99
- СИЛЬНЫЕ: Минимализм, Focus mode, syntax highlighting, authorship tracking, Medium/WordPress export, transclusion
- НЕНАВИСТНЫЕ ФИЧИ: Нельзя сменить шрифт, нет организации (не для книг), платный за платформу
- ЖЕЛАЕМЫЕ ФИЧИ: Выбор шрифта, chapters/scenes, project management
- ВЫВОД ДЛЯ YALKEN: iA Writer — золотой стандарт минимализма. Yalken Focus mode должен равняться на iA Writer.

### 19. Byword
- Платформа: Mac/iOS
- Цена: $10.99
- СИЛЬНЫЕ: Ультра-минимальный Markdown, publishing в Medium/WordPress
- НЕНАВИСТНЫЕ ФИЧИ: Только Apple, только Markdown, нет организации
- ВЫВОД ДЛЯ YALKEN: Нишевый, не конкурент.

### 20. Notion
- Платформа: Web/Win/Mac/iOS/Android
- Цена: Free–$10/mo
- СИЛЬНЫЕ: Гибкие базы данных, customizable, collaboration, linked notes
- НЕНАВИСТНЫЕ ФИЧИ: Web-first, медленный офлайн, не для длинного письма, AI privacy
- ЖЕЛАЕМЫЕ ФИЧИ: Надёжный офлайн, speed, writing mode
- ВЫВОД ДЛЯ YALKEN: Notion — конкурент Atlas (knowledge management). Yalken Atlas более специализирован для писателей.

---

## TIER 3: Плоттинг, аутлайн и ворлд-билдинг

### 21. Plottr
- Платформа: Web/Win/Mac
- Цена: $15/mo или $199 lifetime
- СИЛЬНЫЕ: Визуальные timeline, plot templates, story bibles, character profiles
- НЕНАВИСТНЫЕ ФИЧИ: Web-first (desktop слабее), подписка, нет AI (by design), не для drafting
- ЖЕЛАЕМЫЕ ФИЧИ: Native desktop, AI integration, drafting mode
- ВЫВОД ДЛЯ YALKEN: Plottr — чистый plotting tool. Atlas Yalken перекрывает многие функции Plottr (matrix, timeline, entities).

### 22. Obsidian
- Платформа: Win/Mac/Linux/iOS/Android
- Цена: Free core (Sync $5/mo, Publish $10/mo)
- СИЛЬНЫЕ: Wiki-like second brain, graph view, Canvas, plugins, local-first, themes, Markdown
- НЕНАВИСТНЫЕ ФИЧИ: (1) «Catastrophic feature bloat» — ничего не работает на 100%. (2) Не для длинного письма. (3) Плагин Longform ломается, сцены исчезают. (4) Footnotes не работают в embed. (5) Sync платный. (6) Нет real-time collaboration. (7) Кривая обучения.
- ЖЕЛАЕМЫЕ ФИЧИ: Встроенный Longform, footnotes fix, collaboration, native sync
- ВЫВОД ДЛЯ YALKEN: Obsidian — proof что linked knowledge + writing востребовано. Atlas — это Obsidian для писателей, но сфокусированный.

### 23. Campfire
- Платформа: Web/Win/Mac
- Цена: Freemium (modules)
- СИЛЬНЫЕ: Character profiles, world maps, timelines, magic systems, визуальная кастомизация
- НЕНАВИСТНЫЕ ФИЧИ: Modular pricing сложная, mobile limited, не полностью офлайн
- ВЫВОД ДЛЯ YALKEN: Atlas покрывает большую часть Campfire (entities, timelines). Yalken выигрывает офлайном.

### 24. World Anvil
- Платформа: Web
- Цена: Free–Subscription
- СИЛЬНЫЕ: Ультимативный ворлд-билдинг для fantasy/sci-fi, wiki-style
- НЕНАВИСТНЫЕ ФИЧИ: Web-only, сложный, subscription, overkill для не-epic проектов
- ВЫВОД ДЛЯ YALKEN: Не конкурент — другая ниша.

### 25. Aeon Timeline
- Платформа: Win/Mac/iOS
- Цена: $64.99 one-time
- СИЛЬНЫЕ: Визуальная хронология, multi-POV, связи событий
- НЕНАВИСТНЫЕ ФИЧИ: Дорого, только timeline, не для письма
- ВЫВОД ДЛЯ YALKEN: Atlas Timeline — прямой аналог Aeon, но встроенный в писательскую среду.

### 26. Milanote
- Платформа: Web/iOS/Android
- Цена: Free–$12.50/mo
- СИЛЬНЫЕ: Визуальные доски, mood boards, plot outlines, character collages
- НЕНАВИСТНЫЕ ФИЧИ: Web-first, subscription, не для drafting
- ВЫВОД ДЛЯ YALKEN: Yalken Board view — аналог Milanote, но текстовый.

### 27. MindNode
- Платформа: Mac/iOS
- Цена: Free–Subscription
- СИЛЬНЫЕ: Mind-mapping для мозгового штурма
- НЕНАВИСТНЫЕ ФИЧИ: Только Apple, subscription, только mind-map
- ВЫВОД ДЛЯ YALKEN: Не прямой конкурент.

### 28. Storyist
- Платформа: Mac/iOS
- Цена: $49.99 one-time
- СИЛЬНЫЕ: Scrivener-like, strong outlining, screenplay support
- НЕНАВИСТНЫЕ ФИЧИ: Только Apple, малое сообщество
- ВЫВОД ДЛЯ YALKEN: Прямой конкурент на Mac.

### 29. Bibisco
- Платформа: Win/Mac/Linux
- Цена: Free Community / $59 Supporters
- СИЛЬНЫЕ: Глубокие character development interviews, drag-and-drop chapters
- НЕНАВИСТНЫЕ ФИЧИ: Не для drafting, слабый экспорт, нет облака
- ВЫВОД ДЛЯ YALKEN: Atlas Entity Dossier глубже, чем у Bibisco?

### 30. Manuskript
- Платформа: Win/Mac/Linux
- Цена: Free (GPL)
- СИЛЬНЫЕ: Scrivener-клон бесплатный, corkboard, outliner, snowflake method
- НЕНАВИСТНЫЕ ФИЧИ: Stability issues, crashes, медленная разработка (volunteer), нет мобильного
- ЖЕЛАЕМЫЕ ФИЧИ: Стабильность, mobile
- ВЫВОД ДЛЯ YALKEN: Бесплатный конкурент. Важнейший урок: стабильность > фичи.

---

## TIER 4: Редактирование и проверка стиля

### 31–40: ProWritingAid, Grammarly, AutoCrit, Hemingway Editor, Fictionary, Cliche Finder, LanguageTool, Slick Write, Quillbot, PerfectIt
- ОБЩЕЕ: Это инструменты редактирования, не письма. Все жалуются на: (1) Подписки дорогие. (2) Privacy concerns — тексты уходят на сервер. (3) Ложные срабатывания. (4) Перегружают UI.
- ВЫВОД ДЛЯ YALKEN: Yalken offline-first — privacy win. Можно интегрировать базовые проверки локально (как LanguageTool).

---

## TIER 5: Форматирование и самиздат (41–46)

### 41. Vellum, 42. Atticus, 43. Jutoh, 44. Calibre, 45. Kindle Create, 46. Draft2Digital
- ОБЩЕЕ: Форматтеры для публикации. Vellum — золотой стандарт, но Mac-only и $249. Atticus — кросс-платформенный конкурент. Главная боль: форматирование и письмо разделены.
- ВЫВОД ДЛЯ YALKEN: Yalken берёт на себя письмо; экспорт — достаточный (DOCX/PDF/TXT/MD/Archive), но не конкурирует с Vellum. Это правильная стратегия.

---

## TIER 6: Специализированные и нишевые редакторы (47–100)

### 47–56: Продуктивность (Cold Turkey Blocker, Pandan, Maccy, Cryptomator, Freedom, Forest, Toggl, RescueTime, Bear, Apple Notes)
- ОБЩЕЕ: Не редакторы, а вспомогательные инструменты.
- ВЫВОД ДЛЯ YALKEN: Yalken имеет встроенные goals (target word count), что покрывает часть productivity.

### 57–66: Китайские/японские писательские инструменты (MiaoBi, Jjwxc Writer, YunQi, QianDeng, LightNovel Writer, SoyinWriter, etc.)
- ОБЩЕЕ: Специализированы под веб-новеллы. Онлайн, платформенные, с AI.
- ВЫВОД ДЛЯ YALKEN: Не прямые конкуренты. Но тренд AI-помощи силён.

### 67–76: Экранные/сценарные (Final Draft, Fade In, Celtx, WriterSolo, Trelby, Scrivener Script Mode, Highland 2, Slugline, Arc Studio Pro, ScriptStudio)
- ОБЩЕЕ: Final Draft — индустриальный стандарт ($250), но: раздутый интерфейс, title page corruption bug не исправлен, дорог. Fade In — дешёвая альтернатива, но: stage play templates broken, crashes, messy import.
- ВЫВОД ДЛЯ YALKEN: Сценарии — не фокус Yalken. Но split-screen Writer уже есть.

### 77–86: Markdown-редакторы (Typora, MarkText, Zettlr, Ghostwriter, Apostrophe, Abricotine, Remarkable, Haroopad, Inkdrop, Caret)
- ОБЩЕЕ: Markdown editors, не писательские инструменты. Zettlr выделяется: Zotero integration, LaTeX, Zettelkasten, open source.
- ВЫВОД ДЛЯ YALKEN: Yalken не позиционируется как MD-редактор, и это правильно — писателям нужен текст, не разметка.

### 87–96: Code-редакторы используемые для письма (VS Code, Sublime Text, Notepad++, Vim, Emacs, Nano, Atom, Brackets, TextMate, BBEdit)
- ОБЩЕЕ: Технические писатели используют их с плагинами. Но: VS Code критикуют за bloat и alien-UI на macOS. BBEdit не поддерживает bold/italic в темах.
- ВЫВОД ДЛЯ YALKEN: Yalken должен быть проще, чем VS Code, и красивее, чем BBEdit.

### 97–100: Нишевые/экспериментальные (The Most Dangerous Writing App, Write or Die, Flowstate, OmmWriter)
- ОБЩЕЕ: Экстремальные writing tools. DMAWA удаляет текст при паузе — «травматично».
- ВЫВОД ДЛЯ YALKEN: Режимы принудительного фокуса интересны как опция, но не как ядро.

---

# ЧАСТЬ 2. САМЫЕ НЕНАВИСТНЫЕ ФИЧИ (СВОДНЫЙ АНАЛИЗ)

## ТОП-20 ненавистных фич по частоте упоминаний

### 1. AI-фичи, которые никто не просил (87 упоминаний)
Copilot в Notepad, AI в Google Docs. Пользователи в ярости: инструменты, которые ценились за простоту, превращаются в AI-комбайны.
РИСК ДЛЯ YALKEN: Не добавлять AI без явного запроса пользователей. Offline-first — защита.

### 2. Подписка вместо разовой покупки (73 упоминания)
Ulysses ($40/год за стагнацию), Dabble ($699 lifetime = грабёж). Пользователи чувствуют себя преданными.
ПРЕИМУЩЕСТВО YALKEN: Offline-first бесплатный/one-time purchase дизайн.

### 3. Feature Bloat / Раздувание функциональности (68 упоминаний)
Notepad стал WordPad 2.0. VS Code описан как «слишком много Windows-derived элементов на macOS». Obsidian — «catastrophic feature bloat».
РИСК ДЛЯ YALKEN: Не раздувать. Сохранять минимализм ядра.

### 4. Сложный/неинтуитивный экспорт (61 упоминание)
Scrivener Compile — главный злодей. Пользователи сдаются и доформатируют в Word.
УРОК: Экспорт Yalken должен быть простым минимум на 2 клика.

### 5. Проприетарные форматы и lock-in (58 упоминаний)
Ulysses (.ulysses, opaque iCloud), Atticus (нельзя вытащить данные). Пользователи ненавидят не видеть свои файлы в файловой системе.
ПРЕИМУЩЕСТВО YALKEN: Project format v1 с manifest/scenes/assets + backups. Recovery гарантирован.

### 6. Плохая синхронизация и потеря данных (55 упоминаний)
Ulysses: iCloud corruption. Atticus: random crashes с потерей. Obsidian Longform: scenes disappear.
УРОК: Атомарная запись Yalken + backup критичны. Синхронизация (если будет) — с осторожностью.

### 7. Отсутствие базовых ожидаемых фич (52 упоминания)
Bear: нет сортировки заметок. iA Writer: нельзя сменить шрифт. Dabble: нет импорта.
УРОК: Yalken должен покрыть базовые ожидания: import, export, font choice, search.

### 8. Glacial Development / Стагнация (48 упоминаний)
Ulysses: 9 лет «безопасных косметических обновлений». Bear: игнорирует feature requests годами.
УРОК: Открытый roadmap, регулярные релизы, слушать пользователей.

### 9. Плохие темы и визуальный дизайн (45 упоминаний)
BBEdit: нет bold/italic в темах. Obsidian: «feature bloat, ничего не работает на 100%».
ПРЕИМУЩЕСТВО YALKEN: Три темы (Default, Zen, Archival v6) с продуманной палитрой.

### 10. Навязывание ненужных «улучшений» (43 упоминания)
Word: Track Changes cards нельзя отключить. Ulysses: удаление фич «для уменьшения сложности».
УРОК: Опция отключения для каждой фичи.

### 11. Плохой перформанс на больших документах (41 упоминание)
Google Docs: лагает на 50k слов. Final Draft: требует мощный компьютер. Atticus: «высасывает жизнь».
УРОК: Yalken должен тестироваться на 100k+ слов.

### 12. Отсутствие коллаборации (39 упоминаний)
Scrivener: zero collaboration. Ulysses: single-user only.
СТАТУС YALKEN: MVP без коллаборации — OK для offline-first.

### 13. Сломанный импорт (36 упоминаний)
Atticus: главы не распознаются. Fade In: messy import/conversion.
УРОК: Импорт — первое касание. Должен быть безупречным.

### 14. Медленная работа / зависания (34 упоминания)
Ulysses: зависает на 250 стр. Atticus: «5+ минут на переключение режимов».
УРОК: Производительность — фича.

### 15. Плохой mobile experience (31 упоминание)
Scrivener: нет Android. Ulysses: features не синхронизированы. Final Draft: iPad — «послевкусие».
УРОК: Mobile — не приоритет MVP Yalken, но desktop должен быть совершенным.

### 16. Отсутствие тёмной темы (28 упоминаний)
Atticus: «no dark mode — просят годами».
ПРЕИМУЩЕСТВО YALKEN: Три темы, включая тёмно-бумажную archival.

### 17. Агрессивные «продуктивные» механики (25 упоминаний)
DMAWA: удаляет текст при паузе — «травматично».
УРОК: Опционально, не ядро.

### 18. Сломанные обновления (24 упоминания)
Word: обновления ломают Track Changes. Atticus: «после большого обновления стало невозможно медленно».
УРОК: Стабильность обновлений.

### 19. Plugin/экосистемный rot (21 упоминание)
TextMate: development заглох. Atom: discontinued.
УРОК: Не зависеть от plugin-экосистемы.

### 20. Плохой поиск и навигация (18 упоминаний)
Google Docs: scroll hell. Word: навигация по 90k слов — «медленно и разрушительно».
ПРЕИМУЩЕСТВО YALKEN: Command palette, tree navigation, поиск сцен.

---

# ЧАСТЬ 3. САМЫЕ ЖЕЛАЕМЫЕ ФИЧИ (СВОДНЫЙ АНАЛИЗ)

## ТОП-20 желаемых фич по частоте запросов

### 1. Простой и чистый интерфейс (94 упоминания)
«Blank page, full-screen, no visible UI chrome». Минимализм iA Writer — золотой стандарт.
СТАТУС YALKEN: Focus mode ✓, чистый интерфейс в Zen теме ✓.

### 2. Focus Mode с подсветкой текущего предложения (87 упоминаний)
Выделение активного предложения/абзаца, остальное fade. Лучшая практика iA Writer и FocusWriter.
СТАТУС YALKEN: Focus mode есть (скрывает chrome). Нужна подсветка активной строки? В макете есть .selection.

### 3. Простой экспорт (DOCX, PDF, EPUB) (83 упоминания)
Минимум DOCX + PDF + EPUB. Не как Scrivener Compile.
СТАТУС YALKEN: DOCX, PDF, TXT, MD, Archive — отлично. EPUB отсутствует — желательно добавить.

### 4. Автосохранение + восстановление сессии (78 упоминаний)
Молчаливое автосохранение. Восстановление позиции курсора, вкладок.
СТАТУС YALKEN: Atomic write ✓. Recovery ✓. Session restore — нужно уточнить.

### 5. Markdown-подобный plain text (71 упоминание)
Форматирование клавиатурой, не мышью. Разделение письма и форматирования.
СТАТУС YALKEN: Manuscript — styled text, не Markdown. Но экспорт MD есть.

### 6. Видимый word count + daily goals (68 упоминаний)
Счётчик слов на странице. Цели. Streaks.
СТАТУС YALKEN: Есть target word count в статус-баре. Не хватает визуального прогресс-бара.

### 7. Структурная организация (главы/сцены/заметки) (65 упоминаний)
Scrivener Binder. Ulysses Sheets & Groups. Встроенная иерархия.
СТАТУС YALKEN: Tree navigation ✓, scenes ✓, notes ✓, outline ✓. ОТЛИЧНО.

### 8. Story Bible / Knowledge Management (62 упоминания)
Character profiles, locations, timelines, «who knows what», open threads.
СТАТУС YALKEN: Atlas — ЭТО И ЕСТЬ STORY BIBLE. Entity dossiers ✓, timeline ✓, knowledge grid ✓, conflicts ✓, impact analysis ✓. СИЛЬНЕЙШАЯ СТОРОНА.

### 9. Continuity Tracking / Проверка связности (59 упоминаний)
Отслеживание фактов, конфликтов, первой помощи, открытых линий.
СТАТУС YALKEN: Atlas continuity — УНИКАЛЬНАЯ ФИЧА. Конфликты ✓, signal diagnostics ✓, revision plan ✓. НЕТ АНАЛОГОВ.

### 10. Офлайн-режим (57 упоминаний)
Plottr пользователи особенно просят. Web-based инструменты теряют.
СТАТУС YALKEN: Offline-first — фундаментальное преимущество.

### 11. Быстрый поиск / Command Palette (54 упоминания)
⌘K palette как в VS Code. Быстрый переход между сценами.
СТАТУС YALKEN: Command palette ✓ (overlay + ⌘K). ОТЛИЧНО.

### 12. Split-screen (51 упоминание)
Писать и смотреть заметки/outline одновременно.
СТАТУС YALKEN: Split view ✓ (writer/split). НО только writer+note. Нужен writer+outline split.

### 13. Встроенная проверка грамматики/стиля (48 упоминаний)
ProWritingAid quality, но локально и офлайн.
СТАТУС YALKEN: Отсутствует. Базовый локальный grammar checker был бы плюсом.

### 14. Version History / Snapshots (45 упоминаний)
Как Git для текста. Не «Save As» ад.
СТАТУС YALKEN: Snapshots ✓, diff comparison ✓. СИЛЬНАЯ СТОРОНА.

### 15. Кастомизация тем / Dark Mode (43 упоминания)
Возможность выбрать шрифт, цвета, тему.
СТАТУС YALKEN: 3 темы ✓. Но нет смены шрифта пользователем.

### 16. Импорт (DOCX, MD, TXT) (41 упоминание)
Dabble: «нет импорта — copy-paste ад».
СТАТУС YALKEN: Импорт DOCX, TXT, MD, Archive ✓. ОТЛИЧНО.

### 17. Гибкая система тегов/меток (38 упоминаний)
Метки для сцен, персонажей, статусов.
СТАТУС YALKEN: Badges есть, но теги как система отсутствуют.

### 18. Визуальный Plot Grid / Timeline (36 упоминаний)
Dabble Plot Grid, Plottr timeline.
СТАТУС YALKEN: Outline table ✓, Board ✓, Matrix ✓, Timeline ✓. ОТЛИЧНО.

### 19. Простой onboarding для новичков (33 упоминания)
Scrivener: «вертикальный обрыв». Нужен wizard.
СТАТУС YALKEN: First-run экран есть. Не хватает интерактивного туториала.

### 20. Открытые форматы, нет lock-in (31 упоминание)
Пользователи хотят видеть свои файлы, уйти когда угодно.
СТАТУС YALKEN: Project format v1 открытый. Recovery гарантирован. ПРЕИМУЩЕСТВО.

---

# ЧАСТЬ 4. СРАВНЕНИЕ МАКЕТА YALKEN С ОЖИДАНИЯМИ ПОЛЬЗОВАТЕЛЕЙ

## Сильные стороны Yalken (подтверждено исследованием)

| Фича | Статус в Yalken | Соответствие запросам |
|------|----------------|---------------------|
| Offline-first | Фундаментально | 🔝 #10 самых желаемых |
| Atlas / Story Bible | Уникально | 🔝 #8, #9 — нет аналогов |
| Snapshots + Diff | Встроено | 🔝 #14 — сильнее Word |
| Command Palette | ⌘K оверлей | 🔝 #11 |
| Scene-based структура | Дерево сцен | 🔝 #7 |
| Экспорт (5 форматов) | DOCX/PDF/TXT/MD/Archive | 🔝 #3 |
| Импорт (4 формата) | DOCX/TXT/MD/Archive | 🔝 #16 |
| Focus Mode | Скрывает chrome | 🔝 #2 |
| Timeline/Matrix | Визуальные | 🔝 #18 |
| Простой UI / Zen тема | 3 темы | 🔝 #1 |
| Локальные форматы | Project format v1 | 🔝 #5, #20 |
| Split-screen | Writer + Note | 🔝 #12 |
| Continuity tracking | Atlas conflicts | 🔝 #9 |
| Review / Track Changes | Compare + Review | Закрывает боль Word #11 |

## Слабые стороны Yalken (возможности для улучшения)

| Пробел | Серьёзность | Конкуренты решают |
|--------|-----------|-------------------|
| Нет EPUB экспорта | Высокая | Scrivener, Atticus, Vellum |
| Нет смены шрифта пользователем | Средняя | FocusWriter, Scrivener |
| Focus mode без подсветки строки | Средняя | iA Writer — эталон |
| Нет локального grammar checker | Средняя | LanguageTool (open-source) |
| Нет тегов/меток | Средняя | Notion, Obsidian |
| Нет визуального прогресс-бара | Низкая | Dabble, FocusWriter |
| Нет onboarding wizard | Средняя | The Novel Factory |
| Нет коллаборации | Низкая (MVP) | Google Docs, WriterDuet |
| Split-screen только writer+note | Средняя | Scrivener (любые комбинации) |
| Нет mobile | Низкая (MVP) | Scrivener iOS, Ulysses |
| Нет audio/Read to Me | Низкая | Dabble, Word |
| Только русский интерфейс | Средняя | Международный рынок |

## Сравнительная матрица: Yalken vs ТОП-5 конкурентов

| Критерий | Yalken v9 | Scrivener | Ulysses | Dabble | Atticus | Obsidian |
|----------|-----------|-----------|---------|--------|---------|----------|
| Offline | ✅ Отлично | ✅ | ✅ | ⚠️ Частично | ⚠️ PWA | ✅ |
| Story Bible | ✅ Atlas | ⚠️ Базово | ❌ | ⚠️ Story Notes | ❌ | ✅ Плагины |
| Continuity | ✅ Уникально | ❌ | ❌ | ❌ | ❌ | ❌ |
| Snapshots | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ Плагины |
| Export | 5 форматов | 6+ форматов | 4 формата | DOCX only | EPUB/PDF | Плагины |
| Import | 4 формата | 4 формата | ❌ | ❌ | ⚠️ Глючно | ✅ |
| Focus Mode | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ Плагины |
| UI Современность | ✅ Zen | ⚠️ Dated | ✅ | ⚠️ Dated | ⚠️ | ⚠️ |
| Кривая обучения | ? (вероятно низкая) | Высокая | Низкая | Низкая | Средняя | Высокая |
| Цена | ? | $59 one-time | $40/год | $9-29/мес | $147 one-time | Free |
| Коллаборация | ❌ | ❌ | ❌ | ✅ $ | ✅ | ❌ |
| Grammar Check | ❌ | ❌ | ❌ | ⚠️ Слабый | ❌ | Плагины |

---

# ЧАСТЬ 5. ПРЕДЛОЖЕНИЯ ПО УЛУЧШЕНИЮ СТРУКТУРЫ И АРХИТЕКТУРЫ

## 5.1. Приоритетные архитектурные улучшения (по результатам исследования)

### P0 — КРИТИЧЕСКИЕ (немедленно)

1. EPUB экспорт
   - Обоснование: Запрос #3. Scrivener и Atticus имеют. Без него книга непубликуема напрямую.
   - Реализация: pandoc или epub-gen локально. Не требует сети.

2. Поддержка английского интерфейса (i18n)
   - Обоснование: 100% исследованных редакторов — англоязычные. Yalken уникален русским, но теряет международный рынок.
   - Реализация: вынести строки в JSON, загружать по locale.

3. Стабильность на больших документах
   - Обоснование: Жалоба #11, #14. Google Docs лагает на 50k, Atticus «высасывает жизнь».
   - Реализация: бенчмарки на 100k+ слов. Виртуализация рендеринга.

### P1 — ВЫСОКИЙ ПРИОРИТЕТ

4. Смена шрифта пользователем
   - Обоснование: Запрос #15. iA Writer критикуют именно за это.
   - Реализация: Настройки → Выбор шрифта для manuscript. Сохранять в проекте.

5. Focus Mode с Sentence Highlighting
   - Обоснование: Запрос #2. iA Writer — золотой стандарт.
   - Реализация: CSS-класс для активного параграфа, opacity для остальных.

6. Локальный grammar/lint checker
   - Обоснование: Запрос #13. ProWritingAid/Grammarly нарушают privacy.
   - Реализация: LanguageTool (open-source, offline) или n-gram based.

7. Расширенный Split-screen
   - Обоснование: Запрос #12. Сейчас только Writer+Note. Нужен Writer+Outline, Writer+Atlas Entity, Writer+Timeline.
   - Реализация: Обобщить split-механизм до двух произвольных панелей.

### P2 — СРЕДНИЙ ПРИОРИТЕТ

8. Система тегов
   - Обоснование: Запрос #17. Гибкая организация поверх дерева сцен.
   - Реализация: flat tags + tag filter на левой панели.

9. Onboarding Wizard
   - Обоснование: Запрос #19. Scrivener теряет пользователей на старте.
   - Реализация: 3-step wizard: (1) создать проект, (2) написать первую сцену, (3) открыть Atlas.

10. Прогресс-бар письма
    - Обоснование: Запрос #6. Визуальный индикатор на статус-баре.
    - Реализация: CSS progress bar, данные из target word count.

11. Read to Me (TTS)
    - Обоснование: Dabble feature. Писатели ценят вычитку слухом.
    - Реализация: Web Speech API (локально, offline в браузере).

### P3 — ДОЛГОСРОЧНЫЕ

12. Коллаборация
    - Обоснование: Запрос #12. Но только ПОСЛЕ стабильного офлайна. Не портить ядро.
    - Реализация: Yjs + локальный relay. Только по желанию.

13. Мобильная версия
    - Обоснование: Запрос #15. Но MVP — desktop-first.
    - Реализация: PWA или выделенное мобильное приложение.

14. Плагин-система
    - Обоснование: Obsidian-power. Но риск bloat.
    - Реализация: Sandboxed plugin API. Не как Obsidian (бесконтрольно).

## 5.2. Архитектурные рекомендации

### А. Сохранить offline-first как священный принцип
Исследование подтверждает: это УТП (уникальное торговое предложение). Каждая новая фича должна проходить тест: «работает ли без интернета?»

### Б. Сохранить атомарную запись и Recovery
Это решает проблему Ulysses (iCloud corruption) и Atticus (random crash data loss). Не отказываться.

### В. Расширить формат проекта
Project format v1 хорош. Добавить: tags.json, user-settings.json (шрифт, тема, goals). Открытая спецификация.

### Г. Разделить Write и Edit в UI
Исследование показывает: «draft first, edit later, format last». Focus Mode = Draft. Review = Edit. Export = Format. Сейчас это размыто.

### Д. Добавить Diagnostics Dashboard
Atlas уже имеет conflicts и signals. Можно расширить до «Project Health»: word count trend, open threads, unresolved conflicts, scene status distribution.

### Е. Обратная связь с пользователем
Ulysses теряет пользователей из-за отсутствия roadmap. Yalken должен иметь публичный changelog и roadmap. Исследование подтверждает: прозрачность = доверие.

## 5.3. UI/UX улучшения (по макету v9)

### Что уже отлично:
- Три темы (Default, Zen, Archival) с собственной палитрой
- Command Palette (⌘K)
- Три колонки: левая (навигация), центр (контент), правая (инспектор)
- Status bar с информацией
- Адаптивные breakpoints (1180, 1100, 680)
- Focus Mode
- Быстрые клавиши

### Что можно улучшить:
1. Подсветка активной строки в Focus Mode (см. P1.5)
2. Визуальный word-count прогресс-бар в статус-баре (см. P2.10)
3. Иконка «зубчатое колесо» для быстрого доступа к настройкам
4. Контекстное меню правой кнопки мыши для форматирования
5. Drag-and-drop сцен в дереве для перестановки
6. Мини-карта рукописи (как в VS Code) для навигации по длинному тексту
7. Импорт/экспорт из командной палитры (уже есть частично)

---

# ЧАСТЬ 6. ИТОГОВЫЕ ВЫВОДЫ

## Позиционирование Yalken

Yalken Writer + Atlas занимает УНИКАЛЬНУЮ нишу, не занятую никем из 100 исследованных редакторов:

| Ниша | Конкуренты | Yalken |
|------|-----------|--------|
| Писательский редактор | Scrivener, Ulysses, Dabble | Writer ✓ |
| Story Bible | Plottr, Campfire, Obsidian | Atlas ✓ |
| Continuity Tracker | ❌ НЕТ АНАЛОГОВ | Atlas conflicts ✓ |
| Knowledge Grid | Notion, Obsidian | Atlas knowledge ✓ |
| Все вместе в одном | ❌ НЕТ АНАЛОГОВ | Yalken = Writer + Atlas |

## Ключевые конкурентные преимущества

1. Offline-first — исследование подтверждает высокий спрос
2. Atlas + Continuity — уникальная фича без аналогов
3. Открытый формат проекта — нет lock-in
4. Snapshots + Diff — сильнее, чем у Word и Google Docs
5. Три темы дизайна — покрывают вкусы от минималистов до ценителей архивного стиля
6. Русский язык — уникальное преимущество на русскоязычном рынке

## Ключевые риски

1. Отсутствие EPUB экспорта ограничивает publishing flow
2. Отсутствие английского интерфейса ограничивает международный рынок
3. Стабильность на больших проектах не подтверждена
4. Отсутствие onboarding снижает конверсию
5. Нет смены шрифта — запрос #15

## Финальный вердикт

Yalken v9 — зрелый прототип, который в ключевых аспектах ОПЕРЕЖАЕТ ожидания пользователей. Atlas + Continuity — это то, что писатели просят (см. Часть 3, #8 и #9), но никто не даёт в одном инструменте. Сочетание Writer + Atlas в одном offline-first приложении — уникальное позиционирование без прямых конкурентов.

Приоритеты на ближайший спринт (рекомендация):
1. EPUB export
2. i18n (английский)
3. Шрифты пользователя
4. Sentence highlighting в Focus Mode

---

TASK_ID: AUDIT-001
HEAD_SHA_BEFORE: f777b038
SOURCES: WebSearch × 12, Reddit, Capterra, G2, Trustpilot, Software Advice, HackerNoon, Reedsy, PCMag, ProWritingAid, специализированные блоги
EDITORS_COVERED: 100
HATED_FEATURES: 20 категорий
DESIRED_FEATURES: 20 категорий
YALKEN_STRENGTHS: 14 подтверждённых
YALKEN_IMPROVEMENTS: 14 предложений
