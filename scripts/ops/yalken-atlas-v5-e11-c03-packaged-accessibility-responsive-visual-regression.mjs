#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { runAtlasRailResponsiveAudit } from './yalken-atlas-v5-er-c06-atlas-rail-responsive-audit.mjs';

const REPORT_SCHEMA = 'yalken.atlas.v5.e11.c03.packagedAccessibilityResponsiveVisualRegression.v1';
const DEFAULT_OUT_DIR = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION');
const C01_RECEIPT_PATH = path.resolve('docs/OPS/STATUS/YALKEN_ATLAS_V5_E11_C01_MACOS_PACKAGE_ARTIFACT_SECURITY_RECEIPT.json');
const ER_C06_BASELINE_PATH = path.resolve('docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_ER_C06_ATLAS_RAIL_RESPONSIVE_ACCESSIBILITY/atlas-er-c06-responsive-audit.json');
const ER_C06_BASELINE_DIR = path.dirname(ER_C06_BASELINE_PATH);
const APP_ASAR = path.resolve('dist/mac-arm64/Yalken.app/Contents/Resources/app.asar');
const AUDIT_EVIDENCE_FILES = Object.freeze([
  'atlas-er-c06-responsive-audit.json',
  'atlas-er-c06-desktop.png',
  'atlas-er-c06-laptop.png',
  'atlas-er-c06-compact.png',
  'atlas-er-c06-tablet.png',
  'atlas-er-c06-handset-advisory.png',
]);

const VISUAL_DELTA_LIMITS = Object.freeze({
  meanAbsMax: 1,
  changedRatioMax: 0.02,
});

function parseArgs(argv) {
  const out = { outDir: DEFAULT_OUT_DIR, skipRuntime: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      out.outDir = path.resolve(String(argv[i + 1] || '').trim());
      i += 1;
    } else if (arg === '--skip-runtime') {
      out.skipRuntime = true;
    }
  }
  return out;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fsSync.readFileSync(filePath));
}

function fileProof(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) {
    return { path: filePath || '', exists: false, bytes: 0, sha256: '' };
  }
  const stat = fsSync.statSync(filePath);
  return {
    path: filePath,
    exists: stat.isFile(),
    bytes: stat.isFile() ? stat.size : 0,
    sha256: stat.isFile() ? sha256File(filePath) : '',
  };
}

function readJson(filePath) {
  return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
}

