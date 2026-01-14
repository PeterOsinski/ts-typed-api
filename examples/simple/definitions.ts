import { ZodSchema as z, CreateApiDefinition, CreateResponses } from '../../src';

export const PublicApiDefinition = CreateApiDefinition({
    prefix: '/api/v1/public',
    sectionDescriptions: {
        status: 'Health check and status endpoints',
        common: 'Common utility endpoints'
    },
    endpoints: {
        status: {
            probe1: {
                method: 'GET',
                path: '/status/probe1',
                description: 'Advanced health check with query parameters',
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
                description: 'Simple health check endpoint',
                responses: CreateResponses({
                    200: z.enum(["pong"]),
                })
            },
        },
        common: {
            ping: {
                method: 'GET',
                path: '/ping',
                description: 'Basic ping endpoint to check if the service is alive',
                query: z.object({
                    format: z.enum(["json", "html"]).optional()
                }),
                responses: CreateResponses({
                    200: z.enum(["pong"]),
                })
            },
            customHeaders: {
                method: 'GET',
                path: '/custom-headers',
                description: 'Returns information about custom headers',
                responses: CreateResponses({
                    200: z.object({
                        message: z.string()
                    }),
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
