// Hono-only exports - for Cloudflare Workers and other Hono environments
// Excludes Express dependencies like multer, busboy, etc.
export { CreateApiDefinition, CreateResponses } from './definition';
export { z as ZodSchema } from 'zod';
export { EndpointMiddleware } from './object-handlers'

// Hono adapter for Cloudflare Workers
export { RegisterHonoHandlers } from './hono-cloudflare-workers';

// Re-export types that are needed for Hono development
export type {
    ApiDefinitionSchema,
    RouteSchema,
    UnifiedError,
    FileUploadConfig,
    HttpSuccessStatusCode,
    HttpClientErrorStatusCode,
    HttpServerErrorStatusCode,
    AllowedInputStatusCode,
    AllowedResponseStatusCode
} from './definition';

// Hono-specific types
export type {
    HonoFile,
    HonoFileType,
    HonoTypedContext
} from './hono-cloudflare-workers';
