import { z, ZodTypeAny, ZodType } from 'zod';

// Marker class for raw TypeScript types
export class TsTypeMarker<T> {
    readonly _isTsTypeMarker = true;
    readonly _type!: T; // Phantom type, used for inference

    constructor() {
        // This constructor doesn't need to do anything with T at runtime.
        // T is purely a compile-time construct.
    }
}

// Helper function to create a TsTypeMarker instance
export function CustomResponse<T>() {
    return new TsTypeMarker<T>();
}

// Type for schema input, can be Zod schema or our TS type marker
type InputSchemaOrMarker = ZodTypeAny | TsTypeMarker<any>;

// Define the structure for error details
const errorDetailSchema = z.object({
    field: z.string(),
    type: z.enum(['body', 'query', 'param', 'general']), // 'general' for non-field specific errors
    message: z.string(),
});

// Define the schema for the error list
const unifiedErrorSchema = z.array(errorDetailSchema).nullable(); // Nullable if no errors
export type UnifiedError = z.infer<typeof unifiedErrorSchema>;

// Helper function to create the success-specific unified response schema
// This wraps the original data schema with a 'data' field and sets 'error' to null.
function createSuccessUnifiedResponseSchema<TData extends ZodTypeAny>(dataSchema: TData) {
    return z.object({
        data: dataSchema, // Data is present as per dataSchema (can be nullable if dataSchema itself is)
    });
}

// Schema for error responses (e.g., 422 Validation Error)
// Ensures 'data' is null and 'error' is populated.
const errorUnifiedResponseSchema = z.object({
    error: unifiedErrorSchema.refine(val => val !== null, { message: "Error list cannot be null for errorUnifiedResponseSchema" }), // Error list is mandatory
});

// Define allowed HTTP status codes
export const HttpSuccessCodes = [200, 201, 202, 204] as const;
export const HttpClientErrorCodes = [400, 401, 403, 404, 409] as const; // 422 is handled separately
export const HttpServerErrorCodes = [500] as const;

export type HttpSuccessStatusCode = typeof HttpSuccessCodes[number];
export type HttpClientErrorStatusCode = typeof HttpClientErrorCodes[number];
export type HttpServerErrorStatusCode = typeof HttpServerErrorCodes[number];

// Status codes that can be passed to createResponses (422 is added automatically by createResponses)
export type AllowedInputStatusCode = HttpSuccessStatusCode | HttpClientErrorStatusCode | HttpServerErrorStatusCode;

// All status codes that can appear in the 'responses' object of a route after createResponses
export type AllowedResponseStatusCode = AllowedInputStatusCode | 422;

// More precise return type for createResponses
// InputSchemas keys are now constrained to AllowedInputStatusCode
type CreateResponsesReturnType<InputSchemas extends Partial<Record<AllowedInputStatusCode, InputSchemaOrMarker>>> = {
    // For each status KStatus provided in InputSchemas (which are AllowedInputStatusCode),
    // the response schema wraps InputSchemas[KStatus] in a success structure.
    [KStatus in keyof InputSchemas]: InputSchemas[KStatus] extends TsTypeMarker<infer T>
    ? z.ZodObject<{ data: z.ZodType<T> }> // If TsTypeMarker<T>, data infers to T
    : InputSchemas[KStatus] extends ZodTypeAny
    ? z.ZodObject<{ data: InputSchemas[KStatus] }> // If ZodTypeAny, data infers to z.infer<InputSchemas[KStatus]>
    : never;
} & {
    // The 422 response is always the errorUnifiedResponseSchema.
    422: typeof errorUnifiedResponseSchema;
};

// Helper function to make Zod schemas strict (fail on unknown properties)
function makeSchemaStrict(schema: ZodTypeAny): ZodTypeAny {
    // Check if the schema has a .strict() method (ZodObject does)
    if ('strict' in schema && typeof schema.strict === 'function') {
        return schema.strict();
    }
    // For other schema types, return as-is
    return schema;
}

