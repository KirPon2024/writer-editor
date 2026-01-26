# ТЗ для Codex: откалибровать размер страницы и gap под референс (Scrivener A4, zoom 50%), этапами

> Цель: добиться совпадения размеров “листа” и расстояния между страницами с референсом, **без интерпретаций**.
> Меняем только математику размеров в `src/renderer/editor.js`, без CSS/HTML и без новых зависимостей.

## Контекст / ограничения
- Технологии: Electron + vanilla HTML/CSS/JS. Полностью оффлайн.
- Без новых зависимостей.
- Diff budget: точечно; правим **только** математику размеров страницы/полей/gap (мм→px) **в одном файле**: `src/renderer/editor.js`.
- Нельзя ломать: темы, зум (шаг 5%), пагинацию, ввод (`contenteditable`), `Cmd/Ctrl+C/V/A`, wrap toggle, word count, save/open.
- Не менять: `MARGIN_MM`, `PAGE_FORMATS`, расчёт высоты `* Math.SQRT2`, логику `--editor-zoom`, CSS/HTML.

## Референс подтверждён
- Scrivener → `Page Setup…` → `Paper Size: A4 210×297 mm`.

## Референс (фиксированные числа)
Все размеры ниже измерены на macOS по **скриншоту** (Retina), при **zoom = 50%**:
- Размер листа A4 (граница белого прямоугольника): `595×842 px`
- Gap между страницами (вертикальный зазор между низом одной страницы и верхом следующей): `20 px`
  - измерение `592×20` означает: высота gap = `20px` (ширина не важна).

## Важно: что именно сравниваем (device px vs CSS px)
Измерение по скриншоту даёт **device pixels** (на Retina это обычно `devicePixelRatio = 2`).
Чтобы не путаться, в Craftsman проверяем размеры в **device px** так:
- берём `getBoundingClientRect()` (CSS px)
- умножаем на `window.devicePixelRatio`
- округляем `Math.round(...)`

## Термины
- “Размер страницы” = размер `.editor-page-wrap` (его `getBoundingClientRect().width/height`).
- “Gap” = расстояние между соседними `.editor-page-wrap` по вертикали (в px на экране).

## Где сейчас задаются размеры (в проекте)
Файл: `src/renderer/editor.js`
- `PX_PER_MM_AT_ZOOM_1` — базовая конверсия мм → px (источник правды).
- `PAGE_GAP_MM` — gap в мм, затем переводится в px.
- `MARGIN_MM = 25.4` — поля в мм (совпадает с референсом: 2.54cm) — **не менять**.
- `PAGE_FORMATS.A4 = 210` — ширина A4 в мм — **не менять**.
- Высота A4: `widthMm * Math.SQRT2` — **не менять**.
- CSS vars выставляются в `applyPageViewCssVars()` через `Math.round` — **не менять**.

## Проблема (что сломано сейчас)
Изменения могли затронуть только gap, но размер страницы не совпадает с референсом на 50%.
Основная причина расхождения: в одном сравнении смешались “пиксели скрина” (device px) и CSS px.

## Цели (детерминированно)
После правок, в Craftsman при **zoom = 50%** (проверка в device px):
- Страница: `595×842`
- Gap: `20`

При **zoom = 100%**:
- Страница: `1190×1684` (ровно ×2)
- Gap: `40`

При **zoom = 200%**:
- Страница: `2380×3368` (ровно ×4)
- Gap: `80`

Допуски:
- Страница: `±0` по ширине, `±1` по высоте (округление высоты через √2).
- Gap: `±1` (округление/субпиксели).

## Этапы реализации (строго по шагам)
> Каждый этап — отдельный небольшой патч в `src/renderer/editor.js`, затем ручная проверка.

### Этап 1 — откалибровать размер страницы (только `PX_PER_MM_AT_ZOOM_1`)
**Задача этапа:** добиться размера страницы `595×842 device px` при zoom 50%.

Сделать:
1) В `src/renderer/editor.js` заменить `PX_PER_MM_AT_ZOOM_1` на **ровно**:
   - `const PX_PER_MM_AT_ZOOM_1 = 595 / 210;`
2) На этом этапе **не менять** `PAGE_GAP_MM` (даже если он “почти совпал”).

Проверка этапа 1 (DevTools, zoom = 50%):
```js
const page = document.querySelector('.editor-page-wrap');
const r = page.getBoundingClientRect();
const dpr = window.devicePixelRatio || 1;
[Math.round(r.width * dpr), Math.round(r.height * dpr)]
```
Ожидание: `[595, 842]`.

### Этап 2 — откалибровать gap (только `PAGE_GAP_MM`)
**Задача этапа:** добиться gap `20 device px` при zoom 50%.

Сделать:
1) В `src/renderer/editor.js` заменить `PAGE_GAP_MM` так, чтобы при zoom 50% gap был 20 device px.
2) Использовать **только** формулу, без отдельного скейла:
   - `const PAGE_GAP_MM = 20 / (595 / 210);`
   - (то же самое, что ~`7.0588235294 mm`, но лучше оставить формулой).

Проверка этапа 2 (DevTools, zoom = 50%, нужно минимум 2 страницы):
```js
const pages = document.querySelectorAll('.editor-page-wrap');
const r1 = pages[0].getBoundingClientRect();
const r2 = pages[1].getBoundingClientRect();
const dpr = window.devicePixelRatio || 1;
Math.round((r2.top - r1.bottom) * dpr)
```
Ожидание: `20`.

### Этап 3 — линейность и регресс-минимум
Проверить, что:
- На zoom 100% и 200% размеры/ gap линейно масштабируются (×2 и ×4 в device px).
- Пагинация/скролл работают как раньше.
- Light/Dark не меняют геометрию.

Проверка линейности (повторить на 100% и 200%):
```js
const page = document.querySelector('.editor-page-wrap');
const r = page.getBoundingClientRect();
const dpr = window.devicePixelRatio || 1;
[Math.round(r.width * dpr), Math.round(r.height * dpr)]
```
Ожидания:
- 100%: `[1190, 1684]`
- 200%: `[2380, 3368]`

Gap аналогично формуле из этапа 2:
- 100%: `40`
- 200%: `80`

## Запрещённые решения (чтобы не “обобщать”)
- Не менять `MARGIN_MM`, `PAGE_FORMATS`, `Math.SQRT2`.
- Не менять логику `--editor-zoom` и шаг зума.
- Не править CSS/HTML.
- Не добавлять отдельные коэффициенты масштаба для gap (только `PAGE_GAP_MM` в мм).

## Output contract (ответ Codex)
- Изменённые файлы: только `src/renderer/editor.js:<line>`.
- Явно указать, что выставлено:
  - `PX_PER_MM_AT_ZOOM_1 = 595 / 210`
  - `PAGE_GAP_MM = 20 / (595 / 210)`
- Проверки: какие команды/ручные шаги реально выполнены; если `npm run dev` не запускался — сказать прямо.
