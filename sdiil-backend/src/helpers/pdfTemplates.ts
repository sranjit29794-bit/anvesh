import fs from 'fs';
import path from 'path';

/**
 * Shared PDF template helper for pristine evidence records.
 * Used by seed routine and demo-restore endpoint.
 */
export function getSeedAssetsDir(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'sdiil-backend/seed-assets'),
    path.resolve(process.cwd(), 'seed-assets'),
    path.resolve(process.cwd(), '../seed-assets'),
    path.resolve(process.cwd(), '../sdiil-backend/seed-assets'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  throw new Error(`Seed assets directory not found in: ${possiblePaths.join(', ')}`);
}

/**
 * Retrieves the pristine unmodified raw PDF bytes for a given filename or title.
 */
export function getPristinePdfBuffer(fileNameOrPath: string): Buffer {
  const baseName = path.basename(fileNameOrPath);
  const seedDir = getSeedAssetsDir();
  const fullPath = path.join(seedDir, baseName);

  if (!fs.existsSync(fullPath)) {
    // If not exact match, find closest match by case or document type
    const files = fs.readdirSync(seedDir);
    const matched = files.find((f) => f.toLowerCase() === baseName.toLowerCase() || baseName.toLowerCase().includes(f.toLowerCase()));
    if (matched) {
      return fs.readFileSync(path.join(seedDir, matched));
    }
    throw new Error(`Pristine PDF seed asset not found for "${fileNameOrPath}" in ${seedDir}`);
  }

  return fs.readFileSync(fullPath);
}
