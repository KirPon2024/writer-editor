# Политика: Codex 5.3 — разделение ответственности на две роли с жёсткими границами (DOCS vs CODE) — v1.0 (FROZEN)

## 0) Цель
Одна модель Codex 5.3 выполняет две роли, но права и инструменты разделены. Разделение достигается через:
- роли (разрешённые действия и ожидаемые выходы),
- профили прав (технические ограничения окружения),
- гейты (обязательные проверки и стоп-условия),
- Execution Ticket (единственный вход в роль CODE).

Роли:
- DOCS — анализ и формулировки без изменений репозитория.
- CODE — изменения репозитория строго по Execution Ticket.

## 0.1 Freeze-to-Execute (режим заморозки)
Policy `v1.0` считается замороженной на `N=3` реальных тикета.

Правило заморозки:
- policy не правится и не “улучшается”, пока не случился фактический `STOP/инцидент` на реальном тикете.
- после каждого тикета проводится короткий постмортем: только факты `PASS/STOP`, причина, и точечное предложение правки.
- если по итогам `N=3` тикетов нет блокеров → policy остаётся как есть.
- если были блокеры → допускается один `v1.1` патч только по подтверждённым кейсам.

## 0.2 Приоритет и совместимость с процессом репозитория
Если задача выполняется с валидным Execution Ticket, действует эта политика (включая разрешение CODE на commit/push/PR согласно тикету и профилям прав).

Если валидного Execution Ticket нет, действует процесс репозитория по умолчанию (включая правило, что commit/push выполняет человек).

## 1) Термины и определения

### 1.1 Роль
Набор разрешённых действий и ожидаемых артефактов, привязанный к профилю прав.

### 1.2 Профиль прав
Технические ограничения окружения: доступ к файловой системе, сетевой доступ, доступ к секретам, allowlist/denylist путей и команд.

### 1.3 Execution Ticket
Артефакт, который разрешает запуск роли CODE. Без Execution Ticket роль CODE не выполняется.

Execution Ticket считается действительным только если содержит поля утверждения человеком (см. 6) и обязательные содержательные поля (см. 6.2).

### 1.4 Allowlist

#### 1.4.1 Allowlist Paths
Единственный источник прав на изменения файлов в CODE. Список файлов/папок, которые разрешено менять в рамках конкретного Execution Ticket.

`ALLOWLIST_PATHS_MODE` определяет семантику матчинга:
- `EXACT` — разрешены только пути, указанные в списке; каждый элемент списка должен быть явно типизирован:
  - `FILE:<path>` — разрешён ровно этот файл (существующий или создаваемый);
  - `DIR:<path>/` — разрешены все пути внутри этого каталога (существующего или создаваемого) при условии правила границы каталога (см. 1.4.4).
- `PREFIX` — разрешены все пути внутри указанного каталога/поддерева с обязательным правилом границы каталога (см. 1.4.4). Элементы также типизируются как `DIR:<path>/`.
- `GLOB` — разрешены пути, удовлетворяющие glob-правилам, описанным в 1.4.5.

Если поле `ALLOWLIST_PATHS_MODE` отсутствует, применяется `EXACT`.

Если `ALLOWLIST_PATHS_MODE=EXACT`, элементы `ALLOWLIST_PATHS` без префикса `FILE:` или `DIR:` делают Execution Ticket недействительным.

#### 1.4.2 Allowlist Commands
Список команд, которые разрешено выполнять в рамках конкретного Execution Ticket.

Матчинг команд всегда производится по нормализованной форме `COMMAND_KEY` (см. 1.4.6) и является строгим: разрешены только те `COMMAND_KEY`, которые перечислены в эффективном allowlist (см. 1.4.7).

`ALLOWLIST_COMMANDS_MODE` определяет семантику списка команд:
- `ADDITIVE` — команды из тикета добавляются к дефолтному списку профиля.
- `REPLACE` — команды из тикета полностью заменяют дефолтный список профиля.

