'use strict';

const zlib = require('node:zlib');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes;
}

function buildZip(entries, options = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const source of entries) {
    const name = Buffer.from(source.name, 'utf8');
    const data = Buffer.isBuffer(source.data) ? source.data : Buffer.from(source.data ?? '', 'utf8');
    const method = source.method ?? 0;
    const compressed = source.compressed ?? (method === 8 ? zlib.deflateRawSync(data) : data);
    const crc = source.crc32 ?? crc32(data);
    const flags = source.flags ?? 0x0800;
    const localName = Buffer.from(source.localName ?? source.name, 'utf8');
    const localExtra = source.localExtra ?? Buffer.alloc(0);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(source.localFlags ?? flags), u16(source.localMethod ?? method), u16(0), u16(0),
      u32(source.localCrc32 ?? crc), u32(source.localCompressedSize ?? compressed.length), u32(source.localInflatedSize ?? data.length),
      u16(localName.length), u16(localExtra.length), localName, localExtra, compressed,
    ]);
    const entryOffset = source.localOffset ?? offset;
    locals.push(local);
    const centralExtra = source.centralExtra ?? Buffer.alloc(0);
    const comment = source.comment ?? Buffer.alloc(0);
    central.push(Buffer.concat([
      u32(0x02014b50), u16(0x0314), u16(20), u16(flags), u16(method), u16(0), u16(0),
      u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(centralExtra.length), u16(comment.length),
      u16(source.diskStart ?? 0), u16(0), u32(source.externalAttributes ?? 0), u32(entryOffset), name, centralExtra, comment,
    ]));
    offset += local.length;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(central);
  const comment = Buffer.from(options.eocdComment ?? '', 'utf8');
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(options.disk ?? 0), u16(options.centralDisk ?? 0), u16(options.diskEntries ?? entries.length),
    u16(options.entryCount ?? entries.length), u32(options.centralSize ?? centralBytes.length), u32(options.centralOffset ?? localBytes.length),
    u16(comment.length), comment,
  ]);
  return Buffer.concat([localBytes, centralBytes, eocd, options.trailing ?? Buffer.alloc(0)]);
}

function minimalOoxml(overrides = {}) {
  const contentTypes = overrides.contentTypes ?? '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>';
  const rootRels = overrides.rootRels ?? '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const document = overrides.document ?? '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Hello, мир — Καλημέρα.</w:t></w:r></w:p></w:body></w:document>';
  const extra = overrides.extra ?? [];
  return buildZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: document, method: 8 },
    ...extra,
  ]);
}

function mutateU16(bytes, offset, value) {
  const output = Buffer.from(bytes);
  output.writeUInt16LE(value, offset);
  return output;
}

function mutateU32(bytes, offset, value) {
  const output = Buffer.from(bytes);
  output.writeUInt32LE(value >>> 0, offset);
  return output;
}

function locateSignatures(bytes) {
  const result = { local: [], central: [], eocd: [] };
  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    const signature = bytes.readUInt32LE(offset);
    if (signature === 0x04034b50) result.local.push(offset);
    if (signature === 0x02014b50) result.central.push(offset);
    if (signature === 0x06054b50) result.eocd.push(offset);
  }
  return result;
}

module.exports = { buildZip, crc32, locateSignatures, minimalOoxml, mutateU16, mutateU32 };
