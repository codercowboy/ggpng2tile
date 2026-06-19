/**
 * Scale an 8-bit color channel (0-255) down to a 4-bit value (0-15).
 *
 * The Game Gear stores each color channel as 4 bits, giving 16 possible
 * intensities per channel (0-15) instead of the 256 (0-255) you get in
 * a standard 8-bit channel.
 *
 * We shift right by 4 to divide by 16, which maps each of the 16 equal
 * bands of the 8-bit range to one 4-bit level:
 *
 *   0-15   → 0    (0000)
 *   16-31  → 1    (0001)
 *   ...
 *   240-255 → 15  (1111)
 *
 * The & 0xF masks the result to exactly 4 bits, which is defensive but
 * harmless since >> 4 on a value 0-255 already fits in 4 bits.
 *
 * Example:
 *   to4bit(255) → 255 >> 4 = 15   (0b1111)
 *   to4bit(128) → 128 >> 4 = 8    (0b1000)
 *   to4bit(0)   → 0   >> 4 = 0    (0b0000)
 */
export function to4bit(v) {
  return (v >> 4) & 0xF;
}

/**
 * Pack 8-bit RGB channels into a 16-bit Game Gear palette word.
 *
 * The GG palette word layout is:
 *
 *   Bit: 15 14 13 12 | 11 10  9  8 |  7  6  5  4 |  3  2  1  0
 *        (unused = 0)   B3 B2 B1 B0   G3 G2 G1 G0   R3 R2 R1 R0
 *
 * Each channel is first reduced to 4 bits via to4bit(), then placed into
 * its field by shifting:
 *
 *   Red   → bits  0-3  (no shift needed)
 *   Green → bits  4-7  (shift left 4)
 *   Blue  → bits 8-11  (shift left 8)
 *
 * Example: RGB(255, 128, 0) — full red, half green, no blue
 *   to4bit(255) = 15  (0b1111)
 *   to4bit(128) = 8   (0b1000)
 *   to4bit(0)   = 0   (0b0000)
 *
 *   result = (0 << 8) | (8 << 4) | 15
 *          = 0x0000   | 0x0080   | 0x000F
 *          = 0x008F
 *
 * This word is stored little-endian in the GG's CRAM, so bytes on disk
 * would be 0x8F, 0x00.
 */
export function packGGColor(r, g, b) {
  return (to4bit(b) << 8) | (to4bit(g) << 4) | to4bit(r);
}

/**
 * Squared Euclidean distance between two RGB colors.
 *
 * Used for nearest-color matching when the palette is full and a pixel's
 * exact color isn't in the palette. We compare squared distances rather
 * than true distances to avoid the cost of a square root — squaring is
 * monotonic, so the closest color by squared distance is the same as the
 * closest color by real distance.
 *
 * Example: distance between red (255,0,0) and orange (255,165,0)
 *   (255-255)² + (0-165)² + (0-0)² = 0 + 27225 + 0 = 27225
 *
 * This is purely in RGB space — it's not perceptually weighted, which
 * means it may not always pick the most visually similar color, but it's
 * fast and good enough for palette-limited pixel art.
 */
export function colorDist(r1, g1, b1, r2, g2, b2) {
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

/**
 * Format a byte value (0-255) as a two-digit lowercase hex literal.
 * Example: hex2(255) → '0xff',  hex2(10) → '0x0a'
 */
export function hex2(v) { return `0x${v.toString(16).padStart(2, '0')}`; }

/**
 * Format a 16-bit word (0-65535) as a four-digit lowercase hex literal.
 * Example: hex4(256) → '0x0100',  hex4(15) → '0x000f'
 */
export function hex4(v) { return `0x${v.toString(16).padStart(4, '0')}`; }

/**
 * Render a flat byte array as a C unsigned char array definition.
 *
 * Output example for a 4-byte array named "ship_tiles":
 *
 *   const unsigned char ship_tiles[4] = {
 *       0xff, 0x00, 0x00, 0x00,
 *   };
 *
 * @param {string} name - The C variable name.
 * @param {number[]} bytes - Array of byte values (0-255).
 * @param {number} cols - How many hex values to print per line (default 16).
 */
export function formatByteArray(name, bytes, cols = 16) {
  const lines = [`const unsigned char ${name}[${bytes.length}] = {`];
  for (let i = 0; i < bytes.length; i += cols) {
    const chunk = bytes.slice(i, i + cols).map(hex2).join(', ');
    lines.push(`    ${chunk},`);
  }
  lines.push(`};`);
  return lines.join('\n');
}

/**
 * Render a 16-entry GG palette as a C unsigned char array of raw little-endian
 * bytes. Each 12-bit GG color word is stored as 2 bytes (LE), so 16 palette
 * entries become 32 bytes total.
 *
 * Outputting as unsigned char (rather than unsigned short) makes the 2-bytes-
 * per-entry layout explicit and avoids any ambiguity around short/int sizes
 * across different Z80 toolchains.
 *
 * Byte layout for one entry (LE 16-bit word 0x0RGB):
 *   byte 0 (low):  GGGG RRRR
 *   byte 1 (high): 0000 BBBB
 *
 * Output example (cols=8 entries per line = 16 bytes per line):
 *
 *   const unsigned char ship_palette[32] = {
 *       0x00, 0x00, 0x00, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
 *       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
 *   };
 *
 * @param {string} name - The C variable name.
 * @param {number[]} words - Array of 16 palette word values.
 * @param {number} cols - Palette entries per line (default 8 → 16 bytes per line).
 */
export function formatWordArray(name, words, cols = 8) {
  // Flatten each 16-bit word to two little-endian bytes.
  // Example: 0x0A00 (Blue) → [0x00, 0x0A]
  const bytes = words.flatMap(w => [w & 0xFF, (w >> 8) & 0xFF]);
  const byteCols = cols * 2; // 2 bytes per palette entry
  const lines = [`const unsigned char ${name}[${bytes.length}] = {`];
  for (let i = 0; i < bytes.length; i += byteCols) {
    const chunk = bytes.slice(i, i + byteCols).map(hex2).join(', ');
    lines.push(`    ${chunk},`);
  }
  lines.push(`};`);
  return lines.join('\n');
}
