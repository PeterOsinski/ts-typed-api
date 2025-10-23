import { beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import { Server } from 'http';
import http from 'http';
import { Hono } from 'hono';
import { PublicApiDefinition as SimplePublicApiDefinition, PrivateApiDefinition as SimplePrivateApiDefinition } from '../examples/simple/definitions';
import { PublicApiDefinition as AdvancedPublicApiDefinition, PrivateApiDefinition as AdvancedPrivateApiDefinition } from '../examples/advanced/definitions';
import { RegisterHandlers, RegisterHonoHandlers, CreateApiDefinition, CreateResponses, CreateTypedHonoHandlerWithContext } from '../src';
import { z } from 'zod';
import { EndpointMiddlewareCtx } from '../src/object-handlers';

// Shared handler definitions for simple API
const simplePublicHandlers = {
    common: {
        ping: async (req: any, res: any) => {
            res.respond(200, "pong");
        }
    },
    status: {
        probe1: async (req: any, res: any) => {
            if (req.query.match) {
                return res.respond(201, { status: true });
            }
            res.respond(200, "pong");
        },
        probe2: async (req: any, res: any) => {
            res.respond(200, "pong");
        }
    }
};

const simplePrivateHandlers = {
    user: {
        get: async (req: any, res: any) => {
            res.respond(200, "ok");
        }
    }
};

// Initial mock data for advanced API
const initialMockUsers = [
    {
        id: '123e4567-e89b-12d3-a456-426614174000',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user' as const,
        createdAt: new Date('2023-01-01')
    }
];

const initialMockProducts = [
    {
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test Product',
        description: 'A test product',
        price: 99.99,
        category: 'electronics' as const
    }
];

// Shared mock data for advanced API (will be reset between tests)
let mockUsers = [...initialMockUsers];
let mockProducts = [...initialMockProducts];

// Reset function to restore initial state
export function resetMockData() {
    mockUsers = [...initialMockUsers];
    mockProducts = [...initialMockProducts];
}

// Shared handler definitions for advanced API
const advancedPublicHandlers = {
    auth: {
        login: async (req: any, res: any) => {
            if (req.body.username === 'testuser' && req.body.password === 'password') {
                res.respond(200, {
                    token: 'mock-jwt-token',
                    user: {
                        username: 'testuser',
                        email: 'test@example.com',
                        role: 'user' as const
                    }
                });
            } else {
                res.respond(401, { error: 'Invalid credentials' });
            }
        },
        logout: async (req: any, res: any) => {
            res.respond(200, { message: 'Logged out successfully' });
        }
    },
    products: {
        list: async (req: any, res: any) => {
            const { page = 1, limit = 10 } = req.query;
            res.respond(200, {
                products: mockProducts,
                total: mockProducts.length,
                page,
                totalPages: Math.ceil(mockProducts.length / limit)
            });
        }
    }
};

const advancedPrivateHandlers = {
    user: {
        get: async (req: any, res: any) => {
            const user = mockUsers.find(u => u.id === req.params.id);
            if (user) {
                res.respond(200, user);
            } else {
                res.respond(404, { error: 'User not found' });
            }
        },
        create: async (req: any, res: any) => {
            const newUser = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                ...req.body,
                createdAt: new Date()
            };
            mockUsers.push(newUser);
            res.respond(201, newUser);
        },
        update: async (req: any, res: any) => {
            const userIndex = mockUsers.findIndex(u => u.id === req.params.id);
            if (userIndex !== -1) {
                mockUsers[userIndex] = { ...mockUsers[userIndex], ...req.body };
                res.respond(200, mockUsers[userIndex]);
            } else {
                res.respond(404, { error: 'User not found' });
            }
        },
        delete: async (req: any, res: any) => {
            const userIndex = mockUsers.findIndex(u => u.id === req.params.id);
            if (userIndex !== -1) {
                mockUsers.splice(userIndex, 1);
                res.respond(204, null);
            } else {
                res.respond(404, { error: 'User not found' });
            }
        }
    },
    fileUpload: {
        upload: async (req: any, res: any) => {
            res.respond(200, {
                fileId: '123e4567-e89b-12d3-a456-426614174003',
                uploadUrl: 'https://example.com/upload/123'
            });
        }
    }
};

// Shared file upload API definition and handlers
const FileUploadApiDefinition = CreateApiDefinition({
    prefix: '/api',
    endpoints: {
        files: {
            uploadSingle: {
                path: '/upload/single',
                method: 'POST',
                body: z.object({
                    description: z.string().optional(),
                }),
                fileUpload: {
                    single: {
                        fieldName: 'file',
                        maxSize: 5 * 1024 * 1024,
                        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif']
                    }
                },
                responses: CreateResponses({
                    200: z.object({
                        message: z.string(),
                        fileInfo: z.object({
                            originalName: z.string(),
                            size: z.number(),
                            mimetype: z.string()
                        })
                    })
                })
            }
        }
    }
});