// Helper function to create response schemas with unified structure and default 422 error
// Schemas input is now constrained to use AllowedInputStatusCode as keys.
export function CreateResponses<TInputMap extends Partial<Record<AllowedInputStatusCode, InputSchemaOrMarker>>>(
    schemas: TInputMap
): CreateResponsesReturnType<TInputMap> {
    const builtResult: any = {}; // Using any for intermediate dynamic construction.

    for (const stringStatusKey in schemas) {
        if (Object.prototype.hasOwnProperty.call(schemas, stringStatusKey)) {
            const numericKey = parseInt(stringStatusKey) as Extract<keyof TInputMap, AllowedInputStatusCode>;
            const schemaOrMarker = schemas[numericKey];

            if (schemaOrMarker) { // Check if schemaOrMarker is defined (due to Partial)
                if (schemaOrMarker instanceof TsTypeMarker) {
                    // For TsTypeMarker, create a ZodObject with data typed as z.any() at runtime.
                    // The actual type T is carried by CreateResponsesReturnType for compile-time inference.
                    (builtResult as any)[numericKey] = z.object({
                        data: z.any(), // Runtime placeholder
                    }).strict(); // Make the wrapper object strict
                } else if (schemaOrMarker instanceof ZodType) { // It's a Zod schema
                    const strictSchema = makeSchemaStrict(schemaOrMarker);
                    (builtResult as any)[numericKey] = createSuccessUnifiedResponseSchema(strictSchema);
                } else {
                    const strictSchema = makeSchemaStrict(schemaOrMarker);
                    (builtResult as any)[numericKey] = createSuccessUnifiedResponseSchema(strictSchema);
                }
                // Note: If schemaOrMarker is something else, it would be a type error
                // based on InputSchemaOrMarker, or this runtime check would skip it.
            }
        }
    }
    // Always set/overwrite the 422 response to use errorUnifiedResponseSchema (already strict)
    (builtResult as any)[422] = errorUnifiedResponseSchema;

    // Cast to the more specific return type at the end.
    // This is safe if builtResult's structure matches CreateResponsesReturnType<TInputMap>.
    return builtResult as CreateResponsesReturnType<TInputMap>;
}

// File upload configuration interface
export interface FileUploadConfig {
    // Single file upload
    single?: {
        fieldName: string;
        maxSize?: number; // in bytes
        allowedMimeTypes?: string[];
    };
    // Multiple files upload (same field name)
    array?: {
        fieldName: string;
        maxCount?: number;
        maxSize?: number; // in bytes per file
        allowedMimeTypes?: string[];
    };
    // Multiple files upload (different field names)
    fields?: Array<{
        fieldName: string;
        maxCount?: number;
        maxSize?: number; // in bytes per file
        allowedMimeTypes?: string[];
    }>;
    // Any files upload
    any?: {
        maxSize?: number; // in bytes per file
        allowedMimeTypes?: string[];
    };
}

// HTTP methods that should not have a body
type MethodsWithoutBody = 'GET' | 'HEAD' | 'OPTIONS';

// HTTP methods that can have a body
type MethodsWithBody = 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// Type alias for all supported HTTP methods
export type HttpMethod = MethodsWithoutBody | MethodsWithBody;

// Route schema for methods that cannot have a body (GET, HEAD, OPTIONS)
type RouteWithoutBody = {
    method: MethodsWithoutBody;
    path: string;
    params?: ZodTypeAny;
    query?: ZodTypeAny;
    body?: never;           // Explicitly prevent body
    fileUpload?: never;     // Explicitly prevent file uploads
    responses: Record<number, ZodTypeAny>;
};

// Route schema for methods that can have a body (POST, PUT, DELETE, PATCH)
type RouteWithBody = {
    method: MethodsWithBody;
    path: string;
    params?: ZodTypeAny;
    query?: ZodTypeAny;
    body?: ZodTypeAny;      // Allow body
    fileUpload?: FileUploadConfig; // Allow file uploads
    responses: Record<number, ZodTypeAny>;
};

// Union type for all route schemas
export type RouteSchema = (RouteWithoutBody | RouteWithBody) & {
    description?: string;
};

