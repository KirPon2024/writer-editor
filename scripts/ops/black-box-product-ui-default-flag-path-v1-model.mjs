#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

const TASK_ID = 'F3_BLACK_BOX_PRODUCT_UI_DEFAULT_FLAG_PATH_V1';
const COMMAND_ID = 'cmd.project.blackBox.exportManualCoreCapsuleKitV1';
const CAPABILITY_ID = 'cap.blackBox.manualCoreCapsule.export';
const FEATURE_FLAG_ENV = 'YALKEN_ENABLE_BLACK_BOX_MANUAL_CORE_CAPSULE_COMMAND_V1';
const FEATURE_FLAG_ID = 'yalken.blackBox.manualCoreCapsuleKit.v1';
const MENU_ITEM_ID = 'file-export-black-box-manual-core-capsule';
const MENU_LABEL_KEY = 'menu.file.exportBlackBoxManualCoreCapsule';
const EXPORT_FORMAT_ID = 'black-box-manual-core';

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function findMenuItemByCommand(menuConfig, commandId = COMMAND_ID) {
  for (const menu of menuConfig.menus || []) {
    for (const item of menu.items || []) {
      if (item && item.command === commandId) return { menu, item };
    }
  }
  return null;
}

function getSource(overrides = {}) {
  return {
    menu: overrides.menu || readJson('src/menu/menu-config.v2.json'),
    locale: overrides.locale || readJson('src/menu/menu-locale.catalog.v1.json'),
    html: overrides.html || readText('src/renderer/index.html'),
    editor: overrides.editor || readText('src/renderer/editor.js'),
    main: overrides.main || readText('src/main.js'),
    product: overrides.product || readText('src/shared/productCommandRegistry.cjs'),
    catalog: overrides.catalog || readText('src/renderer/commands/command-catalog.v1.mjs'),
    capability: overrides.capability || readText('src/renderer/commands/capabilityPolicy.mjs'),
    receipt: overrides.receipt || readText('docs/OPS/STATUS/YALKEN_F3_BLACK_BOX_PRODUCT_COMMAND_EXPORT_MANUAL_CORE_V1_RECEIPT.json'),
    ledger: overrides.ledger || readText('docs/OPS/STATUS/FINAL_LAB_TO_PRODUCT_TRACEABILITY_V2_LEDGER.json'),
  };
}

function includesRegex(text, regex) {
  return regex.test(String(text));
}

function sliceBetween(text, startNeedle, endNeedle) {
  const value = String(text);
  const start = value.indexOf(startNeedle);
  if (start < 0) return '';
  const end = value.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) return value.slice(start);
  return value.slice(start, end);
}

