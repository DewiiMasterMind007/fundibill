/**
 * electron/license.js
 *
 * License key algorithm — must stay byte-for-byte identical to the
 * copy embedded in key-generator.html so both tools agree on validity.
 *
 * Key format:  FNDBY-SEG1-SEG2-SEG3
 *   SEG1/SEG2  four chars each, base-36 encoded hash of the customer seed
 *   SEG3       checksum: toSeg( fnv1a32("FNDBY" + SEG1 + SEG2) )
 *
 * A key is valid iff SEG3 === computeChecksum(SEG1, SEG2).
 * Any SEG1/SEG2 pair combined with its correct SEG3 is a valid key —
 * the generator is the only source of real keys because it derives SEG1/SEG2
 * from a secret seed, but the validator only checks the internal checksum.
 */

'use strict'

// ─── FNV-1a 32-bit ───────────────────────────────────────────────────────────

function fnv1a32(str) {
  let h = 0x811C9DC5          // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h  = Math.imul(h, 0x01000193)  // 32-bit FNV prime via hardware multiply
  }
  return h >>> 0              // coerce to unsigned 32-bit
}

// ─── Encoding ─────────────────────────────────────────────────────────────────
// 36-char alphabet: A-Z then 0-9  (uppercase first so keys look clean)

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * Convert a 32-bit unsigned integer to exactly 4 chars from CHARS.
 * Most-significant "digit" is placed first (big-endian).
 */
function toSeg(n) {
  const d = []
  for (let i = 0; i < 4; i++) {
    d.unshift(CHARS[n % 36])
    n = Math.floor(n / 36)
  }
  return d.join('')
}

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Compute the mandatory third segment from the first two data segments.
 * This is what a key-validator checks, and what the generator writes as SEG3.
 */
function computeChecksum(seg1, seg2) {
  return toSeg(fnv1a32('FNDBY' + seg1 + seg2))
}

// ─── Public API ───────────────────────────────────────────────────────────────

const KEY_RE = /^FNDBY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

/**
 * Returns true when `key` is correctly formatted and its checksum is valid.
 */
function validateLicenseKey(key) {
  const k = (key ?? '').trim().toUpperCase()
  if (!KEY_RE.test(k)) return false
  const [, seg1, seg2, seg3] = k.split('-')
  return computeChecksum(seg1, seg2) === seg3
}

/**
 * Generate a deterministic license key from an arbitrary seed string.
 * Same seed → same key every time.
 */
function generateLicenseKey(seed) {
  const seg1 = toSeg(fnv1a32(seed + ':S1'))
  const seg2 = toSeg(fnv1a32(seed + ':S2'))
  return `FNDBY-${seg1}-${seg2}-${computeChecksum(seg1, seg2)}`
}

module.exports = { validateLicenseKey, generateLicenseKey }
