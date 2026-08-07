# Yalken Interop: proof-carrying import/export engineering specification V1

```text
DOCUMENT_CLASS: TARGET_ENGINEERING_SPECIFICATION
TASK_ID: YALKEN_IMPORT_EXPORT_PROOF_CARRYING_ENGINEERING_SPEC_V1
STATUS: PROPOSED_NOT_CURRENT_NOT_ACCEPTANCE_EVIDENCE
BINDING_BASE_SHA: 71d793db4cdeb78f7ff1db46699a91b9d3ac3a60
AUDITED_CANDIDATE_SHA: 5def7069b69306e804516587d1583674210b96a8
AUDIT_ARCHIVE_SHA256: fcf0a4e6399542cef0dde13e0a19d6d1dacbd485b5760df184bcf1b2815d8841
DATE: 2026-08-07
DESIGN_TOOL_ROUTER: NOT_APPLICABLE_DOCS_ONLY
CLAIM_CEILING: архитектурный план и проверяемые гипотезы; не реализация, не Word acceptance, не Google acceptance
```

## 0. Решение в одном абзаце

Yalken не должен строить один универсальный «импорт-экспорт». Нужны три явно
разделённых контракта: перенос содержимого из произвольного файла, обычная
публикация документа и связанный с конкретной ревизией проекта цикл рецензирования.
Только третий контракт имеет право интерпретировать изменения Word или Google как
кандидатов на изменение рукописи. Он строится как proof-carrying pipeline:
зафиксированная ревизия → фактический baseline после self-parse → подписанная
идентичность раунда → карантин недоверенного возврата → детерминированная
классификация → видимое решение пользователя → повторная проверка Command Kernel →
атомарное применение → обратная проверка и recovery → доказательство, привязанное к
точному SHA, профилю редактора и знаменателю операций. Практический путь —
хирургически завершить уже существующий Word V4/C5V2 контур, а не переписывать его;
Google включать только после насыщения Word и сначала как файловый профиль того же
протокола без cloud/runtime authority.

## 1. Что именно означает «100%»

### 1.1. Запрещённое обещание

Нельзя обещать 100% семантическое сохранение любого DOCX, созданного любой версией
Word, Google Docs или сторонним редактором. DOCX содержит поля, истории, секции,
таблицы, плавающие объекты, макросы, внешние связи, произвольные расширения и
редактороспецифичное поведение. Такое обещание нефальсифицируемо и создаёт ложный
green.

### 1.2. Разрешённое доказуемое обещание

Для заранее замороженного `InteropProfile` и корпуса `U` каждый наблюдаемый элемент
возврата обязан попасть ровно в один терминальный класс:

```text
|U| = |EXACT_APPLIED| + |MANUAL_DECISION| + |BLOCKED_UNSAFE| + |DIAGNOSTIC_ONLY|

MISSING = 0
UNKNOWN = 0
DUPLICATE = 0
NOT_RUN = 0
SILENTLY_DROPPED = 0
```

`100% CLASSIFIED` не равно `100% AUTO_APPLIED`. Терминальный claim всегда сообщает
оба числа отдельно. Ручной или заблокированный исход допустим только когда он:

1. имеет стабильный reason code;
2. видим пользователю до mutation;
3. включён в знаменатель;
4. не меняет manuscript truth;
5. имеет воспроизводимое доказательство причины.

### 1.3. Единица доказательства

Единица доказательства — не файл и не тестовый suite, а `OperationCase`:

```text
caseId
profileId
sourceArtifactId
returnArtifactId
roundId
sceneId
operationFamily
expectedClass
actualClass
reasonCode
beforeRevision
afterRevision
evidenceHashes[]
producerRunId
verifierRunId
```

Любая сводная цифра должна раскрываться до полного списка таких единиц.

## 2. Источники истины и честная текущая граница

### 2.1. Приоритет источников

Для реализации действует следующий порядок:

1. active canon и архитектурная доктрина;
2. exact-head production code и Command Kernel policy;
3. exact-head тесты;
4. физическое evidence с совпадающими SHA, профилем, корпусом и знаменателем;
5. статусные матрицы, если их bindings совпадают;
6. этот документ как TARGET-план;
7. приложенный аудит как входная гипотеза, но не authority.

Исторический receipt не расширяет текущий capability. Документ или матрица не
может сделать live то, чего нет в production command path.

### 2.2. Сверенный статус

| Область | Доказанное состояние | Claim ceiling |
|---|---|---|
| Базовый репозиторий | `71d793d…`, current `origin/main` на момент preflight | CURRENT только для этого SHA |
| Аудируемый Word-кандидат | `5def706…`, 27 commits поверх binding base | UNMERGED_CANDIDATE |
| Последний прогон из архива | 578/594; 16 коррелированных падений orchestrator; `ENOENT/cwd-path`; пустой `headSha` в failure capture | RED, причина не закрыта |
| Повторный диагностический прогон того же кандидата | 594/594 на той же машине и SHA | не supersede RED; доказывает недетерминированность |
| Word | bounded TXT/MD/DOCX и часть review-runtime реализованы; terminal claim не сделан | NOT_SATURATED |
| Google | report-only матрица; нет physical и product-runtime evidence | BLOCKED_BEFORE_WORD_GATE |

Красный и зелёный полный граф на одном SHA образуют состояние
`NONDETERMINISTIC_UNRESOLVED`. Повторный green не является исправлением.

### 2.3. Что не следует расследовать заново без регрессии

В аудируемом кандидате есть точные regression tests для ранее найденных проблем:

- перекрывающиеся одинаковые occurrences;
- вычисление batch относительно immutable baseline;
- инвариантность результата к перестановке batch;
- полная привязка identity/envelope.

Их статус: `IMPLEMENTED_IN_UNMERGED_CANDIDATE`, а не `CURRENT_ACCEPTED`. Эти дефекты
не открываются заново в C00–C01, если новый тест или physical artifact не докажет
регрессию.

### 2.4. Текущие разрывы, которые нельзя замаскировать

1. Полный RTK-граф дал красный и зелёный исход на одном SHA; root cause неизвестен.
2. Failure capture допускает пустой `headSha`, потому что ошибка получения SHA не
   становится собственной fail-closed причиной.
3. Test runner буферизует вывод через синхронный дочерний процесс и не даёт heartbeat
   во время многоминутного прогона.
4. Raw `hmacSecret` сохраняется в локальном project state; обязательный
   `ReviewSecretStorePort` и lifecycle `ACTIVE/VERIFY_ONLY/REVOKED/LOST` не закрыты.
5. Hostile DOCX parser worker получает секрет на втором проходе, хотя парсеру для
   извлечения недоверенного IR секрет не нужен.
6. Authority раунда сохраняется до окончательной публикации файла, но нет явного
   двухфазного `PREPARED → PUBLISHED` recovery-протокола.
7. Generic DOCX import и bound review intake используют разные parser boundaries;
   generic path остаётся синхронным в main process.
8. Formatting и structural runtime-команды присутствуют в коде, тогда как terminal
   matrix часть этих операций считает `MANUAL_ONLY`.
9. Text, comments, formatting и structure применяются разными lanes без единого
   терминального decision ledger всего раунда.
10. Production completion цепочки кандидата `PREPARED → release proof → FINALIZED`
    и финальная физическая Word-волна не закрыты.
11. Google matrix устарела относительно Word-кандидата и не содержит физического
    исполнения.
12. Общий `writeBufferAtomic` завершает публикацию через `rename` и способен заменить
    существующую цель; bound review export требует отдельной no-replace семантики и
    не должен молча менять поведение всех остальных exporters.
13. Budget policy не едина: product outer DOCX gate равен 10 MiB, parser default
    `maxDocxBytes` — 50 MiB, full-manuscript path расширяет `maxBlocks` с 5000 до
    50000 и worker output с 16 до 64 MiB, а parent utility timeout 10 секунд короче
    parser soft/hard timeout 15/30 секунд. Effective envelope нельзя доказать одной
    текущей конфигурацией.

### 2.5. Provenance приложенного аудита

ZIP проверен по приложенному SHA-256 sidecar; digest совпал с
`fcf0a4e6399542cef0dde13e0a19d6d1dacbd485b5760df184bcf1b2815d8841`. Внутренний
snapshot заявляет clean candidate `5def706…`, 6520 tracked files и merge base
`71d793d…`. Его feature-delta manifest выделяет шесть файлов:

```text
scripts/ops/rtk-word-c5v2-physical-canary.mjs
scripts/ops/rtk-word-c5v2-terminal-orchestrator.mjs
scripts/run-rtk-tests.mjs
test/contracts/rtk-test-graph-catalog.contract.test.js
test/contracts/rtk-word-c5v2-comment-lifecycle-return-runtime.contract.test.js
test/contracts/rtk-word-c5v2-terminal-orchestrator.contract.test.js
```

Это provenance для C00/C01, а не доказательство merge или acceptance. Архивный
failure capture, локальный повтор и live repository рассматриваются раздельно; их
outputs нельзя складывать в один numerator.

## 3. Три контракта вместо одного «импорт-экспорта»

### 3.1. CONTENT_PORTABILITY

Назначение: создать новый Yalken content из произвольного TXT, MD или DOCX.

- Не требует `roundId`, `ExportMap` или YRTK2.
- Никогда не трактует Word revisions/comments как подтверждённое намерение.
- Всегда выдаёт `ImportLossReport`.
- Текущий DOCX-профиль остаётся честно plain-text-first: tables, media, comments,
  revisions, notes, hyperlinks и unsupported structures перечисляются как loss.
- Mutation происходит только через canonical import Command.

### 3.2. NATIVE_FILE_EXPORT

Назначение: получить обычный DOCX для чтения, печати или передачи.

- Не обещает возврат изменений.
- Не создаёт semantic authority для будущего файла.
- Может использовать тот же CompileIR/Package builder, но не смешивает state с review
  round.
- Перезапись существующего пользовательского файла по умолчанию запрещена.

### 3.3. BOUND_REVIEW_ROUNDTRIP

Назначение: вернуть в Yalken изменения из файла, который Yalken сам экспортировал
из конкретной ревизии проекта.

- Требует локальный `RoundRecord`, фактический baseline, `ExportMap`, `CoreManifest`
  и YRTK2.
- Возвращённый файл всегда недоверен до intake verification.
- Ни carrier, ни filename, ни Word IDs сами по себе authority не дают.
- Применение возможно только после preview и явного решения пользователя.
- Command Kernel повторно проверяет capability и revision при dispatch.

### 3.4. Непересекаемость

Произвольный DOCX нельзя «повысить» до bound roundtrip эвристикой по имени файла,
похожему тексту или найденному custom XML. Если локальная identity не найдена либо
подпись не проверена, допустимы только `CONTENT_PORTABILITY` или диагностический
manual preview без mutation.

## 4. Архитектурное размещение

### 4.1. Product plane

Product Core владеет:

- scenes, manuscript truth и project revision;
- project/scene identity;
- атомарной persistence и recovery;
- durable review round metadata без raw secrets;
- applied decision receipts как частью управляемой истории.

Command Kernel владеет:

- командами и availability;
- capability/release policy;
- повторной проверкой identity/revision/generation;
- effect reservation;
- единственным путём mutation.

