# docs/tasks

Здесь лежат ТЗ (task/spec) по задачам в формате:

`YYYY-MM-DD--short-name.md`

Создавать удобнее через “brain”:
- `npm run brain:new-task -- "Короткий заголовок задачи"`

Дальше можно дописать детали прямо в созданном файле и передать его Codex/агенту.

Перед любой write-задачей сначала разрешить `CANON_STATUS.json`, прочитать
active canon, затем `CANON.md`, COREX, BIBLE и `PROCESS.md`.

Для feature, process, worker, import, export, analysis или новой UI surface
обязателен `YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md` и preflight из
`FEATURE_TZ.md` либо `hard-tz.md`. Manifest сначала является блоком ТЗ; он не
создаёт runtime registry или feature pack автоматически.
