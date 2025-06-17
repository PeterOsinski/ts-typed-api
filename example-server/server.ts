import express from 'express';
import { PublicApiDefinition } from './definitions';
import { registerHandlers } from '../src/router';
const app = express();
const port = 3001;
app.set('etag', false);
app.use(express.json()); // Middleware to parse JSON bodies

// Register all handlers at once
registerHandlers(app, PublicApiDefinition, {
    // Define handlers using the object-based approach
    // TypeScript will enforce that all required handlers are present
    common: {
        // TypeScript will give you type errors if this handler is missing
        ping: async (req, res) => {
            // req and res are fully typed based on the API definition
            console.log('Ping endpoint called');
            res.respond(200, "pong");
        }
    },
    status: {
        // TypeScript will give you type errors if these handlers are missing
        probe1: async (req, res) => {
            console.log('Probe1 endpoint called');
            res.respond(200, "pong");
        },
        probe2: async (req, res) => {
            console.log('Probe2 endpoint called');
            res.respond(200, "pong");
        }
    }
});
// Register all route handlers
// If example routes were also to be served, they'd need their own registration
// or a merged API definition strategy.
// registerRouteHandlers(app, PublicApiDefinition, PublicApiHandlers);

app.listen(port, async () => {
    console.log(`Backend server listening at http://localhost:${port}`);

    // await runClientExample()
});
