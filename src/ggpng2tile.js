#!/usr/bin/env node

/**
 * ggpng2tile — converts PNG sprite sheets to Game Gear / SMS tile data.
 *
 * The Game Gear (and its near-twin the Sega Master System) stores graphics
 * as 8x8 pixel tiles in a planar format, with a 12-bit color palette (4 bits
 * per R/G/B channel). This module handles the full pipeline:
 *
 *   1. Read a PNG of any standard bit depth via pngjs (always decoded to
 *      a flat RGBA byte buffer regardless of original color mode).
 *   2. Scan every pixel to build a palette of up to 15 opaque colors,
 *      with palette index 0 permanently reserved for transparency.
 *   3. Encode the image as 8x8 tiles in GG planar format (32 bytes/tile).
 *   4. Emit a .c file (tile data + palette array) and a .h header.
 *
 * Can be used as a CLI tool directly or imported and driven programmatically
 * via the GGPng2Tile class.
 */

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { packGGColor, toCTilesArraySoureCode, toCPaletteArraySourceCode } from './ggpng2tileutils.js';
import { PaletteManager, PaletteEntry } from "./PaletteManager.js";

export class GGPng2Tile {
  debug = false;
  pngFileName = null;
  outputName = null;
  fallback = null;

  /**
   * @param {object} options
   * @param {string} options.pngFileName       - Path to the source PNG file.
   * @param {string} [options.outputName] - C variable / output file prefix.
   *                                        Defaults to the PNG filename stem.
   * @param {string|number} [options.fallback='nearest'] - What to do when the
   *   palette is full and a new color is encountered. One of:
   *     'nearest'     — map to the closest existing palette color (default)
   *     'transparent' — map to palette index 0
   *     0-15          — map to a specific palette index
   */
  constructor({ pngFileName, outputName, fallback = 'nearest' }) {
    this.pngFileName = pngFileName;
    this.outputName = outputName;
    this.fallback = fallback;
  }

  /**
   * Parse process.argv and return a ready-to-use GGPng2Tile instance.
   * Prints help and exits if required args are missing or --help is passed.
   *
   * @param {string[]} argv - Typically process.argv.
   * @returns {GGPng2Tile}
   */
  static fromArgs(argv) {
    const { flags, positional } = GGPng2Tile.#parseArgs(argv);
    const [pngFileName, outputName] = positional;

    if (!pngFileName || flags.help || flags.h) {
      GGPng2Tile.#printHelp();
      // Exit 0 if --help was explicitly requested, 1 if no pngFileName was provided.
      process.exit(pngFileName ? 0 : 1);
    }

    if (!fs.existsSync(pngFileName)) {
      console.log("Error, file doesn't exist: " + pngFileName);
      process.exit(1);
    }

    let ggPng2Tile = new GGPng2Tile({
      pngFileName,
      outputName,
      fallback: GGPng2Tile.#parseFallback(flags.fallback),
    });

    if (flags['debug'] == true) {
      ggPng2Tile.debug = true;
    }

    return ggPng2Tile;
  }

  /**
   * Run the full conversion pipeline and write the .c and .h files to disk.
   * This is the top-level entry point when using the tool as a CLI.
   */
  run() {
    let paletteManager = PaletteManager.fromPNGFile(this.pngFileName);
    const { cFileContents, hFileContents, varName, numTiles, numColors, width, height } = this.convert(paletteManager);
    fs.writeFileSync(`${varName}.c`, cFileContents);
    fs.writeFileSync(`${varName}.h`, hFileContents);
    console.log(`${width}x${height} -> ${numTiles} tile(s), ${numColors} color(s) + transparent`);
    console.log(`Wrote ${varName}.c and ${varName}.h`);
  }

