import { z } from 'zod';
import { CreateApiDefinition, CreateResponses } from '../../src';

// User Schema for validation
const UserSchema = z.object({
    id: z.string().uuid(),
    username: z.string().min(3).max(50),
    email: z.string().email(),
    role: z.enum(['user', 'admin', 'moderator']),
    createdAt: z.date()
});

// Product Schema for validation
const ProductSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    price: z.number().positive(),
    category: z.enum(['electronics', 'clothing', 'books', 'other'])
});

export const PublicApiDefinition = CreateApiDefinition({
    prefix: '/api/v1/public',
    endpoints: {
        auth: {
            login: {
                method: 'POST',
                path: '/login',
                body: z.object({
                    username: z.string(),
                    password: z.string()
                }),
                responses: CreateResponses({
                    200: z.object({
                        token: z.string(),
                        user: UserSchema.omit({ id: true, createdAt: true })
                    }),
                    401: z.object({
                        error: z.string()
                    })
                })
            },
            logout: {
                method: 'POST',
                path: '/logout',
                responses: CreateResponses({
                    200: z.object({
                        message: z.string()
                    })
                })
            }
        },
        products: {
            list: {
                method: 'GET',
                path: '/products',
                query: z.object({
                    page: z.number().int().min(1).optional().default(1),
                    limit: z.number().int().min(1).max(100).optional().default(10),
                    category: z.enum(['electronics', 'clothing', 'books', 'other']).optional(),
                    minPrice: z.number().positive().optional(),
                    maxPrice: z.number().positive().optional()
                }),
                responses: CreateResponses({
                    200: z.object({
                        products: z.array(ProductSchema),
                        total: z.number(),
                        page: z.number(),
                        totalPages: z.number()
                    })
                })
            }
        }
    }
});

export const PrivateApiDefinition = CreateApiDefinition({
    prefix: '/api/v1/private',
    endpoints: {
        user: {
            get: {
                method: 'GET',
                path: '/user/:id',
                params: z.object({
                    id: z.string().uuid()
                }),
                responses: CreateResponses({
                    200: UserSchema,
                    404: z.object({
                        error: z.string()
                    })
                })
            },
            create: {
                method: 'POST',
                path: '/user',
                body: UserSchema.omit({ id: true, createdAt: true }),
                responses: CreateResponses({
                    201: UserSchema,
                    400: z.object({
                        errors: z.array(z.object({
                            field: z.string(),
                            message: z.string()
                        }))
                    })
                })
            },
            update: {
                method: 'PUT',
                path: '/user/:id',
                params: z.object({
                    id: z.string().uuid()
                }),
                body: UserSchema.partial().omit({ id: true, createdAt: true }),
                responses: CreateResponses({
                    200: UserSchema,
                    404: z.object({
                        error: z.string()
                    })
                })
            },
            delete: {
                method: 'DELETE',
                path: '/user/:id',
                params: z.object({
                    id: z.string().uuid()
                }),
                responses: CreateResponses({
                    204: z.null(),
                    404: z.object({
                        error: z.string()
                    })
                })
            }
        },
        fileUpload: {
            upload: {
                method: 'POST',
                path: '/upload',
                body: z.object({
                    fileName: z.string(),
                    fileType: z.enum(['image', 'document', 'video']),
                    fileSize: z.number().max(10 * 1024 * 1024) // 10MB max
                }),
                responses: CreateResponses({
                    200: z.object({
                        fileId: z.string().uuid(),
                        uploadUrl: z.string().url()
                    }),
                    400: z.object({
                        error: z.string()
                    })
                })
            }
        }
    }
});