function decodePng(filePath) {
  const buffer = fsSync.readFileSync(filePath);
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error(`NOT_PNG:${filePath}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const chunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || bytesPerPixel === 0) throw new Error(`UNSUPPORTED_PNG:${bitDepth}:${colorType}:${filePath}`);

  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const source = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const target = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? target[x - bytesPerPixel] : 0;
      const above = previous ? previous[x] : 0;
      const upperLeft = previous && x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let value = source[x];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + above) & 255;
      else if (filter === 3) value = (value + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) {
        const predictor = left + above - upperLeft;
        const leftDistance = Math.abs(predictor - left);
        const aboveDistance = Math.abs(predictor - above);
        const upperLeftDistance = Math.abs(predictor - upperLeft);
        value = (value + (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
          ? left
          : aboveDistance <= upperLeftDistance ? above : upperLeft)) & 255;
      } else if (filter !== 0) {
        throw new Error(`UNSUPPORTED_PNG_FILTER:${filter}:${filePath}`);
      }
      target[x] = value;
    }
  }

  return { width, height, bytesPerPixel, pixels };
}

function comparePng(currentPath, baselinePath) {
  const current = decodePng(currentPath);
  const baseline = decodePng(baselinePath);
  const sameDimensions = current.width === baseline.width && current.height === baseline.height;
  if (!sameDimensions) {
    return {
      sameDimensions,
      currentDimensions: [current.width, current.height],
      baselineDimensions: [baseline.width, baseline.height],
      meanAbs: Number.POSITIVE_INFINITY,
      changedRatio: 1,
      withinLimits: false,
    };
  }

  let sumAbsoluteDelta = 0;
  let changedChannels = 0;
  let nonBlankChannels = 0;
  const sampleCount = current.width * current.height * 3;
  for (let pixel = 0; pixel < current.width * current.height; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const currentValue = current.pixels[pixel * current.bytesPerPixel + channel];
      const baselineValue = baseline.pixels[pixel * baseline.bytesPerPixel + channel];
      const delta = Math.abs(currentValue - baselineValue);
      sumAbsoluteDelta += delta;
      if (delta > 0) changedChannels += 1;
      if (currentValue !== 255) nonBlankChannels += 1;
    }
  }

  const meanAbs = Number((sumAbsoluteDelta / sampleCount).toFixed(4));
  const changedRatio = Number((changedChannels / sampleCount).toFixed(4));
  const nonBlankRatio = Number((nonBlankChannels / sampleCount).toFixed(4));
  return {
    sameDimensions,
    currentDimensions: [current.width, current.height],
    baselineDimensions: [baseline.width, baseline.height],
    meanAbs,
    changedRatio,
    nonBlankRatio,
    withinLimits: meanAbs <= VISUAL_DELTA_LIMITS.meanAbsMax
      && changedRatio <= VISUAL_DELTA_LIMITS.changedRatioMax,
  };
}

function buildVisualComparisons(audit, outputDir) {
  const baseline = fsSync.existsSync(ER_C06_BASELINE_PATH) ? readJson(ER_C06_BASELINE_PATH) : null;
  const baselineRows = new Map((baseline?.results || []).map((row) => [row.id, row]));
  return (audit?.result?.results || []).map((row) => {
    const baselineRow = baselineRows.get(row.id) || {};
    const currentPath = path.join(outputDir, row.screenshotName || '');
    const baselinePath = path.join(ER_C06_BASELINE_DIR, baselineRow.screenshotName || '');
    const currentProof = fileProof(currentPath);
    const baselineProof = fileProof(baselinePath);
    const delta = currentProof.exists && baselineProof.exists
      ? comparePng(currentPath, baselinePath)
      : { sameDimensions: false, meanAbs: Number.POSITIVE_INFINITY, changedRatio: 1, withinLimits: false };
    return {
      id: row.id,
      current: currentProof,
      baseline: baselineProof,
      exactHashMatch: currentProof.sha256 !== '' && currentProof.sha256 === baselineProof.sha256,
      exactHashRequired: false,
      delta,
      pass: currentProof.exists === true
        && currentProof.bytes > 1000
        && baselineProof.exists === true
        && delta.sameDimensions === true
        && delta.withinLimits === true
        && delta.nonBlankRatio > 0.01,
    };
  });
}

export function evaluatePackagedAccessibilityResponsiveVisualRegression(input = {}) {
  const c01Receipt = input.c01Receipt || (fsSync.existsSync(C01_RECEIPT_PATH) ? readJson(C01_RECEIPT_PATH) : null);
  const appAsarProof = input.appAsarProof || fileProof(APP_ASAR);
  const audit = input.audit || null;
  const visualComparisons = input.visualComparisons || [];
  const packageBound = Boolean(
    c01Receipt
    && c01Receipt.pass === true
    && c01Receipt.status === 'PASS_UNSIGNED_LOCAL_ARTIFACT'
    && appAsarProof.exists === true
    && appAsarProof.sha256 === c01Receipt.physicalArtifactEvidence?.artifactSet?.appAsar?.sha256,
  );
  const assertions = audit?.result?.assertions || {};
  const auditAssertionsPass = [
    'noNetwork',
    'supportedWidthMatrix',
    'supportedOneActiveShell',
    'externalOpenerReachable',
    'openerNoToolbarCollision',
    'noHorizontalOverflow',
    'keyboardNavigation',
    'overlayFocusTrapAndEscape',
    'visibleAtlasScreenshots',
    'scrollBudget',
    'contrastAA',
    'supportedWidthsNotClipped',
    'handsetHonestAdvisory',
  ].every((key) => assertions[key] === true);
  const viewportIds = visualComparisons.map((row) => row.id).sort();
  const allViewportsPresent = ['compact', 'desktop', 'handset-advisory', 'laptop', 'tablet'].every((id) => viewportIds.includes(id));
  const visualRegressionPass = allViewportsPresent && visualComparisons.every((row) => row.pass === true);
  const pass = packageBound
    && audit?.ok === true
    && audit?.timedOut === false
    && auditAssertionsPass
    && visualRegressionPass;

  return {
    schemaVersion: REPORT_SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    contourId: 'E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION',
    platformId: 'macos-packaged-electron',
    status: pass ? 'PASS_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION' : 'NOT_READY',
    pass,
    packageBinding: {
      packageBound,
      c01ReceiptStatus: c01Receipt?.status || '',
      appAsarSha256: appAsarProof.sha256,
      c01AppAsarSha256: c01Receipt?.physicalArtifactEvidence?.artifactSet?.appAsar?.sha256 || '',
      ciParityIsNotPackageProof: true,
    },
    audit: {
      ok: audit?.ok === true,
      runtimeKind: 'er-c06-electron-responsive-audit-harness',
      timedOut: audit?.timedOut === true,
      exitCode: audit?.exitCode ?? null,
      proofPath: audit?.proofPath || '',
      proofSha256: audit?.proofSha256 || '',
      assertions,
      networkRequestCount: audit?.result?.networkRequestCount ?? null,
      viewports: (audit?.result?.results || []).map((row) => ({
        id: row.id,
        width: row.width,
        height: row.height,
        activeShellCount: row.activeShellCount,
        focusVisible: row.focusVisible,
        keyboardMovedFocus: row.keyboardMovedFocus,
        navContrast: row.navContrast,
        atlasPanelScrollHeight: row.atlasPanelScrollHeight,
        rightSidebarHidden: row.rightSidebarHidden,
        screenshotName: row.screenshotName,
        screenshotBytes: row.screenshotBytes,
        screenshotSha256: row.screenshotSha256,
      })),
    },
    visualRegression: {
      baselineArtifact: ER_C06_BASELINE_PATH,
      limits: VISUAL_DELTA_LIMITS,
      exactPngHashRequired: false,
      comparisons: visualComparisons,
      pass: visualRegressionPass,
    },
    negativeAssertions: {
      ciParityCanSubstitutePackagedVisualProof: false,
      exactHashMismatchIsAutomaticFailure: false,
      missingPhysicalScreenshotCanPass: false,
      directRendererStorageMutation: false,
      runtimeNetworkActivated: false,
      inactivePlatformCertificationClaim: false,
      finalProgramDoDClaim: false,
    },
  };
}

export async function runPackagedAccessibilityResponsiveVisualRegression(options = {}) {
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  let audit = null;
  let tempAuditDir = '';
  if (!options.skipRuntime) {
    tempAuditDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yalken-e11-c03-responsive-audit-'));
    audit = await runAtlasRailResponsiveAudit({ outputDir: tempAuditDir });
    if (audit.result && typeof audit.result === 'object') {
      audit.result.outputDir = outDir;
    }
    for (const fileName of AUDIT_EVIDENCE_FILES) {
      await fs.copyFile(path.join(tempAuditDir, fileName), path.join(outDir, fileName));
    }
    const copiedAuditPath = path.join(outDir, 'atlas-er-c06-responsive-audit.json');
    await fs.writeFile(copiedAuditPath, `${JSON.stringify(audit.result, null, 2)}\n`, 'utf8');
    audit = {
      ...audit,
      outputDir: outDir,
      proofPath: copiedAuditPath,
      proofSha256: sha256File(copiedAuditPath),
    };
  }
  const visualComparisons = audit ? buildVisualComparisons(audit, outDir) : [];
  const report = evaluatePackagedAccessibilityResponsiveVisualRegression({ audit, visualComparisons });
  const reportPath = path.join(outDir, 'packaged-accessibility-responsive-visual-regression-report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (tempAuditDir) {
    await fs.rm(tempAuditDir, { recursive: true, force: true }).catch(() => {});
  }
  return {
    ...report,
    reportPath,
    reportSha256: sha256File(reportPath),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runPackagedAccessibilityResponsiveVisualRegression(args);
  console.log(`YALKEN_ATLAS_E11_C03_PACKAGED_ACCESSIBILITY_RESPONSIVE_VISUAL_REGRESSION_RESULT:${JSON.stringify(result)}`);
  process.exit(result.pass ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
