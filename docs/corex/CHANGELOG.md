# COREX Changelog

Формат записи (обязателен для каждой версии):
- Version:
- Date:
- Reason:
- Effect:
- Rollback:

---

- Version: COREX.v1
- Date: 2026-02-01
- Reason: Ввести COREX как отдельный канонический слой (философия + целевая архитектура + долгий горизонт), без переписывания CANON/BIBLE.
- Effect: Добавлен `docs/corex/` (pointer + COREX.v1 + changelog) и ссылки на COREX в документах инициализации агента.
- Rollback: Удалить `docs/corex/` и откатить изменения в `README.md`, `agents.md`, `docs/AGENT_START_PROMPT.md`, `docs/HANDOFF.md`.

