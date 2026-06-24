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
import { PaletteManager, PaletteEntry } from "./PaletteManager.js";
import { PNG2TileConverter } from "./PNG2TileConverter.js";

export class GGPNG2Tile {
  debug = false;
  pngFileName = null;
  outputName = null;

  /**
   * @param {object} options
   * @param {string} options.pngFileName       - Path to the source PNG file.
   * @param {string} [options.outputName] - C variable / output file prefix.
   *                                        Defaults to the PNG filename stem.
   */
  constructor(pngFileName, outputName) {
    this.pngFileName = pngFileName;
    this.outputName = outputName;
  }

  /**
   * Parse process.argv and return a ready-to-use GGPng2Tile instance.
   * Prints help and exits if required args are missing or --help is passed.
   *
   * @param {string[]} argv - Typically process.argv.
   * @returns {GGPNG2Tile}
   */
  static fromArgs(argv) {
    const { flags, positional } = GGPNG2Tile.#parseArgs(argv);
    const [pngFileName, outputName] = positional;

    if (!pngFileName || flags.help || flags.h) {
      GGPNG2Tile.#printHelp();
      // Exit 0 if --help was explicitly requested, 1 if no pngFileName was provided.
      process.exit(pngFileName ? 0 : 1);
    }

    if (!fs.existsSync(pngFileName)) {
      console.log("Error, file doesn't exist: " + pngFileName);
      process.exit(1);
    }

    let ggPNG2Tile = new GGPNG2Tile(pngFileName, outputName);
    if (flags['debug'] == true) {
      ggPNG2Tile.debug = true;
    }
    return ggPNG2Tile;
  }

  /**
   * Run the full conversion pipeline and write the .c and .h files to disk.
   * This is the top-level entry point when using the tool as a CLI.
   */
  run() {
    const paletteManager = PaletteManager.fromPNGFile(this.pngFileName);

    console.log(`Reading full palette from PNG file: ${this.pngFileName}`);
    let paletteSize = paletteManager.getPaletteEntryCount();
    let targetPaletteSize = 15;
    if (paletteSize > targetPaletteSize) {
      console.log(`Reducing palette size to ${targetPaletteSize} from ${paletteSize}`);
      paletteManager.reducePaletteSize(targetPaletteSize);
      paletteSize = paletteManager.getPaletteEntryCount();
    } else {
      console.log(`Palette size: ${paletteSize}`)
    }

    PNG2TileConverter.convertPNGToTile(this.pngFileName, paletteManager);
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

  static #printHelp() {
    console.log('Usage: ggpng2tile <input.png> [output_name] [options]');
    console.log('');
    console.log('  input.png      source image (dimensions must be multiples of 8)');
    console.log('  output_name    C variable/file prefix (default: filename without extension)');
    console.log('');
    console.log('Options:');
    console.log('');
    console.log('  --debug = debug mode, *very* verbose');
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

GGPNG2Tile.fromArgs(process.argv).run();