  /**
   * Convert the pngFileName PNG to GG tile data and return the generated C source
   * and header as strings, along with metadata about the conversion.
   *
   * This method is the public programmatic API — call it directly if you want
   * the output strings without writing files to disk.
   *
   * @returns {{ cFileContents: string, hFileContents: string, varName: string, numTiles: number,
   *             numColors: number, width: number, height: number }}
   */
  convert(paletteManager) {
    const raw = fs.readFileSync(this.pngFileName);

    // PNG.sync.read decodes the file into a flat RGBA buffer regardless of
    // whether the source was 8-bit indexed, 24-bit RGB, 32-bit RGBA, etc.
    // After this call, png.data is always a Uint8Array of (width * height * 4)
    // bytes laid out as [R, G, B, A, R, G, B, A, ...] from top-left to bottom-right.
    const png = PNG.sync.read(raw);
    const { width, height } = png;

    // The GG tile format is built around 8x8 blocks. A sprite sheet that is
    // e.g. 17 pixels wide has no valid tile boundary at the right edge.
    if (width % 8 !== 0 || height % 8 !== 0) {
      console.error(`Error: image size ${width}x${height} is not a multiple of 8`);
      process.exit(1);
    }

    let paletteSize = paletteManager.getPaletteEntryCount();
    if (paletteSize > 15) {
      paletteManager.reducePaletteSize(15);
      paletteSize = paletteManager.getPaletteEntryCount();
      // Describe what we're actually doing with the extra colors so the user
      // isn't surprised by the output.
      const desc = this.fallback === 'nearest' ? 'nearest palette color'
        : this.fallback === 'transparent' ? 'transparent (index 0)'
        : `palette index ${this.fallback}`;
      
      console.warn(`Warning: more than 15 opaque colors found; excess pixels mapped to ${desc}. Use --fallback to change this behavior.`);
    }

    const paletteWords = new Array(16).fill(0);
    for (let paletteEntry of paletteManager.paletteEntriesMap.values()) {
      paletteWords[paletteEntry.index] = packGGColor(paletteEntry.red, paletteEntry.green, paletteEntry.blue);
    }

    // Encode tiles left-to-right, top-to-bottom — the order the GG expects
    // them in VRAM when using sequential tile indices.
    const tilesX = width / 8;
    const tilesY = height / 8;
    const tileBytes = [];
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        tileBytes.push(...this.#encodeTile(png, paletteManager, tx, ty));
      }
    }

    const numTiles = tilesX * tilesY;
    const numColors = paletteManager.getPaletteEntryCount(); // slot 0 is transparent, not a real color
    const varName = (this.outputName || path.basename(this.pngFileName, '.png')).replace(/[^a-zA-Z0-9]/g, '_');

    let dateString = new Date().toISOString();
    const fileHeader = [
      `/*`,
      `  Generated by ggpng2tile (https://github.com/codercowboy/ggpng2tile) on ${new Date().toISOString()} `,
      `  source file: ${path.basename(this.pngFileName)}, dims: ${width}x${height} px, tiles: ${numTiles}, palette: ${numColors} color${numColors !== 1 ? 's' : ''} + transparent`,
      `*/`,      
      ``,
    ].join('\n');

    const cFileContents = [
      fileHeader,
      toCTilesArraySoureCode(`${varName}_tiles`, tileBytes, 4),
      ``,
      toCPaletteArraySourceCode(`${varName}_palette`, paletteWords),
      ``,
    ].join('\n');

    const hFileContents = [
      fileHeader,
      `#ifndef ${varName.toUpperCase()}_H`,
      `#define ${varName.toUpperCase()}_H`,
      ``,
      `#define ${varName}_tiles_count ${numTiles}`,
      `#define ${varName}_tiles_size_bytes ${tileBytes.length}`,
      ``,
      `extern const unsigned char ${varName}_tiles[${tileBytes.length}];`,
      ``,
      `#define ${varName}_palette_color_count 16`,
      `#define ${varName}_palette_size_bytes 32`,
      ``,
      `extern const unsigned char ${varName}_palette[32];`,
      ``,
      `#endif`,
      ``,
    ].join('\n');