Interop service не становится вторым Core, bus или storage writer. Это композиция
domain services за существующими портами.

### 4.2. Interface plane

Design OS и Renderer получают только immutable projections:

- `ReviewExportProjection`;
- `ReturnIntakeProjection`;
- `RoundDecisionProjection`;
- `CapabilityProjection`;
- `RecoveryProjection`;
- `EvidenceProjection`.

Кнопка или видимость operation никогда не заменяет Command Kernel enforcement.
Текущая docs-only задача не меняет UI. Если будущий контур меняет composition,
state model или visual baseline, он обязан отдельно включить Design Tool Router,
прочитать Design OS guide, сформировать `SURFACE_MANIFEST_V1` и пройти Lazyweb.

### 4.3. State classes

| Данные | Класс | Запрещённое смешивание |
|---|---|---|
| manuscript/scenes/revisions | PROJECT_STATE | не хранить в shell или parser worker |
| несохранённый editor text | AUTHORING_WORKING_STATE | не считать transient и не терять при import |
| parsed IR, diff, classification | DERIVED_STATE | не принимать за truth; перестраивать по identity guards |
| выбранный panel/mode | SHELL_STATE | не использовать как approval или capability |
| hover/progress animation | TRANSIENT_STATE | не использовать как durable round status |

### 4.4. Background jobs

Package parse, normalization, classification и large diff могут быть
`BACKGROUND_JOB`. Публикация результата разрешена только при совпадении:

```text
projectId + roundId + returnAttemptId + sourceRevision + generation + inputSha256
```

Отмена, timeout или поздний результат не оставляют product mutation.

## 5. Обязательные порты и границы привилегий

### 5.1. Product ports

| Port | Минимальная ответственность | Не имеет права |
|---|---|---|
| `ReviewCryptoPort` | sign/verify YRTK2 по opaque key handle; constant-time compare; domain separation | возвращать raw master key вызывающему коду |
| `ReviewSecretStorePort` | создать/import key, вернуть opaque handle и state, rotate/revoke/mark lost | сохранять plaintext key в project JSON, IPC или DOCX |
| `ReviewArtifactFilePort` | прочитать user-selected artifact, publish no-replace, reopen/hash и вернуть file identity receipt | интерпретировать package semantics или выбирать project mutation |
| `ReviewDocxPackagePort` | bounded read/write package, enumerate parts, enforce ZIP/XML budgets | решать semantic authority или писать Core |
| `ReviewParserPort` | превратить bounded package в immutable untrusted IR | получать HMAC secret, project writer или user approval |
| `ReviewRoundStorePort` | монотонные round/attempt transitions и recovery lookup | менять manuscript scenes |
| `ReviewEvidenceStorePort` | append-only receipts и content hashes | объявлять acceptance самостоятельно |
| `ProjectPersistencePort` | atomic commit revision-bound mutation | принимать renderer payload без Command Kernel |
| `RecoveryPort` | snapshot, journal, restore, reopen/replay verification | маскировать частичный apply как success |

### 5.2. Design OS read-only ports

- `CommandCatalogPort`
- `CommandDispatchPort`
- `DomainProjectionPort`
- `DiagnosticsPort`
- `ShellProjectionPort`

Новый write-port из Renderer запрещён.

### 5.3. Secret privilege rule

В публичном интерфейсе `ReviewSecretStorePort` нет метода `getSecret()`. Доменный
код оперирует `KeyHandle`. Crypto adapter внутри main process использует handle для
sign/verify и обнуляет временный derived key после операции. Parser worker, renderer,
evidence writer и DOCX builder raw key не видят.

Рекомендуемый macOS adapter использует уже pinned Electron `safeStorage` и OS-backed
protected storage без новой зависимости. C02 сначала выполняет packaged probe exact
Electron build. Предпочтителен async API: он не блокирует main thread, сообщает
temporary unavailability и необходимость re-encryption при ротации. Sync API допустим
только как изолированный профильный fallback, если exact packaged runtime не имеет
доказанного async contract; его blocking/keychain-prompt риск фиксируется явно. Если
protected backend недоступен, `BOUND_REVIEW_ROUNDTRIP` fail-closed; обычный DOCX
export и доступ к рукописи продолжают работать.

Строгая семантика key state:

| State | Sign | Verify old round | Manuscript access |
|---|---:|---:|---:|
| `ACTIVE` | yes | yes | yes |
| `VERIFY_ONLY` | no | yes | yes |
| `REVOKED` | no | no | yes |
| `LOST` | no | no; manual diagnostic only | yes |

Master key: 256 bits. Round authentication key выводится через HKDF-SHA-256 с
domain label, включающей schema version, projectId и roundId. Ротация не делает
рукопись нечитаемой.

### 5.4. Legacy secret migration

При обнаружении legacy `hmacSecret`:

1. loader валидирует формат и длину;
2. secret импортируется в protected store;
3. durable state получает только `keyId`, state и migration receipt;
4. новый atomic project save удаляет plaintext field;
5. старые backups не удаляются скрытно; создаётся
   `LEGACY_SECRET_RESIDUE_POSSIBLE` diagnostic;
6. новый export использует rotated ACTIVE key;
7. crash между шагами восстанавливается идемпотентно.

## 6. Канонические операции

### 6.1. Commands

- `ImportPortableContent`
- `ExportNativeDocument`
- `CreateBoundReviewRound`
- `PublishBoundReviewArtifact`
- `RegisterReturnedReviewArtifact`
- `RecordReviewDecisionSet`
- `ApplyReviewLaneDecision`
- `AbortReviewRound`
- `RecoverReviewRound`
- `RotateReviewKey`
- `RevokeReviewKey`

`Parse`, `classify` и `diff` сами по себе не Commands: это Queries или guarded
background jobs. Чтение/запись файла и secret store — Effects через ports.

### 6.2. Queries

- `GetInteropCapabilities`
- `GetReviewRound`
- `GetReturnIntakeProjection`
- `GetReviewDecisionProjection`
- `GetInteropDiagnostics`
- `GetRecoveryStatus`

### 6.3. Events

- `ReviewRoundPrepared`
- `ReviewArtifactPublished`
- `ReviewReturnQuarantined`
- `ReviewReturnClassified`
- `ReviewDecisionRecorded`
- `ReviewLaneApplied`
- `ReviewLaneRejected`
- `ReviewRoundClosed`
- `ReviewRecoveryRequired`

Event — уже произошедший факт, не запрос на write.

### 6.4. Effects

- `ReadSelectedArtifact`
- `WriteStagedArtifact`
- `PublishArtifactNoReplace`
- `ParseDocxInUtilityProcess`
- `ProtectedKeyCreate/Use/Transition`
- `AtomicProjectCommit`
- `RecoverySnapshot/Restore`
- `EvidenceAppend`

## 7. Целевые контракты данных

### 7.1. `InteropProfile`

```text
profileId
schemaVersion
transport: WORD_DOCX | GOOGLE_OFFICE_DOCX | GOOGLE_NATIVE_EXPORT_DOCX
platform
editorName
editorVersionConstraint
packageLimits
semanticKernelVersion
allowedOperationFamilies[]
releasedAutomaticFamilies[]
manualFamilies[]
blockedFamilies[]
reasonRegistryVersion
physicalEvidenceSetHash
```

Профиль immutable. Изменение Word/Google build, parser, semantic kernel, лимитов или
released capability создаёт новый `profileId`.

### 7.2. `ReviewRoundRecord`

```text
roundId
projectId
sourceRevision
generation
profileId
exportArtifactId
actualBaselineHash
exportMapHash
coreManifestHash
keyId
keyStateAtSign
exportState
publishedArtifactSha256?
publishedTargetIdentity?
createdAt
transitionJournalHash
```

Разрешённые export transitions:

```text
EXPORT_PREPARING
  -> EXPORT_PREPARED
  -> EXPORT_PUBLISHED
  -> EXPORT_CLOSED

любое незавершённое состояние
  -> EXPORT_RECOVERY_REQUIRED
  -> EXPORT_PUBLISHED | EXPORT_ABORTED
```

Переходы монотонны и compare-and-swap привязаны к предыдущему record hash.

### 7.3. `ReturnAttemptRecord`

```text
returnAttemptId
roundId
inputSha256
inputSize
parserVersion
untrustedIrHash
verificationState
classificationHash?
decisionSetHash?
state
failureReasonCode?
```

Transitions:

```text
RETURN_READING -> RETURN_PARSED_UNTRUSTED -> RETURN_VERIFIED
-> RETURN_CLASSIFIED -> DECISION_RECORDED -> APPLYING
-> APPLIED_PARTIAL | APPLIED_COMPLETE -> VERIFIED -> CLOSED
```

Любая ошибка authority до `RETURN_VERIFIED` оставляет файл в quarantine и не даёт
Command Kernel mutation capability.

### 7.4. `CoreManifest` и `ExportMap`

`CoreManifest` содержит только канонические identities и hashes, но не raw hash
финального DOCX, чтобы исключить hash cycle. `ExportMap` связывает Yalken blocks с
фактическим self-parsed baseline, а не с предположением builder-а.

Обязательные bindings:

```text
schemaVersion
projectId
roundId
exportId
sourceRevision
generation
profileId
semanticKernelVersion
actualBaselineHash
exportMapHash
operationPolicyHash
```

Paragraph IDs, Word IDs, RSID, positions и custom XML являются locator hints.
Authority даёт только совместная проверка local round + YRTK2 + manifest hashes +
source revision + semantic proof.

### 7.5. `ParsedUntrustedIR`

```text
inputSha256
packageInventoryHash
budgetReceipt
stories[]
paragraphs[]
runs[]
revisionNodes[]
commentNodes[]
formatNodes[]
structureNodes[]
carrierCandidates[]
unsupportedNodes[]
normalizationVersion
irHash
```

Название `untrusted` обязательно сохраняется до authority verification. Этот IR не
содержит путь, raw key, project writer или capability.

### 7.6. `RoundDecisionSet`

```text
decisionSetId
roundId
returnAttemptId
projectRevisionAtDecision
classificationHash
orderedLaneDecisions[]
userIntentTimestamp
commandPolicyHash
```

Каждый lane decision — `ACCEPT`, `REJECT` или `DEFER`. Decision не является
mutation; каждый `ACCEPT` повторно проходит Command Kernel.

### 7.7. `EvidenceClaim`

```text
claimId
claimType
exactHeadSha
mergedSha?
profileId
editorBuild
corpusHash
denominator
producerCommandHash
testInventoryHash
artifactHashes[]
parentClaimIds[]
producerRole
verifierRole
result
vetoes[]
```

Receipt без полного binding является diagnostic, не acceptance evidence.

## 8. Алгоритм экспорта bound review round

### 8.1. Нормальный путь

1. Command Kernel принимает `CreateBoundReviewRound` и повторно проверяет project
   capability.
