#!/usr/bin/env node
// R2.4 E0 — canonical JSON + bounded IO + atomic durable write law.
// Canonicalization rule is identical to the sealed R2.4 package verifier:
// arrays keep order, object keys are sorted, primitives via JSON.stringify.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class R24Error extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

export const canonicalize = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const canonicalDigest = (value) => sha256hex(canonicalize(value));

export const HEX40_RE = /^[0-9a-f]{40}$/;
export const HEX64_RE = /^[0-9a-f]{64}$/;

export function readJsonBounded(filePath, { maxBytes = 4 * 1024 * 1024 } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new R24Error('E_R24_READ_MISSING', filePath);
  }
  if (!stat.isFile()) throw new R24Error('E_R24_READ_NOT_A_FILE', filePath);
  if (stat.size > maxBytes) throw new R24Error('E_R24_READ_TOO_LARGE', `${filePath} ${stat.size}>${maxBytes}`);
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new R24Error('E_R24_JSON_PARSE', `${filePath}: ${error.message}`);
  }
}

const fsyncDirectory = (dir) => {
  const handle = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
};

// Durable write protocol: intent journal -> temp write -> fsync(temp) ->
// atomic rename -> fsync(parent) -> readback digest proof -> intent cleanup.
// Every crash point classifies into exactly one recovery state.
export function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const intentPath = path.join(dir, `.${base}.r24-intent`);
  const tempPath = path.join(dir, `.${base}.r24-tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const payloadDigest = sha256hex(payload);

  fs.writeFileSync(intentPath, `${JSON.stringify({ target: base, sha256: payloadDigest })}\n`, 'utf8');
  fsyncDirectory(dir);

  let committed = false;
  try {
    const handle = fs.openSync(tempPath, 'w');
    try {
      fs.writeFileSync(handle, payload, 'utf8');
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(tempPath, filePath);
    committed = true;
    fsyncDirectory(dir);
    const readback = sha256hex(fs.readFileSync(filePath));
    if (readback !== payloadDigest) throw new R24Error('E_R24_READBACK_MISMATCH', filePath);
    return { path: filePath, sha256: payloadDigest, bytes: Buffer.byteLength(payload) };
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch { /* cleanup best effort; classification handles leftovers */ }
    if (committed) {
      try {
        fs.unlinkSync(intentPath);
        fsyncDirectory(dir);
      } catch { /* intent cleanup failure leaves ROLLBACK_REQUIRED marker, fail closed */ }
    }
  }
}

// Total crash classification. Given a target file and its intent journal,
// the post-crash state is exactly one of four classes; torn/false-ACK states
// are unreachable by construction of writeJsonAtomic.
export function classifyWriteArtifacts(filePath, { expectedNewDigest = null } = {}) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const intentPath = path.join(dir, `.${base}.r24-intent`);
  const mainExists = fs.existsSync(filePath);
  const intentExists = fs.existsSync(intentPath);
  const leftovers = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.startsWith(`.${base}.r24-tmp-`))
    : [];

  if (!intentExists) {
    if (mainExists) {
      if (typeof expectedNewDigest === 'string' && HEX64_RE.test(expectedNewDigest)) {
        const currentDigest = sha256hex(fs.readFileSync(filePath));
        return {
          classification: currentDigest === expectedNewDigest ? 'NEW_COMMITTED' : 'OLD_COMMITTED',
          intent: null,
          leftovers,
        };
      }
      return { classification: 'OLD_OR_NEW_COMMITTED', intent: null, leftovers };
    }
    return { classification: 'ROLLBACK_REQUIRED', intent: null, leftovers, reason: 'TARGET_MISSING_WITHOUT_INTENT' };
  }

  let intent = null;
  try {
    intent = JSON.parse(fs.readFileSync(intentPath, 'utf8'));
  } catch {
    return { classification: 'ROLLBACK_REQUIRED', intent: null, leftovers, reason: 'INTENT_UNREADABLE' };
  }

  if (!mainExists) {
    return { classification: leftovers.length > 0 ? 'RESUMABLE_PREPARED' : 'ROLLBACK_REQUIRED', intent, leftovers };
  }
  const currentDigest = sha256hex(fs.readFileSync(filePath));
  if (intent && typeof intent.sha256 === 'string' && currentDigest === intent.sha256) {
    return { classification: 'NEW_COMMITTED', intent, leftovers };
  }
  return { classification: leftovers.length > 0 ? 'RESUMABLE_PREPARED' : 'ROLLBACK_REQUIRED', intent, leftovers };
}
