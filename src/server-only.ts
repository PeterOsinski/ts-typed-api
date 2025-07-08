// Server-only exports - includes server dependencies
export { RegisterHandlers, EndpointMiddleware } from './object-handlers';
export { File as UploadedFile } from './router';
export {
    createRouteHandler,
    makeRouteHandlerCreator
} from './router';

// Re-export types that are needed for server-side development
export type {
    TypedRequest,
    TypedResponse
} from './router';

export type {
    ObjectHandlers
} from './object-handlers';
