import express from 'express';
import { PrivateApiDefinition, PublicApiDefinition } from './definitions';
import { RegisterHandlers, EndpointMiddleware } from '../../src';
const app = express();
const port = 3001;
app.set('etag', false);
app.use(express.json()); // Middleware to parse JSON bodies

// Example middlewares that receive endpoint information
const loggingMiddleware: EndpointMiddleware = (req, res, next, endpointInfo) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Endpoint: ${endpointInfo.domain}.${endpointInfo.routeKey}`);
    next();
};

const loggingMiddlewareTyped: EndpointMiddleware<typeof PrivateApiDefinition> = (req, res, next, endpointInfo) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Endpoint: ${endpointInfo.domain}.${endpointInfo.routeKey}`);
    next();
};

// Universal auth middleware that doesn't use endpointInfo
const authMiddleware: EndpointMiddleware = async (req, res, next) => {
    // Example auth logic
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log(`Auth failed - No valid auth header`);
        res.status(401).json({ error: [{ field: "authorization", type: "general", message: "Unauthorized" }] });
        return;
    }
    console.log(`Auth passed`);
    next();
};


// Register all handlers at once with middlewares
RegisterHandlers(app, PublicApiDefinition, {
    // Define handlers using the object-based approach
    // TypeScript will enforce that all required handlers are present
    common: {
        // TypeScript will give you type errors if this handler is missing
        ping: async (req, res) => {
            // req and res are fully typed based on the API definition
            if (req.query.format === 'html') {
                res.respondContentType(200, "<h1>pong</h1>", "text/html");
            } else {
                res.respond(200, "pong");
            }
        },
        customHeaders: async (req, res) => {
            res.setHeader('x-custom-test', 'test-value');
            res.setHeader('x-another-header', 'another-value');
            res.respond(200, { message: "headers set" });
        },
        longpoll: async (req, res) => {
            const sequence = req.params.sequence;
            // Simulate long polling delay based on sequence
            const delay = sequence * 100; // 100ms per sequence number
            await new Promise(resolve => setTimeout(resolve, delay));
            res.respond(200, {
                sequence,
                data: `object ${sequence}`,
                timestamp: Date.now()
            });
        },
        stream: async (req, res) => {
            // Initialize SSE with proper headers
            res.startSSE();

            // Send SSE events with JSON data at intervals
            await res.streamSSE('update', { sequence: 1, data: 'object 1' });
            await new Promise(resolve => setTimeout(resolve, 100));

            await res.streamSSE('update', { sequence: 2, data: 'object 2' });
            await new Promise(resolve => setTimeout(resolve, 100));

            await res.streamSSE('update', { sequence: 3, data: 'object 3' });

            // Close the stream
            res.endStream();
        }
    },
    status: {
        // TypeScript will give you type errors if these handlers are missing
        probe1: async (req, res) => {
            if (req.query.match) {
                return res.respond(201, { status: true })
            }
            res.respond(200, "pong");
        },
        probe2: async (req, res) => {
            res.respond(200, "pong");
        }
    }
}, [loggingMiddleware]); // Pass middlewares as 4th argument

// Add another api definition
RegisterHandlers(app, PrivateApiDefinition, {
    user: {
        get: async (req, res) => {
            console.log('Fetching user', req.params.id);
            res.respond(200, "ok");
        }
    }
}, [loggingMiddlewareTyped, authMiddleware]);

app.listen(port, async () => {
    console.log(`Backend server listening at http://localhost:${port}`);

    // await runClientExample()
});
