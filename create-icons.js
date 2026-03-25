#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the logo SVG
const logoSvg = fs.readFileSync(path.join(__dirname, 'public/logo.svg'));

async function createIcons() {
  try {
    const pngSizes = [
      { size: 512, name: 'public/logo.png' },
      { size: 256, name: 'public/logo-256.png' },
      { size: 128, name: 'public/logo-128.png' },
      { size: 64, name: 'public/logo-64.png' },
      { size: 32, name: 'public/logo-32.png' },
      { size: 16, name: 'public/logo-16.png' }
    ];

    for (const { size, name } of pngSizes) {
      console.log(`Creating ${name} (${size}x${size})...`);
      await sharp(logoSvg, { density: 300 })
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(path.join(__dirname, name));
    }

    console.log('Creating public/logo.ico...');
    const icoBuffer = await pngToIco([
      path.join(__dirname, 'public/logo-16.png'),
      path.join(__dirname, 'public/logo-32.png'),
      path.join(__dirname, 'public/logo-64.png'),
      path.join(__dirname, 'public/logo-128.png'),
      path.join(__dirname, 'public/logo-256.png')
    ]);
    fs.writeFileSync(path.join(__dirname, 'public/logo.ico'), icoBuffer);
    
    console.log('✓ All icons created successfully!');
  } catch (error) {
    console.error('✗ Error creating icons:', error);
    process.exit(1);
  }
}

createIcons();
