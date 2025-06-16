import { z } from 'zod';
import { createApiDefinition, createResponses } from '../src/router/definition';

export const PublicApiDefinition = createApiDefinition({
    prefix: '/api/v1',
    endpoints: {
        status: {
            probe1: {
                method: 'GET',
                path: '/status/probe1',
                responses: createResponses({
                    200: z.enum(["pong"]),
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
