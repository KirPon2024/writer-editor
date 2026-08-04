# Yalken Documentation Constitution

STATUS: ACTIVE_DOCUMENT_CLASSIFICATION_AND_DRIFT_LAW

Цель: репозиторий имеет одну разрешаемую truth chain. Документы разных ролей
не конкурируют за authority и не превращают historical evidence в текущий law.

## 1. Document classes

### EXECUTION_RESOLVER

`CANON_STATUS.json` выбирает единственный active execution canon и extensions.
Имя канона нельзя запоминать или угадывать.

### EXECUTION_LAW

Resolved active canon содержит machine-bound blocking execution law. Только
resolver может сделать конкретный execution document active.

### REPO_CANON

`CANON.md` определяет repo change control и интерпретацию. Он не отменяет
binding law active execution canon.

### TARGET_ARCHITECTURE

Current COREX и doctrine описывают философию, архитектурные ownership contracts
и долгий горизонт. Они не доказывают live capability.

### PRODUCT_MAP

`BIBLE.md` задаёт product scope, north star и order. Он не является CI receipt.

### FACTUAL_STATUS

`CONTEXT.md`, `HANDOFF.md` и current status matrices описывают наблюдаемое
состояние на названном SHA. Без SHA/даты/границы утверждения status устаревает.

### PROCESS

`PROCESS.md`, AGENTS и agent protocol определяют способ работы, preflight,
delivery и report format. Process не создаёт product capability.

### EVIDENCE

Receipts, artifacts и reports подтверждают только named scope на exact SHA,
build/profile, numerator/denominator и oracle. Evidence не пишет law обратно.

### REFERENCE

Исследования, guides и examples помогают решению, но не переопределяют canon.

### HISTORICAL

Superseded plans, old milestones и frozen previous versions сохраняются для
traceability. Их внутренний `ACTIVE` label не сильнее текущего resolver-а.

## 2. Precedence

```text
EXECUTION_RESOLVER_AND_RESOLVED_LAW
  > REPO_CANON
  > CURRENT_COREX
  > PRODUCT_MAP
  > FACTUAL_STATUS_AND_EXACT_CODE_EVIDENCE
  > PROCESS
  > REFERENCE_AND_HISTORICAL
```

Exact code/evidence определяет, реализован ли target. Оно не отменяет higher
law; при конфликте возникает reconciliation task, а не свободная трактовка.

## 3. Required document header

Новый governing или status document объявляет:

- `STATUS`;
- `ROLE` или `DOCUMENT_CLASS`;
- `CLAIM_BOUNDARY`;
- для factual/evidence: exact SHA, generated/observed time и scope;
- для versioned law: previous version и rollback.

Отсутствующий header делает документ advisory до явной классификации.

## 4. Current/target/historical language

- `CURRENT` — подтверждено current exact code/evidence.
- `TARGET` — требуемая или желаемая архитектура.
- `CANDIDATE` — branch-local и не merged truth.
- `HISTORICAL` — было применимо к старому SHA/этапу.
- `UNKNOWN` — доказательство отсутствует или stale.

Слова complete, supported, safe, production, terminal и pass требуют claim
scope и evidence. Count-only, screenshot-only и self-PASS недостаточны.

## 5. Versioning and freeze

- Frozen document не редактируется; выпускается новая версия.
- Pointer/resolver меняется вместе с changelog и validator.
- Старую версию не удалять и не переписывать как будто она всегда была новой.
- Новая версия не становится execution law, если resolver этого не объявил.
- Rollback возвращает pointer/policy и сохраняет обе версии для audit.

## 6. Capability truth

Human-facing docs обязаны ссылаться на один current capability authority или
явно объяснять роли нескольких matrices:

- platform capability;
- product support status;
- command-to-capability binding;
- physical/profile-specific evidence.

Matrix с другим SHA не может повысить current claim. `PLANNED`, `PARTIAL`,
`MANUAL_ONLY`, `BLOCKED`, `UNKNOWN` и profile-specific status не нормализуются
в `SUPPORTED` ради краткого отчёта.

## 7. Change protocol

При изменении architecture/process:

1. определить изменяемый document class;
2. проверить higher authority;
3. обновить минимальный canonical set;
4. не переписывать factual docs до фактического cutover;
5. обновить machine manifest/schema/validator;
6. добавить positive и negative contract tests;
7. завершить full delivery chain;
8. выполнить exact-head post-merge verification.

## 8. Anti-duplication law

Machine-enforced enumerations имеют один JSON source. Markdown объясняет их и
может содержать краткое отображение, но validator обязан ловить расхождение.

Нельзя создавать второй active canon, второй command catalog, второй state
taxonomy или частный glossary внутри feature pack.

## 9. Drift stop signals

- resolver path отсутствует или указывает вне repo;
- две версии объявлены current без единого pointer;
- factual status не называет SHA/scope для blocking claim;
- target language выдан как live;
- evidence относится к другому head/build/profile;
- current doc ссылается на superseded terminology как canonical;
- machine manifest и Markdown расходятся;
- generated artifact редактируется вручную без source regeneration.

Любой такой сигнал означает STOP_RECONCILIATION_REQUIRED.