2. Product Core создаёт immutable snapshot `R0` и generation `G0`.
3. `ReviewRoundStorePort` CAS-создаёт `EXPORT_PREPARING`.
4. CompileIR строит scene/block/format structure только из snapshot `R0`.
5. Builder создаёт provisional DOCX без финального carrier.
6. `ReviewParserPort` self-parses provisional bytes через bounded package path.
7. Из фактического parse строятся `actualBaseline` и `ExportMap`.
8. Строится `CoreManifest`; `ReviewCryptoPort` подписывает YRTK2 через opaque
   `KeyHandle`.
9. Builder создаёт final DOCX.
10. Второй self-parse подтверждает semantic equivalence, carrier binding и отсутствие
    запрещённых частей.
11. Локально атомарно сохраняются `EXPORT_PREPARED`, map/manifest hashes и ожидаемый
    artifact hash.
12. `PublishArtifactNoReplace` публикует bytes в выбранную цель.
13. Порт reopen-читает опубликованный файл и сверяет hash/size/package minimum.
14. CAS-переход фиксирует `EXPORT_PUBLISHED` и target identity.
15. Renderer получает projection успеха только после шага 14.

### 8.2. Почему нельзя просто переставить два write

Если сначала записать пользовательский DOCX, а потом local round, crash оставит файл,
который Yalken больше не умеет аутентифицировать. Если сначала сохранить authority,
а потом не записать DOCX, останется фантомный export. Поэтому нужен двухфазный record
и reconciliation, а не простая перестановка.

### 8.3. Reconciliation

При старте проекта:

- `EXPORT_PREPARING` без prepared payload → `EXPORT_ABORTED`;
- `EXPORT_PREPARED` без target → безопасный retry publication по явному user intent;
- `EXPORT_PREPARED` с существующим target и совпадающим hash →
  `EXPORT_PUBLISHED`;
- target существует, но hash отличается → `EXPORT_RECOVERY_REQUIRED`, без overwrite;
- `EXPORT_PUBLISHED` с отсутствующим target не меняет manuscript; выдаётся
  `PUBLISHED_ARTIFACT_MISSING` diagnostic.

### 8.4. No-replace publication

Практический dependency-free macOS путь:

1. валидировать выбранный parent, `realpath`, `lstat`, device/inode;
2. создать staged file в том же каталоге с exclusive create;
3. write, file fsync, reopen hash;
4. повторно проверить identity parent;
5. atomic hard-link staged inode в final name; существующий final даёт fail;
6. проверить final type/inode/hash;
7. unlink stage и fsync directory;
8. повторно проверить parent identity.

Это доказывает no-overwrite и crash-visible complete artifact для обычной локальной
single-user модели. Node не предоставляет полноценный `openat/renameat2` dirfd API.
Поэтому claim `HOSTILE_LOCAL_PATH_RACE_PROOF` остаётся `BLOCKED` до отдельного
owner-approved native platform adapter. Нельзя скрывать этот разрыв дополнительными
`realpath` checks. Альтернативный строгий adapter обязан использовать directory
handle, no-follow и no-replace на уровне ОС и иметь собственный security review.

## 9. Алгоритм возврата и карантина

### 9.1. Intake без секрета в parser worker

1. Main process принимает user-selected path как input только для platform effect.
2. Main безопасно открывает файл, применяет outer byte cap, читает bytes и считает
   `inputSha256`.
3. Worker получает bytes, `returnAttemptId`, budgets и parser version — не path и не
   secret.
4. `ReviewDocxPackagePort` проверяет ZIP inventory, entry sizes, inflated total,
   compression ratio, XML depth/nodes, relationships и timeout.
5. `ReviewParserPort` выдаёт immutable `ParsedUntrustedIR` и `BudgetReceipt`.
6. Main проверяет, что worker result связан с тем же attempt/input hash/generation.
7. Carrier candidate используется только для поиска локального round.
8. `ReviewCryptoPort` в main проверяет YRTK2 opaque key handle-ом.
9. Проверяются local round state, CoreManifest, ExportMap, profile и source revision.
10. Только после этого создаётся `ReturnIntakeProof` и состояние `RETURN_VERIFIED`.

Worker никогда не получает raw HMAC secret. Второй privileged parse запрещён.

### 9.2. Hostile-package budgets

Пределы входят в `InteropProfile` и receipt:

- compressed file bytes;
- number of ZIP entries;
- maximum single inflated entry;
- total inflated bytes;
- compression ratio;
- XML byte size, nesting depth и node count;
- relationship count и traversal validation;
- parse wall time и CPU/worker termination policy;
- maximum comments/revisions/paragraphs/runs;
- output IR byte size.

Budget breach имеет typed reason и не запускает fallback parser с более широкими
правами.

Текущие значения являются входом для C04, но не автоматически принятым TARGET:

| Layer | Current value |
|---|---:|
| main outer intake bytes | 10 MiB |
| parser default DOCX bytes | 50 MiB |
| ZIP entries | 512 |
| single inflated part | 10 MiB |
| total inflated bytes | 50 MiB |
| compression ratio | 200 |
| XML depth / attributes | 64 / 128 |
| parser default blocks / revisions / comments / candidates | 5000 / 5000 / 2000 / 200 |
| full-manuscript blocks override | 50000 |
| parser/worker output default | 16 MiB |
| full-manuscript output override | 64 MiB |
| parser soft / hard timeout | 15 s / 30 s |
| main utility-process timeout | 10 s |

C04 замораживает один `PackageBudgetPolicy` в `InteropProfile`. Main, worker,
package parser и result validator связываются одним policy hash. Child может только
ужесточить, но не расширить limit. Parent hard deadline должен быть позже worker hard
deadline на фиксированный receipt/reap grace; иначе typed parser timeout физически
недостижим. Изменение лимита создаёт новый profile/evidence, а не тихую настройку.

### 9.3. Generic import convergence

`CONTENT_PORTABILITY` использует тот же no-secret package/worker boundary, но другой
normalizer и другой result contract: `PortableContentIR + ImportLossReport`.
Объединяется security boundary, а не semantic meaning. Bound return и generic import
не получают общий authority shortcut.

## 10. Semantic kernel и locator stack

### 10.1. Минимальный принцип

Алгоритм не пытается «понять весь Word». Он доказывает минимальный semantic kernel
для released operation families и типизирует всё остальное.

Locator stack применяется сверху вниз, но ни один hint отдельно не авторитетен:

1. local round/export identity;
2. scene and block binding из ExportMap;
3. actual baseline hash tree;
4. stable advisory paragraph/custom XML IDs;
5. semantic neighborhood fingerprint;
6. unique diff proof на immutable baseline;
7. manual fallback.

RSID, run index, ZIP order, comment numeric ID, filename и absolute position — только
advisory.

### 10.2. Нормализация

Normalization обязана быть версионированной и минимальной. Она может унифицировать
representation, доказанно не меняющее смысл в профиле, но не имеет права:

- превращать clean/untracked edit в tracked revision;
- считать AutoCorrect пользовательским tracked intent;
- удалять paragraph-mark revision;
- склеивать adjacent revisions без proof;
- переносить comment anchor через неоднозначную structure;
- принимать визуальный Word diff за package truth.

### 10.3. Match proof

Автоматическое изменение допускается только если classifier выдаёт:

```text
candidateId
operationFamily
sourceSceneId
sourceBlockId
baselineSpan
returnedSpan
beforeHash
afterHash
locatorEvidence[]
uniquenessProof
nonOverlapProof
revisionBinding
capabilityPolicyHash
reasonCode: EXACT_SUPPORTED
```

Отсутствие любого поля переводит candidate в manual/blocked, а не в heuristic apply.

### 10.4. DOCX package map

DOCX — OPC/ZIP package, а не один XML. Intake сначала строит inventory и только затем
интерпретирует parts.

| Part/family | Значение для Yalken | Authority | Default policy |
|---|---|---|---|
| ZIP central/local records, CRC | физическая целостность и compressed/inflated budgets | none | mismatch/bomb блокирует package |
| `[Content_Types].xml` | declared MIME/type topology | none | validate; unknown сохраняется diagnostic |
| `_rels/.rels` | package root relationships | none | normalize target, запрещать traversal/active external effects |
| `word/_rels/document.xml.rels` | связи main story с comments/styles/media/etc. | none | allowlist relationship types; external/active target typed block |
| `word/document.xml` | main story: paragraphs, runs, revisions, anchors, tables | semantic input после binding | required для текущего review profile |
| `word/styles.xml` | style graph и named style properties | advisory semantic input | parse bounded; неизвестный style не auto-apply |
| `word/numbering.xml` | abstract/instance numbering graph | advisory semantic input | diagnostic/manual до отдельного list proof |
| `word/settings.xml` | document/editor settings, включая tracking-related form | advisory | не даёт user intent |
| `word/comments.xml` | root comment bodies и numeric IDs | semantic candidate | ID только document-scoped locator |
| `word/commentsExtended.xml`, `commentsExtensible.xml`, `commentsIds.xml`, `people.xml` | modern replies/lifecycle/person metadata | build-bound candidate | profile physical proof; отсутствие не synthetic-fill |
| `docProps/custom.xml` | YRTK2/Core digest custom properties carrier | locator carrier | проверять HMAC/local round; не sole authority |
| `customXml/*` | advisory map/carrier extension | advisory only | никогда не получает apply authority самостоятельно |
| `docProps/core.xml`, `docProps/app.xml` | metadata/app hints | display/diagnostic | author/app/build не capability |
| headers, footers, footnotes, endnotes, text boxes | отдельные stories | none для manuscript MVP | inventory + `UNSUPPORTED_STORY`; не смешивать с main text |
| tables/drawings/fields/content controls | topology или computed/embedded content | none для text lane | typed manual/blocked/loss по контракту |
| VBA, OLE, ActiveX, attached template, active relationships | executable/active surface | forbidden | fail-closed для bound intake |

Parser не обязан сохранять неизвестный part внутри проекта. Он обязан учесть его в
inventory/conservation и не выдать silent exact claim. Yalken review return читает
файл и не переписывает его; поэтому package preservation и semantic intake — разные
задачи.

### 10.5. Word revision anatomy

| OOXML form | Наблюдаемая операция | Yalken interpretation |
|---|---|---|
| `w:ins` вокруг runs | tracked insertion | exact text candidate при complete MatchProof |
| `w:del` + `w:delText` | tracked deletion | exact text candidate при complete MatchProof |
| adjacent delete + insert | replacement representation | один или несколько candidates; не склеивать без unique segmentation proof |
| `w:moveFrom` / `w:moveTo` | move source/destination | structural/manual до paired identity proof |
| `w:pPrChange` | изменение paragraph properties | structural/format candidate, не text normalization |
| `w:rPrChange` или effective run properties | tracked/effective formatting | FormatIR whitelist + exact span proof |
| `w:pPr/w:rPr/w:del` | удалённый paragraph mark, объединение абзацев | `ParagraphBoundaryEffect` candidate, default manual |
| paragraph/table row insertion/deletion properties | block/table topology mutation | structural/manual; main text patch запрещён |
| comment range start/end + reference + comments part | anchored comment | root comment candidate при согласованной triplet/ID mapping |
| modern extension parts | reply/resolve/reopen metadata | отдельная build-bound lifecycle family |
| изменённый visible text без revision node | clean edit/AutoCorrect/editor normalization | manual candidate; tracked intent не выводится |

