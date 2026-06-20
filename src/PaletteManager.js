import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { HexUtils } from './HexUtils.js';
import { cloneObject } from './ggpng2tileutils.js';

export class PaletteManager {
    paletteEntries = new Map();

    static fromPNGFile(pngFile) {         
        console.log(`Reading palette from '${pngFile}'`);
        const raw = fs.readFileSync(pngFile);
        const png = PNG.sync.read(raw);
        const { data, width, height } = png;

        console.log(`Reading palette from file '${pngFile}', width: ${width}, height: ${height}`);

        let paletteManager = new PaletteManager();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // pngjs lays out pixel data as a flat RGBA byte array.
                // To get pixel (x, y), skip (y * width + x) pixels, each 4 bytes wide.
                //
                // Example: pixel (3, 2) in a 16-pixel-wide image
                //   i = (2 * 16 + 3) * 4 = 35 * 4 = 140
                //   data[140] = R, data[141] = G, data[142] = B, data[143] = A
                const i = (y * width + x) * 4;

                const red = data[i], green = data[i + 1], blue = data[i + 2];
                const alpha = parseFloat(data[i + 3]) / 255.0;
                const htmlHex = HexUtils.rgbToHTMLHex(red, green, blue);

                //console.log(`${x}x${y} = r${red}, g${green}, b${blue}, a${alpha}, html${htmlHex}`);

                let paletteEntry = paletteManager.incrementPaletteUseCount(red, green, blue, alpha);
                paletteEntry.htmlHex = htmlHex;
            }
        }
        return paletteManager;
    }

    /*
        red/green/blue - number 0 to 255
        alpha - float 0 to 1.0
        
        returns relevant PaletteEntry
    */
    incrementPaletteUseCount(red, green, blue, alpha) {
        let key = PaletteManager.createPaletteEntryKeyRGBA(red, green, blue, alpha);
        let paletteEntry = this.paletteEntries.get(key);
        if (paletteEntry == null) {
            paletteEntry = new PaletteEntry(red, green, blue, alpha, 0);
            this.paletteEntries.set(key, paletteEntry);
        }
        paletteEntry.useCount = paletteEntry.useCount + 1;
        return paletteEntry;
    }

    static createPaletteEntryKey(paletteEntry) {
        let key = `r${paletteEntry.red}g${paletteEntry.green}b${paletteEntry.blue}a${paletteEntry.alpha}`;
        return key;
    }

    static createPaletteEntryKeyRGBA(red, green, blue, alpha) {
        let key = `r${red}g${green}b${blue}a${alpha}`;
        return key;
    }

    combineUseCounts(thatPaletteManager) {
        if (thatPaletteManager == null) {
            return;
        }
        for (let thatPaletteEntry of thatPaletteManager.paletteEntries.values()) {
            let key = PaletteManager.createPaletteEntryKey(thatPaletteEntry);
            let thisPaletteEntry = this.paletteEntries.get(key);
            if (thisPaletteEntry == null) {
                thisPaletteEntry = cloneObject(thatPaletteEntry);
                thisPaletteEntry.useCount = 0;
                this.paletteEntries.set(key, thisPaletteEntry);
            }
            thisPaletteEntry.useCount += thatPaletteEntry.useCount;
        }
    }

    getPaletteEntriesSortedByUseCount() {
        let useCountsMap = new Map();
        for (let paletteEntry of this.paletteEntries.values()) {
            let entryList = useCountsMap.get(paletteEntry.useCount);
            if (entryList == null) {
                entryList = [];
                useCountsMap.set(paletteEntry.useCount, entryList);
            }
            entryList.push(paletteEntry);
        }

        let sortedPaletteEntriesList = [];  
        let useCountsKeysArray = Array.from(useCountsMap.keys());      
        let useCountsSortedKeys = useCountsKeysArray.sort((a, b) => b - a);
        for (let key of useCountsSortedKeys) {
            let entryList = useCountsMap.get(key);
            if (entryList != null) {
                for (let paletteEntry of entryList) {
                    sortedPaletteEntriesList.push(paletteEntry);
                }
            }
        }
        return sortedPaletteEntriesList;
    }
}

export class PaletteEntry {
    red = null; // number 0 to 255
    green = null; // number 0 to 255
    blue = null; // number 0 to 255
    alpha = null; // float 0 to 1.0

    useCount = 0; // number

    /*
        red/green/blue - int numbers between 0 and 255
        alpha - float number between 0 and 1, ie 0.5
        usecount - int number
    */
    constructor(red, green, blue, alpha, useCount) {
        this.red = HexUtils.denull(red, 0);
        this.green = HexUtils.denull(green, 0);
        this.blue = HexUtils.denull(blue, 0);
        this.alpha = HexUtils.denull(alpha, 1.0);
        this.useCount = HexUtils.denull(useCount, 0);
    }

    toHTMLHex(includePrefix) {
        let prefix = includePrefix ? "#" : "";
        return prefix 
            + HexUtils.toHex2(HexUtils.denull(this.red, 0)) 
            + HexUtils.toHex2(HexUtils.denull(this.green, 0)) 
            + HexUtils.toHex2(HexUtils.denull(this.blue, 0));
    }

    // example hexString values: "#FF0011", "0xFF", "FF00FF"
    // returns PaletteEntry
    static fromHexString(hexString) {
        let rgbaObject = HexUtils.hexStringToRGBAObject(hexString)
        let useCount = 0;        

        return new PaletteEntry(rgbaObject.red, 
            rgbaObject.green, 
            rgbaObject.blue, 
            rgbaObject.alpha, 
            useCount);
    }

    toCSSRGBA() {
        return "rgba(" 
            + HexUtils.denull(this.red, 0) + ", "
            + HexUtils.denull(this.green, 0) + ", "
            + HexUtils.denull(this.blue, 0) + ", "
            + HexUtils.denull(this.alpha, 0) + ")"
    }

    /*
        example: from("rgba(12, 15, 18, 0.5") -> PaletteEntry { red: 12, green: 15, b: 19, a: 0.5 }
        returns PaletteEntry
    */
    static fromCSSRGBA(cssRGBAValue) {
        if (cssRGBAValue == null || !cssRGBAValue.startswith("rgba(")) {
            return null;
        }

        let paletteEntry = new PaletteEntry();

        if (cssRGBAValue != null && cssRGBAValue.startsWith("rgba(")) {
            cssRGBAValue = cssRGBAValue.slice("rgba(".length);
            let values = cssRGBAValue.split(",");
            if (values.length >= 1) {
                paletteEntry.red = parseInt(values[0]);
            }
            if (values.length >= 2) {
               paletteEntry. green = parseInt(values[1]);
            }
            if (values.length >= 3) {
                let blueValue = StringUtils.removeSuffix(values[2], ")");
                paletteEntry.blue = parseInt(blueValue);
            }
            if (values.length >= 4) {
                let alphaValue = StringUtils.removeSuffix(values[3], ")");
                paletteEntry.alpha = parseFloat(alphaValue);
            }
        }

        return paletteEntry;
    }
}