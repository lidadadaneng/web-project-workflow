import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const entries = await fs.readdir(directory, { withFileTypes: true });
const svgNames = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.svg'))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'zh-CN'));

if (svgNames.length !== 12) {
  throw new Error(`Expected 12 SVG files, found ${svgNames.length}. No PNG files were changed.`);
}

const pending = [];

for (const svgName of svgNames) {
  const pngName = svgName.replace(/\.svg$/i, '.png');
  const pngPath = path.join(directory, pngName);
  let needsRestore = false;

  try {
    const pngStat = await fs.stat(pngPath);
    if (pngStat.size === 0) {
      needsRestore = true;
    } else {
      const metadata = await sharp(pngPath).metadata();
      needsRestore = !metadata.width || !metadata.height || metadata.format !== 'png';
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      needsRestore = true;
    } else {
      needsRestore = true;
    }
  }

  if (needsRestore) {
    pending.push({ svgName, pngName });
  }
}

for (const { svgName, pngName } of pending) {
  const svgPath = path.join(directory, svgName);
  const pngPath = path.join(directory, pngName);
  const svg = await fs.readFile(svgPath);
  const svgMetadata = await sharp(svg).metadata();

  if (!svgMetadata.width || !svgMetadata.height) {
    throw new Error(`SVG dimensions cannot be read: ${svgName}`);
  }

  const png = await sharp(svg)
    .resize(svgMetadata.width * 2, svgMetadata.height * 2)
    .png()
    .toBuffer();
  const pngMetadata = await sharp(png).metadata();

  if (!pngMetadata.width || !pngMetadata.height || pngMetadata.format !== 'png') {
    throw new Error(`Generated PNG failed validation: ${pngName}`);
  }

  await fs.writeFile(pngPath, png);
  console.log(`${pngName}: ${pngMetadata.width} x ${pngMetadata.height}, ${png.length} bytes`);
}

console.log(`Restored ${pending.length} PNG preview(s); valid PNG files were not modified.`);
