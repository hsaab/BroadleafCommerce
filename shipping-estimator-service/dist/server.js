"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const http_1 = __importDefault(require("http"));
const estimator_1 = require("./estimator");
function sendJson(response, status, body) {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
}
async function collectBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}
function createServer() {
    return http_1.default.createServer(async (req, res) => {
        if (req.url === '/health' && req.method === 'GET') {
            sendJson(res, 200, { status: 'ok' });
            return;
        }
        if (req.url === '/estimate' && req.method === 'POST') {
            try {
                const rawBody = await collectBody(req);
                const parsed = rawBody ? JSON.parse(rawBody) : {};
                const validation = (0, estimator_1.validateEstimateRequest)(parsed);
                if (!validation.valid) {
                    sendJson(res, 400, { errors: validation.errors });
                    return;
                }
                const requestBody = validation.request;
                const response = (0, estimator_1.estimateShipping)(requestBody);
                sendJson(res, 200, response);
            }
            catch (error) {
                sendJson(res, 400, { errors: [error.message || 'Invalid request body'] });
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
//# sourceMappingURL=server.js.map