# ggpng2tile

> **Note:** This tool was quickly vibecoded with Claude in 2026. The code may not be written exactly how I'd prefer, but in the interest of time expediency I'm leaving it as-is — besides, Claude is super great at writing code nowadays.

Converts PNG sprite sheets to Game Gear / Sega Master System compatible tile data, outputting C source files ready for use with SDCC, GBDK, or any SMS/GG development toolchain.

Built as a Mac-friendly alternative to tools like png2tile and bmp2tile that have build or runtime issues on macOS.

## Features

- Reads any PNG (RGBA, RGB, indexed)
- Auto-builds a 16-color Game Gear palette (12-bit, 4 bits per channel)
- Encodes 8×8 tiles in standard SMS/GG 4-bitplane format (32 bytes per tile)
- Transparent pixels (alpha < 128) mapped to palette index 0
- Excess colors (beyond 15 opaque) nearest-color matched to the palette
- Outputs a `.c` data file and a `.h` header with externs and tile count define

## Requirements

- [Node.js](https://nodejs.org/) v14 or later

## Install

```sh
npm install
```

## Usage

```sh
node src/ggpng2tile.js <input.png> [output_name]
```

- `input.png` — source image; dimensions must be multiples of 8
- `output_name` — C variable and file prefix (default: input filename without extension)

**Example:**

```sh
node src/ggpng2tile.js sprites/ship.png ship
```

Produces `ship.c` and `ship.h` in the current directory.

### Output

**`ship.h`**
```c
extern const unsigned char ship_tiles[512];
extern const unsigned short ship_palette[16];

#define SHIP_NUM_TILES 16
```

**`ship.c`**
```c
const unsigned char ship_tiles[512] = {
    0x00, 0x00, ...
};

const unsigned short ship_palette[16] = {
    0x0000, 0x000f, ...
};
```

### Palette format

Each palette entry is a 16-bit little-endian word: `0000BBBBGGGGRRRR` (4 bits per channel). Index 0 is always the transparent color.

### Tile format

Each 8×8 tile is 32 bytes. Each row of 8 pixels is stored as 4 bytes (one per bitplane), pixel 0 in the MSB:

```
row 0: [bitplane 0] [bitplane 1] [bitplane 2] [bitplane 3]
row 1: ...
```

## Install as a global CLI (optional)

```sh
npm install -g .
ggpng2tile sprites/ship.png ship
```

## Authors

- **Jason Baker** — [jason@onejasonforsale.com](mailto:jason@onejasonforsale.com)
- **Claude** (Anthropic) — AI pair programmer

## License

[MIT](LICENSE)
