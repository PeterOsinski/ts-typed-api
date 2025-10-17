import { Hono } from 'hono';
import http from 'http';
import { PublicApiDefinition as SimplePublicApiDefinition, PrivateApiDefinition as SimplePrivateApiDefinition } from './examples/simple/definitions';
import { RegisterHonoHandlers } from './src';

const HONO_PORT = 3004;

async function startHonoServer() {
    console.log('Starting Hono server...');

    const app = new Hono();

    console.log('Registering handlers...');

    // Register public handlers using Hono
    RegisterHonoHandlers(app, SimplePublicApiDefinition, {
        common: {
            ping: async (req, res) => {
                console.log('Handling ping request');
                res.respond(200, "pong");
            }
        },
        status: {
            probe1: async (req, res) => {
                console.log('Handling probe1 request, query:', req.query);
                if (req.query.match) {
                    return res.respond(201, { status: true });
                }
                res.respond(200, "pong");
            },
            probe2: async (req, res) => {
                console.log('Handling probe2 request');
                res.respond(200, "pong");
            }
        }
    });

    // Register private handlers using Hono
    RegisterHonoHandlers(app, SimplePrivateApiDefinition, {
        user: {
            get: async (req, res) => {
                console.log('Handling user get request, params:', req.params);
                res.respond(200, "ok");
            }
        }
    });

    console.log('Creating HTTP server wrapper...');

    // Create HTTP server from Hono app
    const server = app.fetch;

    // Create a simple HTTP server wrapper for Hono
    const honoServer = http.createServer(async (req: any, res: any) => {
        console.log(`Incoming request: ${req.method} ${req.url}`);

        try {
            // Read the request body for non-GET/HEAD methods
            let body: ReadableStream | undefined;
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                console.log('Reading request body...');
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                console.log('Request body length:', buffer.length);
                body = new ReadableStream({
                    start(controller) {
                        controller.enqueue(buffer);
                        controller.close();
                    }
                });
            }

            console.log('Creating Web API Request...');
            const request = new Request(`http://localhost:${HONO_PORT}${req.url}`, {
                method: req.method,
                headers: req.headers,
                body: body
            });

            console.log('Calling Hono app.fetch...');
            const response = await server(request);

            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));

            res.statusCode = response.status;
            for (const [key, value] of response.headers) {
                res.setHeader(key, value);
            }

            const responseBody = await response.text();
            console.log('Response body:', responseBody);
            res.end(responseBody);
        } catch (error) {
            console.error('Hono server error:', error);
            res.statusCode = 500;
            res.end('Internal Server Error');
        }
    });

    console.log(`Starting server on port ${HONO_PORT}...`);
    honoServer.listen(HONO_PORT, () => {
        console.log(`Hono server listening on port ${HONO_PORT}`);
        console.log('Available endpoints:');
        console.log('  GET  /api/v1/public/ping');
        console.log('  GET  /api/v1/public/status/probe1');
        console.log('  GET  /api/v1/public/status/probe1?match=true');
        console.log('  GET  /api/v1/public/status/probe2');
        console.log('  GET  /api/v1/private/user/:id');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('Shutting down server...');
        honoServer.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
}

startHonoServer().catch(console.error);
