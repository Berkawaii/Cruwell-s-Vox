#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the logo SVG
const logoSvg = fs.readFileSync(path.join(__dirname, 'public/logo.svg'));

// Create icons in different sizes
const sizes = [
  // macOS
  { size: 512, name: 'public/logo.png' },
  { size: 256, name: 'public/logo-256.png' },
  // Windows
  { size: 256, name: 'public/logo.ico' },
];

async function createIcons() {
  try {
    for (const { size, name } of sizes) {
      console.log(`Creating ${name} (${size}x${size})...`);
      await sharp(logoSvg, { density: 300 })
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(path.join(__dirname, name));
    }
    
    console.log('✓ All icons created successfully!');
  } catch (error) {
    console.error('✗ Error creating icons:', error);
    process.exit(1);
  }
}

createIcons();