Если поле `ALLOWLIST_COMMANDS_MODE` отсутствует, применяется `ADDITIVE`.

Если `ALLOWLIST_COMMANDS_MODE=REPLACE` и `ALLOWLIST_COMMANDS` пуст, Execution Ticket недействителен.

#### 1.4.3 Allowlist File (для исключений проверок)
Allowlist File используется только для случаев, когда проверка (например, `doctor`) читает внешний allowlist/исключение. Это не ограничивает `ALLOWLIST_PATHS` Execution Ticket.

Файл считается allowlist-файлом только при выполнении хотя бы одного условия:
1) путь к файлу явно читается `scripts/doctor.mjs` (или конфигом, который он загружает) как allowlist/исключение;
2) вывод `doctor` или другая проверка прямо указывает этот файл как allowlist/исключение;
3) в коде проверок есть константа/параметр/CLI-аргумент, который явно указывает на этот файл как allowlist.

Эвристики по названию/пути/содержанию не являются доказательством.

#### 1.4.4 Правило границы каталога
Сопоставление каталога выполняется не по строковому префиксу, а по каталожной принадлежности:
- разрешённый каталог `P` матчится на путь `X`, если `X` начинается с `P + "/"` (граница каталога обязательна).

#### 1.4.5 Спецификация GLOB
Для `ALLOWLIST_PATHS_MODE=GLOB` используются правила:
- поддерживаются паттерны: `*`, `?`, `[...]`, `**`;
- `*` — ноль или более символов внутри одного сегмента пути (не матчится на `/`);
- `?` — ровно один символ внутри одного сегмента пути (не матчится на `/`);
- `[...]` — класс символов внутри одного сегмента пути;
- `**` — ноль или более сегментов каталогов, включая `/`;
- разделитель сегментов — `/`;
- сопоставление выполняется после нормализации путей по 1.5;
- паттерны сравниваются с repo-relative путями;
- экранирование:
  - `\*`, `\?`, `\[`, `\]`, `\\` интерпретируются как литералы `*`, `?`, `[`, `]`, `\`.

Если движок сопоставления не поддерживает эти правила в точности, режим `GLOB` запрещён для механического enforcement и Execution Ticket недействителен.

#### 1.4.6 Нормализация команд и COMMAND_KEY
Каждая выполняемая команда приводится к `COMMAND_KEY`:
- `COMMAND_KEY = <binary> ":" <subcommand>`,
- `<binary>` — первый токен (например, `git`, `npm`, `node`, `rg`, `gh`),
- `<subcommand>`:
  - для `git`: значение парсится по правилам 1.4.9;
  - для `npm`: второй токен (например, `test`, `ci`);
  - для `gh`: второй токен (например, `pr`, `repo`, `issue`);
  - для `node`: фиксированное значение `run`, при этом путь к скрипту проверяется отдельно по allowlist (см. 1.4.8);
  - для остальных бинарников: значение `default`.

Аргументы, флаги и refspec не участвуют в разрешении (они валидируются отдельными правилами запрета/allowlist-ограничениями, см. 4.5).

#### 1.4.7 Эффективный allowlist команд
Эффективный allowlist команд формируется так:
- берётся дефолтный allowlist профиля (4.1/4.2);
- если `ALLOWLIST_COMMANDS_MODE=ADDITIVE`, добавляются `COMMAND_KEY` из тикета;
- если `ALLOWLIST_COMMANDS_MODE=REPLACE`, дефолтный allowlist игнорируется и используется только список из тикета.

Разрешение команды происходит только если её `COMMAND_KEY` входит в эффективный allowlist.

#### 1.4.8 Разрешение `node` выполнения
Команда `node` разрешается только в форме:
- `node <script_path> <args...>`
и только если `node:run` разрешён эффективным allowlist, а `<script_path>` входит в список разрешённых скриптов.

Источник списка разрешённых скриптов:
- поле `ALLOWED_NODE_SCRIPTS` в Execution Ticket (обязательное, если `node:run` используется), либо
- жёсткий список в профиле (если проект выбрал такой режим).

Если `node:run` разрешён, но список разрешённых скриптов не определён одним из источников выше, Execution Ticket недействителен.

#### 1.4.9 Git parsing (глобальные опции)
Разрешённые формы `git`:
- `git <subcommand> <args...>`
- `git --no-pager <subcommand> <args...>`

Запрещены любые глобальные опции до подкоманды, кроме `--no-pager`, включая:
- `git -c ... <subcommand>`
- `git -C <path> <subcommand>`
- `git --work-tree ...`
- `git --git-dir ...`

## 1.5 Нормализация путей
Все проверки scope выполняются по нормализованным путям:
- repo-relative,
- без `..`,
- без абсолютных путей,
- без symlink escape,
- единый формат пути (POSIX `/`).

Если нормализация невозможна, выполнение прекращается.

### 1.5.1 Нормализация для create/modify/delete/rename
Нормализация путей должна работать для операций, где path может не существовать на диске:
- create: путь берётся из git-вывода и нормализуется строково, затем проверяется `parent realpath` (см. 1.5.3).
- modify: допускается `realpath`, если файл существует; иначе — строковая нормализация, затем `parent realpath` (см. 1.5.3).
- delete: `realpath` не применяется; используется строковая нормализация по git-выводу.
- rename/copy: нормализуются оба пути (старый и новый) по git-выводу; оба пути подлежат allowlist-проверке; для нового пути выполняется `parent realpath` (см. 1.5.3), если родитель существует.

### 1.5.2 Symlink escape (общий критерий)
Symlink escape считается нарушением, если:
- любой существующий изменяемый путь имеет `realpath`, выходящий за `realpath(REPO_ROOT) + "/"`, или
- для create/modify/rename обнаружен существующий родительский каталог, чей `realpath` выходит за `REPO_ROOT` (см. 1.5.3).

### 1.5.3 Parent-realpath check (P0)
Для create/modify/rename, даже если целевой путь ещё не существует:
- берётся ближайший существующий родительский каталог `PARENT(path)`;
- вычисляется `realpath(PARENT(path))`;
- разрешено только если `realpath(PARENT(path))` имеет префикс `realpath(REPO_ROOT) + "/"`;
- если ближайший существующий родитель не найден, проверяется ближайший существующий предок; при отсутствии такового выполнение прекращается.

## 1.6 Командная строка и shell-операторы (механический enforcement)
Политика предполагает, что агент выполняет команды без shell-интерпретации.

Запрещены в любом виде shell-операторы и конструкции:
- `|`, `||`, `&&`, `;`, `&`
- `>`, `>>`, `<`, `<<`, heredoc
- `$()`, backticks, process substitution

Разрешены только одиночные “простые команды” без shell-операторов.

Если требуется пайплайн, он должен быть разбит на отдельные команды и выполнен в несколько шагов, каждая команда проходит независимую проверку allowlist команд.

## 1.7 Top-level vs subprocess (исполняемая граница)
Allowlist команд применяется к top-level командам, которые агент запускает напрямую.

Subprocess, порождённые разрешёнными top-level командами, не проходят отдельную allowlist-проверку, но считаются допустимыми только в рамках поведения разрешённой команды.

## 2) Роль DOCS (Docs/Context)

### 2.1 Ответственность
- Читать и суммаризировать документы и контекст.
- Формулировать требования, критерии готовности и ограничения.
- Готовить Execution Ticket для роли CODE.
- Выявлять риски, противоречия, недостающие входные данные.

### 2.2 Обязанности (выходы)
- TL;DR / Decisions / Risks / Next Steps.
- Execution Ticket, содержащий цели, allowlist путей/команд, гейты и стоп-условия.
- Явный список REQUIRED_INPUT, если данных недостаточно.

### 2.3 Права (жёстко)
- Репозиторий: только чтение.
- Запрещены любые изменения файлов репозитория (включая `docs/**`).
- Запрещены: `git add`, `git commit`, `git push`, любые команды, изменяющие рабочее дерево.
- Секреты: отсутствуют.
- Сеть: выключена по умолчанию; включение допускается только по явному разрешению человека и отдельному профилю.

### 2.4 Стоп-условия
- Если требуется изменить репозиторий, DOCS прекращает выполнение и выдаёт Execution Ticket для CODE.
- Любые попытки “повышения прав”, обхода ограничений или изменения прав/владельца/ACL запрещены.

## 3) Роль CODE (Code/Execution)

### 3.1 Ответственность
- Вносить изменения в репозиторий.
- Запускать проверки и тесты.
- Делать коммиты, пушить ветки, создавать PR или подготавливать PR-артефакты (см. 3.5).
- Вести проверяемый лог выполнения (CHECK-блоки).

### 3.2 Обязанности (выходы)
- Изменения только в пределах Allowlist Paths, заданных Execution Ticket.
- Выполнение всех гейтов из Execution Ticket.
- Отчёт по формату Execution Ticket.
- При неполном или неутверждённом Execution Ticket: остановка и заполнение REQUIRED_INPUT.

### 3.3 Права (жёстко)
- Репозиторий: read/write только в пределах Allowlist Paths текущего Execution Ticket.
- `git push` разрешён только после прохождения всех гейтов, включая COMMIT_BINDING (см. 5.6), и post-push проверки удалённой ссылки на `PUSH_BRANCH`.
- Секреты: только если Execution Ticket содержит `SECRETS_REQUIRED=true` и заполнены поля утверждения человеком, с ограничением по scope.
- Сеть: выключена по умолчанию; включение допускается только если Execution Ticket содержит `NETWORK_REQUIRED=true`, указан allowlist доменов, и заполнены поля утверждения человеком.

### 3.4 Стоп-условия (обязательные)
CODE прекращает выполнение и не коммитит/не пушит, если:
- любой из scope-гейтов (5.3) показывает путь вне Allowlist Paths;
- требуется `sudo`, `chmod`, `chown`, изменение ACL, `xattr` или любое “повышение прав”;
- нарушены правила командной строки и shell-операторов (1.6);
- нарушены правила symlink escape (1.5.2–1.5.3);
- проверки из Execution Ticket не проходят.

### 3.5 PR-семантика (исполняемая)
Поле `PR_MODE` в Execution Ticket является обязательным и не имеет скрытых дефолтов.

Допустимые значения:
- `PR_MODE=URL_ONLY`: CODE обязан подготовить URL для создания PR через compare-ссылку и сформировать `PR_TITLE`/`PR_BODY`; PR создаёт человек.
- `PR_MODE=CLI`: CODE создаёт PR через `gh`, если:
  - `gh:pr` добавлен в allowlist команд,
  - `NETWORK_REQUIRED=true`,
  - `SECRETS_REQUIRED=true`,
  - allowlist доменов включает `github.com` (или корпоративный хост),
  - поля утверждения человеком заполнены,
  - в тикете задано обязательное поле `BASE_BRANCH`.

Если `PR_MODE=CLI` задан, но условия не выполнены, Execution Ticket недействителен.

### 3.6 PR_MERGE_DUMP_BLOCK
Используется один markdown code-fence как copy-paste блок для PR description.

`PR_CREATE_READY`
- Этап, когда есть compare URL и PR еще не создан.
- Строка `- PR: (pending)` допустима.

`PR_MERGE_READY`
- Этап, когда PR уже создан и можно переходить к merge.
- Строка `- PR: https://github.com/<owner>/<repo>/pull/<N>` должна быть заполнена.
- Строка `- PR: (pending)` не допускается.

Stop rule:
- Если этап `PR_MERGE_READY` и строка `PR:` отсутствует или содержит `(pending)`, вернуть `STOP=REQUIRED_INPUT_MISSING` и запросить `PR_URL`.

Template shape:
```md
# CHANGED
- <path>

# CHECK
- <check>

# OUT
- committed: <sha>
- pushed ref: origin/<branch>
- PR create URL: <compare_url>
- PR: (pending)

# FAIL_REASON
- (empty)

# EVIDENCE
- (empty)

# REQUIRED_INPUT
- (empty)
```

## 4) Профили прав

### 4.1 PROFILE_DOCS
- FS: репозиторий read-only
- Commands allowlist (COMMAND_KEY):
  - `rg:default`, `cat:default`, `sed:default`, `ls:default`
  - `git:status`, `git:diff`, `git:show`
- Network: off
- Secrets: none

### 4.2 PROFILE_CODE
- FS: репозиторий read/write с enforced Allowlist Paths
- Commands allowlist (COMMAND_KEY, по умолчанию):
  - `rg:default`
  - `git:status`, `git:diff`, `git:show`, `git:switch`, `git:rev-parse`
  - `git:add`, `git:commit`
  - `git:fetch`, `git:log`, `git:merge-base`, `git:branch`
  - `git:ls-files`
  - `git:revert`
  - `node:run`
  - `npm:test`
  - `git:push`
- Network: off (если не разрешено Execution Ticket)
- Secrets: scoped, по Execution Ticket

### 4.3 Запрещённые действия (не override’ятся)
Следующие действия запрещены всегда и не могут быть разрешены через Execution Ticket:
- `sudo`
- `chmod`, `chown`, любые изменения ACL/владельца/прав, `xattr`
- `rm -rf`
- `git clean -fd`
- `git reset --hard`
- `ssh`, `scp`

### 4.4 Network и secrets (двойное условие)
Network и secrets допускаются только при одновременном выполнении двух условий:
1) Execution Ticket содержит `NETWORK_REQUIRED=true` (или `SECRETS_REQUIRED=true`) и соответствующие allowlist/scope поля;
2) Execution Ticket содержит заполненные поля утверждения человеком (6.2).

### 4.5 Ограничения аргументов для критичных команд
Даже если `COMMAND_KEY` разрешён, действуют дополнительные ограничения аргументов.

#### 4.5.1 `git push`
Запрещены аргументы/варианты:
- `--force`, `--force-with-lease`, `--mirror`, `--all`, `--tags`, `--delete`, `--atomic`
- любые push в refs, отличные от `PUSH_BRANCH`
- любые refspec формы `A:B`

Разрешены только варианты:
- `git push origin <PUSH_BRANCH>`
- `git push -u origin <PUSH_BRANCH>`

#### 4.5.2 `git branch`
Запрещены:
- `-D`, `--delete --force`

#### 4.5.3 `git add`
Разрешены только варианты:
- `git add -- <path>` где `<path>` после нормализации (1.5) и матчинга (1.4) принадлежит Allowlist Paths

Запрещены:
- `git add .`
- `git add -A`
- `git add --all`
- `git add -u`

#### 4.5.4 `git commit`
Запрещены:
- `--amend`
- `--no-verify`
- `-a`

#### 4.5.5 `gh pr` (только при PR_MODE=CLI)
Разрешённые операции для `gh` ограничены:
- разрешён только `gh pr create`
- запрещены `gh pr merge`, `gh pr review`, `gh pr close` и любые операции, изменяющие состояние PR без отдельного тикета

Для `gh pr create` запрещены:
- авто-мердж/слияние
- указание base, отличного от `BASE_BRANCH` из тикета

#### 4.5.6 `git fetch`
Разрешены только варианты:
- `git fetch origin`

## 5) Гейты (обязательные проверки в CODE)

### 5.1 STATUS_CLEAN_PRE
CMD: `git status --porcelain --untracked-files=all`  
EXPECT: `(empty)`

### 5.2 BASELINE_BINDING_PRE (обязательный)
CMD: `git rev-parse HEAD`  
EXPECT: значение равно `BASE_SHA` из Execution Ticket.

Если baseline не совпадает, выполнение прекращается и требуется новый Execution Ticket (или обновление `BASE_SHA` с повторным утверждением человеком).

### 5.3 SCOPE_GATES (обязательная связка)
Все результаты команд ниже сравниваются с Allowlist Paths только после нормализации путей по 1.5 и применения правил матчинга из 1.4.1/1.4.4/1.4.5.

Для rename/copy обязателен вывод обеих сторон (старого и нового пути):
- используются команды с `--name-status -M -C`, чтобы получить обе стороны rename/copy;
- оба пути подлежат allowlist-проверке.

Поле `ALLOW_NEW_FILES` в Execution Ticket определяет режим untracked:
- `false` — untracked должен быть пустым.
- `true` — untracked допускается только в пределах Allowlist Paths.

Если поле `ALLOW_NEW_FILES` отсутствует, применяется `false`.

1) WORKTREE_SCOPE  
CMD: `git diff --name-status -M -C`  
EXPECT: все пути (включая оба пути в rename/copy) принадлежат Allowlist Paths

2) STAGED_SCOPE  
CMD: `git diff --cached --name-status -M -C`  
EXPECT: все пути (включая оба пути в rename/copy) принадлежат Allowlist Paths

3) UNTRACKED_SCOPE  
CMD: `git ls-files --others --exclude-standard`  
EXPECT:
- если `ALLOW_NEW_FILES=false`: `(empty)`
- если `ALLOW_NEW_FILES=true`: только Allowlist Paths

### 5.4 Совместимость с CHK-ALLOWLIST-DIFF
Требование `CHK-ALLOWLIST-DIFF`, основанное на `git diff --name-only`, считается покрытым (и усиленным) гейтами `5.3 WORKTREE_SCOPE/STAGED_SCOPE`, так как:
- `--name-status -M -C` включает как минимум те же пути, что `--name-only`,
- дополнительно покрывает rename/copy и предоставляет обе стороны операции.

### 5.5 REQUIRED_CHECKS (пример, если применимо проекту)
- CMD: `node scripts/doctor.mjs (strict baseline mode per project policy)`
- CMD: `npm test`

### 5.6 COMMIT_BINDING (P0, обязательный gate)
Цель: гарантировать, что проверенное состояние (`VERIFIED_SHA`) — это ровно то, что оказалось в удалённой ссылке.

PRE-PUSH:
- CMD: `git rev-parse HEAD`
  OUT: `VERIFIED_SHA`
  EXPECT: `VERIFIED_SHA` зафиксирован и не меняется до конца процедуры push

PUSH:
- CMD: `git push origin <PUSH_BRANCH>` (или `git push -u origin <PUSH_BRANCH>`)

POST-PUSH VERIFY:
- CMD: `git fetch origin`
- CMD: `git rev-parse origin/<PUSH_BRANCH>`
  OUT: `REMOTE_SHA`
  EXPECT: `REMOTE_SHA == VERIFIED_SHA`

Если `REMOTE_SHA != VERIFIED_SHA`, выполнение прекращается и требуется инцидентная процедура.

### 5.7 POST_COMMIT_PROOF
- CMD: `git show --name-status -M -C --pretty=format: HEAD`
  EXPECT: все пути (включая оба пути в rename/copy) принадлежат Allowlist Paths
- CMD: `git status --porcelain --untracked-files=all`
  EXPECT: `(empty)`

## 6) Execution Ticket (единственный вход в CODE)

### 6.1 Правило запуска
CODE не выполняет никаких изменений репозитория без валидного Execution Ticket.

### 6.2 Обязательные поля Execution Ticket
Идентификация и утверждение человеком:
- `TICKET_ID`
- `APPROVED_BY`
- `APPROVED_AT`
- `BASE_SHA`
- `PUSH_BRANCH`
- `PR_MODE`

Обязательные содержательные поля:
- `GOAL` (не пустой)
- `ALLOWLIST_PATHS` (не пустой)
- `CHECKS` (не пустой)
- `REPORT_FORMAT` (не пустой), совместимый с каноном `docs/OPS/OPS-REPORT-FORMAT.md`

Если `PR_MODE=CLI`, обязательно:
- `BASE_BRANCH`

Если `node:run` используется в `CHECKS`, обязательно:
- `ALLOWED_NODE_SCRIPTS` (не пустой)

Если `ALLOWLIST_PATHS_MODE=EXACT`, обязательно:
- типизация каждого элемента `ALLOWLIST_PATHS` как `FILE:` или `DIR:`

### 6.3 Шаблон Execution Ticket

EXECUTION TICKET  
TICKET_ID: <id>  
MODEL: Codex 5.3  
ROLE: CODE  
PERMISSIONS_PROFILE: PROFILE_CODE  
APPROVED_BY: <name/handle>  
APPROVED_AT: <iso8601>  
BASE_SHA: <sha>  
PUSH_BRANCH: <branch>  
PR_MODE: URL_ONLY  

ALLOWLIST_PATHS_MODE
- EXACT

ALLOWLIST_COMMANDS_MODE
- ADDITIVE

ALLOW_NEW_FILES
- false

ALLOWED_NODE_SCRIPTS
- scripts/doctor.mjs

GOAL
- <что нужно получить>

ALLOWLIST_PATHS
- FILE:docs/OPS/X.md
- DIR:docs/OPS/subdir/

CHECKS (mandatory)
- STATUS_CLEAN_PRE: `git status --porcelain --untracked-files=all`
- BASELINE_BINDING_PRE: `git rev-parse HEAD`
- WORKTREE_SCOPE: `git diff --name-status -M -C`
- STAGED_SCOPE: `git diff --cached --name-status -M -C`
- UNTRACKED_SCOPE: `git ls-files --others --exclude-standard`
- REQUIRED_CHECKS: `node scripts/doctor.mjs (strict baseline mode per project policy)`
- REQUIRED_CHECKS: `npm test`
- COMMIT_BINDING_PRE: `git rev-parse HEAD`
- COMMIT_BINDING_PUSH: `git push origin <PUSH_BRANCH>`
- COMMIT_BINDING_POST: `git fetch origin` + `git rev-parse origin/<PUSH_BRANCH>`

NETWORK_REQUIRED
- false

SECRETS_REQUIRED
- false

REPORT_FORMAT
- `docs/OPS/OPS-REPORT-FORMAT.md` (или явно эквивалентный формат: `CHANGED / CHECK / OUT / FAIL_REASON / EVIDENCE / REQUIRED_INPUT`)

## 7) Процедура инцидента (нарушение scope)
Если CODE изменил/запушил неразрешённые файлы или нарушил стоп-условия:
1) Остановиться, не делать новых коммитов без плана отката.
2) Предпочтительный откат: revert (сохраняет аудит).
3) Reset+force как механизм отката в рамках роли CODE запрещён.
4) Emergency reset+force допускается только как отдельный процесс вне CODE и только при явном разрешении человека, с отдельным утверждённым планом.

## 8) План внедрения

### Этап 1
- Зафиксировать policy `v1.0` одним последним патчем: только 2 P0 (`COMMIT_BINDING` как обязательный gate + symlink-check для `create` через ближайший существующий parent).
- Заморозить policy на `N=3` реальных тикета.
- Прогонять тикеты в минимальном объёме: 1 ветка, 1 коммит, узкий allowlist, полный CHECK-блок.
- Делать постмортем после каждого тикета: только факты `PASS/STOP`, причина, что менять в policy (если нужно).

### Этап 2
- Если 3/3 без блокеров → policy остаётся как есть.
- Если были блокеры → один `v1.1` патч только по подтверждённым кейсам.

## 9) Минимальная конституция
1) DOCS не изменяет репозиторий.
2) CODE работает только при наличии валидного Execution Ticket с человеческим утверждением.
3) CODE меняет только Allowlist Paths из Execution Ticket.
4) Запрещённые действия из 4.3 не выполняются никогда.
5) Push/PR только после baseline-binding, scope-гейтов, COMMIT_BINDING и доказательств.
