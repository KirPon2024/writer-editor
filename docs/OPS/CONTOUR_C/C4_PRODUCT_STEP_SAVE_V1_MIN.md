# C4_PRODUCT_STEP_SAVE_V1_MIN

## STEP_ID
`SAVE_V1_MIN`

## PURPOSE
Минимальный продуктовый выход C4: подтверждённый рабочий save-path с атомарной записью.

## SCENARIO
`SAVE_V1_ATOMIC_OVERWRITE`

1. Записать `alpha` через atomic save.
2. Прочитать файл и проверить `alpha`.
3. Перезаписать `beta` через save wrapper.
4. Прочитать файл и проверить `beta`.

## TEST
- `test/unit/contour-c-c4-save-v1-proof.test.js`
- Guard: `scripts/guards/contour-c-c4-save-v1-proof.mjs`

## PASS_CRITERIA
- Guard возвращает `exit=0`.
- Guard печатает:
  - `STEP_ID=SAVE_V1_MIN`
  - `SCENARIO_ID=SAVE_V1_ATOMIC_OVERWRITE`
  - `RESULT=PASS`

## FAIL_CRITERIA
- Любая ошибка записи/чтения.
- Любое расхождение ожидаемого содержимого.
- `RESULT=FAIL` или `exit!=0`.
