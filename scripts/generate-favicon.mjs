#!/usr/bin/env node
/**
 * Favicon Generator Script
 * Converts SVG to PNG and ICO formats for full browser compatibility
 *
 * Usage: node scripts/generate-favicon.mjs
 *
 * Requires: npm install sharp png-to-ico --save-dev
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, "..", "src", "app");

async function generateFavicons() {
  try {
    // Dynamic import for sharp
    const sharp = (await import("sharp")).default;

    const svgPath = join(appDir, "icon.svg");
    const svgBuffer = readFileSync(svgPath);

    console.log("Generating PNG favicons...");

    // Generate different sizes
    const sizes = [16, 32, 48, 64, 128, 180, 192, 512];

    for (const size of sizes) {
      const outputPath = join(appDir, `icon-${size}.png`);
      await sharp(svgBuffer).resize(size, size).png().toFile(outputPath);
      console.log(`  Created: icon-${size}.png`);
    }

    // Main icon.png (32x32 for default)
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(join(appDir, "icon.png"));
    console.log("  Created: icon.png (32x32)");

    // Apple touch icon (180x180)
    await sharp(svgBuffer)
      .resize(180, 180)
      .png()
      .toFile(join(appDir, "apple-icon.png"));
    console.log("  Created: apple-icon.png (180x180)");

    // Generate ICO file (contains 16x16 and 32x32)
    console.log("\nGenerating ICO favicon...");

    try {
      const pngToIco = (await import("png-to-ico")).default;

      // Create temporary PNGs for ICO
      const png16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();
      const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
      const png48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer();

      const icoBuffer = await pngToIco([png16, png32, png48]);
      writeFileSync(join(appDir, "favicon.ico"), icoBuffer);
      console.log("  Created: favicon.ico");
    } catch (e) {
      console.log(
        "  Skipping ICO generation (install png-to-ico for ICO support)"
      );
      // Create a simple 32x32 PNG as fallback favicon
      await sharp(svgBuffer)
        .resize(32, 32)
        .png()
        .toFile(join(appDir, "favicon.png"));
      console.log("  Created: favicon.png (fallback)");
    }

    console.log("\nFavicon generation complete!");
    console.log("\nNext.js will automatically use these files:");
    console.log("  - icon.svg (modern browsers)");
    console.log("  - favicon.ico (legacy browsers)");
    console.log("  - apple-icon.png (Apple devices)");
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") {
      console.error("\nMissing dependencies. Please install:");
      console.error("  npm install sharp png-to-ico --save-dev\n");
      console.error("Then run this script again.");
    } else {
      console.error("Error generating favicons:", error);
    }
    process.exit(1);
  }
}

generateFavicons();
