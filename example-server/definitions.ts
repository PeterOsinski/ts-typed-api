import { z } from 'zod';
import { createApiDefinition, createResponses } from '../src/router/definition';

export const PublicApiDefinition = createApiDefinition({
    api: {
        ping: {
            method: 'GET',
            path: '/ping',
            responses: createResponses({
                200: z.enum(["pong"]),
            })
        },
    }
}, '/api/public')
