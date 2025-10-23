import { Hono } from 'hono';
import http from 'http';
import { PublicApiDefinition as SimplePublicApiDefinition, PrivateApiDefinition as SimplePrivateApiDefinition } from './simple/definitions';
import { CreateTypedHonoHandlerWithContext, RegisterHonoHandlers } from '../src';
import { createTypedHandler, EndpointMiddlewareCtx } from '../src/object-handlers';

const HONO_PORT = 3004;

async function startHonoServer() {
    console.log('Starting Hono server...');

    const app = new Hono();

    console.log('Registering handlers...');

    type Ctx = { foo: string, blah: () => string }

    const loggingMiddleware: EndpointMiddlewareCtx<Ctx> = (req, res, next, endpointInfo) => {
        req.ctx = { foo: 'foo', blah: () => { return '' } }
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Endpoint: ${endpointInfo.domain}.${endpointInfo.routeKey}`);
        next();
    };

    const registerWithContext = CreateTypedHonoHandlerWithContext<Ctx>()
    // Register public handlers using Hono
    registerWithContext(app, SimplePublicApiDefinition, {
        common: {
            ping: async (req, res) => {
                res.respond(200, "pong");
            }
        },
        status: {
            probe1: createTypedHandler(async (req, res) => {
                console.log('Handling probe1 request, query:', req.query, req.ctx!.foo);
                if (req.query.match) {
                    return res.respond(201, { status: true });
                }
                res.respond(200, "pong");
            }),
            probe2: async (req, res) => {
                console.log('Handling probe2 request');
                res.respond(200, "pong");
            }
        }
    }, [loggingMiddleware]);

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
        try {
            // Read the request body for non-GET/HEAD methods
            let body: ReadableStream | undefined;
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                body = new ReadableStream({
                    start(controller) {
                        controller.enqueue(buffer);
                        controller.close();
                    }
                });
            }

            const response = await server(new Request(`http://localhost:${HONO_PORT}${req.url}`, {
                method: req.method,
                headers: req.headers,
                body: body,
                duplex: body ? 'half' : undefined
            } as any));

            res.statusCode = response.status;
            for (const [key, value] of response.headers) {
                res.setHeader(key, value);
            }

            const responseBody = await response.text();
            res.end(responseBody);
        } catch (error) {
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
        process.exit(0);
    });
}

startHonoServer().catch(console.error);
