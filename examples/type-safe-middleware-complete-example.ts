import express from 'express';
import { z } from 'zod';
import { CreateApiDefinition, CreateResponses } from '../src';
import { registerRouteHandlers } from '../src/handler';
import type { EndpointMiddleware } from '../src/handler';

// Example API definition with 3 domains and 4 routes each
const ExampleApiDefinition = CreateApiDefinition({
    prefix: '/api/v1',
    endpoints: {
        // Domain 1: Users
        users: {
            list1: {
                method: 'GET',
                path: '/users',
                query: z.object({
                    page: z.number().optional(),
                    limit: z.number().optional()
                }),
                responses: CreateResponses({
                    200: z.array(z.object({
                        id: z.string(),
                        name: z.string(),
                        email: z.string()
                    }))
                })
            },
            get1: {
                method: 'GET',
                path: '/users/:id',
                params: z.object({
                    id: z.string()
                }),
                responses: CreateResponses({
                    200: z.object({
                        id: z.string(),
                        name: z.string(),
                        email: z.string()
                    })
                })
            },
            create1: {
                method: 'POST',
                path: '/users',
                body: z.object({
                    name: z.string(),
                    email: z.string()
                }),
                responses: CreateResponses({
                    201: z.object({
                        id: z.string(),
                        name: z.string(),
                        email: z.string()
                    })
                })
            },
            update1: {
                method: 'PUT',
                path: '/users/:id',
                params: z.object({
                    id: z.string()
                }),
                body: z.object({
                    name: z.string().optional(),
                    email: z.string().optional()
                }),
                responses: CreateResponses({
                    200: z.object({
                        id: z.string(),
                        name: z.string(),
                        email: z.string()
                    })
                })
            }
        },
        // Domain 2: Posts
        posts: {
            list2: {
                method: 'GET',
                path: '/posts',
                query: z.object({
                    authorId: z.string().optional(),
                    published: z.boolean().optional()
                }),
                responses: CreateResponses({
                    200: z.array(z.object({
                        id: z.string(),
                        title: z.string(),
                        content: z.string(),
                        authorId: z.string()
                    }))
                })
            },
            get2: {
                method: 'GET',
                path: '/posts/:id',
                params: z.object({
                    id: z.string()
                }),
                responses: CreateResponses({
                    200: z.object({
                        id: z.string(),
                        title: z.string(),
                        content: z.string(),
                        authorId: z.string()
                    })
                })
            },
            create2: {
                method: 'POST',
                path: '/posts',
                body: z.object({
                    title: z.string(),
                    content: z.string(),
                    authorId: z.string()
                }),
                responses: CreateResponses({
                    201: z.object({
                        id: z.string(),
                        title: z.string(),
                        content: z.string(),
                        authorId: z.string()
                    })
                })
            },
            delete2: {
                method: 'DELETE',
                path: '/posts/:id',
                params: z.object({
                    id: z.string()
                }),
                responses: CreateResponses({
                    204: z.void()
                })
            }
        },
        // Domain 3: Comments
        comments: {
            list: {
                method: 'GET',
                path: '/comments',
                query: z.object({
                    postId: z.string().optional(),
                    authorId: z.string().optional()
                }),
                responses: CreateResponses({
                    200: z.array(z.object({
                        id: z.string(),
                        content: z.string(),
                        postId: z.string(),
                        authorId: z.string()
                    }))
                })
            },
            get: {
                method: 'GET',
                path: '/comments/:id',
                params: z.object({
                    id: z.string()
                }),
                responses: CreateResponses({
                    200: z.object({
                        id: z.string(),
                        content: z.string(),
                        postId: z.string(),
                        authorId: z.string()
                    })
                })
            },
            create: {
                method: 'POST',
                path: '/comments',
                body: z.object({
                    content: z.string(),
                    postId: z.string(),
                    authorId: z.string()
                }),
                responses: CreateResponses({
                    201: z.object({
                        id: z.string(),
                        content: z.string(),
                        postId: z.string(),
                        authorId: z.string()
                    })
                })
            },
            update: {
                method: 'PUT',
                path: '/comments/:id',
                params: z.object({
                    id: z.string()
                }),
                body: z.object({
                    content: z.string()
                }),
                responses: CreateResponses({
                    200: z.object({
                        id: z.string(),
                        content: z.string(),
                        postId: z.string(),
                        authorId: z.string()
                    })
                })
            }
        }
    }
});

// Type alias for our specific API definition
type MyApiDefinition = typeof ExampleApiDefinition;

// Example middleware with full type safety and autocomplete
const loggingMiddleware: EndpointMiddleware<MyApiDefinition> = (req, res, next, endpointInfo) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log(`Domain: ${endpointInfo.domain}, Route: ${endpointInfo.routeKey}`);

    // Type-safe conditional logic based on domain and route
    // When you type endpointInfo.domain === 'users', TypeScript will know that
    // endpointInfo.routeKey can only be: "list" | "get" | "create" | "update"
    if (endpointInfo.domain === 'users') {
        // endpointInfo.routeKey will have autocomplete for: "list" | "get" | "create" | "update"
        if (endpointInfo.routeKey === 'create1') {
            console.log('Creating a new user');
        } else if (endpointInfo.routeKey === 'list1') {
            console.log('Listing users');
        } else if (endpointInfo.routeKey === 'get1') {
            console.log('Getting a specific user');
        } else if (endpointInfo.routeKey === 'update1') {
            console.log('Updating a user');
        }
        // TypeScript will provide autocomplete for all user routes
    } else if (endpointInfo.domain === 'posts') {
        // endpointInfo.routeKey will have autocomplete for: "list" | "get" | "create" | "delete"
        if (endpointInfo.routeKey === 'delete2') {
            console.log('Deleting a post');
        } else if (endpointInfo.routeKey === 'create2') {
            console.log('Creating a new post');
        } else if (endpointInfo.routeKey === 'list2') {
            console.log('Listing posts');
        } else if (endpointInfo.routeKey === 'get2') {
            console.log('Getting a specific post');
        }
        // TypeScript will provide autocomplete for all post routes
    } else if (endpointInfo.domain === 'comments') {
        // endpointInfo.routeKey will have autocomplete for: "list" | "get" | "create" | "update"
        if (endpointInfo.routeKey === 'update') {
            console.log('Updating a comment');
        } else if (endpointInfo.routeKey === 'create') {
            console.log('Creating a new comment');
        } else if (endpointInfo.routeKey === 'list') {
            console.log('Listing comments');
        } else if (endpointInfo.routeKey === 'get') {
            console.log('Getting a specific comment');
        }
        // TypeScript will provide autocomplete for all comment routes
    }

    next();
};


// Example usage in server setup:
const app = express();
app.use(express.json());

// Mock route handlers (you would implement these properly)
const mockRouteHandlers = [
    // Users domain handlers would go here
    // Posts domain handlers would go here  
    // Comments domain handlers would go here
];

// Register routes with type-safe middlewares
// The middlewares array is now type-safe and provides autocomplete
registerRouteHandlers(
    app,
    ExampleApiDefinition,
    mockRouteHandlers,
    [loggingMiddleware] // All middlewares are type-safe
);
