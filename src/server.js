import express from 'express';
import { collect } from './collector.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_request, response) => response.json({ status: 'ok' }));

app.get('/jobs', async (request, response, next) => {
  try {
    response.json(await collect(request.query));
  } catch (error) {
    next(error);
  }
});

app.post('/collect', async (request, response, next) => {
  try {
    response.json(await collect(request.body));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'COLLECT_FAILED', message: error.message });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`Job Collector listening on http://0.0.0.0:${port}`));
