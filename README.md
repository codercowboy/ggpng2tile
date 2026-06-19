# ggpng2tile

Converts PNG sprite sheets to Game Gear / Sega Master System compatible tile data, outputting C source files ready for use with SDCC, GBDK, or any SMS/GG development toolchain.

Built as a Mac-friendly alternative to tools like png2tile and bmp2tile that have build or runtime issues on macOS.

## Features

- Reads any PNG (RGBA, RGB, indexed — see [PNG bit depth support](#png-bit-depth-support))
- Auto-builds a 16-color Game Gear palette (12-bit, 4 bits per channel)
- Encodes 8×8 tiles in standard SMS/GG 4-bitplane format (32 bytes per tile)
- Transparent pixels (alpha < 128) mapped to palette index 0
- Configurable behavior when more than 15 opaque colors are found (`--fallback`)
- Outputs a `.c` data file and a `.h` header with externs and tile count define

## Requirements

- [Node.js](https://nodejs.org/) v14 or later

## Disclaimer

**Note:** This tool was quickly vibecoded with Claude in 2026. The code may not be written exactly how I'd prefer, but in the interest of time expediency I'm leaving it as-is — besides, Claude is super great at writing code nowadays.


## Install

```sh
npm install
```

## Usage

```
node src/ggpng2tile.js <input.png> [output_name] [options]
```

- `input.png` — source image; dimensions must be multiples of 8
- `output_name` — C variable and file prefix (default: input filename without extension)

**Example:**

```
node src/ggpng2tile.js sprites/ship.png ship
```

Produces `ship.c` and `ship.h` in the current directory.

### Options

#### `--fallback=<value>`

Controls what happens when the palette is full (15 opaque colors already found) and a new color is encountered. Default: `nearest`.

| Value | Behavior |
|---|---|
| `nearest` | Map the pixel to the closest color already in the palette (Euclidean distance in RGB space) |
| `transparent` | Map the pixel to palette index 0 (transparent) |
| `0`–`15` | Map the pixel to a specific palette index you choose |

```
node src/ggpng2tile.js ship.png --fallback=nearest
node src/ggpng2tile.js ship.png --fallback=transparent
node src/ggpng2tile.js ship.png --fallback=3
```

### Output

**`ship.h`**

```
extern const unsigned char ship_tiles[512];
extern const unsigned char ship_palette[32];

#define SHIP_NUM_TILES 16
#define SHIP_TILES_SIZE 512
#define SHIP_PALETTE_SIZE 32
```

**`ship.c`**

```
const unsigned char ship_tiles[512] = {
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    ...
};

const unsigned char ship_palette[32] = {
    0x00, 0x00, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
};
```

### Palette format

Each GG palette entry is a 12-bit color packed into 2 little-endian bytes: `0000BBBBGGGGRRRR` (4 bits per channel, R in low nibble). The palette is output as `unsigned char[32]` — 16 entries × 2 bytes each — to make the byte layout explicit and avoid any toolchain ambiguity around integer sizes. Index 0 is always the transparent color.

### Tile format

Each 8×8 tile is 32 bytes. Each row of 8 pixels is stored as 4 bytes (one per bitplane), pixel 0 in the MSB:

```
row 0: [bitplane 0] [bitplane 1] [bitplane 2] [bitplane 3]
row 1: ...
```

## The planar format and its quirks

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

For more detail on the tile format see the [SMS Power tile programming reference](https://www.smspower.org/maxim/HowToProgram/Tiles).

## PNG bit depth support

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

## Gotchas

### More than 15 opaque colors

The Game Gear palette holds 16 colors total. Index 0 is reserved for transparency, leaving 15 slots for opaque colors. If your image contains more than 15 distinct opaque colors, the tool will **not** error out — it captures the first 15 colors it encounters (scanning left-to-right, top-to-bottom) and handles the rest according to `--fallback` (default: nearest color match). A warning is printed to stderr.

If you're getting unexpected results, run your image through a palette-reduction tool first (Aseprite's indexed mode works well) and export with ≤15 colors.

### Anti-aliasing

If your PNG was exported from a raster editor with anti-aliasing enabled, what looks like a clean edge between two colors may actually contain dozens of intermediate blended shades. These will each count as distinct colors, quickly exhausting the 15-color limit and triggering `--fallback` behavior. There is no flag in the PNG format that indicates whether anti-aliasing was used — the only way to know for certain is to check your export settings. Pixel art tools like Aseprite export cleanly by default; general-purpose editors like Photoshop or Illustrator may not.

### Image dimensions

Width and height must both be exact multiples of 8. The tool will exit with an error if they are not.

## Install as a global CLI (optional)

```
npm install -g .
ggpng2tile sprites/ship.png ship
```

## Alternatives

Other tools that convert graphics to SMS/GG tile data. Each has different tradeoffs depending on your OS and target hardware.

### [bmp2tile](https://github.com/maxim-zhao/bmp2tile) — Windows only

The most full-featured SMS/GG tile converter available. If you're on Windows, use this instead. Actively maintained, well-documented, and purpose-built for the SMS/GG format. Docs: [smspower.org/maxim/Software/BMP2Tile](https://www.smspower.org/maxim/Software/BMP2Tile/)

### [gbdk-2020 png2asset](https://github.com/gbdk-2020/gbdk-2020) — cross-platform

Part of the GBDK-2020 toolchain. Supports SMS tile, palette, and map output, and runs fine on macOS. The caveat for Game Gear development specifically: png2asset targets the SMS palette format (RGB222, 6-bit color), not the GG palette format (RGB444, 12-bit color). If you're writing GG code and need accurate 12-bit palette words, you'll need to post-process its output or use a different tool. Docs: [gbdk.org png2asset settings](https://gbdk.org/docs/api/docs_toolchain_settings.html#png2asset-settings)

### [png2tile](https://github.com/yuv422/png2tile) — currently broken on macOS

Compiles without errors on macOS but fails at runtime today. An SMS Power Discord user has reportedly gotten a v1.0 release working, so it may be resolvable — worth checking the thread. For now, assume it doesn't work on Mac out of the box and it'll probably be fine in the future. Docs: [smspower.org forums thread](https://www.smspower.org/forums/15889-PNG2Tile)

### [SuperFamiconv](https://github.com/Optiroc/SuperFamiconv) — capable but Mac setup is involved

Very capable multi-platform tile converter that supports SMS output. Two things to be aware of:

**Palette format:** Same issue as png2asset — the SMS output mode uses SMS palette encoding, not GG 12-bit palette encoding. Requires post-processing if you're targeting the Game Gear.

**macOS build:** Requires GCC >8 for C++20 support. Apple's Xcode Command Line Tools ship a version of Clang that doesn't satisfy this requirement (as of June 2026). The workaround is to install a real GCC via Homebrew (`brew install gcc@15`) and pass CMake parameters at build time to point at the Homebrew binaries in `/opt/homebrew/bin` rather than the system ones.

Additionally, SuperFamiconv may bail out when a PNG contains more than 16 colors in the file even if the actual pixel data uses 16 or fewer — this can happen with PNGs that embed a full 256-entry palette in their header. Reducing the PNG to an indexed palette with exactly the colors you need (e.g., via Aseprite) before passing it in resolves this.

## Code internals

For a detailed walkthrough of how the code works — the RGBA pixel buffer layout, palette building, Game Gear color packing, and the bitplane encoding with worked examples — see [docs/internals.md](docs/internals.md).

## Visual walkthrough

[docs/walkthrough.html](docs/walkthrough.html) is a standalone HTML document that walks through a concrete example using a sample EGA-palette PNG. It covers palette discovery, GG color word encoding, and the bitplane encoding with interactive canvas diagrams.

## Authors

- **Jason Baker** — [jason@onejasonforsale.com](mailto:jason@onejasonforsale.com)
- **Claude** (Anthropic) — AI pair programmer

## License

[MIT](LICENSE)
