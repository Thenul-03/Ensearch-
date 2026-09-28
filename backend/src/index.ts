import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(currentDirectory, '../.env') });

const { default: syncRoutes } = await import('./routes/syncRoutes.js');
const { default: searchRoutes } = await import('./routes/searchRoutes.js');

const app = express();
app.use(express.json());
app.get('/', (_req, res) => {
  res.send('Ensearch Backend is running!');
});

app.use('/api', syncRoutes);
app.use('/api', searchRoutes);

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

app.listen(port, () => {
  console.log(`Ensearch backend running on http://localhost:${port}`);
});