    return { cFileContents, hFileContents, varName, numTiles, numColors, width, height };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve a pixel's RGBA value to a GG palette index (0-15).
   *
   * Fast path: transparent pixels → 0, known colors → direct map lookup.
   * Slow path: color not in palette (overflow case) → apply this.fallback.
   *
   * @param {PaletteManager} paletteManager - The palette manager
   * @param {number} red - Red channel (0-255).
   * @param {number} green - Green channel (0-255).
   * @param {number} blue - Blue channel (0-255).
   * @param {number} alpha - Alpha channel (0-255).
   * @returns {PalettEntry's index}
   */
  #getPaletteEntryIndex(paletteManager, red, green, blue, alpha) {
    // Alpha below 50% → transparent regardless of RGB.
    if (alpha < 0.5) {

      return 0;
    }

    // Happy path: color was found during palette building, use its index.
    let paletteEntry = paletteManager.getPaletteEntry(red, green, blue, alpha);
    if (paletteEntry != null) {
      return paletteEntry.index;
    }

    // Overflow: this color didn't fit in the palette. Apply the configured
    // fallback behavior.
    if (this.fallback === 'transparent') {
      return 0;
    }
    //FIXME: NOT YET SUPPORTED
    if (this.fallback === 'number') {
      return 0;
    }

    paletteEntry = paletteManager.getNearestPaletteEntry(red, green, blue, alpha);
    return paletteEntry == null ? 0 : paletteEntry.index;
  }

  /**
   * Encode one 8x8 tile at tile-grid position (tileX, tileY) into 32 bytes
   * of GG planar tile data.
   *
   * GG planar format — each row of 8 pixels becomes 4 bytes (one per bitplane):
   *
   *   byte 0 = bitplane 0: bit 0 (LSB) of each pixel's palette index
   *   byte 1 = bitplane 1: bit 1 of each pixel's palette index
   *   byte 2 = bitplane 2: bit 2 of each pixel's palette index
   *   byte 3 = bitplane 3: bit 3 (MSB) of each pixel's palette index
   *
   * Within each byte, pixel 0 of the row sits in the MSB (bit 7), and pixel 7
   * sits in the LSB (bit 0).
   *
   * Worked example — 8 pixels all at palette index 1 (binary 0001):
   *
   *   For each pixel, idx = 1 = 0b0001
   *
   *   Bitplane 0 checks (idx & (1 << 0)) = (1 & 1) = 1  → all 8 pixels set a bit
   *     → bp[0] = 0b11111111 = 0xFF
   *   Bitplane 1 checks (idx & (1 << 1)) = (1 & 2) = 0  → no bits set
   *     → bp[1] = 0x00
   *   Bitplane 2 checks (idx & (1 << 2)) = (1 & 4) = 0
   *     → bp[2] = 0x00
   *   Bitplane 3 checks (idx & (1 << 3)) = (1 & 8) = 0
   *     → bp[3] = 0x00
   *
   *   Row output: 0xFF 0x00 0x00 0x00
   *
   * Another example — 8 pixels all at palette index 6 (binary 0110):
   *
   *   Bitplane 0: (6 & 1) = 0 → bp[0] = 0x00
   *   Bitplane 1: (6 & 2) = 2 → non-zero, all pixels set → bp[1] = 0xFF
   *   Bitplane 2: (6 & 4) = 4 → non-zero, all pixels set → bp[2] = 0xFF
   *   Bitplane 3: (6 & 8) = 0 → bp[3] = 0x00
   *
   *   Row output: 0x00 0xFF 0xFF 0x00
   *
   * @param {PNG} png - Decoded pngjs PNG object.
   * @param {object[]} palette - Palette array from #buildPalette.
   * @param {Map<string,number>} seen - Color→index map from #buildPalette.
   * @param {number} tileX - Tile column index (0-based).
   * @param {number} tileY - Tile row index (0-based).
   * @returns {number[]} 32 bytes of encoded tile data.
   */
  #encodeTile(png, paletteManager, tileX, tileY) {
    const { data, width } = png;
    const bytes = [];