Каждая форма сначала сохраняется в IR без premature merge. Normalizer может создать
derived grouping, но raw node inventory/hash остаётся доступен verifier-у.

### 10.6. Порядок package parsing

```text
outer byte cap
-> ZIP structure and duplicate-name check
-> compressed/inflated budgets and CRC
-> content types and relationship graph
-> active/external/traversal vetoes
-> bounded XML tokenization per admitted part
-> raw node inventory
-> ParsedUntrustedIR conservation
-> carrier candidates
-> main-process local-round/HMAC verification
-> profile-bound semantic normalization
-> candidate classification
```

Нельзя сначала извлечь carrier, довериться ему и только потом проверять package. Нельзя
также отбрасывать unsupported nodes до conservation receipt.

## 11. Lanes применения

### 11.1. Released lanes должны быть явными

Минимальный набор:

1. `TEXT_EXACT`
2. `ROOT_COMMENT_CREATE`
3. `COMMENT_REPLY_LIFECYCLE`
4. `FORMATTING_EXACT`
5. `STRUCTURE_EXACT`

Наличие runtime adapter ещё не означает release. Для каждого профиля Command Kernel
policy отдельно задаёт `AVAILABLE`, `IMPLEMENTED_NOT_RELEASED`, `MANUAL_ONLY` или
`BLOCKED`.

### 11.2. Рекомендуемая атомарность MVP

Не строить сейчас новый all-lanes transaction framework. Использовать существующие
lane runtimes хирургически:

1. пользователь фиксирует единый `RoundDecisionSet`;
2. применяется один lane через Command Kernel и существующий atomic/recovery path;
3. после commit оставшиеся candidates полностью переклассифицируются на новой
   project revision;
4. потерявшие uniqueness или anchor становятся manual/blocked;
5. следующий lane требует нового reservation и revalidation;
6. terminal ledger хранит итог каждого исходного candidate.

Гарантия: atomic per lane, а не ложная «atomic whole round». Whole-round composite
transaction допустим позже только после отдельного manifest, recovery model и
физического falsification.

### 11.3. Apply invariant

Перед каждым lane apply Command Kernel повторно проверяет:

```text
projectId
roundId
returnAttemptId
decisionSetHash
classificationHash
currentProjectRevision
generation
capabilityPolicyHash
source/target hashes
effect reservation
```

Затем создаются recovery snapshot и append journal, выполняется mutation, atomic
save, reopen/replay и reverse verification. Любое несовпадение до commit — no-op;
после начала commit — `RECOVERY_REQUIRED`, но не success.

### 11.4. Единый terminal decision ledger

Каждый исходный candidate получает ровно один terminal record, даже если после
предыдущего lane он переклассифицирован. Ledger запрещает потерю между разными
runtime paths и проверяет conservation equation из раздела 1.

## 12. Word: проблемные классы и проверяемые гипотезы

| Проблема | Гипотеза | Хирургический ход | Фальсификатор | Начальный policy |
|---|---|---|---|---|
| adjacent tracked replacements | Word package сохраняет достаточно boundaries для детерминированной segment reconstruction | отдельный classifier fixture; не склеивать revisions до proof | две разные последовательности дают одинаковый normalized diff | `MANUAL_ONLY` |
| одинаковые фразы | immutable baseline + neighborhood + non-overlap proof устраняют ложный occurrence | сохранять все candidates, решать assignment детерминированно | более одного допустимого matching | `MANUAL_ONLY` при ambiguity |
| paragraph split/merge | paragraph-mark revision можно представить отдельным domain effect | будущий `ParagraphBoundaryEffect`, только single-scene и без list/table/section ambiguity | reverse replay не восстанавливает exact scene/block graph | `MANUAL_ONLY` |
| paragraph style/heading | style change может быть exact только при известном style mapping и стабильной границе block | отдельный structural command, не text patch | неизвестный style, linked numbering или смена section | `IMPLEMENTED_NOT_RELEASED` до evidence |
| inline formatting | run properties можно свести к bounded FormatIR | whitelist properties + span proof + reverse verify | Word split/merge runs меняет semantic span неоднозначно | profile-dependent |
| list numbering | numbering.xml и paragraph props образуют связанный graph | сначала diagnostic parser + canonical list IR; apply позже | restart/override/abstractNum ambiguity | `MANUAL_ONLY` |
| fields/content controls | отображаемый текст не равен stored instruction/state | сохранять как unsupported node и не патчить text внутри | field update после reopen меняет результат | `BLOCKED_UNSAFE` |
| comments/replies/resolve | root comment shadow доказан шире, modern lifecycle зависит от build | раздельные operation families и build-bound physical matrix | reply/resolve исчезает или меняет anchor после reopen | root profile-dependent; lifecycle manual до proof |
| clean/untracked change | может быть намеренным, но не имеет revision semantics | отдельный `CLEAN_UNTRACKED_CANDIDATE` lane | нельзя отличить editor normalization от user edit | `MANUAL_ONLY` |
| AutoCorrect | не является безопасной normalization | отдельный reason `AUTOCORRECT_CANDIDATE` | один editor build меняет токен без tracked revision | `MANUAL_ONLY` |
| soft hyphen/nonbreaking chars | representation может отличаться при сохранении | codepoint-aware diff, показывать Unicode diagnostic | roundtrip меняет rendered/stored relation | manual при mismatch |
| headers/footers/notes/text boxes | это отдельные stories, не manuscript scenes | parser inventory + explicit unsupported stories | node попадает в main story text silently | `DIAGNOSTIC_ONLY` |
| tables | cell graph не равен линейному paragraph stream | сохранять topology в IR, не импортировать как exact scene | merge/split cell теряет coordinates | `MANUAL_ONLY` или portability loss |
| moved text/reorder | Word moveFrom/moveTo и document order требуют отдельной semantics | future explicit reorder command | duplicate content или cross-scene move | `MANUAL_ONLY` |
| author grouping | author metadata не даёт authority | display metadata only, sanitize bounds | spoofed author меняет capability | никогда |

### 12.1. Paragraph split/merge route options

**Route P1 — manual terminal, recommended сейчас.** Полностью классифицировать
paragraph-mark changes, показывать preview и не применять автоматически. Это
сохраняет честный знаменатель и не блокирует Word saturation.

**Route P2 — bounded `ParagraphBoundaryEffect`.** Разрешить только при exact
single-scene mapping, отсутствии list/table/section/comment-anchor ambiguity,
recovery snapshot и reverse graph verification. Сначала component proof, затем
physical profile.

**Route P3 — нормализовать в newline text patch.** Отклонён: смешивает product block
identity со строковым представлением и маскирует structural mutation.

### 12.2. Formatting route options

**Route F1 — whitelist FormatIR, recommended.** Bold/italic/underline и ограниченный
набор properties применяются только к exact semantic span с до/после hash и
физическим reopen proof.

**Route F2 — сохранять raw OOXML fragment.** Отклонён для Product Core: приносит
editor-specific truth и небезопасные relationships внутрь проекта.

**Route F3 — весь formatting manual.** Допустимый fallback профиля, если физическое
evidence не закрывает run splitting и span mapping.

## 13. Варианты инженерной реализации Word

### 13.1. Route W-A — хирургическое завершение V4/C5V2

**Рекомендация.** Сохранить текущие semantic kernel, ExportMap, YRTK2, classifier и
lane runtimes. Закрыть только доказанные разрывы: runner flake, secret boundary,
двухфазную публикацию, no-secret intake, capability truth и terminal ledger.

Плюсы:

- максимальное повторное использование уже проверенных контрактов;
- минимальный diff и rollback;
- можно закрывать по одному falsifiable contour;
- нет новой зависимости и второго authority plane.

Риск: большие `main.js` и legacy `revisionBridge/index.mjs` затрудняют reasoning.
Митигируется characterization tests и extraction только после closure поведения.

### 13.2. Route W-B — strangler extraction

После W-A вынести из больших фасадов три consumer-backed service:

- `ReviewExportCoordinator`;
- `ReviewReturnIntakeCoordinator`;
- `ReviewApplyCoordinator`.

Каждое извлечение сначала фиксирует current behavior contract test, затем меняет
только wiring. Никакого нового registry, bus или storage. Route полезен для
поддерживаемости, но не должен быть prerequisite Word terminal campaign.

### 13.3. Route W-C — новый universal interop framework

Отклонён. Он создаст второй command/authority layer, расширит scope, задержит MVP и
потребует повторного доказательства уже работающих путей.

### 13.4. Parser route options

| Route | Решение | Вердикт |
|---|---|---|
| `PX-A` | сохранить текущий bounded dependency-free package/parser; вынести privilege boundary | recommended сейчас |
| `PX-B` | bake-off одной разрешённой OSS DOCX library на замороженном gap corpus | только если библиотека доказанно закрывает конкретный gap без ухудшения budgets/security |
| `PX-C` | использовать Word/OS automation как semantic parser | rejected: platform/editor side effects, недетерминизм, нет offline hermetic proof |

Library нельзя принять по популярности. Bake-off требует: license/OSS policy, package
attack corpus, deterministic normalized IR, bundle cost, exact gap wins, regression
по текущему корпусу и owner decision.

## 14. Google: практичные маршруты после Word gate

Yalken v1 не синхронизируется с Google и не принимает cloud truth. Google — внешний
редактор, который получает и возвращает файл. Credentials и private documents не
попадают в product runtime или repo evidence.

### 14.1. Route G-A — Google Office Mode DOCX

**Первый рекомендуемый маршрут.** Пользователь загружает DOCX и редактирует его без
native conversion, затем скачивает DOCX. Проверяется, сохраняются ли carrier,
comments, revisions/suggestions, paragraph properties и package semantics.

Если YRTK2 и mappings переживают цикл, применяется тот же bound review protocol с
отдельным `GOOGLE_OFFICE_DOCX` profile. Никакого Google-specific mutation path не
создаётся.

### 14.2. Route G-B — native Google Docs conversion

Это другой профиль, по умолчанию lossy и untrusted. Physical lab обязан проверить:

- сохранение/удаление custom properties и custom XML;
- перевод suggestions в DOCX revisions или clean text;
- comments, replies, resolve state и anchors;
- lists, headings, page breaks, tables, Unicode;
- повторный export после нескольких циклов.

Если carrier потерян, файл не получает authority автоматически. Разрешены два
варианта:

1. явный выбор пользователем локального open round + строгая content/source binding;
2. manual portability import с loss report.

Отдельный подписанный sidecar может быть будущим portability mechanism между
машинами, но не нужен для локального MVP и не заменяет local key/round verification.

### 14.3. Route G-C — Google Drive/Docs API

Отложен и owner-gated. Потребует OAuth, network/cloud truth, token store, remote
identity/revision semantics, rate/retry policy, privacy review и новых product ports.
Drive comments нельзя считать эквивалентом document comments. Route не может быть
«маленьким дополнением» к файловому roundtrip.

### 14.4. Google activation gate

G00 начинается только после Word terminal acceptance на merged exact SHA. До этого
разрешены docs/research и synthetic offline fixtures, но не claim Google support и не
product runtime network.

## 15. Capability truth и reason registry

### 15.1. Один enforcement, несколько projections

