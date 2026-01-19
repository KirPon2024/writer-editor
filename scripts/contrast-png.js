const fs = require('fs');
const zlib = require('zlib');

const [,, inputPath, outputPath, contrastArg] = process.argv;
const contrast = Number.isFinite(Number(contrastArg)) ? Number(contrastArg) : 1.35;

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/contrast-png.js <input> <output> [contrast]');
  process.exit(1);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readUInt32BE(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  if (!buffer.slice(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file');
  }

  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  const idatParts = [];

  while (offset < buffer.length) {
    const length = readUInt32BE(buffer, offset);
    offset += 4;
    const type = buffer.slice(offset, offset + 4).toString('ascii');
    offset += 4;
    const data = buffer.slice(offset, offset + length);
    offset += length;
    offset += 4; // crc

    if (type === 'IHDR') {
      width = readUInt32BE(data, 0);
      height = readUInt32BE(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (width === null || height === null) {
    throw new Error('Invalid PNG header');
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0) {
    throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`);
  }

  const compressed = Buffer.concat(idatParts);
  const inflated = zlib.inflateSync(compressed);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const pixels = Buffer.alloc(width * height * bytesPerPixel);

  let inOffset = 0;
  let outOffset = 0;
  let prevRow = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[inOffset];
    inOffset += 1;
    const row = Buffer.from(inflated.slice(inOffset, inOffset + rowBytes));
    inOffset += rowBytes;

    if (filterType === 1) {
      for (let i = 0; i < rowBytes; i += 1) {
        const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        row[i] = (row[i] + left) & 0xff;
      }
    } else if (filterType === 2) {
      for (let i = 0; i < rowBytes; i += 1) {
        row[i] = (row[i] + prevRow[i]) & 0xff;
      }
    } else if (filterType === 3) {
      for (let i = 0; i < rowBytes; i += 1) {
        const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        const up = prevRow[i];
        row[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
      }
    } else if (filterType === 4) {
      for (let i = 0; i < rowBytes; i += 1) {
        const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        const up = prevRow[i];
        const upLeft = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0;
        row[i] = (row[i] + paethPredictor(left, up, upLeft)) & 0xff;
      }
    } else if (filterType !== 0) {
      throw new Error(`Unsupported PNG filter: ${filterType}`);
    }

    row.copy(pixels, outOffset);
    outOffset += rowBytes;
    prevRow = row;
  }

  if (bytesPerPixel === 4) {
    return { width, height, pixels };
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, out = 0; i < pixels.length; i += 3, out += 4) {
    rgba[out] = pixels[i];
    rgba[out + 1] = pixels[i + 1];
    rgba[out + 2] = pixels[i + 2];
    rgba[out + 3] = 255;
  }

  return { width, height, pixels: rgba };
}

function applyContrast(pixels, contrastValue) {
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const v = pixels[i + c] / 255;
      const adjusted = Math.round(Math.min(1, Math.max(0, ((v - 0.5) * contrastValue + 0.5))) * 255);
      pixels[i + c] = adjusted;
    }
  }
}

function encodePng(width, height, pixels) {
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const raw = Buffer.alloc(height * (rowBytes + 1));

  let inOffset = 0;
  let outOffset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[outOffset] = 0;
    outOffset += 1;
    pixels.copy(raw, outOffset, inOffset, inOffset + rowBytes);
    inOffset += rowBytes;
    outOffset += rowBytes;
  }

  const compressed = zlib.deflateSync(raw);

  const chunks = [];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  function pushChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crcVal, 0);
    chunks.push(lengthBuf, typeBuf, data, crcBuf);
  }

  pushChunk('IHDR', ihdr);
  pushChunk('IDAT', compressed);
  pushChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ...chunks]);
}

try {
  const input = fs.readFileSync(inputPath);
  const { width, height, pixels } = decodePng(input);
  applyContrast(pixels, contrast);
  const output = encodePng(width, height, pixels);
  fs.writeFileSync(outputPath, output);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
