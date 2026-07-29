# COREX (указатель)

COREX — **версионированная энциклопедия** проекта YALKEN / Writer-Editor:
- философия
- целевая архитектурная модель
- долгосрочный вектор развития

COREX:
- не заменяет и не переписывает существующие каноны
- не управляет кодом напрямую
- не является текущим ТЗ

## Иерархия источников истины (жёстко)
1. `docs/OPS/STATUS/CANON_STATUS.json` и указанный active execution canon
2. `CANON.md` — верхний repo canon (правила, запреты, приоритеты)
3. `docs/corex/COREX.vN.md` — философия + целевая архитектура + долгий горизонт
4. `docs/BIBLE.md` — product map и roadmap
5. Остальные `docs/**` — factual, process и справочные материалы

Правило конфликта: active execution canon имеет высший execution priority;
`CANON.md` имеет приоритет над COREX и BIBLE и не может отменить binding law
из active execution canon.

## Текущая версия
- Каноническая версия: `docs/corex/COREX.v1.md`
- Методическая детализация интеграции фич без изменения frozen COREX:
  `docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md`

Доктрина подчинена COREX и active canon. Она разъясняет две плоскости
подключения фичи: product contracts для смысла и эффектов, Design OS contracts
для surfaces, slots и вычисляемой формы интерфейса.

## Правило изменения (жёстко)
- Любые правки COREX — только через выпуск новой версии: `COREX.v2.md`, `COREX.v3.md`, ...
- Каждая новая версия обязана быть записана в `docs/corex/CHANGELOG.md` (причина / эффект / rollback).

## Нейминг (политика)
- В COREX фиксируется философское имя: **YALKEN / Writer-Editor**
- Во внутренних идентификаторах временно сохраняется legacy имя (**craftsman**) до отдельного этапа deep rename