Command Kernel release policy остаётся единственным enforcement. Capability matrix
не становится runtime registry. На exact head evidence builder сверяет:

```text
CommandCatalog availability
+ adapter existence
+ contract test IDs
+ physical evidence bindings
+ profile operation policy
= derived CapabilityProjection and release matrix
```

Контракт падает, если:

- matrix говорит `AUTO_APPLY`, но команда недоступна;
- команда доступна в профиле, а matrix говорит `MANUAL_ONLY`;
- released operation не имеет exact tests или physical evidence;
- receipt относится к другому SHA/profile/corpus;
- reason code отсутствует в registry.

### 15.2. Нормализованный reason registry

Один versioned enum используется classifier, projection, telemetry, tests и evidence.
Минимальные families:

```text
EXACT_SUPPORTED
AMBIGUOUS_MATCH
OVERLAPPING_CANDIDATES
SOURCE_REVISION_STALE
ROUND_IDENTITY_MISSING
ROUND_SIGNATURE_INVALID
ROUND_KEY_VERIFY_ONLY
ROUND_KEY_REVOKED
ROUND_KEY_LOST
PROFILE_MISMATCH
EDITOR_BUILD_UNPROVEN
UNTRACKED_CLEAN_CHANGE
AUTOCORRECT_CANDIDATE
UNSUPPORTED_STORY
UNSUPPORTED_STRUCTURE
UNSUPPORTED_FORMATTING
PACKAGE_BUDGET_EXCEEDED
PARSER_TIMEOUT
WORKER_IDENTITY_MISMATCH
CAPABILITY_NOT_RELEASED
RECOVERY_REQUIRED
EVIDENCE_BINDING_INVALID
```

Unknown reason — fail-closed. Нельзя сваливать разные причины в строку `unsupported`.

## 16. Proof machinery против ложного green

### 16.1. Frozen `ContourManifest`

До первого code write каждого контура фиксируются:

```text
taskId
contourId
baseSha
targetBranch
allowedWritePaths[]
forbiddenWritePaths[]
profileId
editorBuild
corpusHash
testInventoryHash
expectedDenominator
claims[]
vetoes[]
roles
rollbackCommitPolicy
deliveryPolicy
```

Изменение manifest после старта инвалидирует run; создаётся новый contour/runId.

### 16.2. Append-only run state

```text
PREPARED -> RUNNING -> RELEASE_PROOF_WRITTEN -> FINALIZED
```

Child process может писать только bounded artifacts. Только parent oracle после exit,
process reaping, artifact verification и cleanup checks может создать
`RELEASE_PROOF_WRITTEN`. `FINALIZED` требует независимого verifier и delivery binding.

### 16.3. Evidence DAG

Каждый receipt content-addressed и ссылается на parents. Claim verifier рекурсивно
проверяет hashes и bindings. Изменение одного файла, SHA, profile, editor build,
corpus, denominator или test inventory инвалидирует все зависимые claims.

### 16.4. Разделение ролей

| Role | Делает | Не может доказать в одиночку |
|---|---|---|
| Producer | запускает product/physical workload, пишет raw artifacts | acceptance |
| Parent oracle | проверяет exit, inventory, cleanup, sealed prefix | semantic correctness |
| Independent verifier | пересчитывает hashes, denominator, oracle results другим command path | release authority |
| Release auditor | сверяет canon, CI, merge, postmerge exact head и vetoes | скрывать stale/missing evidence |

Один человек может физически исполнять несколько ролей в indie-проекте, но команды,
артефакты и моменты подписи должны быть раздельны. Self-authored prose не evidence.

### 16.5. Запрещённые способы «починки»

- retry-until-green;
- увеличить timeout без causal evidence;
- сериализовать всё без доказательства race;
- пересоздать удалённый cwd и продолжить;
- исключить упавшие тесты из inventory;
- принять focused green вместо required graph;
- принять skip/todo/zero-test run;
- переписать receipt после прогона;
- смешать результаты разных SHA или editor builds;
- считать generated/synthetic DOCX физическим Word evidence;
- назвать manual result exact apply.

### 16.6. Обязательные mutation attacks на evidence

Verifier tests должны изменять по одному:

- head/merged SHA;
- profile или editor build;
- corpus hash и denominator;
- один operation record;
- artifact bytes;
- parent receipt;
- test inventory;
- stage order;
- symlink/target directory identity;
- worker attempt/generation;
- process exit/reaping record.

Каждая мутация обязана сделать claim invalid.

## 17. Протокол закрытия недетерминированности C01

Текущие ranked hypotheses:

1. mutable runDir/TMPDIR удаляется, пока дочерний или descendant process ещё держит
   его как cwd;
2. descendant переживает parent, а lease cleanup считает процесс завершённым;
3. runner/environment scrubbing меняет cwd/git resolution между stages;
4. failure capture отдельно проглатывает ошибку `git rev-parse`, поэтому `headSha`
   остаётся пустым;
5. stage запускается с mutable cwd вместо стабильного repo root.

### 17.1. Сначала наблюдаемость

До функциональной правки runner записывает для каждого stage attempt:

```text
stageAttemptId
parentRunId
requestedCwd
realCwd
cwdDevice
cwdInode
repoRoot
tmpRoot
leaseId
pid
parentPid
processGroupId
spawnAt
lastHeartbeatAt
exitAt
exitCode
signal
descendantsReaped
cleanupStartedAt
cleanupFinishedAt
headShaStatus
headSha
```

Failure capture создаётся до destructive cleanup. Ошибка SHA lookup сама создаёт
typed failure и не допускает пустой binding.

### 17.2. Исполнение runner

Заменить буферизующий sync-запуск на streaming child process с bounded stdout/stderr
tail, heartbeat и отдельным full log artifact. Cwd каждого stage — immutable repo
root; mutable directories передаются аргументами/env как data paths. Parent не
удаляет lease, пока process group/известные descendants не завершены.

### 17.3. Causal exit criterion

C01 закрыт только если одновременно:

1. старый код воспроизводит конкретный injected failure;
2. instrumentation связывает failure с одной причиной;
3. минимальная правка устраняет injected failure;
4. regression test падает без правки и проходит с ней;
5. forced deleted-cwd/orphan/timeout/cancel tests дают typed fail-closed receipts;
6. три свежих full-graph process runs на одном SHA проходят без retry;
7. минимум два независимых CI jobs проходят тот же frozen inventory;
8. все receipts имеют непустой exact SHA и одинаковый test inventory hash.

Серия greens без пунктов 1–4 не закрывает cause.

## 18. Контуры реализации

Каждый контур — один bounded problem, один rollback commit и полная delivery chain.
Следующий code contour не начинается до merge/postmerge verification предыдущего.

### C00 — Truth lock и capability reconciliation

**Проблема:** base/candidate/status matrices и runtime availability расходятся.

**Действия:**

1. выбрать exact candidate integration head без переноса незаявленных commits;
2. заморозить `ContourManifest` и полный test inventory;
3. снять `CommandCatalog`/adapter/test projection exact head;
4. сверить text/comment/formatting/structure availability с normalized/terminal
   matrices;
5. присвоить каждому operation family release state и reason;
6. зафиксировать трактовку Word denominator 8000;
7. объявить все stale receipts invalid для release.

**Negative checks:** missing command, extra released command, stale SHA, zero tests,
unknown reason, matrix permutation.

**Exit:** одна непротиворечивая exact-head capability projection; terminal claim всё
ещё `NOT_MADE`.

**Rollback:** удалить только новые derived receipts/status update; product code не
меняется.

### C01 — Causal closure полного RTK runner

**Проблема:** 578/594 и 594/594 на одном SHA.

**Действия:** выполнить протокол раздела 17; не менять semantic runtime одновременно.

**Tests:** injected deleted cwd, delayed descendant, lease race, SIGTERM, timeout,
failure-capture SHA failure, three full graphs, two CI jobs.

**Exit:** причинная модель + regression + bound receipts; не просто streak.

**Stop:** если failure нельзя связать с одним bounded contour, сохранить artifacts и
вернуться с `NONDETERMINISTIC_UNRESOLVED`.

### C02 — Secret store и key lifecycle

**Проблема:** raw secret в project state и parser worker.

**Действия:** реализовать opaque-key ports, safeStorage adapter, states, migration,
rotation и serializer redaction. Worker-secret удаляется окончательно в C04.

**Tests:** plaintext scan serialized project/IPC/evidence/DOCX; all key-state truth
table; migration crash killpoints; exact packaged Electron safeStorage probe; temporary
unavailability; `shouldReEncrypt` rotation; blocking prompt/cancel для sync fallback;
revoked/lost round; constant-time invalid tag path.

**Exit:** новый round не сохраняет raw key нигде; legacy migration no-loss; manuscript
доступен при LOST.

**Stop:** protected backend недоступен или migration требует удаления backups.

### C03 — Two-phase export publication

**Проблема:** authority и artifact могут расходиться при crash.

**Действия:** `PREPARING/PREPARED/PUBLISHED`, target identity, no-replace adapter,
reopen hash, startup reconciliation.

**Tests:** killpoint после каждого шага; existing target; disk full/short write;
parent rename/symlink swap detection; corrupted reopen; duplicate retry; lost target.

**Exit:** каждый killpoint имеет единственный recoverable state; ни один test не
перезаписывает пользовательский файл.

**Claim ceiling:** dependency-free path не заявляет hostile local race proof.

### C04 — Unprivileged hostile parser boundary

**Проблема:** worker получает secret; generic import парсит в main.

**Действия:** bytes-only worker input, immutable untrusted IR, no-secret verify в main,
общий bounded package path для generic import и bound return; один budget policy/hash
и непротиворечивые parent/worker deadlines.

**Tests:** ZIP bomb families, XML bombs, traversal/relationships, oversized IR,
timeout/cancel/late result, forged attempt/generation, worker output with secret/path,
crash/reap, generic import loss report, budget widening attempt, mismatched policy
hash, exact boundary-minus/at/plus-one cases для каждого числового лимита.

**Exit:** parser process не имеет secret, project path authority или writer; main не
парсит hostile package synchronously.

### C05 — Identity, classifier и normalized reasons

**Проблема:** semantic matching и reason drift могут скрыть ambiguous operations.

**Действия:** единый reason registry, explicit MatchProof, locator hierarchy, immutable
baseline batch, old-P0 regressions, unknown-node conservation.

**Tests:** overlaps, repeated phrases, permutations, lineage mismatch, stale source,
wrong round/export/profile, carrier spoof, adjacent revisions, paragraph mark,
clean/AutoCorrect, unknown story.

**Exit:** classifier total: каждый parsed candidate имеет ровно один class/reason;
AUTO требует complete MatchProof.

### C06 — Decision ledger и lane revalidation

**Проблема:** отдельные runtime lanes не образуют доказуемый terminal round.

**Действия:** `RoundDecisionSet`, ordered per-lane dispatch, fresh reclassification
после каждого commit, terminal conservation ledger, reverse verification.

**Tests:** capability revoked между preview/apply; project revision drift; first lane
меняет anchor second lane; duplicate dispatch; crash each journal phase; recovery;
reopen/replay; reject/defer paths; multi-scene atomic text lane.

