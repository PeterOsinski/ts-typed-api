import { ZodTypeAny, ZodObject, ZodArray, ZodString, ZodNumber, ZodBoolean, ZodEnum, ZodOptional, ZodNullable, ZodUnion, ZodRecord, ZodLiteral, ZodVoid, ZodAny, ZodUnknown } from 'zod';
import { ApiDefinitionSchema, RouteSchema } from './definition';

// OpenAPI 3.0 specification types
export interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    paths: Record<string, PathItem>;
    components?: {
        schemas?: Record<string, SchemaObject>;
    };
}

export interface PathItem {
    get?: Operation;
    post?: Operation;
    put?: Operation;
    delete?: Operation;
    patch?: Operation;
    options?: Operation;
    head?: Operation;
}

export interface Operation {
    summary?: string;
    description?: string;
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses: Record<string, Response>;
    tags?: string[];
}

export interface Parameter {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    required?: boolean;
    description?: string;
    schema: SchemaObject;
}

export interface RequestBody {
    description?: string;
    required?: boolean;
    content: Record<string, MediaType>;
}

export interface Response {
    description: string;
    content?: Record<string, MediaType>;
}

export interface MediaType {
    schema: SchemaObject;
}

export interface SchemaObject {
    type?: string;
    format?: string;
    description?: string;
    enum?: any[];
    items?: SchemaObject;
    properties?: Record<string, SchemaObject>;
    required?: string[];
    additionalProperties?: boolean | SchemaObject;
    nullable?: boolean;
    oneOf?: SchemaObject[];
    anyOf?: SchemaObject[];
    allOf?: SchemaObject[];
    $ref?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
}

export interface OpenAPIOptions {
    info?: {
        title?: string;
        version?: string;
        description?: string;
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    anonymousTypes?: boolean;
}

// Type-safe helper functions for accessing Zod internal properties
function getZodDef(schema: ZodTypeAny): any {
    try {
        return (schema as any)._def;
    } catch {
        return undefined;
    }
}

function getZodInnerType(schema: ZodTypeAny): ZodTypeAny | undefined {
    try {
        const def = getZodDef(schema);
        return def?.innerType;
    } catch {
        return undefined;
    }
}

function getZodTypeName(schema: ZodTypeAny): string | undefined {
    try {
        const def = getZodDef(schema);
        return def?.typeName;
    } catch {
        return undefined;
    }
}

function getZodOptions(schema: ZodTypeAny): any[] | undefined {
    try {
        const def = getZodDef(schema);
        return Array.isArray(def?.options) ? def.options : undefined;
    } catch {
        return undefined;
    }
}

function getZodValues(schema: ZodTypeAny): any[] | undefined {
    try {
        const def = getZodDef(schema);
        // Handle Zod enum entries (both z.enum and z.nativeEnum)
        if (def?.entries && typeof def.entries === 'object') {
            return Object.values(def.entries);
        }
        // Fallback for other structures that might use values array
        return Array.isArray(def?.values) ? def.values : undefined;
    } catch {
        return undefined;
    }
}

function getZodValue(schema: ZodTypeAny): any {
    try {
        const def = getZodDef(schema);
        return def?.value;
    } catch {
        return undefined;
    }
}

function getZodType(schema: ZodTypeAny): ZodTypeAny | undefined {
    try {
        const def = getZodDef(schema);
        return def?.type;
    } catch {
        return undefined;
    }
}

function getZodValueType(schema: ZodTypeAny): ZodTypeAny | undefined {
    try {
        const def = getZodDef(schema);
        return def?.valueType;
    } catch {
        return undefined;
    }
}

function getZodShape(schema: ZodTypeAny): Record<string, ZodTypeAny> | undefined {
    try {
        const def = getZodDef(schema);
        return def?.shape && typeof def.shape === 'object' ? def.shape : undefined;
    } catch {
        return undefined;
    }
}

// Schema registry to avoid duplicate schema definitions
class SchemaRegistry {
    private schemas: Map<string, SchemaObject> = new Map();
    private schemaCounter = 0;