const fileUploadHandlers = {
    files: {
        uploadSingle: async (req: any, res: any) => {
            const file = req.file;
            if (file) {
                res.respond(200, {
                    message: 'File uploaded successfully',
                    fileInfo: {
                        originalName: file.originalname,
                        size: file.size,
                        mimetype: file.mimetype
                    }
                });
            } else {
                res.status(400).json({ error: 'No file uploaded' });
            }
        }
    }
};

export const MiddlewareTestApiDefinition = CreateApiDefinition({
    prefix: '/api/v1',
    endpoints: {
        public: {
            ping: {
                method: 'GET' as const,
                path: '/ping',
                responses: CreateResponses({
                    200: z.object({ message: z.string() })
                })
            },
            protected: {
                method: 'GET' as const,
                path: '/protected',
                responses: CreateResponses({
                    200: z.object({ message: z.string(), user: z.string() }),
                    401: z.object({ error: z.string() })
                })
            },
            context: {
                method: 'GET' as const,
                path: '/context',
                responses: CreateResponses({
                    200: z.object({ message: z.string(), contextData: z.string() })
                })
            }
        }
    }
});

// Global test server instances
export let simpleServer: Server;
export let advancedServer: Server;
export let fileUploadServer: Server;
export let honoServer: Server;
export let advancedHonoServer: Server;
export let fileUploadHonoServer: Server;
export let middlewareExpressServer: Server;
export let middlewareHonoServer: Server;

export const SIMPLE_PORT = 3001;
export const ADVANCED_PORT = 3002;
export const FILE_UPLOAD_PORT = 3003;
export const HONO_PORT = 3004;
export const ADVANCED_HONO_PORT = 3005;
export const FILE_UPLOAD_HONO_PORT = 3006;
export const MIDDLEWARE_EXPRESS_PORT = 3007;
export const MIDDLEWARE_HONO_PORT = 3008;

// Helper function to create HTTP server wrapper for Hono apps
function createHonoHttpServer(server: any, port: number, errorPrefix: string): Server {
    return http.createServer(async (req: any, res: any) => {
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

            const response = await server(new Request(`http://localhost:${port}${req.url}`, {
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
            console.error(`${errorPrefix} error:`, error);
            res.statusCode = 500;
            res.end('Internal Server Error');
        }
    });
}

beforeAll(async () => {
    // Start test servers
    await startSimpleServer();
    await startAdvancedServer();
    await startFileUploadServer();
    await startMiddlewareExpressServer();

    await startHonoServer();
    await startAdvancedHonoServer();
    await startFileUploadHonoServer();
    await startMiddlewareHonoServer();
});

afterAll(async () => {
    // Stop test servers
    if (simpleServer) {
        simpleServer.close();
    }
    if (advancedServer) {
        advancedServer.close();
    }
    if (fileUploadServer) {
        fileUploadServer.close();
    }
    if (honoServer) {
        honoServer.close();
    }
    if (advancedHonoServer) {
        advancedHonoServer.close();
    }
    if (fileUploadHonoServer) {
        fileUploadHonoServer.close();
    }
    if (middlewareExpressServer) {
        middlewareExpressServer.close();
    }
    if (middlewareHonoServer) {
        middlewareHonoServer.close();
    }
});

async function startSimpleServer(): Promise<void> {
    return new Promise((resolve) => {
        const app = express();
        app.use(express.json());

        // Register public handlers
        RegisterHandlers(app, SimplePublicApiDefinition, simplePublicHandlers);

        // Register private handlers
        RegisterHandlers(app, SimplePrivateApiDefinition, simplePrivateHandlers);

        simpleServer = app.listen(SIMPLE_PORT, () => {
            resolve();
        });
    });
}

async function startAdvancedServer(): Promise<void> {
    return new Promise((resolve) => {
        const app = express();
        app.use(express.json());

        // Register public handlers
        RegisterHandlers(app, AdvancedPublicApiDefinition, advancedPublicHandlers);

        // Register private handlers
        RegisterHandlers(app, AdvancedPrivateApiDefinition, advancedPrivateHandlers);

        advancedServer = app.listen(ADVANCED_PORT, () => {
            resolve();
        });
    });
}

async function startAdvancedHonoServer(): Promise<void> {
    return new Promise((resolve) => {
        const app = new Hono();

        // Register public handlers using Hono
        RegisterHonoHandlers(app, AdvancedPublicApiDefinition, advancedPublicHandlers);

        // Register private handlers using Hono
        RegisterHonoHandlers(app, AdvancedPrivateApiDefinition, advancedPrivateHandlers);

        // Create HTTP server from Hono app
        const server = app.fetch;

        // Create a simple HTTP server wrapper for Hono
        advancedHonoServer = createHonoHttpServer(server, ADVANCED_HONO_PORT, 'Advanced Hono server');

        advancedHonoServer.listen(ADVANCED_HONO_PORT, () => {
            resolve();
        });
    });
}

async function startFileUploadServer(): Promise<void> {
    return new Promise((resolve) => {
        const app = express();

        RegisterHandlers(app, FileUploadApiDefinition, fileUploadHandlers);

        fileUploadServer = app.listen(FILE_UPLOAD_PORT, () => {
            resolve();
        });
    });
}

async function startFileUploadHonoServer(): Promise<void> {
    return new Promise((resolve) => {
        const app = new Hono();

        // Register file upload handlers using Hono
        RegisterHonoHandlers(app, FileUploadApiDefinition, fileUploadHandlers);

        // Create HTTP server from Hono app
        const server = app.fetch;

        // Create a simple HTTP server wrapper for Hono
        fileUploadHonoServer = createHonoHttpServer(server, FILE_UPLOAD_HONO_PORT, 'File Upload Hono server');

        fileUploadHonoServer.listen(FILE_UPLOAD_HONO_PORT, () => {
            resolve();
        });
    });
}

async function startHonoServer(): Promise<void> {
    return new Promise((resolve) => {
        const app = new Hono();

        // Register public handlers using Hono
        RegisterHonoHandlers(app, SimplePublicApiDefinition, simplePublicHandlers);

        // Register private handlers using Hono
        RegisterHonoHandlers(app, SimplePrivateApiDefinition, simplePrivateHandlers);

        // Create HTTP server from Hono app
        const server = app.fetch;

        // Create a simple HTTP server wrapper for Hono
        honoServer = createHonoHttpServer(server, HONO_PORT, 'Hono server');

        honoServer.listen(HONO_PORT, () => {
            resolve();
        });
    });
}

type Ctx = { user: string }

// Middleware test servers
async function startMiddlewareExpressServer(): Promise<void> {
    return new Promise((resolve) => {
        const app = express();
        app.use(express.json());

        // Define middleware functions
        const loggingMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction, endpointInfo: any) => {
            console.log(`[Test] ${req.method} ${req.path} - Domain: ${endpointInfo.domain}, Route: ${endpointInfo.routeKey}`);
            next();
        };

        const contextMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
            (req as any).ctx = { middlewareData: "middleware-added-data" };
            next();
        };

        const authMiddleware: EndpointMiddlewareCtx<Ctx> = (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (authHeader === 'Bearer valid-token') {
                req.ctx = { user: 'testuser' };
            }
            next();
        };

        // Register handlers with middleware
        RegisterHandlers(app, MiddlewareTestApiDefinition, {
            public: {
                ping: async (req: any, res: any) => {
                    res.respond(200, { message: "pong" });
                },
                protected: async (req, res) => {
                    // Check if user is authenticated via context
                    if (req.ctx && req.ctx.user) {
                        res.respond(200, {
                            message: "protected content",
                            user: req.ctx.user
                        });
                    } else {
                        res.respond(401, { error: "No authorization header" });
                    }
                },
                context: async (req: any, res: any) => {
                    res.respond(200, {
                        message: "context test",
                        contextData: req.ctx?.middlewareData || "default"
                    });
                }
            }
        }, [
            loggingMiddleware,
            contextMiddleware,
            authMiddleware
        ]);

        middlewareExpressServer = app.listen(MIDDLEWARE_EXPRESS_PORT, () => {
            resolve();
        });
    });
}