**Exit:** никакой candidate не исчезает между lanes; mutation только через Command
Kernel; claim честно `ATOMIC_PER_LANE`.

### C07 — Word pre-long production closure

**Проблема:** кандидату не хватает единой production chain
`PREPARED → release proof → FINALIZED` и полного Phase D.

**Действия:** интегрировать C01–C06, прогнать component/contract/product цепочку,
закрыть release orchestrator, удалить test-only authority shortcuts, сформировать
candidate release proof.

**Tests:** полный frozen RTK graph, packaged critical journey, production wiring,
negative oracle portfolio, recovery/replay, evidence mutation suite.

**Exit:** один merged candidate SHA готов к physical campaign; Word acceptance всё ещё
не сделан.

### C08 — Word terminal physical campaign

**Проблема:** component tests не доказывают поведение реального Word.

**Действия:** выполнить замороженный synthetic corpus в одном exact Word build на
одном merged SHA; никаких code changes внутри campaign.

**Stop:** любой product bug, corpus/schema change, Word auto-update, SHA drift или
missing operation инвалидирует campaign. Исправление идёт новым contour и весь
затронутый denominator повторяется.

**Exit:** 8000/8000 classified, zero vetoes, complete artifacts, producer + blind
replay + independent verification.

### C09 — Independent release audit и exact-head acceptance

**Действия:** пересчитать evidence DAG другим command path; проверить canon,
capability matrix, merged SHA, CI, clean postmerge checkout и terminal arithmetic.

**Exit:** только здесь допустим `WORD_PROFILE_ACCEPTED`; claim перечисляет точный
profile/build и manual/blocked families. Слова «Word поддерживается полностью»
запрещены.

### G00 — Google authority gate

Проверить C09, создать отдельные Office/native profiles и synthetic corpus. До PASS
G00 product code не меняется.

### G01 — Google Office Mode characterization

Экспорт → реальный Google Office Mode → return DOCX → quarantine/parse. Измерить
carrier, suggestions, comments, formats, structures и повторные cycles. Никакого
apply в Product Core до матрицы.

### G02 — Google native conversion characterization

Повторить для conversion в Google Docs и download DOCX. Отдельно проверить missing
carrier и explicit local round pairing. Результат — только capability matrix и
reason codes.

### G03 — Минимальный Google product profile

Если G01 или G02 доказал bounded operation families, переиспользовать C02–C06 и
добавить только profile policy/normalization deltas. Google-specific Core или writer
запрещён.

### G04 — Google physical, audit и acceptance

Заморозить новый denominator по доказанному профилю, выполнить physical campaign,
independent verification, merge/postmerge exact head. Не наследовать Word numerator.

## 19. Word terminal corpus и знаменатель

Существующий практический план на одну repetition:

| Family | Positive/expected cases |
|---|---:|
| tracked text insert/replace/delete | 1200 |
| root comments | 300 |
| replies | 120 |
| lifecycle/delete | 100 |
| formatting | 180 |
| supported structural | 60 |
| negative/fail-closed | 40 |
| **Total** | **2000** |

21 scenes одного synthetic Dorian project. Каждый case имеет уникальный ID и
проверяется отдельно.

Рекомендуемая однозначная трактовка terminal target:

```text
3 producer repetitions x 2000 = 6000
1 blind independent physical replay x 2000 = 2000
TOTAL_PHYSICAL_CLASSIFIED = 8000
```

Второй independent auditor проверяет artifacts/claims, но не создаёт ещё один
physical numerator. Если active canon требует физический replay от обоих auditors,
знаменатель становится 10000, а не остаётся «8000». C00 обязан заморозить одну
трактовку до запуска.

### 19.1. Physical artifact set

Для каждой repetition:

- исходный export hash;
- returned artifact hash;
- exact Yalken SHA и packaged app identity;
- OS и точный Word build;
- corpus/test inventory hashes;
- operator action sheet;
- per-case observed result;
- parser/classifier/apply receipts;
- screenshots только как вспомогательное evidence;
- reopen/replay result;
- process/cleanup receipt;
- verifier output.

Word UI screenshot не доказывает OOXML semantics; package + product result остаются
обязательными.

## 20. Google physical corpus

Google denominator не копируется автоматически из Word. Сначала G01/G02 строят
characterization corpus минимум по следующим dimensions:

- Office mode vs native conversion;
- suggestions on/off и accept/reject state;
- root comments, replies, resolve/reopen;
- clean edits и AutoCorrect;
- repeated/adjacent tracked spans;
- headings, lists, page breaks, tables;
- Unicode, soft hyphen, nonbreaking spaces;
- headers/footers/notes/other stories;
- one, two и three edit cycles;
- carrier present/stripped/tampered;
- wrong local round, wrong project, stale revision;
- large package и hostile package negatives.

Только фактически доказанные families входят в G03 automatic denominator. Остальные
остаются manual/blocked и всё равно учитываются в total classification.

## 21. Защита от ухода в бесконечную разработку

### 21.1. Surgical experiment card

Перед каждым изменением исполнитель заполняет:

```text
problem
current evidence
one primary hypothesis
at most two alternate hypotheses
observable that separates them
minimal instrumentation
falsifier
allowed files
diff budget
tests before/after
rollback
exit criterion
claim ceiling
```

Сначала измерение, затем минимальная правка. Нельзя одновременно чинить runner,
semantic parser и UI.

### 21.2. Правила scope

- Один contour — одна причинная цепочка.
- Новая abstraction разрешена только при двух существующих consumers и удалении
  дублирования в том же contour.
- Новая dependency — только через owner decision и bake-off.
- Большой extraction не является prerequisite functional proof.
- После двух опровергнутых alternate hypotheses contour не расширяется: evidence
  фиксируется, scope пересогласуется.
- Не начинать Google implementation до C09.
- Не поднимать manual family в automatic ради terminal процента.

### 21.3. Claim ladder

```text
COMPONENT_PROVEN
CONTRACT_PROVEN
PRODUCT_PATH_PROVEN
PACKAGED_PATH_PROVEN
PHYSICAL_PROFILE_PROVEN
INDEPENDENTLY_VERIFIED
MERGED_EXACT_HEAD_VERIFIED
```

Каждый contour поднимается только на одну заявленную ступень. Верхняя ступень не
выводится из суммы нижних без соответствующего evidence.

## 22. Required negative suites

### 22.1. Authority

- wrong project/round/export/source revision/generation;
- invalid/missing/tampered YRTK2;
- wrong/verify-only/revoked/lost key;
- stale profile/editor build;
- carrier copied между документами;
- filename spoof;
- local round missing;
- replay already-applied return.

### 22.2. Parser/package

- ZIP traversal, duplicate parts, malformed central directory;
- inflated size/ratio bombs;
- XML entity/depth/node bombs;
- relationship escape/external target;
- invalid UTF/XML;
- huge comments/revisions/runs;
- worker timeout/crash/late result;
- output IR attempt/hash/generation mismatch.

### 22.3. Classification

- overlapping and repeated spans;
- adjacent revisions;
- permutation invariance;
- lineage mismatch;
- paragraph split/merge;
- clean/AutoCorrect;
- unsupported stories/fields/tables;
- Unicode normalization collision;
- comment anchor ambiguity;
- cross-scene and multi-scene stale mapping.

### 22.4. Apply/recovery

- capability revoked after preview;
- revision drift;
- duplicate dispatch;
- crash before/after reservation, snapshot, save, receipt;
- disk full/short write;
- recovery restore failure;
- reopen hash mismatch;
- remaining lane invalidated by previous lane;
- stale async publication;
- renderer direct IPC bypass.

### 22.5. Publication/evidence

- existing target and symlink target;
- parent identity change;
- staged artifact replacement;
- empty head SHA;
- receipt/artifact mutation;
- missing operation from denominator;
- duplicate case;
- skip/todo/zero tests;
- mixed SHA/build/corpus;
- orphan descendant and deleted cwd.

## 23. Delivery protocol каждого write contour

1. canonical bootstrap и exact active canon;
2. clean isolated worktree на verified T7-Secure;
3. `TASK_ARCHITECTURE_DECLARATION_V1` и preflight;
4. frozen `ContourManifest`;
5. baseline/falsifier до правки;
6. bounded implementation;
7. focused negative tests;
8. affected chain;
9. required frozen full graph;
10. guardrails и OSS/audit checks при затронутой dependency/security boundary;
11. stage scope check и diff budget;
12. commit, push, PR, independent CI;
13. merge без silent rebase/force;
14. fetch exact `origin/main`;
15. clean detached/worktree postmerge verification на merged SHA;
16. claim/evidence finalization;
17. один следующий contour.

Если target branch ушёл и bindings/mergeability нарушены, работа останавливается.
Нельзя молча переносить evidence на новый base.

## 24. Definition of Done

### 24.1. Word profile

Word contour завершён только когда:

- C00–C09 закрыты полными delivery chains;
- runner deterministic по causal criterion;
- raw secrets отсутствуют в project/IPC/DOCX/evidence;
- hostile parser unprivileged и bounded;
- export crash states reconciled, target не перезаписывается;
- classifier total и reason registry exact-head;
- Command Kernel policy совпадает с capability matrix;
- terminal ledger выполняет conservation equation;
- 8000/8000 или заранее исправленный 10000/10000 physical denominator закрыт;
- exact/manual/blocked counts опубликованы отдельно;
- independent audit и postmerge exact-head verification зелёные;
- terminal claim ограничен конкретным profile и Word build.

### 24.2. Google profile

Google contour завершён только когда:

- Word gate C09 принят;
- Office/native profiles не смешаны;
- physical behavior Google реально измерено;
- carrier loss не повышается эвристикой до authority;
- product runtime не зависит от network/cloud truth;
- reused Word pipeline прошёл Google-specific negatives;
- свой frozen denominator и independent audit закрыты;
- claim ограничен точным Google route/profile.

### 24.3. Hard STOP

Немедленный STOP при:

- ambiguous base/branch/worktree authority;
- чужом dirty WIP;
- missing active canon;
- renderer/parser прямом write в Core/storage/platform;
- external payload с authority до validation;
- raw secret вне protected adapter;
- async result без identity/revision/generation;
- stale/self-authored evidence как acceptance;
- red+green same-SHA, объявленном green без causal closure;
- пропущенном знаменателе или unknown candidate;
- обязательном network/credential/private-data scope без owner decision;
- новой dependency или native security adapter без разрешения;
- незавершённой commit/push/PR/merge/postmerge цепочке предыдущего contour.

## 25. Первый следующий исполнимый шаг

Начать только C00 на exact candidate branch: заморозить candidate SHA и test
inventory, снять реальную Command Catalog/capability projection, сопоставить её с
formatting/structural matrices и формально закрепить `NONDETERMINISTIC_UNRESOLVED`.
Затем C01 отдельно инструментирует runner и доказывает причину `ENOENT/cwd-path`.
Не менять Word semantic runtime, secret store или Google code до закрытия C01.

Это самый короткий путь к честному продолжению: он сначала делает измерительный
прибор надёжным, а уже потом использует его для security и semantic изменений.

## 26. Решения, требующие owner/canon choice до соответствующего контура