    register(zodSchema: ZodTypeAny, name?: string): string {
        const schemaObject = this.zodToOpenAPI(zodSchema);
        const schemaKey = name || this.generateSchemaName(schemaObject);

        if (!this.schemas.has(schemaKey)) {
            this.schemas.set(schemaKey, schemaObject);
        }

        return schemaKey;
    }

    getSchemas(): Record<string, SchemaObject> {
        return Object.fromEntries(this.schemas);
    }

    private generateSchemaName(schema: SchemaObject): string {
        if (schema.type === 'object' && schema.properties) {
            const keys = Object.keys(schema.properties).slice(0, 3).join('');
            return `Schema${keys}${this.schemaCounter++}`;
        }
        return `Schema${this.schemaCounter++}`;
    }

    zodToOpenAPI(zodSchema: ZodTypeAny, shouldRegister: boolean = false): SchemaObject {
        // Simplified approach - use try/catch and fallbacks for type detection
        try {
            // Handle ZodOptional
            if (zodSchema instanceof ZodOptional) {
                const innerType = getZodInnerType(zodSchema);
                if (innerType) {
                    return this.zodToOpenAPI(innerType, shouldRegister);
                }
            }

            // Handle ZodNullable
            if (zodSchema instanceof ZodNullable) {
                const innerType = getZodInnerType(zodSchema);
                if (innerType) {
                    const innerSchema = this.zodToOpenAPI(innerType, shouldRegister);
                    return { ...innerSchema, nullable: true };
                }
            }

            // Handle ZodUnion
            if (zodSchema instanceof ZodUnion) {
                const options = getZodOptions(zodSchema);
                if (options) {
                    return { oneOf: options.map((option: any) => this.zodToOpenAPI(option, shouldRegister)) };
                }
            }

            // Handle basic types with simple instanceof checks and fallbacks
            if (zodSchema instanceof ZodString) {
                return { type: 'string' };
            }

            if (zodSchema instanceof ZodNumber) {
                return { type: 'number' };
            }

            if (zodSchema instanceof ZodBoolean) {
                return { type: 'boolean' };
            }

            if (zodSchema instanceof ZodEnum) {
                const values = getZodValues(zodSchema);
                if (values && values.length > 0) {
                    return {
                        type: 'string',
                        enum: values
                    };
                }
                // If we can't extract enum values, fall back to a basic string type
                return { type: 'string' };
            }

            if (zodSchema instanceof ZodLiteral) {
                const value = getZodValue(zodSchema);
                return {
                    type: typeof value as any,
                    enum: [value]
                };
            }

            if (zodSchema instanceof ZodArray) {
                const itemType = getZodType(zodSchema);
                return {
                    type: 'array',
                    items: itemType ? this.zodToOpenAPI(itemType, shouldRegister) : { type: 'string' }
                };
            }

            if (zodSchema instanceof ZodObject) {
                const shape = getZodShape(zodSchema);
                if (shape) {
                    // For complex objects, register them as components if requested
                    if (shouldRegister && Object.keys(shape).length > 0) {
                        const schemaName = this.register(zodSchema);
                        return { $ref: `#/components/schemas/${schemaName}` };
                    }

                    const properties: Record<string, SchemaObject> = {};
                    const required: string[] = [];

                    for (const [key, value] of Object.entries(shape)) {
                        const zodValue = value as ZodTypeAny;
                        properties[key] = this.zodToOpenAPI(zodValue, false); // Don't register nested objects

                        // Check if field is required (not optional)
                        if (!(zodValue instanceof ZodOptional)) {
                            required.push(key);
                        }
                    }

                    const schema: SchemaObject = {
                        type: 'object',
                        properties,
                        additionalProperties: false
                    };

                    if (required.length > 0) {
                        schema.required = required;
                    }

                    return schema;
                }
            }

            if (zodSchema instanceof ZodRecord) {
                const valueType = getZodValueType(zodSchema);
                return {
                    type: 'object',
                    additionalProperties: valueType ? this.zodToOpenAPI(valueType, shouldRegister) : { type: 'string' }
                };
            }

            if (zodSchema instanceof ZodVoid) {
                return { type: 'null' };
            }

            if (zodSchema instanceof ZodAny || zodSchema instanceof ZodUnknown) {
                return {};
            }

            // Fallback based on constructor name
            const constructorName = zodSchema.constructor.name;
            switch (constructorName) {
                case 'ZodString':
                case 'String':
                    return { type: 'string' };
                case 'ZodNumber':
                case 'Number':
                    return { type: 'number' };
                case 'ZodBoolean':
                case 'Boolean':
                    return { type: 'boolean' };
                case 'ZodArray':
                case 'Array':
                    return { type: 'array', items: { type: 'string' } };
                case 'ZodObject':
                case 'Object':
                    return { type: 'object', additionalProperties: true };
                default: {
                    // Final fallback - try to infer from the schema structure
                    const typeName = getZodTypeName(zodSchema);
                    if (typeName) {
                        switch (typeName) {
                            case 'ZodString':
                                return { type: 'string' };
                            case 'ZodNumber':
                                return { type: 'number' };
                            case 'ZodBoolean':
                                return { type: 'boolean' };
                            case 'ZodArray':
                                return { type: 'array', items: { type: 'string' } };
                            case 'ZodObject':
                                return { type: 'object', additionalProperties: true };
                        }
                    }
                    return { type: 'string' }; // Ultimate fallback
                }
            }
        } catch (error) {
            // If anything fails, return a basic string type
            return { type: 'string' };
        }
    }
}

function convertPathToOpenAPI(path: string): string {
    // Convert Express-style path parameters (:param) to OpenAPI style ({param})
    return path.replace(/:([^/]+)/g, '{$1}');
}

function extractPathParameters(path: string): string[] {
    const matches = path.match(/:([^/]+)/g);
    return matches ? matches.map(match => match.substring(1)) : [];
}

function createParameters(
    pathParams: string[],
    paramsSchema?: ZodTypeAny,
    querySchema?: ZodTypeAny,
    registry?: SchemaRegistry
): Parameter[] {
    const parameters: Parameter[] = [];

    // Add path parameters
    if (pathParams.length > 0 && paramsSchema instanceof ZodObject && registry) {
        try {
            const shape = getZodShape(paramsSchema);
            if (shape) {
                for (const paramName of pathParams) {
                    const paramSchema = shape[paramName];
                    if (paramSchema) {
                        parameters.push({
                            name: paramName,
                            in: 'path',
                            required: true,
                            schema: registry.zodToOpenAPI(paramSchema)
                        });
                    }
                }
            }
        } catch (error) {
            // If shape parsing fails, add basic string parameters
            for (const paramName of pathParams) {
                parameters.push({
                    name: paramName,
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                });
            }
        }
    }

    // Add query parameters
    if (querySchema instanceof ZodObject && registry) {
        try {
            const shape = getZodShape(querySchema);
            if (shape) {
                for (const [queryName, queryZodSchema] of Object.entries(shape)) {
                    const zodValue = queryZodSchema as ZodTypeAny;
                    parameters.push({
                        name: queryName,
                        in: 'query',
                        required: !(zodValue instanceof ZodOptional),
                        schema: registry.zodToOpenAPI(zodValue)
                    });
                }
            }
        } catch (error) {
            // If shape parsing fails, skip query parameters
        }
    }

    return parameters;
}

function createRequestBody(bodySchema?: ZodTypeAny, registry?: SchemaRegistry, anonymousTypes: boolean = false): RequestBody | undefined {
    if (!bodySchema || !registry) {
        return undefined;
    }

    return {
        required: true,
        content: {
            'application/json': {
                schema: registry.zodToOpenAPI(bodySchema, !anonymousTypes) // Register complex schemas only if not using anonymous types
            }
        }
    };
}

function createResponses(responses: Record<number, ZodTypeAny>, registry: SchemaRegistry, anonymousTypes: boolean = false): Record<string, Response> {
    const openApiResponses: Record<string, Response> = {};

    for (const [statusCode, responseSchema] of Object.entries(responses)) {
        const status = statusCode.toString();

        // Handle void responses (like 204 No Content)
        if (responseSchema instanceof ZodVoid) {
            openApiResponses[status] = {
                description: getResponseDescription(parseInt(status))
            };
        } else {
            openApiResponses[status] = {
                description: getResponseDescription(parseInt(status)),
                content: {
                    'application/json': {
                        schema: registry.zodToOpenAPI(responseSchema, !anonymousTypes) // Register complex schemas only if not using anonymous types
                    }
                }
            };
        }
    }

    return openApiResponses;
}

function getResponseDescription(statusCode: number): string {
    const descriptions: Record<number, string> = {
        200: 'OK',
        201: 'Created',
        202: 'Accepted',
        204: 'No Content',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        500: 'Internal Server Error'
    };

    return descriptions[statusCode] || `HTTP ${statusCode}`;
}

function processRoute(
    route: RouteSchema,
    fullPath: string,
    registry: SchemaRegistry,
    domain: string,
    anonymousTypes: boolean = false
): Operation {
    const pathParams = extractPathParameters(route.path);
    const parameters = createParameters(pathParams, route.params, route.query, registry);
    const requestBody = createRequestBody(route.body, registry, anonymousTypes);
    const responses = createResponses(route.responses, registry, anonymousTypes);

    const operation: Operation = {
        summary: `${route.method} ${fullPath}`,
        description: `${route.method} operation for ${fullPath}`,
        responses,
        tags: [domain]
    };

    if (parameters.length > 0) {
        operation.parameters = parameters;
    }

    if (requestBody) {
        operation.requestBody = requestBody;
    }

    return operation;
}

function processApiDefinition(
    definition: ApiDefinitionSchema,
    registry: SchemaRegistry,
    anonymousTypes: boolean = false
): Record<string, PathItem> {
    const paths: Record<string, PathItem> = {};

    for (const [domain, routes] of Object.entries(definition.endpoints)) {
        for (const route of Object.values(routes)) {
            const fullPath = (definition.prefix || '') + route.path;
            const openApiPath = convertPathToOpenAPI(fullPath);

            if (!paths[openApiPath]) {
                paths[openApiPath] = {};
            }

            const operation = processRoute(route, fullPath, registry, domain, anonymousTypes);
            const method = route.method.toLowerCase() as keyof PathItem;

            (paths[openApiPath] as any)[method] = operation;
        }
    }

    return paths;
}

export function generateOpenApiSpec(
    definitions: ApiDefinitionSchema | ApiDefinitionSchema[],
    options: OpenAPIOptions = {}
): OpenAPISpec {
    const registry = new SchemaRegistry();
    const definitionsArray = Array.isArray(definitions) ? definitions : [definitions];
    const anonymousTypes = options.anonymousTypes || false;

    const allPaths: Record<string, PathItem> = {};

    // Process each definition
    for (const definition of definitionsArray) {
        const paths = processApiDefinition(definition, registry, anonymousTypes);

        // Merge paths, handling potential conflicts
        for (const [path, pathItem] of Object.entries(paths)) {
            if (allPaths[path]) {
                // Merge operations for the same path
                allPaths[path] = { ...allPaths[path], ...pathItem };
            } else {
                allPaths[path] = pathItem;
            }
        }
    }

    const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: {
            title: options.info?.title || 'API Documentation',
            version: options.info?.version || '1.0.0',
            description: options.info?.description || 'Generated API documentation'
        },
        paths: allPaths
    };

    // Add servers if provided
    if (options.servers && options.servers.length > 0) {
        spec.servers = options.servers;
    }

    // Add components with schemas if any were registered and not using anonymous types
    if (!anonymousTypes) {
        const schemas = registry.getSchemas();
        if (Object.keys(schemas).length > 0) {
            spec.components = {
                schemas
            };
        }
    }

    return spec;
}