async function startMiddlewareHonoServer(): Promise<void> {
    return new Promise((resolve) => {
        const app = new Hono();

        // Define middleware functions
        const loggingMiddleware = async (req: any, res: any, next: any, endpointInfo: any) => {
            console.log(`[Test Hono] ${req.method} ${req.path} - Domain: ${endpointInfo.domain}, Route: ${endpointInfo.routeKey}`);
            await next();
        };

        const contextMiddleware = async (req: any, res: any, next: any) => {
            req.ctx = { ...req.ctx, middlewareData: "middleware-added-data" };
            await next();
        };

        const authMiddleware: EndpointMiddlewareCtx<Ctx> = async (req, res, next) => {
            const authHeader = req.headers?.authorization;
            if (authHeader === 'Bearer valid-token') {
                req.ctx = { ...req.ctx, user: 'testuser' };
            }
            await next();
        };

        const hdnl = CreateTypedHonoHandlerWithContext<Ctx>()
        // Register handlers with middleware
        hdnl(app, MiddlewareTestApiDefinition, {
            public: {
                ping: async (req: any, res: any) => {
                    res.respond(200, { message: "pong" });
                },
                protected: async (req, res) => {
                    // Check if user is authenticated via context
                    if (req.ctx && req.ctx.user) {
                        res.respond(200, {
                            message: "protected content",
                            user: req.ctx.user
                        });
                    } else {
                        res.respond(401, { error: "No authorization header" });
                    }
                },
                context: async (req: any, res: any) => {
                    res.respond(200, {
                        message: "context test",
                        contextData: req.ctx?.middlewareData || "default"
                    });
                }
            }
        }, [
            loggingMiddleware,
            contextMiddleware,
            authMiddleware
        ]);

        // Create HTTP server from Hono app
        const server = app.fetch;

        // Create a simple HTTP server wrapper for Hono
        middlewareHonoServer = createHonoHttpServer(server, MIDDLEWARE_HONO_PORT, 'Middleware Hono server');

        middlewareHonoServer.listen(MIDDLEWARE_HONO_PORT, () => {
            resolve();
        });
    });
}