1. Считать ли второй independent audit проверкой evidence или вторым physical replay;
   это фиксирует denominator 8000 либо 10000 в C00.
2. Достаточна ли single-user no-replace модель публикации для MVP; если требуется
   hostile local path-race proof, нужен отдельный owner-approved native adapter.
3. Какие formatting/structural families реально выпускаются в первом Word profile;
   наличие кода само по себе не является ответом.
4. Нужен ли после Word acceptance Google native conversion или достаточно Google
   Office Mode.
5. Разрешать ли когда-либо Google API route; это отдельное расширение security и
   network boundary, не часть текущего MVP.

До этих решений безопасные defaults: 8000 по схеме раздела 19, dependency-free
no-replace с честным race limitation, unsupported formatting/structure manual,
Google Office Mode первым, Google API запрещён.

## 27. Карта текущего кода и целевая ответственность

Эта карта привязана к binding base. Она нужна, чтобы executor не создавал новый
параллельный interop stack.

| Текущий модуль | Наблюдаемая роль | Конкретный разрыв | Целевой хирургический ход |
|---|---|---|---|
| `src/main.js` | command wiring, export source, durable authority store, publication gate, utility-process intake, apply orchestration | 29k строк; raw secret persistence; второй privileged parse; state transitions распределены | оставить composition root; перенести protected-key effect в adapter; main координирует, но не реализует parser/semantic algorithms |
| `src/io/revisionBridge/index.mjs` | legacy/canonical façade для import, package, evidence и review функций | 17k строк; несколько ответственностей; риск незаметного fallback | не переписывать в C01–C07; добавлять узкие exports из существующих модулей; extraction только Route W-B после terminal behavior lock |
| `src/export/docx/fullManuscriptDocxReviewPacketSource.js` | scene snapshot, blocks/FormatIR, ExportMap/CoreManifest/YRTK2 source capsule | принимает/возвращает raw `hmacSecret`; содержит fallback builders, хотя production требует canonical bridge | подавать готовый signed public token и key metadata; fallback сделать явно test-only либо удалить после characterization |
| `src/export/docx/docxReviewPacketBuilder.js` | deterministic package construction, custom properties/custom XML | builder может случайно получить privilege через source object | принимать только public package model; contract test запрещает secret-like fields |
| `src/export/docx/docxReviewPacketExportHandler.js` | validation, build, publication gate, file write | использует overwrite-capable `writeBufferAtomic` | для bound review инжектировать отдельную `publishBufferNoReplace`; generic exporters не менять скрытно |
| `src/export/docx/atomicWriteBuffer.js` | temp + rename atomic write | rename заменяет существующую цель; нет reopen hash/state receipt | сохранить legacy API для существующих consumers; добавить отдельный no-replace API с явным result/receipt или отдельный узкий adapter после scope review |
| `src/export/docx/fullManuscriptDocxReviewReturnRouter.js` | full-manuscript classification и command envelope routing | читает local raw secret; разные lanes расходятся | принимать только verified `ReturnIntakeProof`; выдавать candidates/commands без direct mutation |
| `src/main/rtkDocxReturnIntakeWorker.cjs` | Electron utility-process package/semantic parse | явно возвращает `hmacSecret` во вход и создаёт HMAC crypto capability | удалить HMAC implementation и secret field; worker выдаёт только `ParsedUntrustedIR` + budget receipt |
| `src/io/revisionBridge/reviewTransportPackageParserV2.mjs` | bounded package parser, carrier extraction и authority verification | parse и privileged verify сцеплены | выделить pure extraction entrypoint; verify оставить в main-side crypto/manifest core |
| `src/io/revisionBridge/reviewTransportManifestCore.mjs` | transport manifest sign/verify | API принимает raw secret | перевести main-side caller на opaque crypto operations; pure payload/hash builders оставить |
| `src/io/revisionBridge/reviewTransportYrtk2Core.mjs` | YRTK2 create/verify | API принимает raw secret | разделить pure token codec и `ReviewCryptoPort` sign/verify по handle |
| `src/io/revisionBridge/reviewTransportRoundStore.mjs` | bounded round store, safe path, fsync/quarantine | W1 lifecycle не выражает export prepare/publish и return attempts | расширять versioned schema/CAS transitions; не создавать второй store в main |
| `src/io/revisionBridge/reviewTransportContracts.mjs` | lifecycle и общие contracts | reason vocabulary распределён | поместить versioned normalized reason registry здесь либо в одном импортируемом pure child module |
| `src/io/revisionBridge/reviewTransportClassifierV2.mjs` | классификация revisions/comments | не все results связаны единым MatchProof/reason enum | total classifier; unknown fail-closed; без write capability |
| `src/io/revisionBridge/reviewTransportSourceMapUniqueDiffV4.mjs` | source mapping и unique diff | критическая основа occurrence/lineage proof | сохранить; добавить только regression/falsifier, если C05 обнаружит gap |
| `src/io/revisionBridge/reviewTransportExactApplyAdapterV2.mjs` | exact text adapter | released scope зависит от внешней матрицы | принимать complete MatchProof и Command Kernel reservation |
| `src/io/revisionBridge/reviewTransportMultiSceneAtomicCoordinatorV4.mjs` | multi-scene text atomicity | не является whole-round coordinator | переиспользовать только text lane; не расширять молча на formatting/structure |
| `src/io/revisionBridge/reviewTransportNonTextReturnRuntime.mjs` | root comments/lifecycle | profile/release truth требует reconciliation | включить в terminal decision ledger через существующий command path |
| `src/io/revisionBridge/reviewTransportFormattingReturnRuntime.mjs` | formatting apply/recovery | наличие runtime расходится с `MANUAL_ONLY` matrix | C00 фиксирует `IMPLEMENTED_NOT_RELEASED` или released profile; код не получает claim автоматически |
| `src/io/revisionBridge/reviewTransportStructuralReturnRuntime.mjs` | bounded structure apply/recovery | то же; часть операций лишь typed candidates | разделить exact supported commands и manual candidates в capability projection |
| `src/io/revisionBridge/reviewTransportApplyCore.mjs` и `reviewTransportApplyStore.mjs` | apply contracts/store | нет полного terminal ledger всех lanes | разместить orchestration primitives здесь; новый ledger module допустим только если две lane families реально его потребляют |
| `src/io/revisionBridge/exactTextMinSafeWrite.mjs` и `exactTextApplyJournal.mjs` | safe text write/journal/replay | гарантия не переносится автоматически на другие lanes | переиспользовать как reference; не заявлять cross-lane atomicity |
| `src/utils/docxImportLocalFilePreview.js` и related preview/create modules | generic DOCX portability | отдельный main-side parser boundary и loss semantics | перевести package parse на общий no-secret worker; сохранить отдельный `ImportLossReport` |
| `scripts/run-rtk-tests.mjs` | frozen RTK graph runner/failure capture | sync buffering, нет heartbeat, SHA error swallow, вероятный lease/cwd race | только C01 instrumentation и causal fix |
| `scripts/ops/rtk-word-c5v2-terminal-orchestrator.mjs` | candidate terminal stages/portfolio/finalization | последняя цепочка flaky/incomplete | не расширять semantic scope; закрыть stage authority и parent oracle |
| `scripts/ops/rtk-word-normalized-capability-matrix.mjs` | derived matrix | может устареть относительно Command Catalog и physical receipts | C00 добавляет exact-head cross-check, но не делает script runtime enforcement |

### 27.1. Минимальный новый adapter

Единственный заранее оправданный новый platform module C02 — main-process adapter
`reviewSecretStoreAdapter.cjs` либо эквивалентное существующему naming имя. Он:

- хранит encrypted key blobs в app-owned local store, не в project content;
- на pinned Electron сначала probes async availability и предпочитает
  `encryptStringAsync/decryptStringAsync`;
- обрабатывает temporary unavailability как typed no-mutation outcome и
  `shouldReEncrypt` как атомарную ротацию blob;
- если доказан только sync API, изолирует `isEncryptionAvailable` и
  `encryptString/decryptString` за тем же port без распространения sync semantics;
- атомарно сохраняет index `projectId/keyId/state/blobHash` с mode 0600;
- возвращает наружу opaque `KeyHandle`;
- никогда не сериализуется в renderer IPC;
- имеет injectable in-memory fake только для tests;
- при переносе проекта на другую машину даёт `LOST`, а не повреждение manuscript.

Если Electron runtime не предоставляет требуемый protected backend в packaged build,
C02 останавливается. Plaintext fallback запрещён.

### 27.2. Рекомендуемые port signatures

```text
ReviewSecretStorePort.ensureProjectKey({ projectId })
  -> { keyHandle, keyId, state }

ReviewSecretStorePort.getKeyMetadata({ projectId, keyId })
  -> { keyHandle?, keyId, state }

ReviewSecretStorePort.transition({ projectId, keyId, fromState, toState })
  -> { previousRecordHash, recordHash, state }

ReviewCryptoPort.signYrtk2({ keyHandle, domain, canonicalPayload })
  -> { token, tokenDigest, keyId }

ReviewCryptoPort.verifyYrtk2({ keyHandle, domain, canonicalPayload, token })
  -> { verified, keyId, reasonCode }

ReviewParserPort.parseUntrustedDocx({
  bytes, inputSha256, returnAttemptId, generation, budgets, parserVersion
})
  -> { untrustedIr, irHash, budgetReceipt, workerReceipt }

ReviewRoundStorePort.compareAndTransition({
  roundId, expectedRecordHash, fromState, toState, patch
})
  -> { record, recordHash }

ReviewArtifactFilePort.publishNoReplace({
  parentIdentity, targetName, bytes, expectedSha256, roundId
})
  -> { status, artifactIdentity, sha256, durabilityReceipt, limitationCodes }
```

`ReviewCryptoPort` implementation может кратковременно decrypt derived material внутри
main process, но API не возвращает bytes. Test fake обязан имитировать handle semantics,
а не приучать callers передавать plaintext.

### 27.3. Производственный путь без duplicate fallback

`readFullManuscriptDocxReviewPacketExportSource` уже требует canonical
`revisionBridge` builders. Поэтому fallback CoreManifest/YRTK2 builders в source
module не должны становиться вторым production algorithm. C02/C03 выбирают одно:

1. удалить их после добавления characterization tests; либо
2. пометить explicit `testOnlyFallback` и сделать production invocation contract
   падающим при его использовании.

Молчаливый fallback при production import error запрещён.

## 28. `FEATURE_INTEGRATION_MANIFEST_V1` для будущей реализации

Этот раздел — manifest contract, а не разрешение создать runtime registry.

