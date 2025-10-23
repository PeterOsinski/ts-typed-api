// Hono-only exports - for Cloudflare Workers and other Hono environments
// Excludes Express dependencies like multer, busboy, etc.
import type { ApiDefinitionSchema } from './definition';
import type { TypedRequest, TypedResponse } from './router';

export { CreateApiDefinition, CreateResponses } from './definition';
export { z as ZodSchema } from 'zod';
export { EndpointMiddleware, EndpointMiddlewareCtx } from './object-handlers'

// Helper function to create typed handlers with proper type inference
// Defined locally to avoid Express dependencies in Hono-only bundle
export function createTypedHandler<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteKey extends keyof TDef['endpoints'][TDomain],
    Ctx extends Record<string, any> = Record<string, any>
>(
    handler: (
        req: TypedRequest<TDef, TDomain, TRouteKey, any, any, any, any, Ctx>,
        res: TypedResponse<TDef, TDomain, TRouteKey>
    ) => Promise<void> | void
) {
    return handler;
}

// Hono adapter for Cloudflare Workers
export { RegisterHonoHandlers, CreateTypedHonoHandlerWithContext } from './hono-cloudflare-workers';

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
