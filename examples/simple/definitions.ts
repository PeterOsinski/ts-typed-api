import { ZodSchema as z, CreateApiDefinition, CreateResponses } from '../../src';

export const PublicApiDefinition = CreateApiDefinition({
    prefix: '/api/v1/public',
    endpoints: {
        status: {
            probe1: {
                method: 'GET',
                path: '/status/probe1',
                query: z.object({
                    match: z.boolean()
                }),
                params: z.object({}),
                responses: CreateResponses({
                    200: z.enum(["pong"]),
                    201: z.object({
                        status: z.boolean()
                    })
                })
            },
            probe2: {
                method: 'GET',
                path: '/status/probe2',
                responses: CreateResponses({
                    200: z.enum(["pong"]),
                })
            },
        },
        common: {
            ping: {
                method: 'GET',
                path: '/ping',
                responses: CreateResponses({
                    200: z.enum(["pong"]),
                })
            },
        }
    }
})
export const PrivateApiDefinition = CreateApiDefinition({
    prefix: '/api/v1/private',
    endpoints: {
        user: {
            get: {
                method: 'GET',
                path: '/user/:id',
                params: z.object({
                    id: z.string()
                }),
                responses: CreateResponses({
                    200: z.enum(["ok"]),
                })
            },
        }
    }
})
