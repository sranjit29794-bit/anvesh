import path from 'path';
import fs from 'fs';

const envPath = path.resolve(__dirname, 'sdiil-backend/.env');
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import './sdiil-backend/src/scripts/test-role-fix.ts';
