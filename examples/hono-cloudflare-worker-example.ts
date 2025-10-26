import { Hono } from 'hono';
import { RegisterHonoHandlers } from '../src';
import { PublicApiDefinition, PrivateApiDefinition } from './simple/definitions';

// Create Hono app for Cloudflare Workers
const app = new Hono();

// Example middlewares that receive endpoint information
const loggingMiddleware = async (req: any, res: any, next: any, endpointInfo: any) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Endpoint: ${endpointInfo.domain}.${endpointInfo.routeKey}`);
    await next();
};

const authMiddleware = async (req: any, res: any, next: any) => {
    // Example auth logic for Workers
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log(`Auth failed - No valid auth header`);
        return res.status(401).json({ error: [{ field: "authorization", type: "general", message: "Unauthorized" }] });
    }
    console.log(`Auth passed`);
    await next();
};

// Register public handlers (same as Express version)
RegisterHonoHandlers(app, PublicApiDefinition, {
    common: {
        ping: async (req, res) => {
            res.respond(200, "pong");
        }
    },
    status: {
        probe1: async (req, res) => {
            if (req.query.match) {
                return res.respond(201, { status: true });
            }
            res.respond(200, "pong");
        },
        probe2: async (req, res) => {
            res.respond(200, "pong");
        }
    }
}, [loggingMiddleware]);

// Register private handlers with auth
RegisterHonoHandlers(app, PrivateApiDefinition, {
    user: {
        get: async (req, res) => {
            console.log('Fetching user', req.params.id);
            res.respond(200, "ok");
        }
    }
}, [loggingMiddleware, authMiddleware]);

// Export for Cloudflare Workers
export default app;

// For local development/testing (commented out for Workers compatibility)
// if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
//     console.log('Hono Cloudflare Worker example running locally');
//     console.log('Available routes:');
//     console.log('- GET /api/v1/public/ping');
//     console.log('- GET /api/v1/public/status/probe1');
//     console.log('- GET /api/v1/public/status/probe2');
//     console.log('- GET /api/v1/private/user/:id (requires Bearer token)');
// }