// Define the structure for the entire API definition object
// Now includes an optional prefix and endpoints record
export type ApiDefinitionSchema<TEndpoints extends Record<string, Record<string, RouteSchema>> = Record<string, Record<string, RouteSchema>>> = {
    prefix?: string;
    sectionDescriptions?: Partial<Record<keyof TEndpoints, string>>;
    endpoints: TEndpoints;
};

// Helper function to ensure the definition conforms to ApiDefinitionSchema
// while preserving the literal types of the passed object.
// Also applies strict validation to all Zod schemas in the definition.
export function CreateApiDefinition<T extends ApiDefinitionSchema>(
    definition: T
): T {
    // Create a new definition object with strict schemas
    const strictDefinition = { ...definition };
    strictDefinition.endpoints = { ...definition.endpoints };

    // Apply strict validation to all route schemas
    for (const domainKey in definition.endpoints) {
        const domain = definition.endpoints[domainKey];
        strictDefinition.endpoints[domainKey] = { ...domain };

        for (const routeKey in domain) {
            const route = domain[routeKey];
            const strictRoute = { ...route };

            // Apply strict validation to params, query, and body schemas
            if (route.params) {
                strictRoute.params = makeSchemaStrict(route.params);
            }
            if (route.query) {
                strictRoute.query = makeSchemaStrict(route.query);
            }
            if (route.body) {
                strictRoute.body = makeSchemaStrict(route.body);
            }

            strictDefinition.endpoints[domainKey][routeKey] = strictRoute;
        }
    }

    return strictDefinition as T;
}

// Generate TypeScript types from the API definition

// Helper types for extracting information from the API definition
// TDef is the type of a specific API definition object (e.g., typeof routes)
// TDomain is a domain key within that API definition (e.g., 'users')
export type ApiRouteKey<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints']
> = keyof TDef['endpoints'][TDomain];

// TRouteName is a route key within the specified TDomain of TDef (e.g., 'getUserById')
export type ApiRoute<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteName extends ApiRouteKey<TDef, TDomain>
> = TDef['endpoints'][TDomain][TRouteName];

// Helper to extract data type from a unified response schema, handling potential null and void.
// Also handles cases where the schema itself is z.void() (e.g., for 204 No Content not using the unified wrapper).
// Renamed and Exported for use in frontend client
export type InferDataFromUnifiedResponse<S extends ZodTypeAny> =
    S extends z.ZodVoid ? void : // Handles top-level z.void() for 204s not using unified wrapper
    z.infer<S> extends { data: infer D } ? // Does inferred S have a 'data' prop?
    D extends null ? null : // If D (type of data field) is strictly null (e.g. from z.literal(null))
    D extends (infer ActualD | null) ? // Else if D is 'Type | null' (e.g. from .nullable())
    ActualD extends void ? void : // If non-null part (ActualD) is void
    ActualD // Return non-null part
    : D // Else (D is not nullable, e.g. z.string()), return D
    : never; // Fallback: S doesn't have a 'data' prop (shouldn't happen with createUnifiedResponseSchema or clientErrorResponseSchema)


// ApiResponse extracts the data type from the primary success response schema (200, 201, or 204).
// This type might be less central if the client uses a discriminated union based on status code.
export type ApiResponse<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteName extends ApiRouteKey<TDef, TDomain>
> = TDef['endpoints'][TDomain][TRouteName] extends { responses: infer R } // Check if 'responses' property exists
    ? R extends { 200: infer R200 extends ZodTypeAny } ? InferDataFromUnifiedResponse<R200>
    : R extends { 201: infer R201 extends ZodTypeAny } ? InferDataFromUnifiedResponse<R201>
    : R extends { 204: infer R204 extends ZodTypeAny } ? InferDataFromUnifiedResponse<R204> // Handles 204 with z.void() or other
    : any // Fallback if no 200/201/204 success code is found in responses
    : any; // Fallback if 'responses' property is not defined on the route

