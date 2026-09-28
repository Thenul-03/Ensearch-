import { defineConfig } from '@prisma/config';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured');
}

let databaseUrlForLog: string;

try {
  const parsedDatabaseUrl = new URL(databaseUrl);
  databaseUrlForLog = `${parsedDatabaseUrl.protocol}//${parsedDatabaseUrl.hostname}${parsedDatabaseUrl.port ? `:${parsedDatabaseUrl.port}` : ''}${parsedDatabaseUrl.pathname}`;
} catch {
  databaseUrlForLog = '(configured; unable to parse safely)';
}

console.log('Using Database URL:', databaseUrlForLog);

export default defineConfig({
  datasource: {
    url: databaseUrl,
  },
});