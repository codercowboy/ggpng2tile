# Code Internals

This document explains how ggpng2tile works under the hood, focusing on the parts that aren't obvious from reading the code alone: the pixel buffer layout, palette building, Game Gear color packing, and the bitplane tile encoding.

## File overview

```
src/
  utils.js        — pure functions: color math, GG color packing, C output formatting
  ggpng2tile.js   — GGPng2Tile class: pipeline orchestration, palette building, tile encoding, CLI
```

`utils.js` has no dependency on the conversion logic and can be imported independently. `ggpng2tile.js` imports from it and also invokes the CLI entry point at the bottom of the file.

---

## The PNG pixel buffer

pngjs decodes every PNG — regardless of original color mode (indexed, RGB, RGBA, 16-bit, etc.) — into a single flat `Uint8Array` of RGBA bytes. The array is laid out row by row, left to right:

```
[ R G B A | R G B A | R G B A | ... ]
  pixel 0   pixel 1   pixel 2
```

To get the byte offset for the pixel at column `x`, row `y` in an image of width `w`:

```
i = (y * w + x) * 4
```

The `* 4` accounts for the 4 bytes per pixel (R, G, B, A). Then:

```
data[i]     = Red
data[i + 1] = Green
data[i + 2] = Blue
data[i + 3] = Alpha
```

Concrete example — pixel at (3, 2) in a 16-pixel-wide image:

```
i = (2 * 16 + 3) * 4 = 35 * 4 = 140

data[140] = R
data[141] = G
data[142] = B
data[143] = A
```

This formula appears in two places in the code: `#buildPalette` (scanning every pixel to discover colors) and `#encodeTile` (looking up each pixel while encoding an 8x8 block).

*Palette format*

Each GG palette entry is a 12-bit color packed into 2 little-endian bytes: `0000BBBBGGGGRRRR` (4 bits per channel, R in low nibble). The palette is output as `unsigned char[32]` — 16 entries × 2 bytes each — to make the byte layout explicit and avoid any toolchain ambiguity around integer sizes. Index 0 is always the transparent color.

*Tile format*

Each 8×8 tile is 32 bytes. Each row of 8 pixels is stored as 4 bytes (one per bitplane), pixel 0 in the MSB:

```
row 0: [bitplane 0] [bitplane 1] [bitplane 2] [bitplane 3]
row 1: ...
```

*The planar format and its quirks*

Note, this is explained visually in-depth in [docs/walkthrough.html]().

The Game Gear (and SMS) tile format is **planar**, not chunky. In a chunky format you'd store all 4 bits of a pixel's palette index together — e.g. the high nibble of byte 0 is pixel 0, the low nibble is pixel 1, and so on. The GG does not do this.

Instead, each row of 8 pixels is represented by 4 separate bytes — one per **bitplane** — where each byte holds one bit from each of the 8 pixels in that row. Bit 7 of the byte is pixel 0, bit 6 is pixel 1, and so on down to bit 0 for pixel 7.

The part that trips people up is **which bit of the palette index goes into which byte**. You might expect byte 0 to carry the most significant bit (the "first" bit written in binary), but it's the opposite: **byte 0 carries the least significant bit (bit 0) of each pixel's palette index**, byte 1 carries bit 1, byte 2 carries bit 2, and byte 3 carries bit 3 (the MSB).

Concretely, if all 8 pixels in a row are palette index 1 (binary `0001`):

```
bit 0 of index 1 = 1  →  byte 0 (bitplane 0) = 0xFF  (all 8 pixels have this bit set)
bit 1 of index 1 = 0  →  byte 1 (bitplane 1) = 0x00
bit 2 of index 1 = 0  →  byte 2 (bitplane 2) = 0x00
bit 3 of index 1 = 0  →  byte 3 (bitplane 3) = 0x00
```

Row encoding: `0xFF 0x00 0x00 0x00`

If you wrote the palette index in binary as `0001` and expected the bytes to flow left-to-right from MSB to LSB, you'd predict `0x00 0x00 0x00 0xFF` — but it's reversed. The LSB comes first.

*PNG bit depth support*

PNG is not a single format — it has several color modes and bit depths. Here's what each means and how this tool handles them:

