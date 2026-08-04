# COREX Changelog

Формат записи (обязателен для каждой версии):
- Version:
- Date:
- Reason:
- Effect:
- Rollback:

---

- Version: COREX.v2
- Date: 2026-08-04
- Reason: COREX v1 смешивал workspaces, modes и profiles, описывал любую
  операцию как Command, заявлял Plugin Runtime v1 и содержал историческую
  roadmap M2–M8, которая больше не является execution authority.
- Source binding: owner architecture input SHA-256
  `3da9aafcbc26ecbc1ab868aedf353b63d07af56418dabded13df16f5b93e8913`;
  frozen COREX v1 SHA-256
  `eb01e070a91bb99a9703f319e9aa3090e5ccf7806dbf7739694a6881813dacc8`;
  feature integration doctrine SHA-256
  `6188e9d213167724c479da73a08f513fd6c985a3987c4fb5cbbfae9e56710070`.
- Published COREX v2 SHA-256:
  `ea25f66352497e58935c673d3bf3c82d828e31dcc3cdad1ca19ef1250512f0bf`.
- Effect: зафиксированы Product Core, Command Kernel, Design OS, Renderer и
  adapters; Command/Query/Event/Effect/Background Job; пять state classes;
  current-vs-target law; controlled Core evolution; точные workspaces, shell
  modes и profiles; declarative-only extension boundary Writer v1.
- Compatibility: COREX v1 сохранён без изменения как historical frozen input.
  Active execution canon и CANON_STATUS не изменяются.
- Rollback: вернуть pointer COREX.md на COREX.v1.md и откатить связанные
  repo-bootstrap документы, manifest и validator одним PR. Не удалять v2.

---

- Version: COREX.v1
- Date: 2026-02-01
- Reason: Ввести COREX как отдельный канонический слой (философия + целевая архитектура + долгий горизонт), без переписывания CANON/BIBLE.
- Effect: Добавлен `docs/corex/` (pointer + COREX.v1 + changelog) и ссылки на COREX в документах инициализации агента.
- Rollback: Удалить `docs/corex/` и откатить изменения в `README.md`, `agents.md`, `docs/AGENT_START_PROMPT.md`, `docs/HANDOFF.md`.