function inspect(source) {
  const menuHit = findMenuItemByCommand(source.menu);
  const localeEntry = source.locale?.entries?.[MENU_LABEL_KEY] || null;
  const html = String(source.html);
  const editor = String(source.editor);
  const product = String(source.product);
  const catalog = String(source.catalog);
  const capability = String(source.capability);
  const main = String(source.main);
  const receipt = String(source.receipt);
  const ledger = String(source.ledger);
  const capabilityNodeBlock = sliceBetween(capability, 'node: Object.freeze({', '  web: Object.freeze({');
  const capabilityWebBlock = sliceBetween(capability, 'web: Object.freeze({', "  'mobile-wrapper': Object.freeze({");
  const capabilityMobileBlock = sliceBetween(capability, "'mobile-wrapper': Object.freeze({", '});');
  const commandPaletteActionBody = sliceBetween(editor, 'function runCommandPaletteAction(commandId) {', 'function buildSettingsAggregationSnapshot() {');

  const checks = {
    productRecordExists: product.includes(`id: '${COMMAND_ID}'`),
    productCapabilityBinding: product.includes(`capabilityId: '${CAPABILITY_ID}'`),
    productCommandAuthority: product.includes("commandAuthority: 'CommandKernel'"),
    productSurfacePalette: product.includes("surface: ['palette', 'product']"),
    catalogImportsProductRows: catalog.includes('...PRODUCT_COMMAND_CATALOG_ROWS'),
    nodeCapabilityAllows: capabilityNodeBlock.includes(`'${CAPABILITY_ID}': true`),
    webCapabilityDenies: capabilityWebBlock.includes(`'${CAPABILITY_ID}': false`),
    mobileCapabilityDenies: capabilityMobileBlock.includes(`'${CAPABILITY_ID}': false`),
    mainRuntimeFlagDefaultOff: main.includes(FEATURE_FLAG_ENV)
      && main.includes(`process.env.${FEATURE_FLAG_ENV} === '1'`),
    mainRuntimeFeatureFlagBinding: main.includes(`'${FEATURE_FLAG_ID}': productFlagEnabled`),
    menuItemExists: Boolean(menuHit),
    menuItemIdExact: menuHit?.item?.id === MENU_ITEM_ID,
    menuItemLabelKeyExact: menuHit?.item?.labelKey === MENU_LABEL_KEY,
    menuItemDocumentGated: JSON.stringify(menuHit?.item?.enabledWhen || null) === JSON.stringify({ op: 'flag', name: 'hasDocument' }),
    menuItemDesktopOfflineStages: JSON.stringify(menuHit?.item?.mode || null) === JSON.stringify(['offline'])
      && JSON.stringify(menuHit?.item?.profile || null) === JSON.stringify(['minimal', 'pro', 'guru'])
      && JSON.stringify(menuHit?.item?.stage || null) === JSON.stringify(['X1', 'X2', 'X3', 'X4']),
    localeEntryExists: typeof localeEntry?.base === 'string' && typeof localeEntry?.ru === 'string' && typeof localeEntry?.en === 'string',
    htmlOptionExists: html.includes(`data-export-surface-format="${EXPORT_FORMAT_ID}"`),
    htmlBindsCommandId: html.includes(`data-product-command-id="${COMMAND_ID}"`),
    htmlDefaultOffCopy: /default-off protected capsule/u.test(html) && /safe target/u.test(html),
    editorDefinesCommandConstant: editor.includes(`const BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID = '${COMMAND_ID}'`),
    editorDefinesFormatConstant: editor.includes(`const BLACK_BOX_EXPORT_MANUAL_CORE_FORMAT = '${EXPORT_FORMAT_ID}'`),
    editorPaletteRoutesToExportSurface: includesRegex(commandPaletteActionBody, /normalizedCommandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID[\s\S]{0,180}openExportSurfaceModal\(normalizedCommandId\)/u),
    editorFormatRunsBridge: includesRegex(editor, /normalizedFormat === BLACK_BOX_EXPORT_MANUAL_CORE_FORMAT[\s\S]{0,240}runExportSurfaceBridgeCommand\(\s*BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID/u),
    editorNoFeatureFlagAuthority: !editor.includes(FEATURE_FLAG_ENV) && !includesRegex(editor, /process\.env[\s\S]{0,120}BLACK_BOX/u),
    editorNoDirectBlackBoxIpc: !includesRegex(editor, /window\.electronAPI\.[A-Za-z0-9_$]*(?:BlackBox|blackBox|Capsule|capsule)/u),
    receiptStillNotFullProductClaim: /NOT_FULL_BLACK_BOX_PRODUCT_V1/u.test(receipt),
    ledgerKeepsFullProductDeferred: /"materialId":\s*"F3_BLACK_BOX_PRODUCT_V1"[\s\S]{0,120}"disposition":\s*"DEFERRED_WITH_BLOCKER"/u.test(ledger),
  };

  return {
    checks,
    menuHit,
    localeEntry,
    sourceDigests: {
      menu: sha256Text(JSON.stringify(source.menu)),
      locale: sha256Text(JSON.stringify(source.locale)),
      html: sha256Text(html),
      editor: sha256Text(editor),
      main: sha256Text(main),
      product: sha256Text(product),
      catalog: sha256Text(catalog),
      capability: sha256Text(capability),
    },
  };
}

function runFinite() {
  const observed = inspect(getSource());
  const finiteCases = [
    ['product record exists', observed.checks.productRecordExists],
    ['product capability binding exact', observed.checks.productCapabilityBinding],
    ['product command authority remains CommandKernel', observed.checks.productCommandAuthority],
    ['product catalog surface remains palette/product', observed.checks.productSurfacePalette],
    ['renderer catalog imports product command rows', observed.checks.catalogImportsProductRows],
    ['node capability allows Black Box export', observed.checks.nodeCapabilityAllows],
    ['web capability denies Black Box export', observed.checks.webCapabilityDenies],
    ['mobile wrapper capability denies Black Box export', observed.checks.mobileCapabilityDenies],
    ['main runtime flag is env opt-in only', observed.checks.mainRuntimeFlagDefaultOff],
    ['main runtime binds feature flag to product flags', observed.checks.mainRuntimeFeatureFlagBinding],
    ['File export menu contains Black Box command', observed.checks.menuItemExists],
    ['File export menu id is exact', observed.checks.menuItemIdExact],
    ['File export menu locale key is exact', observed.checks.menuItemLabelKeyExact],
    ['File export menu is document gated', observed.checks.menuItemDocumentGated],
    ['File export menu keeps desktop/offline stage profile', observed.checks.menuItemDesktopOfflineStages],
    ['locale entry exists', observed.checks.localeEntryExists],
    ['export modal option exists', observed.checks.htmlOptionExists],
    ['export modal binds product command id', observed.checks.htmlBindsCommandId],
    ['renderer palette routes to export surface', observed.checks.editorPaletteRoutesToExportSurface],
    ['renderer export format uses command bridge', observed.checks.editorFormatRunsBridge],
  ];
  const failures = finiteCases
    .filter(([, ok]) => ok !== true)
    .map(([name]) => name);
  return { observed, cases: finiteCases, failures };
}

function runHostile(baseSource) {
  const hostileCases = [
    {
      id: 'menu_metadata_only_no_html',
      mutate(source) {
        return { ...source, html: source.html.replaceAll(`data-export-surface-format="${EXPORT_FORMAT_ID}"`, 'data-export-surface-format="missing-black-box"') };
      },
      expectReject: (view) => !view.checks.htmlOptionExists,
    },
    {
      id: 'html_option_wrong_command_id',
      mutate(source) {
        return { ...source, html: source.html.replaceAll(`data-product-command-id="${COMMAND_ID}"`, 'data-product-command-id="cmd.project.export.docxMin"') };
      },
      expectReject: (view) => !view.checks.htmlBindsCommandId,
    },
    {
      id: 'editor_format_no_bridge_dispatch',
      mutate(source) {
        return { ...source, editor: source.editor.replace(/runExportSurfaceBridgeCommand\(\s*BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID/u, 'runExportSurfaceBridgeCommand(COMMAND_IDS.PROJECT_EXPORT_PDF_V1') };
      },
      expectReject: (view) => !view.checks.editorFormatRunsBridge,
    },
    {
      id: 'renderer_reads_feature_flag_env',
      mutate(source) {
        return { ...source, editor: `${source.editor}\nconst leaked = process.env.${FEATURE_FLAG_ENV};\n` };
      },
      expectReject: (view) => !view.checks.editorNoFeatureFlagAuthority,
    },
    {
      id: 'renderer_direct_blackbox_ipc',
      mutate(source) {
        return { ...source, editor: `${source.editor}\nwindow.electronAPI.exportBlackBoxCapsule({});\n` };
      },
      expectReject: (view) => !view.checks.editorNoDirectBlackBoxIpc,
    },
    {
      id: 'menu_wrong_command_id',
      mutate(source) {
        const menu = cloneJson(source.menu);
        const hit = findMenuItemByCommand(menu);
        if (hit) hit.item.command = 'cmd.project.exportFullArchiveV1';
        return { ...source, menu };
      },
      expectReject: (view) => !view.checks.menuItemExists,
    },
    {
      id: 'menu_no_document_gate',
      mutate(source) {
        const menu = cloneJson(source.menu);
        const hit = findMenuItemByCommand(menu);
        if (hit) hit.item.enabledWhen = { op: 'all', args: [] };
        return { ...source, menu };
      },
      expectReject: (view) => !view.checks.menuItemDocumentGated,
    },
    {
      id: 'menu_label_key_missing_locale',
      mutate(source) {
        const locale = cloneJson(source.locale);
        delete locale.entries[MENU_LABEL_KEY];
        return { ...source, locale };
      },
      expectReject: (view) => !view.checks.localeEntryExists,
    },
    {
      id: 'web_capability_laundered_to_true',
      mutate(source) {
        return { ...source, capability: source.capability.replace(/(web:\s*Object\.freeze\([\s\S]*?'cap\.blackBox\.manualCoreCapsule\.export': )false/u, '$1true') };
      },
      expectReject: (view) => !view.checks.webCapabilityDenies,
    },
    {
      id: 'mobile_capability_laundered_to_true',
      mutate(source) {
        return { ...source, capability: source.capability.replace(/('mobile-wrapper':\s*Object\.freeze\([\s\S]*?'cap\.blackBox\.manualCoreCapsule\.export': )false/u, '$1true') };
      },
      expectReject: (view) => !view.checks.mobileCapabilityDenies,
    },
    {
      id: 'main_feature_flag_not_default_off',
      mutate(source) {
        return { ...source, main: source.main.replace(`process.env.${FEATURE_FLAG_ENV} === '1'`, 'true') };
      },
      expectReject: (view) => !view.checks.mainRuntimeFlagDefaultOff,
    },
    {
      id: 'default_off_copy_removed',
      mutate(source) {
        return { ...source, html: source.html.replace('default-off protected capsule', 'ready capsule') };
      },
      expectReject: (view) => !view.checks.htmlDefaultOffCopy,
    },
    {
      id: 'palette_route_removed',
      mutate(source) {
        return {
          ...source,
          editor: source.editor.replace(
            "if (normalizedCommandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID) {\n    return openExportSurfaceModal(normalizedCommandId);\n  }",
            "if (normalizedCommandId === BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID) {\n    return dispatchUiCommand(normalizedCommandId);\n  }",
          ),
        };
      },
      expectReject: (view) => !view.checks.editorPaletteRoutesToExportSurface,
    },
    {
      id: 'command_constant_wrong_id',
      mutate(source) {
        return { ...source, editor: source.editor.replace(COMMAND_ID, 'cmd.project.exportFullArchiveV1') };
      },
      expectReject: (view) => !view.checks.editorDefinesCommandConstant,
    },
    {
      id: 'full_product_v1_claim_laundered',
      mutate(source) {
        return { ...source, ledger: source.ledger.replace('"disposition": "DEFERRED_WITH_BLOCKER"', '"disposition": "ADOPTED_PRODUCT"') };
      },
      expectReject: (view) => !view.checks.ledgerKeepsFullProductDeferred,
    },
    {
      id: 'receipt_full_product_boundary_removed',
      mutate(source) {
        return { ...source, receipt: source.receipt.replaceAll('NOT_FULL_BLACK_BOX_PRODUCT_V1', 'READY_FULL_BLACK_BOX_PRODUCT_V1') };
      },
      expectReject: (view) => !view.checks.receiptStillNotFullProductClaim,
    },
  ];

  const failures = [];
  for (const spec of hostileCases) {
    const mutated = spec.mutate(baseSource);
    const view = inspect(mutated);
    if (spec.expectReject(view) !== true) failures.push(spec.id);
  }
  return { total: hostileCases.length, failures };
}

function runMutations(baseSource) {
  const mutationSpecs = [
    ['drop menu item id exactness', (source) => {
      const menu = cloneJson(source.menu);
      const hit = findMenuItemByCommand(menu);
      if (hit) hit.item.id = 'file-export-black-box';
      return { ...source, menu };
    }, (view) => view.checks.menuItemIdExact],
    ['drop menu label key exactness', (source) => {
      const menu = cloneJson(source.menu);
      const hit = findMenuItemByCommand(menu);
      if (hit) hit.item.labelKey = 'menu.file.exportFullArchive';
      return { ...source, menu };
    }, (view) => view.checks.menuItemLabelKeyExact],
    ['drop stage profile', (source) => {
      const menu = cloneJson(source.menu);
      const hit = findMenuItemByCommand(menu);
      if (hit) hit.item.stage = ['X4'];
      return { ...source, menu };
    }, (view) => view.checks.menuItemDesktopOfflineStages],
    ['drop product command surface', (source) => ({ ...source, product: source.product.replace("surface: ['palette', 'product']", "surface: ['internal']") }), (view) => view.checks.productSurfacePalette],
    ['drop product capability binding', (source) => ({ ...source, product: source.product.replace(CAPABILITY_ID, 'cap.project.export.fullArchiveV1') }), (view) => view.checks.productCapabilityBinding],
    ['drop command authority', (source) => ({ ...source, product: source.product.replace("commandAuthority: 'CommandKernel'", "commandAuthority: 'Renderer'") }), (view) => view.checks.productCommandAuthority],
    ['drop catalog product import', (source) => ({ ...source, catalog: source.catalog.replace('...PRODUCT_COMMAND_CATALOG_ROWS', '') }), (view) => view.checks.catalogImportsProductRows],
    ['drop html command binding', (source) => ({ ...source, html: source.html.replace(`data-product-command-id="${COMMAND_ID}"`, '') }), (view) => view.checks.htmlBindsCommandId],
    ['drop editor command constant', (source) => ({ ...source, editor: source.editor.replace(`const BLACK_BOX_EXPORT_MANUAL_CORE_COMMAND_ID = '${COMMAND_ID}';`, '') }), (view) => view.checks.editorDefinesCommandConstant],
    ['drop editor format constant', (source) => ({ ...source, editor: source.editor.replace(`const BLACK_BOX_EXPORT_MANUAL_CORE_FORMAT = '${EXPORT_FORMAT_ID}';`, '') }), (view) => view.checks.editorDefinesFormatConstant],
    ['drop main product flag binding', (source) => ({ ...source, main: source.main.replace(`'${FEATURE_FLAG_ID}': productFlagEnabled`, `'${FEATURE_FLAG_ID}': true`) }), (view) => view.checks.mainRuntimeFeatureFlagBinding],
    ['remove deferred full product gate', (source) => ({ ...source, ledger: source.ledger.replace('"materialId": "F3_BLACK_BOX_PRODUCT_V1"', '"materialId": "F3_BLACK_BOX_PRODUCT_V1_MUTATED"') }), (view) => view.checks.ledgerKeepsFullProductDeferred],
  ];
  const survivors = [];
  for (const [id, mutate, survivorPredicate] of mutationSpecs) {
    const view = inspect(mutate(baseSource));
    if (survivorPredicate(view) === true) survivors.push(id);
  }
  return { total: mutationSpecs.length, survivors };
}

async function main() {
  await import(pathToFileURL(path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'command-catalog.v1.mjs')).href);
  const finite = runFinite();
  const baseSource = getSource();
  const hostile = runHostile(baseSource);
  const mutations = runMutations(baseSource);
  const report = {
    schemaVersion: 'yalken.blackBoxProductUiDefaultFlagPath.modelReport.v1',
    taskId: TASK_ID,
    finite: {
      total: finite.cases.length,
      failed: finite.failures.length,
      failures: finite.failures,
    },
    hostile: {
      total: hostile.total,
      failed: hostile.failures.length,
      failures: hostile.failures,
    },
    mutations: {
      total: mutations.total,
      survivors: mutations.survivors.length,
      survivorIds: mutations.survivors,
    },
    sourceDigests: finite.observed.sourceDigests,
    limits: {
      userDocumentsTouched: false,
      productRuntimeChanged: false,
      dependenciesAdded: false,
      lazywebInstalled: false,
    },
  };
  process.stdout.write(`BLACK_BOX_PRODUCT_UI_DEFAULT_FLAG_PATH_MODEL:${JSON.stringify(report)}\n`);
  if (report.finite.failed > 0 || report.hostile.failed > 0 || report.mutations.survivors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
