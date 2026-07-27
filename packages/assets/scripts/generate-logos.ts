/**
 * Generates raster logo exports from the canonical SVG sources.
 *
 * The generated `png/` directories are intentionally ignored by Git. Run this
 * script whenever raster branding assets or favicons are needed.
 *
 * @module
 * @category Assets
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import sharp from "sharp";

const ASSETS_ROOT = resolve(process.cwd());
const LOGOS_ROOT = join(ASSETS_ROOT, "logos", "latest");
const THEMES = ["light", "dark"] as const;
const STYLES = ["grid", "no-grid", "transparent"] as const;
const EXPORTS = {
  logo_square: [16, 32, 48, 64, 128, 256, 512, 1024, 2000],
  wordmark_compact: [256, 512, 1024, 2000],
  wordmark_horizontal: [256, 512, 1024, 2000],
} as const;
const FAVICON_SIZES = [16, 32, 48] as const;

const createIco = (images: readonly Buffer[]): Buffer => {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const dataOffset = headerSize + directoryEntrySize * images.length;
  const header = Buffer.alloc(dataOffset);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = dataOffset;
  images.forEach((image, index) => {
    const size = FAVICON_SIZES[index];
    const entryOffset = headerSize + index * directoryEntrySize;

    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.length;
  });

  return Buffer.concat([header, ...images]);
};

const generateVariant = async (theme: (typeof THEMES)[number], style: (typeof STYLES)[number]) => {
  const variantDirectory = join(LOGOS_ROOT, theme, style);
  const outputDirectory = join(variantDirectory, "png");
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  for (const [name, sizes] of Object.entries(EXPORTS)) {
    const source = join(variantDirectory, `${name}.svg`);
    for (const width of sizes) {
      await sharp(source)
        .resize({ width })
        .png()
        .toFile(join(outputDirectory, `${name}_${width}.png`));
    }
  }

  if (style !== "transparent") {
    const faviconSource = join(variantDirectory, "logo_square.svg");
    const faviconImages = await Promise.all(
      FAVICON_SIZES.map((size) => sharp(faviconSource).resize(size, size).png().toBuffer())
    );
    await writeFile(join(outputDirectory, "favicon.ico"), createIco(faviconImages));
  }
};

const main = async () => {
  for (const theme of THEMES) {
    for (const style of STYLES) {
      await generateVariant(theme, style);
    }
  }

  const generatedFiles = (
    await Promise.all(
      THEMES.flatMap((theme) =>
        STYLES.map(async (style) => {
          const directory = join(LOGOS_ROOT, theme, style, "png");
          return (await readdir(directory)).map((file) => join(directory, file));
        })
      )
    )
  ).flat();
  const totalBytes = (await Promise.all(generatedFiles.map(async (file) => (await readFile(file)).byteLength))).reduce(
    (total, size) => total + size,
    0
  );

  console.log(
    `Generated ${generatedFiles.length} files (${(totalBytes / 1024 / 1024).toFixed(2)} MiB) under ${relative(process.cwd(), LOGOS_ROOT)}.`
  );
};

void main();
