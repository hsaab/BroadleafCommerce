import http from 'http';
import { AddressInfo } from 'net';
import { estimateShipping, validateEstimateRequest } from './estimator';
import { EstimateRequest } from './types';

function sendJson(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function collectBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.url === '/estimate' && req.method === 'POST') {
      try {
        const rawBody = await collectBody(req);
        const parsed = rawBody ? JSON.parse(rawBody) : {};
        const validation = validateEstimateRequest(parsed);
        if (!validation.valid) {
          sendJson(res, 400, { errors: validation.errors });
          return;
        }

        const requestBody = validation.request as EstimateRequest;
        const response = estimateShipping(requestBody);
        sendJson(res, 200, response);
      } catch (error) {
        sendJson(res, 400, { errors: [(error as Error).message || 'Invalid request body'] });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });
}

if (require.main === module) {
  const server = createServer();
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  server.listen(port, () => {
    console.log(`Shipping estimator service running on http://127.0.0.1:${port}`);
  });
}