```text
featureId: YALKEN_BOUND_DOCUMENT_REVIEW_INTEROP_V1
status: TARGET_NOT_CURRENT
productPlaneOwner: Product Core + Command Kernel
interfacePlaneOwner: Design OS projections only
externalSystems: Microsoft Word; Google Docs as untrusted file editors
runtimeNetwork: FORBIDDEN_IN_MVP
newDependencies: NONE_BY_DEFAULT

projectState:
  - ReviewRoundRecord metadata without raw secret
  - ReturnAttemptRecord
  - applied decision receipts

authoringWorkingState:
  - current unsaved editor document
  - must block/export snapshot or explicitly reconcile; never discard

derivedState:
  - ParsedUntrustedIR
  - actual baseline
  - ExportMap
  - classification
  - MatchProof
  - capability/evidence projections

shellState:
  - active review panel/session selection only

transientState:
  - progress, hover, cancel affordance

commands:
  - ImportPortableContent
  - ExportNativeDocument
  - CreateBoundReviewRound
  - PublishBoundReviewArtifact
  - RegisterReturnedReviewArtifact
  - RecordReviewDecisionSet
  - ApplyReviewLaneDecision
  - AbortReviewRound
  - RecoverReviewRound
  - RotateReviewKey
  - RevokeReviewKey

queries:
  - GetInteropCapabilities
  - GetReviewRound
  - GetReturnIntakeProjection
  - GetReviewDecisionProjection
  - GetInteropDiagnostics
  - GetRecoveryStatus

events:
  - ReviewRoundPrepared
  - ReviewArtifactPublished
  - ReviewReturnQuarantined
  - ReviewReturnClassified
  - ReviewDecisionRecorded
  - ReviewLaneApplied
  - ReviewLaneRejected
  - ReviewRoundClosed
  - ReviewRecoveryRequired

effects:
  - ReadSelectedArtifact
  - WriteStagedArtifact
  - PublishArtifactNoReplace
  - ParseDocxInUtilityProcess
  - ProtectedKeyCreateUseTransition
  - AtomicProjectCommit
  - RecoverySnapshotRestore
  - EvidenceAppend

productPorts:
  - ReviewCryptoPort
  - ReviewSecretStorePort
  - ReviewArtifactFilePort
  - ReviewDocxPackagePort
  - ReviewParserPort
  - ReviewRoundStorePort
  - ReviewEvidenceStorePort
  - ProjectPersistencePort
  - RecoveryPort

designReadPorts:
  - CommandCatalogPort
  - CommandDispatchPort
  - DomainProjectionPort
  - DiagnosticsPort
  - ShellProjectionPort

projections:
  - ReviewExportProjection
  - ReturnIntakeProjection
  - RoundDecisionProjection
  - CapabilityProjection
  - RecoveryProjection
  - EvidenceProjection

identityGuard:
  projectId + roundId + returnAttemptId + sourceRevision + generation + inputSha256

fallback:
  unbound or unverified file -> manual diagnostic or CONTENT_PORTABILITY
  unsupported operation -> typed MANUAL_DECISION or BLOCKED_UNSAFE
  protected key unavailable -> bound review disabled; manuscript remains available
  parser timeout/crash -> quarantine; no mutation
  stale revision -> reclassify/manual; no heuristic rebase

recovery:
  export two-phase reconciliation
  per-lane reservation + snapshot + journal + atomic save + reopen/replay
  no whole-round atomic claim

accessibility:
  existing review projection must expose operation, before/after, reason and decision
  keyboard and screen-reader acceptance belongs to any future UI contour

performance:
  all byte/node/time/output limits belong to InteropProfile and evidence
  no unbounded main-thread DOCX parse

security:
  external bytes untrusted
  no secret in project JSON, renderer IPC, worker, DOCX or evidence
  no path/command authority from renderer or package
  no runtime network/cloud truth

negativeTests:
  authority + package + classification + apply/recovery + publication/evidence suites

nonClaims:
  no universal DOCX fidelity
  no Google sync
  no executable plugin runtime
  no hostile local path-race proof without native adapter
  no automatic paragraph/list/table/field semantics unless separately released
```

`ReviewArtifactFilePort` — TARGET-уточнение относительно списка V4. C00 обязан либо
внести его в следующий canonical feature manifest, либо привязать те же операции к
уже одобренному named platform port. Прямые `fs` effects из domain/classifier как
компромисс запрещены.

## 29. Предварительная file-scope карта контуров

Точные paths каждого контура всё равно замораживаются его declaration. Эта таблица
ограничивает направление; она не разрешает менять всё перечисленное сразу.

| Contour | Основные production files | Test/evidence owners | Явно вне scope |
|---|---|---|---|
| C00 | production files read-only | normalized capability script, exact-head contract, status matrices | semantic code, UI, Google runtime |
| C01 | RTK runner и terminal orchestrator только | runner contracts, injected fault child, graph catalog | parser, crypto, apply, renderer |
| C02 | main wiring, packet source, YRTK2/manifest crypto boundary, secret adapter | key lifecycle/migration/secret scan contracts | parser semantics, lane apply, UI |
| C03 | round store, review export handler, explicit no-replace publisher, main wiring | killpoints, publication/reconciliation contracts | generic exporter semantics, parser, Google |
| C04 | intake worker, package parser entrypoint, main intake, generic DOCX preview wiring | hostile corpus, worker identity/reap, portability loss contracts | classifier/apply semantics |
| C05 | contracts/reason registry, classifier, source-map unique diff, return router | semantic/ambiguity/permutation/identity contracts | persistence writer, UI |
| C06 | return router, apply core/store, existing lane runtimes, main command wiring | decision ledger, revalidation, recovery/replay contracts | new all-lane framework, Google |
| C07 | production wiring only по обнаруженному gap | full RTK graph, orchestrator, release receipts | new semantic families |
| C08 | no `src` writes | physical corpus/artifacts/receipts | любые code fixes внутри campaign |
| C09 | no feature code | verifier, status matrices, postmerge receipts | новые capabilities |
| G00–G02 | no product code | Google lab scripts/matrices/synthetic artifacts | OAuth/API/runtime network |
| G03 | profile policy и доказанный normalization delta only | reused Word graph + Google negatives | Google-specific Core/writer |
| G04 | no feature code | physical artifacts, independent verifier, status | новые capabilities |

### 29.1. Change budget rule

Каждый contour declaration задаёт max changed production basenames и max logical
lines. Превышение — не автоматический fail, но требует остановки до edit, новой
причины и обновлённого owner-visible scope. Нельзя дробить один большой rewrite на
несколько commits внутри того же contour, чтобы обойти budget.

## 30. Реестр ключевых гипотез и маршрут решений

| ID | Гипотеза | Самый дешёвый различающий эксперимент | Решение при подтверждении | Решение при опровержении |
|---|---|---|---|---|
| H-RUN-01 | flaky ENOENT вызван cleanup до reaping descendants | child держит cwd, parent завершён, контролируемый delayed exit | process-group/lease ownership fix | перейти к H-RUN-02 без semantic edits |
| H-RUN-02 | stage использует mutable cwd | записать inode cwd до/после удаления runDir | immutable repo cwd + data path args | проверить env/git lookup H-RUN-03 |
| H-RUN-03 | empty SHA — отдельный capture defect | заставить `git rev-parse` завершиться nonzero | fail-closed SHA status | если SHA пуст без failure, искать serialization bug |
| H-KEY-01 | Electron safeStorage достаточен без новой dependency | packaged probe: availability, encrypt/decrypt, restart, locked backend | opaque-key adapter C02 | STOP и owner choice; plaintext запрещён |
| H-PUB-01 | same-directory hard-link даёт нужный no-replace MVP | existing target, crash, reopen inode/hash, fsync probe | dependency-free publisher с limitation code | direct `wx` fallback с честной crash limitation или owner-approved native adapter |
| H-PARSE-01 | current parser можно разделить на extraction и verify без semantic rewrite | characterization hash current IR до/после pure entrypoint | no-secret worker C04 | узкий parser adapter; не новый framework |
| H-CAP-01 | format/structure code есть, но release policy выключает его | exact Command Catalog + dispatch gate projection | matrix `IMPLEMENTED_NOT_RELEASED` | если доступно пользователю, C00 блокирует до evidence либо выключает capability |
| H-LANE-01 | per-lane reclassification достаточно для MVP | mixed round: text меняет format/comment anchor | ordered per-lane coordinator | отдельный future composite transaction manifest |
| H-WORD-01 | paragraph mark можно доказать отдельным bounded effect | synthetic split/merge + package/reopen/reverse graph | Route P2 отдельным будущим contour | Route P1 manual terminal |
| H-WORD-02 | bounded FormatIR переживает Word run splitting | whitelist corpus, multiple save/reopen cycles | release доказанных properties | profile manual для остальных |
| H-GOOG-01 | Office Mode сохраняет YRTK2 carrier и baseline bindings | physical upload/edit/download/reparse | reuse bound pipeline profile | explicit local pairing/manual portability |
| H-GOOG-02 | native conversion сохраняет suggestions как usable DOCX revisions | physical conversion matrix | отдельный bounded native profile | suggestions manual/clean candidates |
| H-GOOG-03 | Google comments экспортируются как document comments с anchors | root/reply/resolve cycle | release только доказанный subset | diagnostic/manual; Drive comments не смешивать |

Гипотеза считается закрытой только экспериментом, который мог её опровергнуть.
Совпадение с ожидаемым результатом на synthetic builder output не заменяет реальный
Word/Google experiment там, где гипотеза относится к поведению редактора.

## 31. Внешние нормативные ограничения, проверенные по первичным источникам

Эти источники подтверждают форму внешнего формата/API, но не являются Yalken product
evidence и не заменяют physical campaign.

1. Microsoft описывает tracked deletion знака абзаца как `w:del` внутри
   `w:p/w:pPr/w:rPr`; содержимое соседних абзацев при этом не становится автоматически
   deleted. Это подтверждает отдельный structural candidate и отклоняет Route P3 с
   простой newline-normalization: [Microsoft Learn — revisions in a word-processing
   document](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-accept-all-revisions-in-a-word-processing-document).
2. Microsoft указывает, что comment без matching reference может быть проигнорирован,
   а duplicate comment IDs не дают однозначного результата. Поэтому numeric comment
   ID — locator, но не authority: [Microsoft Learn — retrieve comments from a word
   processing document](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-retrieve-comments-from-a-word-processing-document).
3. Google документирует два разных пути: редактирование Office file с сохранением в
   исходном Office-формате и conversion в отдельную Google-копию. Документ не обещает
   byte/package/custom-XML fidelity, поэтому G-A и G-B обязаны быть разными physical
   profiles: [Google Drive Help — work with Microsoft Office
   files](https://support.google.com/drive/answer/9406611).
4. Google Drive API отдельно определяет anchored/unanchored comments, предупреждает,
   что Workspace editors трактуют developer-defined anchors как unanchored и что
   позиция anchor между revisions не гарантируется. Это подтверждает запрет смешивать
   Drive comments с DOCX document comments: [Google Drive API — manage comments and
   replies](https://developers.google.com/workspace/drive/api/guides/manage-comments).
5. Electron определяет `safeStorage` как main-process OS-backed encryption; для macOS
   key material опирается на Keychain. Текущая документация рекомендует async API,
   который поддерживает temporary-unavailable и re-encryption signals. Поэтому C02
   требует exact packaged probe, а не предположение по TypeScript/API surface:
   [Electron — safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

Ни один источник не гарантирует, что конкретный Word/Google build сохранит YRTK2,
custom properties, custom XML, replies или suggestion semantics после save/export.
Именно эти утверждения остаются фальсифицируемыми physical hypotheses.
