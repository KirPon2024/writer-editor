# ТЗ‑001: OSS‑guard + CI (anti‑paywall + npm audit)

> Статус: выполнено в репо (2026-01-27). Файл оставлен как канонический “вертикальный срез” для повторения/проверки.

## Контекст / инварианты
- Offline‑first продукт, никаких сетевых запросов/аккаунтов как фич.
- Anti‑paywall политика обязательна:
  - запрещены `@tiptap-pro/*`, `@tiptap-cloud/*`
  - запрещены `registry.tiptap.dev`, `TIPTAP_PRO_TOKEN`
- Никаких новых npm‑зависимостей.

## Ограничения
- Разрешённые файлы:
  - `scripts/check-no-paid-tiptap.mjs` (новый)
  - `.github/workflows/oss-policy.yml` (новый)
  - `package.json` (только добавление npm scripts)
- Запрещено менять:
  - `src/**`, `test/**`, `docs/**`, `build/**`, `dist/**`
- Diff budget: ≤ 3 новых файла, ≤ 1 изменённый файл.

## Что сделать (детерминированно)
1) Добавить `scripts/check-no-paid-tiptap.mjs` (скан repo; падать при нарушении).
2) В `package.json` добавить script:
   - `oss:policy`: `node scripts/check-no-paid-tiptap.mjs`
3) Добавить workflow `.github/workflows/oss-policy.yml`:
   - pre‑install OSS‑guard
   - `npm ci`
   - post‑install OSS‑guard
   - `npm audit --audit-level=high`

## Acceptance criteria (DoD)
- [ ] `node scripts/check-no-paid-tiptap.mjs` проходит на текущем репо.
- [ ] В `package.json` есть `oss:policy`.
- [ ] В репо есть `.github/workflows/oss-policy.yml` с pre/post install проверками и `npm audit`.
- [ ] `src/**` не изменён.
- [ ] Новых npm‑зависимостей нет.

## Проверки
- Авто: `node scripts/check-no-paid-tiptap.mjs`
- В CI: workflow `OSS policy`

## Output contract
- Изменённые файлы: список + `path:line` ключевых мест.
- Подтверждение: deps не добавлял, `src/**` не трогал.
- Что проверил/не проверил — явно.
