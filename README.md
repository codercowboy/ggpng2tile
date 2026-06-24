# ggpng2tile

Converts PNG images to Game Gear palettes/tiles .c/.h files for use with devkitSMS.

Converted C source files are meant for inclusion in game gear homebrew source code built with [sverx's](https://github.com/sverx) [devkitSMS](https://github.com/sverx/devkitSMS) library. 

Note that a variety of tools exist to convert images to game gear assets, those are described below in the `Alternatives` section of this document.

Github for this project: [https://github.com/codercowboy/ggpng2tile]().

## Features

- Reads any PNG (RGBA, RGB, indexed — see `PNG bit depth support` below
- Auto-builds a 16-color Game Gear palette (12-bit, 4 bits per channel)
- Encodes 8×8 tiles in standard SMS/GG 4-bitplane format (32 bytes per tile)
- Outputs a `.c` data file and a `.h` header with externs and tile count define

## Disclaimer

**Note:** This tool was quickly vibecoded with Claude in 2026. The code may not be written exactly how I'd prefer, but in the interest of time expediency I'm leaving it as-is — besides, Claude is super great at writing code nowadays.

## Install

*Requirements*

- [Node.js](https://nodejs.org/) v14 or later (includes npm)

*Installing*

Run this before trying to use ggpng2tile. You'll only need to run this once.

```
npm install
```

## Usage

*Linux/Mac users:*

```
ggpng2tile.sh <input.png> [output_name] [options]
```

Example usage, produces `ship.c` and `ship.h` in the current directory:

```
ggpng2tile.sh sprites/ship.png ship
```

*Windows users:*

```
node src/ggpng2tile.js <input.png> [output_name] [options]
```

Example usage, produces `ship.c` and `ship.h` in the current directory:

```
node src/ggpng2tile.js sprites/ship.png ship
```

*Program Arguments*

- `input.png` — (required) source image; dimensions must be multiples of 8
- `output_name` — (optional) C variable and file prefix (default: input filename without extension)

*Program Options*

`--debug - enable debug mode`

Example usage:

```
node src/ggpng2tile.js ship.png --debug
```

### Example Output

**`ship.h`**

```
#define ship_tiles_count 4
#define ship_tiles_size_bytes 128

extern const unsigned char ship_tiles[128];

#define ship_palette_color_count 16
#define ship_palette_size_bytes 32

extern const unsigned char ship_palette[32];
```

View the file yourself: [examples/ship.h](examples/ship.h)

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

View the file yourself: [examples/ship.c](examples/ship.c)

## Caveats

*More than 15 opaque colors*

The Game Gear palette holds 16 colors total. Index 0 is reserved for transparency, leaving 15 slots for opaque colors. If your image contains more than 15 distinct opaque colors, the tool will **not** error out — it captures the first 15 colors it encounters (scanning left-to-right, top-to-bottom) and handles the rest by finding the nearest color match).

If you're getting unexpected results, run your image through a palette-reduction tool first ([Aseprite's](https://www.aseprite.org/) indexed mode works well) and export with ≤15 colors.

*Source PNG images with anti-aliasing*

If your PNG was exported from a raster editor with anti-aliasing enabled, what looks like a clean edge between two colors may actually contain dozens of intermediate blended shades. These will each count as distinct colors, quickly exhausting the 15-color limit. There is no flag in the PNG format that indicates whether anti-aliasing was used — the only way to know for certain is to check your export settings. Pixel art tools like Aseprite export cleanly by default; general-purpose editors like Photoshop or Illustrator may not.

*Image dimensions*

Width and height must both be exact multiples of 8. The tool will exit with an error if they are not.

## Alternatives

There are several other tools that convert graphics to SMS/GG tile data. This list is not exhaustive, but were considered before creating `ggpng2tile`. Each alternative tool has differing tradeoffs depending on your OS and target hardware. 

Some tools will export tiles and palettes as binaries that can then be used by the [folder2c](https://github.com/sverx/devkitSMS/tree/master/folder2c) tool provided by [sverx's](https://github.com/sverx) [devkitSMS](https://github.com/sverx/devkitSMS), while other tools will export directly to .c/.h files that are suitable for inclusion in your code base. 

What many of these tools do not provide is accurate game gear palette colors for developers using MacOs, thus, `ggpng2tile` exists.

#### [bmp2tile](https://github.com/maxim-zhao/bmp2tile) — Windows only

The most full-featured SMS/GG tile converter available. If you're on Windows, use this instead. Actively maintained, well-documented, and purpose-built for the SMS/GG format. 

bmp2tile docs: [smspower.org/maxim/Software/BMP2Tile](https://www.smspower.org/maxim/Software/BMP2Tile/)

#### [gbdk-2020 png2asset](https://github.com/gbdk-2020/gbdk-2020) — cross-platform

The `png2asset` tile converter is part of the GBDK-2020 toolchain. It supports SMS tile, palette, and map output, and runs fine on macOS. The caveat for Game Gear development specifically: `png2asset` targets the SMS palette format (RGB222, 6-bit color), not the GG palette format (RGB444, 12-bit color). If you're writing GG code and need accurate 12-bit palette words, you'll need to post-process its output or use a different tool.

png2asset docs: [gbdk.org png2asset settings](https://gbdk.org/docs/api/docs_toolchain_settings.html#png2asset-settings)

#### [png2tile](https://github.com/yuv422/png2tile) — currently broken on macOS

Compiles without errors on macOS but fails at runtime as of June 18, 2026. A SMS Power Discord user has reportedly gotten a years-old v1.0 release that isn't available on the project's github page, so current issues may be resolved in the near future. 

png2tile docs: [smspower.org forums thread](https://www.smspower.org/forums/15889-PNG2Tile)

#### [SuperFamiconv](https://github.com/Optiroc/SuperFamiconv) — capable but Mac setup is involved

Very capable multi-platform tile converter that supports SMS output. Two things to be aware of:

**Palette format:** Same issue as png2asset — the SMS output mode uses SMS palette encoding, not GG 12-bit palette encoding. Requires post-processing if you're targeting the Game Gear.

**macOS build:** Requires GCC version 8 or greater for C++20 support. As of June 2026, Apple's Xcode Command Line Tools ship a version of Clang that doesn't satisfy this requirement. The workaround is to install a real GCC via Homebrew (`brew install gcc@15`) and pass `CMake` parameters at build time to point at the Homebrew binaries in `/opt/homebrew/bin` rather than the XCode binaries.

Additionally, SuperFamiconv may bail out when a PNG contains more than 16 colors in the file's palette even if the actual pixel data uses 16 or fewer — this can happen with PNGs that are true-color or embed a full 256-entry palette in their header. Reducing the PNG to an indexed palette with exactly the colors you need (e.g., via [Aseprite](https://www.aseprite.org/)) before processing might resolve this.

## Technical Details

*Visual walkthrough*

[docs/walkthrough.html](docs/walkthrough.html) is a standalone HTML document that walks through the often-confusing bit by bit conversion details with a concrete example using a sample EGA-palette PNG. It covers palette discovery, GG color word encoding, and the bitplane encoding with interactive canvas diagrams.

*Code internals*

For a detailed walkthrough of how the code works — the RGBA pixel buffer layout, palette building, Game Gear color packing, and the bitplane encoding with worked examples — see [docs/internals.md](docs/internals.md).

Credit
======

- Numerous threads, articles, and discussions on the [SMS Power!](https://www.smspower.org) forums and discord provided knowledge
- [Maxim's](https://www.smspower.org/maxim/) [SMS / GG Palette](https://www.smspower.org/maxim/HowToProgram/Palette) and [SMS / GG Tiles](https://www.smspower.org/maxim/HowToProgram/Tiles) pages very clearly explain the bit-by-bit details of the on-device image formatting, better than the Claude generated [docs/walkthrough.html]() in this project.
- The [pngjs](https://www.npmjs.com/package/pngjs) ([github](https://github.com/pngjs)) pure-javascript library is used to process PNG files. 
- Anthropic's [Claude Code](https://claude.ai/) wrote 100% of the initial code, documentation, and visual example. Model used was [Sonnet 4.6](https://www.anthropic.com/news/claude-sonnet-4-6) on June 18, 2026. 
- [sverx's](https://github.com/sverx) [devkitSMS](https://github.com/sverx/devkitSMS) library was used to verify the tool's work in emulators and on device. 
- krikzz's [EVERDRIVE-GG](https://krikzz.com/our-products/legacy/edgg.html) flash cart was used to test on real hardware
- Game Gear hardware used was restored/improved by [pizza_whistle](https://www.reddit.com/user/pizza_whistle/).

## Authors

- **Jason Baker** — [jason@onejasonforsale.com](mailto:jason@onejasonforsale.com)
- **Claude** (Anthropic) — AI pair programmer, initial author of all code and documentation

## License

All code is licensed with the [Apache License](http://en.wikipedia.org/wiki/Apache_license), which is a great license for code because it:

* a) covers liability - my code should work, but I'm not liable if you do something stupid with it
* b) allows you to copy, fork, and use the code, even commercially
* c) is [non-viral](http://en.wikipedia.org/wiki/Viral_license), that is, your derivative code doesn't *have to be* open source to use it
* d) requires attribution to this project in derivative projects

Other great licensing options for your own code: the BSD License, or the MIT License.

Here's the Apache License:

Copyright (c) 2026, Coder Cowboy, LLC. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
* 1. Redistributions of source code must retain the above copyright notice, this
list of conditions and the following disclaimer.
* 2. Redistributions in binary form must reproduce the above copyright notice,
this list of conditions and the following disclaimer in the documentation
and/or other materials provided with the distribution.
  
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
  
The views and conclusions contained in the software and documentation are those
of the authors and should not be interpreted as representing official policies,
either expressed or implied.