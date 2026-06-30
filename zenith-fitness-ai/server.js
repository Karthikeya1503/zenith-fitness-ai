import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Pterodactyl automatically sets the SERVER_PORT environment variable
/* global process */
const port = process.env.SERVER_PORT || 3000;

// Serve the static files from the Vite build directory
app.use(express.static(path.join(__dirname, 'dist')));

// Send all other requests to index.html (for React Router)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`FitCoach AI is running on Port ${port}`);
});
