import { z } from 'zod';
import { createApiDefinition, createResponses } from '../../src/router/definition';

export const PublicApiDefinition = createApiDefinition({
    prefix: '/api/v1/public',
    endpoints: {
        status: {
            probe1: {
                method: 'GET',
                path: '/status/probe1',
                query: z.object({
                    match: z.boolean()
                }),
                body: z.object({}),
                params: z.object({}),
                responses: createResponses({
                    200: z.enum(["pong"]),
                    201: z.object({
                        status: z.boolean()
                    })
                })
            },
            probe2: {
                method: 'GET',
                path: '/status/probe2',
                responses: createResponses({
                    200: z.enum(["pong"]),
                })
            },
        },
        common: {
            ping: {
                method: 'GET',
                path: '/ping',
                responses: createResponses({
                    200: z.enum(["pong"]),
                })
            },
        }
    }
})
export const PrivateApiDefinition = createApiDefinition({
    prefix: '/api/v1/private',
    endpoints: {
        user: {
            get: {
                method: 'GET',
                path: '/user/:id',
                params: z.object({
                    id: z.string()
                }),
                responses: createResponses({
                    200: z.enum(["ok"]),
                })
            },
        }
    }
})
