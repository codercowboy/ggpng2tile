import { PaletteManager, PaletteEntry } from "./PaletteManager.js";

let paletteManager = new PaletteManager();

function printPaletteEntries(paletteManager) {
    let count = 1;
    for (let paletteEntry of paletteManager.getPaletteEntriesSortedByUseCount()) {
        console.log("Palette Entry #" + count + ": " + paletteEntry.useCount + " uses, " + paletteEntry.toCSSRGBA());
        count += 1;
    }
}

let args = process.argv.slice(2);
for (let pngFile of args) {
    console.log("now processing png file: " + pngFile);
    let tmpPaletteManager = PaletteManager.fromPNGFile(pngFile);
    console.log("Count results for png file: " + pngFile);
    printPaletteEntries(tmpPaletteManager);
    console.log("Combining use counts from " + pngFile);
    paletteManager.combineUseCounts(tmpPaletteManager);
}

console.log("Count results for all: ");
printPaletteEntries(paletteManager);