| Common name | PNG color type | Bits per channel | Total bits/pixel | Notes |
|---|---|---|---|---|
| 1-bit indexed | Palette | 1 | 1 | 2-color palette; each pixel is a 1-bit index |
| 2-bit indexed | Palette | 2 | 2 | 4-color palette |
| 4-bit indexed | Palette | 4 | 4 | 16-color palette; closest to GG native |
| 8-bit indexed | Palette | 8 | 8 | 256-color palette, like GIF |
| 24-bit | RGB | 8 | 24 | Full color, no alpha channel |
| 32-bit | RGBA | 8 | 32 | Full color + alpha; most common for sprites |
| 48-bit | RGB | 16 | 48 | 16 bits per channel; rare, used in photography |
| 64-bit | RGBA | 16 | 64 | 16 bits per channel + alpha; very rare |

**All of the above are supported.** The PNG library used ([pngjs](https://github.com/pngjs/pngjs)) decodes every color mode and bit depth into a normalized 32-bit RGBA buffer before the tool sees any data. So regardless of whether your source file is a 4-bit indexed sprite sheet or a 32-bit RGBA export from Photoshop, the tool processes the same flat pixel array and the color detection logic is identical.

---

## Palette building

The Game Gear palette holds 16 colors, indexed 0–15. Index 0 is permanently reserved as the transparent color (the GG hardware treats it as transparent for sprites and as the background fill color for backgrounds). That leaves 15 slots for opaque colors.

`#buildPalette` scans the full pixel buffer, collecting unique opaque RGB values into a palette array and a `seen` map:

```js
const palette = [{ r: 0, g: 0, b: 0 }]; // slot 0 pre-filled: transparent
const seen = new Map();                   // "r,g,b" → palette index
```

For each pixel, alpha below 128 is skipped (treated as transparent). For opaque pixels, the RGB tuple is stringified as a key:

```js
const key = `${r},${g},${b}`;
```

If the key hasn't been seen before and there's room in the palette, it gets a new index:

```js
seen.set(key, palette.length); // e.g. "255,0,0" → 1
palette.push({ r, g, b });
```

If the palette is already full (16 entries) and a new color appears, `overflow` is flagged. That pixel's palette index is resolved later by `#getPaletteIndex` using the `--fallback` setting: nearest color match (default), transparent, or a fixed index.

The `seen` map makes tile encoding fast — looking up a pixel's palette index is an O(1) map get rather than a linear search through the palette.

---

## Game Gear color packing

The GG stores each palette entry as a 16-bit little-endian word. The bit layout is:

```
Bit: 15 14 13 12 | 11 10  9  8 |  7  6  5  4 |  3  2  1  0
     (unused = 0)   B3 B2 B1 B0   G3 G2 G1 G0   R3 R2 R1 R0
```

Each channel is 4 bits (0–15), giving 4096 possible colors. An 8-bit source channel (0–255) is scaled to 4 bits by shifting right by 4:

```js
function to4bit(v) {
  return (v >> 4) & 0xF;
}
```

This maps the 256 input values into 16 equal bands:

```
  0–15  → 0
 16–31  → 1
  ...
240–255 → 15
```

The three 4-bit channels are then packed into a word:

```js
function packGGColor(r, g, b) {
  return (to4bit(b) << 8) | (to4bit(g) << 4) | to4bit(r);
}
```

Step by step for RGB(255, 128, 0) — full red, half green, no blue:

```
to4bit(255) = 15  →  0b00001111
to4bit(128) = 8   →  0b00001000
to4bit(0)   = 0   →  0b00000000

blue  shifted: 0   << 8 = 0x0000
green shifted: 8   << 4 = 0x0080
red   (none):  15      = 0x000F

result = 0x0000 | 0x0080 | 0x000F = 0x008F
```

As a little-endian 16-bit word in the output C array: `0x008f`.

---

## Bitplane tile encoding

This is the most counterintuitive part of the codebase. See also the [README planar format section](../README.md#the-planar-format-and-its-quirks) and the [SMS Power reference](https://www.smspower.org/maxim/HowToProgram/Tiles).

### The format

Each 8x8 tile is 32 bytes: 8 rows × 4 bytes per row. For each row of 8 pixels, the 4 bytes are one **bitplane** each:

```
byte 0 = bitplane 0: the LSB (bit 0) of each pixel's palette index
byte 1 = bitplane 1: bit 1 of each pixel's palette index
byte 2 = bitplane 2: bit 2 of each pixel's palette index
byte 3 = bitplane 3: the MSB (bit 3) of each pixel's palette index
```

Within each byte, pixel 0 of the row occupies bit 7 (the MSB of the byte), and pixel 7 occupies bit 0 (the LSB of the byte).

### Why it feels backwards

If you wrote a palette index in binary — say index 1 as `0001` — you might expect the four bytes to correspond to the four digits left to right: the first byte carries the `0` (bit 3), and the last byte carries the `1` (bit 0). That would give `0x00 0x00 0x00 0xFF` for all 8 pixels at index 1.

The GG does the opposite. **Byte 0 carries the LSB**, so for index 1 (`0001`), the `1` bit is in bit 0, which goes into byte 0:

```
8 pixels × index 1 (0001):

  bitplane 0 (byte 0): bit 0 of 1 = 1 → all 8 pixels set → 0xFF
  bitplane 1 (byte 1): bit 1 of 1 = 0 → no pixels set   → 0x00
  bitplane 2 (byte 2): bit 2 of 1 = 0 →                  → 0x00
  bitplane 3 (byte 3): bit 3 of 1 = 0 →                  → 0x00

Row: 0xFF 0x00 0x00 0x00
```

### The encoding loop

```js
for (let p = 0; p < 4; p++) {
  if (idx & (1 << p)) bp[p] |= (1 << bit);
}
```

Breaking it down:

- `p` iterates 0 through 3 — one iteration per bitplane.
- `1 << p` produces a mask that isolates bit `p` of the palette index:
  ```
  p=0: 0b0001  (isolates the LSB)
  p=1: 0b0010
  p=2: 0b0100
  p=3: 0b1000  (isolates the MSB)
  ```
- `idx & (1 << p)` is non-zero if bit `p` of the index is set.
- `bit = 7 - col` is the target bit position inside the bitplane byte. Column 0 (leftmost pixel) maps to bit 7 (the MSB of the byte); column 7 (rightmost) maps to bit 0.
- `bp[p] |= (1 << bit)` sets that pixel's bit in the appropriate bitplane accumulator.

### Worked example: palette index 6 (binary 0110)

```
idx = 6 = 0b0110

Bitplane 0: (6 & 0b0001) = 0 → bit 0 not set → bp[0] unchanged
Bitplane 1: (6 & 0b0010) = 2 → non-zero     → bp[1] |= (1 << bit)
Bitplane 2: (6 & 0b0100) = 4 → non-zero     → bp[2] |= (1 << bit)
Bitplane 3: (6 & 0b1000) = 0 → bit 3 not set → bp[3] unchanged
```

For 8 pixels all at index 6, col 0 through 7:

```
bp[0] = 0x00
bp[1] = 0xFF  (all 8 pixels set a bit in bitplane 1)
bp[2] = 0xFF  (all 8 pixels set a bit in bitplane 2)
bp[3] = 0x00

Row: 0x00 0xFF 0xFF 0x00
```

### Worked example: mixed row

4 pixels at index 0 (transparent) then 4 pixels at index 3 (binary 0011), all in one row:

```
Pixels 0-3: idx=0, no bits set in any plane
Pixels 4-7: idx=3 = 0b0011

  Bitplane 0: bit 0 of 3 = 1
    col=4 → bit = 7-4 = 3 → bp[0] |= (1 << 3) = 0b00001000
    col=5 → bit = 7-5 = 2 → bp[0] |= (1 << 2) = 0b00001100
    col=6 → bit = 7-6 = 1 → bp[0] |= (1 << 1) = 0b00001110
    col=7 → bit = 7-7 = 0 → bp[0] |= (1 << 0) = 0b00001111
    bp[0] = 0x0F

  Bitplane 1: bit 1 of 3 = 1 → same pixel positions set
    bp[1] = 0x0F

  Bitplane 2: bit 2 of 3 = 0 → bp[2] = 0x00
  Bitplane 3: bit 3 of 3 = 0 → bp[3] = 0x00

Row: 0x0F 0x0F 0x00 0x00
```

---

## Nearest-color matching

When a pixel's color isn't in the palette, `PaletteManager.#getNearestPaletteEntry` finds the closest palette entry using squared Euclidean distance in RGB space:

```js
let best = 1, bestDist = Infinity;
for (let i = 1; i < palette.length; i++) {
  const d = colorDist(r, g, b, palette[i].r, palette[i].g, palette[i].b);
  if (d < bestDist) { bestDist = d; best = i; }
}
```

`colorDist` returns the sum of squared channel differences:

```
d = (r1-r2)² + (g1-g2)² + (b1-b2)²
```

Squared distance is used rather than true Euclidean distance (`√d`) because taking the square root is unnecessary when all you need is a relative ordering — the color with the smallest squared distance is the same color with the smallest real distance. This avoids a `Math.sqrt` call per palette entry per overflow pixel.

Index 0 is skipped in the search because it's the transparent slot, not a real color.
