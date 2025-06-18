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
    ? z.ZodObject<{ data: ZodType<T, z.ZodTypeDef, T> }> // If TsTypeMarker<T>, data infers to T
    : InputSchemas[KStatus] extends ZodTypeAny
    ? z.ZodObject<{ data: InputSchemas[KStatus] }> // If ZodTypeAny, data infers to z.infer<InputSchemas[KStatus]>
    : never;
} & {
    // The 422 response is always the errorUnifiedResponseSchema.
    422: typeof errorUnifiedResponseSchema;
};

// Helper function to create response schemas with unified structure and default 422 error
// Schemas input is now constrained to use AllowedInputStatusCode as keys.
export function createResponses<TInputMap extends Partial<Record<AllowedInputStatusCode, InputSchemaOrMarker>>>(
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
                    });
                } else if (schemaOrMarker instanceof ZodType) { // It's a Zod schema
                    (builtResult as any)[numericKey] = createSuccessUnifiedResponseSchema(schemaOrMarker);
                }
                // Note: If schemaOrMarker is something else, it would be a type error
                // based on InputSchemaOrMarker, or this runtime check would skip it.
            }
        }
    }
    // Always set/overwrite the 422 response to use errorUnifiedResponseSchema
    (builtResult as any)[422] = errorUnifiedResponseSchema;

    // Cast to the more specific return type at the end.
    // This is safe if builtResult's structure matches CreateResponsesReturnType<TInputMap>.
    return builtResult as CreateResponsesReturnType<TInputMap>;
}

// Define the structure for a single API route
export interface RouteSchema {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'; // Add more methods as needed
    params?: ZodTypeAny;
    query?: ZodTypeAny;
    body?: ZodTypeAny;
    responses: Record<number, ZodTypeAny>; // Maps HTTP status codes to Zod schemas
}

// Define the structure for the entire API definition object
// Now includes an optional prefix and endpoints record
export type ApiDefinitionSchema = {
    prefix?: string;
    endpoints: Record<string, Record<string, RouteSchema>>;
};

// Helper function to ensure the definition conforms to ApiDefinitionSchema
// while preserving the literal types of the passed object.
export function createApiDefinition<T extends ApiDefinitionSchema>(definition: T): T {
    return definition;
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
