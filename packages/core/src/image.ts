export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_DIMENSION = 4096;
export const MAX_LOGO_PIXELS = 4_000_000;
export type LogoMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

const readU32BE = (bytes: Uint8Array, at: number) => (((bytes[at]! * 0x1000000) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!) >>> 0);
const readU32LE = (bytes: Uint8Array, at: number) => ((bytes[at]! + (bytes[at + 1]! << 8) + (bytes[at + 2]! << 16) + (bytes[at + 3]! * 0x1000000)) >>> 0);
const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_LOGO_DIMENSION || height > MAX_LOGO_DIMENSION || width * height > MAX_LOGO_PIXELS) throw new Error('Logo dimensions are invalid or too large');
  return { width, height };
}

function inspectPng(bytes: Uint8Array) {
  const signature = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
  if (bytes.length < 45 || !signature.every((value, index) => bytes[index] === value)) return null;
  let at = 8, size: { width: number; height: number } | null = null, sawData = false, dataEnded = false, bitDepth = 0, colorType = -1, sawPalette = false;
  const imageData: Uint8Array[] = [];
  while (at + 12 <= bytes.length) {
    const length = readU32BE(bytes, at);
    if (length > bytes.length - at - 12) throw new Error('Logo is not a valid PNG image');
    const type = ascii(bytes, at + 4, 4);
    const end = at + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || (bytes[at + 6]! & 0x20) !== 0) throw new Error('Logo is not a valid PNG image');
    if ((bytes[at + 4]! & 0x20) === 0 && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type)) throw new Error('Logo is not a valid PNG image');
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== readU32BE(bytes, at + 8 + length)) throw new Error('Logo is not a valid PNG image');
    if (type === 'IHDR' && size) throw new Error('Logo is not a valid PNG image');
    if (!size) {
      if (type !== 'IHDR' || length !== 13) throw new Error('Logo is not a valid PNG image');
      size = dimensions(readU32BE(bytes, at + 8), readU32BE(bytes, at + 12));
      bitDepth = bytes[at + 16]!; colorType = bytes[at + 17]!;
      const validDepths: Record<number, number[]> = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
      if (!validDepths[colorType]?.includes(bitDepth) || bytes[at + 18] !== 0 || bytes[at + 19] !== 0 || bytes[at + 20] !== 0) throw new Error('Logo is not a valid PNG image');
    }
    if (type === 'PLTE') {
      const entries = length / 3;
      if (sawPalette || sawData || colorType === 0 || colorType === 4 || length === 0 || length % 3 !== 0 || length > 768 || (colorType === 3 && entries > 2 ** bitDepth)) throw new Error('Logo is not a valid PNG image');
      sawPalette = true;
    }
    if (type === 'IDAT') { if (dataEnded) throw new Error('Logo is not a valid PNG image'); sawData = true; imageData.push(bytes.slice(at + 8, at + 8 + length)); }
    else if (sawData && type !== 'IEND') dataEnded = true;
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length || !sawData || !size || (colorType === 3 && !sawPalette)) throw new Error('Logo is not a valid PNG image');
      return { mediaType: 'image/png' as const, ...size, bitDepth, colorType, imageData };
    }
    at = end;
  }
  throw new Error('Logo is not a valid PNG image');
}

function inspectJpeg(bytes: Uint8Array) {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  if (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('Logo is not a valid JPEG image');
  let at = 2, size: { width: number; height: number } | null = null;
  while (at < bytes.length - 2) {
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === undefined || marker === 0x00) throw new Error('Logo is not a valid JPEG image');
    if (marker === 0xda) {
      if (!size) throw new Error('Logo is not a valid JPEG image');
      return { mediaType: 'image/jpeg' as const, ...size };
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (at + 2 > bytes.length - 2) throw new Error('Logo is not a valid JPEG image');
    const length = (bytes[at]! << 8) | bytes[at + 1]!;
    if (length < 2 || at + length > bytes.length - 2) throw new Error('Logo is not a valid JPEG image');
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length < 8) throw new Error('Logo is not a valid JPEG image');
      size = dimensions((bytes[at + 5]! << 8) | bytes[at + 6]!, (bytes[at + 3]! << 8) | bytes[at + 4]!);
    }
    at += length;
  }
  throw new Error('Logo is not a valid JPEG image');
}

function inspectWebp(bytes: Uint8Array) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  if (readU32LE(bytes, 4) + 8 !== bytes.length) throw new Error('Logo is not a valid WebP image');
  let at = 12, size: { width: number; height: number } | null = null;
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, 4), length = readU32LE(bytes, at + 4), data = at + 8;
    if (data + length > bytes.length) throw new Error('Logo is not a valid WebP image');
    if (type === 'VP8X') {
      if (length !== 10) throw new Error('Logo is not a valid WebP image');
      const width = 1 + bytes[data + 4]! + (bytes[data + 5]! << 8) + (bytes[data + 6]! << 16);
      const height = 1 + bytes[data + 7]! + (bytes[data + 8]! << 8) + (bytes[data + 9]! << 16);
      size = dimensions(width, height);
    } else if (type === 'VP8L') {
      if (length < 5 || bytes[data] !== 0x2f) throw new Error('Logo is not a valid WebP image');
      const bits = readU32LE(bytes, data + 1);
      size = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    } else if (type === 'VP8 ') {
      if (length < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) throw new Error('Logo is not a valid WebP image');
      size = dimensions(((bytes[data + 7]! << 8) | bytes[data + 6]!) & 0x3fff, ((bytes[data + 9]! << 8) | bytes[data + 8]!) & 0x3fff);
    }
    at = data + length + (length & 1);
  }
  if (at !== bytes.length || !size) throw new Error('Logo is not a valid WebP image');
  return { mediaType: 'image/webp' as const, ...size };
}

async function validatePngPixels(image: NonNullable<ReturnType<typeof inspectPng>>) {
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const rowBytes = Math.ceil(image.width * channels[image.colorType]! * image.bitDepth / 8);
  const expected = image.height * (rowBytes + 1);
  const compressedParts = image.imageData.map(chunk => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
  const compressed = new Blob(compressedParts).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader = compressed.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expected) { await reader.cancel(); throw new Error('Logo is not a valid PNG image'); }
      chunks.push(value);
    }
  } catch { throw new Error('Logo is not a valid PNG image'); }
  if (total !== expected) throw new Error('Logo is not a valid PNG image');
  const pixels = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { pixels.set(chunk, offset); offset += chunk.byteLength; }
  for (let row = 0; row < image.height; row++) if (pixels[row * (rowBytes + 1)]! > 4) throw new Error('Logo is not a valid PNG image');
}

export async function inspectLogoImage(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_LOGO_BYTES) throw new Error('Logo must be 2 MiB or smaller');
  const png = inspectPng(bytes);
  if (png) { await validatePngPixels(png); const { mediaType, width, height } = png; return { mediaType, width, height }; }
  const inspected = inspectJpeg(bytes) ?? inspectWebp(bytes);
  if (!inspected) throw new Error('Logo must be a valid PNG, JPEG, or WebP image');
  return inspected;
}