export type ApiBody<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteName extends ApiRouteKey<TDef, TDomain>
> = TDef['endpoints'][TDomain][TRouteName] extends { body: infer B extends z.ZodTypeAny }
    ? z.infer<B>
    : Record<string, any>;

export type ApiParams<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteName extends ApiRouteKey<TDef, TDomain>
> = TDef['endpoints'][TDomain][TRouteName] extends { params: infer P extends z.ZodTypeAny }
    ? z.infer<P>
    : Record<string, any>;

export type ApiQuery<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteName extends ApiRouteKey<TDef, TDomain>
> = TDef['endpoints'][TDomain][TRouteName] extends { query: infer Q extends z.ZodTypeAny }
    ? z.infer<Q>
    : Record<string, any>;

// --- Client-specific Input Types ---

// For client-side request body (data before Zod parsing/transformation on backend)
export type ApiClientBody<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteName extends ApiRouteKey<TDef, TDomain>
> = TDef['endpoints'][TDomain][TRouteName] extends { body: infer B extends ZodTypeAny }
    ? z.input<B> // Use z.input for the type expected by the client to send
    : undefined; // If no body schema, body is undefined for the client

// For client-side path parameters. Client typically sends strings or numbers.
// z.input will give the type before backend transformations.
export type ApiClientParams<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteName extends ApiRouteKey<TDef, TDomain>
> = TDef['endpoints'][TDomain][TRouteName] extends { params: infer P extends ZodTypeAny }
    ? z.input<P> // Use z.input for the type expected by the client to send
    : undefined;

// For client-side query parameters (data before Zod parsing/transformation on backend)
export type ApiClientQuery<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteName extends ApiRouteKey<TDef, TDomain>
> = TDef['endpoints'][TDomain][TRouteName] extends { query: infer Q extends ZodTypeAny }
    ? z.input<Q> // Use z.input for the type expected by the client to send
    : undefined;

// --- File Upload Validation Schemas ---

// Schema for validating uploaded files
// Compatible with both Node.js (Buffer) and browser (File/Blob) environments
export const fileSchema = z.object({
    fieldname: z.string(),
    originalname: z.string(),
    encoding: z.string(),
    mimetype: z.string(),
    size: z.number(),
    buffer: z.union([
        // Node.js environment
        typeof Buffer !== 'undefined' ? z.instanceof(Buffer) : z.never(),
        // Browser environment
        typeof File !== 'undefined' ? z.instanceof(File) : z.never(),
        typeof Blob !== 'undefined' ? z.instanceof(Blob) : z.never(),
    ]).optional(), // Make optional since not all environments will have all types
    destination: z.string().optional(),
    filename: z.string().optional(),
    path: z.string().optional(),
    stream: z.any().optional(),
});

export type FileType = z.infer<typeof fileSchema>;

// Helper function to create file validation schema with constraints
export function createFileValidationSchema(options?: {
    maxSize?: number;
    allowedMimeTypes?: string[];
    required?: boolean;
}) {
    let schema: z.ZodTypeAny = fileSchema;

    if (options?.maxSize) {
        schema = schema.refine(
            (file: any) => file.size <= options.maxSize!,
            { message: `File size must be less than ${options.maxSize} bytes` }
        );
    }

    if (options?.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
        schema = schema.refine(
            (file: any) => options.allowedMimeTypes!.includes(file.mimetype),
            { message: `File type must be one of: ${options.allowedMimeTypes.join(', ')}` }
        );
    }

    return options?.required === false ? schema.optional() : schema;
}

// Helper function to create array of files validation schema
export function createFilesArrayValidationSchema(options?: {
    maxCount?: number;
    maxSize?: number;
    allowedMimeTypes?: string[];
    required?: boolean;
}) {
    const singleFileSchema = createFileValidationSchema({
        maxSize: options?.maxSize,
        allowedMimeTypes: options?.allowedMimeTypes,
        required: true, // Individual files in array are required
    });

    let schema = z.array(singleFileSchema);

    if (options?.maxCount) {
        schema = schema.max(options.maxCount, `Maximum ${options.maxCount} files allowed`);
    }

    return options?.required === false ? schema.optional() : schema;
}