    for (let row = 0; row < 8; row++) {
      // bp[0..3] accumulate one byte per bitplane for this row of 8 pixels.
      const bp = [0, 0, 0, 0];

      for (let col = 0; col < 8; col++) {
        // Convert tile-local (col, row) to absolute pixel (px, py), then to
        // the flat RGBA buffer index. Same formula as in #buildPalette:
        //   i = (absoluteY * width + absoluteX) * 4
        //
        // Example: col=2, row=1 in tile (1, 0) on a 16px-wide image:
        //   px = 1*8 + 2 = 10,  py = 0*8 + 1 = 1
        //   i  = (1 * 16 + 10) * 4 = 26 * 4 = 104
        const i = ((tileY * 8 + row) * width + (tileX * 8 + col)) * 4;

        const red = data[i], green = data[i + 1], blue = data[i + 2];
        const alpha = parseFloat(data[i + 3]) / 255.0;
        const idx = this.#getPaletteEntryIndex(paletteManager, red, green, blue, alpha);

        // Within a bitplane byte, pixel 0 occupies the MSB (bit 7) and pixel 7
        // occupies the LSB (bit 0). So for column `col`, the target bit position
        // inside the byte is (7 - col).
        //
        // Example: col=0 → bit 7 (MSB),  col=7 → bit 0 (LSB)
        const bit = 7 - col;

        // Distribute the palette index across the 4 bitplane bytes.
        // For each bitplane p (0-3), check whether bit p of the index is set.
        // If it is, set the corresponding pixel's bit in bp[p].
        //
        // (1 << p)   — a mask isolating bit p of the index
        // (1 << bit) — a mask for this pixel's position in the bitplane byte
        //
        // Example: idx=3 (0b0011), col=0 (bit position 7)
        //   p=0: (3 & 1) = 1 → bp[0] |= (1 << 7) → sets bit 7 of bp[0]
        //   p=1: (3 & 2) = 2 → bp[1] |= (1 << 7) → sets bit 7 of bp[1]
        //   p=2: (3 & 4) = 0 → bp[2] unchanged
        //   p=3: (3 & 8) = 0 → bp[3] unchanged
        for (let p = 0; p < 4; p++) {
          if (idx & (1 << p)) {
            bp[p] |= (1 << bit);
          }
        }
      }

      // Emit bitplane bytes in order 0→3 (LSB plane first — see README for
      // why this feels backwards compared to how you'd write the index in binary).
      bytes.push(...bp);
    }

    return bytes;
  }

  /**
   * Parse a process.argv-style array into named flags and positional arguments.
   *
   * Handles two flag forms:
   *   --flag=value  → flags['flag'] = 'value'
   *   --flag        → flags['flag'] = true
   *
   * Everything that doesn't start with '--' is treated as a positional argument.
   *
   * Example: ['node', 'ggpng2tile.js', 'ship.png', 'ship', '--fallback=3']
   *   positional: ['ship.png', 'ship']
   *   flags:      { fallback: '3' }
   *
   * @param {string[]} argv - Raw argument array (typically process.argv).
   * @returns {{ flags: object, positional: string[] }}
   */
  static #parseArgs(argv) {
    const flags = {};
    const positional = [];
    for (const arg of argv.slice(2)) { // skip 'node' and script path
      if (arg.startsWith('--')) {
        const eq = arg.indexOf('=');
        if (eq !== -1) {
          flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        } else {
          flags[arg.slice(2)] = true;
        }
      } else {
        positional.push(arg);
      }
    }
    return { flags, positional };
  }

  /**
   * Validate and parse the --fallback flag value into a typed fallback setting.
   *
   * @param {string|undefined} value - The raw string value of --fallback.
   * @returns {'nearest'|'transparent'|number}
   */
  static #parseFallback(value) {
    if (value === undefined || value === 'nearest') { return 'nearest' };
    if (value === 'transparent') { return 'transparent' };
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 0 && n <= 15) { return n; }
    console.error(`Error: --fallback must be 'nearest', 'transparent', or a palette index 0-15 (got '${value}')`);
    process.exit(1);
  }

  static #printHelp() {
    console.log('Usage: ggpng2tile <input.png> [output_name] [options]');
    console.log('');
    console.log('  input.png      source image (dimensions must be multiples of 8)');
    console.log('  output_name    C variable/file prefix (default: filename without extension)');
    console.log('');
    console.log('Options:');
    console.log('');
    console.log('  --fallback=<value> = behavior when palette is full (default: nearest)');
    console.log('.      nearest            map excess colors to the closest palette entry');
    console.log('       transparent        map excess colors to transparent (index 0)');
    console.log('       0-15               map excess colors to a specific palette index');
    console.log('');
    console.log('  --debug = debug mode, *very* verbose');
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

GGPng2Tile.fromArgs(process.argv).run();
