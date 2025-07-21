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
const authMiddleware = async (req, res, next) => {
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
            res.respond(200, "pong");
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
