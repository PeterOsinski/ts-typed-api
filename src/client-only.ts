// Client-only exports - no server dependencies
export { ApiClient, FetchHttpClientAdapter } from './client';
export { CreateApiDefinition, CreateResponses } from './definition';
export { z as ZodSchema } from 'zod';

// Re-export types that are safe for client use
export type {
    ApiDefinitionSchema,
    RouteSchema,
    UnifiedError,
    InferDataFromUnifiedResponse,
    ApiClientParams,
    ApiClientQuery,
    ApiClientBody,
    ApiResponse,
    ApiBody,
    ApiParams,
    ApiQuery,
    FileType,
    HttpSuccessStatusCode,
    HttpClientErrorStatusCode,
    HttpServerErrorStatusCode,
    AllowedInputStatusCode,
    AllowedResponseStatusCode
} from './definition';

export type {
    HttpRequestOptions,
    HttpResponse,
    HttpClientAdapter,
    ApiCallResult,
    CallApiOptions
} from './client';
