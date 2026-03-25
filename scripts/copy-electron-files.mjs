import fs from 'node:fs';
import path from 'node:path';

const sourceDir = path.resolve('src/electron');
const targetDir = path.resolve('dist-electron');

if (!fs.existsSync(sourceDir)) {
  console.error('Source directory not found:', sourceDir);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
  const sourcePath = path.join(sourceDir, entry.name);
  const targetPath = path.join(targetDir, entry.name);

  if (entry.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  } else {
    fs.copyFileSync(sourcePath, targetPath);
  }
}

console.log('Copied Electron files to dist-electron');
