/**
 * scripts/create-icon.js
 *
 * Generates a minimal valid 32×32 ICO file at assets/icon.ico.
 * Run automatically by `npm run build:win` when the file is missing.
 * Replace assets/icon.ico with your own icon at any time — this script
 * will not overwrite an existing file.
 */

'use strict'

const fs   = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'assets', 'icon.ico')

if (fs.existsSync(OUT)) {
  console.log('  icon  assets/icon.ico already exists — skipping generation.')
  process.exit(0)
}

// ── Build a 32×32 32-bpp BMP-based ICO ────────────────────────────────────────
const SIZE = 256

// Teal (#14B8A6) in BGRA byte order
const B = 0xA6, G = 0xB8, R = 0x14, A = 0xFF

// 1. Pixel data — BGRA, bottom-up row order (standard BMP)
const pixels = Buffer.alloc(SIZE * SIZE * 4)
for (let i = 0; i < SIZE * SIZE; i++) {
  pixels[i * 4 + 0] = B
  pixels[i * 4 + 1] = G
  pixels[i * 4 + 2] = R
  pixels[i * 4 + 3] = A
}

// 2. AND mask — 1-bpp, rows padded to 4 bytes, all zeros = fully opaque
const maskRowStride = Math.ceil(SIZE / 32) * 4   // 4 bytes for SIZE=32
const mask = Buffer.alloc(maskRowStride * SIZE, 0x00)

// 3. BITMAPINFOHEADER (40 bytes)
const bmi = Buffer.alloc(40, 0)
bmi.writeUInt32LE(40,        0)   // biSize
bmi.writeInt32LE (SIZE,      4)   // biWidth
bmi.writeInt32LE (SIZE * 2,  8)   // biHeight ×2 (XOR + AND planes combined in ICO)
bmi.writeUInt16LE(1,        12)   // biPlanes
bmi.writeUInt16LE(32,       14)   // biBitCount (32 bpp)
// biCompression … biClrImportant all remain 0

const imgData = Buffer.concat([bmi, pixels, mask])

// 4. ICONDIRENTRY (16 bytes)
const entry = Buffer.alloc(16, 0)
entry.writeUInt8  (SIZE & 0xFF,      0)   // bWidth  (0 means 256)
entry.writeUInt8  (SIZE & 0xFF,      1)   // bHeight
entry.writeUInt8  (0,                2)   // bColorCount
entry.writeUInt8  (0,                3)   // bReserved
entry.writeUInt16LE(1,               4)   // wPlanes
entry.writeUInt16LE(32,              6)   // wBitCount
entry.writeUInt32LE(imgData.length,  8)   // dwBytesInRes
entry.writeUInt32LE(6 + 16,         12)   // dwImageOffset = ICONDIR + ICONDIRENTRY

// 5. ICONDIR header (6 bytes)
const header = Buffer.alloc(6, 0)
header.writeUInt16LE(0, 0)   // idReserved
header.writeUInt16LE(1, 2)   // idType = 1 (ICO)
header.writeUInt16LE(1, 4)   // idCount = 1 image

const ico = Buffer.concat([header, entry, imgData])

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, ico)

console.log(`  icon  assets/icon.ico generated (${SIZE}×${SIZE}px placeholder, teal).`)

console.log('        Replace this file with your own .ico before distributing.')
