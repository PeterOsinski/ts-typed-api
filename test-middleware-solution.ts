import express from 'express';
import { PrivateApiDefinition, PublicApiDefinition } from './examples/simple/definitions';
import { RegisterHandlers, SimpleMiddleware, UniversalEndpointMiddleware } from './src';

const app = express();

// Simple middleware without endpoint info - works with any API definition
const simpleAuthMiddleware: SimpleMiddleware = (req, res, next) => {
    console.log('Simple auth middleware - no endpoint info needed');
    next();
};

// Universal middleware that can work with any API definition
const universalLoggingMiddleware: UniversalEndpointMiddleware = (req, res, next, endpointInfo) => {
    console.log(`Universal middleware: ${endpointInfo.domain}.${endpointInfo.routeKey}`);
    next();
};

// Now you can use the same middleware with different API definitions
RegisterHandlers(app, PublicApiDefinition, {
    common: {
        ping: async (req, res) => {
            res.respond(200, "pong");
        }
    },
    status: {
        probe1: async (req, res) => {
            res.respond(200, "pong");
        },
        probe2: async (req, res) => {
            res.respond(200, "pong");
        }
    }
}, [simpleAuthMiddleware, universalLoggingMiddleware]);

RegisterHandlers(app, PrivateApiDefinition, {
    user: {
        get: async (req, res) => {
            res.respond(200, "ok");
        }
    }
}, [simpleAuthMiddleware, universalLoggingMiddleware]); // Same middleware works here too!

console.log('✅ Middleware solution works! You can now use middleware without generic type constraints.');
