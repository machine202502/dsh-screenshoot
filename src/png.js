import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Minimal PNG reader/writer, just enough to crop a screenshot without pulling
 * an image library into the plugin.
 *
 * Supports 8-bit RGB and RGBA (what Windows GDI+, macOS screencapture and
 * ImageMagick produce); palette and 16-bit images are rejected with a clear
 * message instead of silently corrupting the picture.
 */
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

/** Decode to RGBA8 plus size. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  let bitDepth = 8;
  const idat = [];

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
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG (bit depth ${bitDepth}, colour type ${colorType}); crop needs 8-bit RGB/RGBA`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const source = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const line = Buffer.from(source);

    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) line[x] = (line[x] + left) & 0xff;
      else if (filter === 2) line[x] = (line[x] + up) & 0xff;
      else if (filter === 3) line[x] = (line[x] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        line[x] = (line[x] + predictor) & 0xff;
      }
    }

    for (let x = 0; x < width; x++) {
      const sourceIndex = x * channels;
      const targetIndex = (y * width + x) * 4;
      pixels[targetIndex] = line[sourceIndex];
      pixels[targetIndex + 1] = line[sourceIndex + 1];
      pixels[targetIndex + 2] = line[sourceIndex + 2];
      pixels[targetIndex + 3] = channels === 4 ? line[sourceIndex + 3] : 255;
    }
    previous = line;
  }

  return { width, height, pixels };
}

/** Encode RGBA8 to PNG. */
export function encodePng({ width, height, pixels }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Crop a PNG buffer to a rectangle; coordinates are inside the image. */
export function cropPng(buffer, { x, y, width, height }) {
  const image = decodePng(buffer);
  const left = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const top = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const right = Math.max(left + 1, Math.min(image.width, left + Math.round(width)));
  const bottom = Math.max(top + 1, Math.min(image.height, top + Math.round(height)));
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const pixels = Buffer.alloc(cropWidth * cropHeight * 4);
  for (let row = 0; row < cropHeight; row++) {
    const from = ((top + row) * image.width + left) * 4;
    image.pixels.copy(pixels, row * cropWidth * 4, from, from + cropWidth * 4);
  }
  return {
    buffer: encodePng({ width: cropWidth, height: cropHeight, pixels }),
    width: cropWidth,
    height: cropHeight,
    origin: { x: left, y: top },
  };
}
