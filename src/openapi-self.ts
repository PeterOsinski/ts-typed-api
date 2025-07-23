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
                const innerType = (zodSchema as any)._def?.innerType;
                if (innerType) {
                    return this.zodToOpenAPI(innerType, shouldRegister);
                }
            }

            // Handle ZodNullable
            if (zodSchema instanceof ZodNullable) {
                const innerType = (zodSchema as any)._def?.innerType;
                if (innerType) {
                    const innerSchema = this.zodToOpenAPI(innerType, shouldRegister);
                    return { ...innerSchema, nullable: true };
                }
            }

            // Handle ZodUnion
            if (zodSchema instanceof ZodUnion) {
                const options = (zodSchema as any)._def?.options;
                if (options && Array.isArray(options)) {
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
                const values = (zodSchema as any)._def?.values;
                return {
                    type: 'string',
                    enum: Array.isArray(values) ? values : []
                };
            }

            if (zodSchema instanceof ZodLiteral) {
                const value = (zodSchema as any)._def?.value;
                return {
                    type: typeof value as any,
                    enum: [value]
                };
            }

            if (zodSchema instanceof ZodArray) {
                const itemType = (zodSchema as any)._def?.type;
                return {
                    type: 'array',
                    items: itemType ? this.zodToOpenAPI(itemType, shouldRegister) : { type: 'string' }
                };
            }

            if (zodSchema instanceof ZodObject) {
                const shape = (zodSchema as any)._def?.shape;
                if (shape && typeof shape === 'object') {
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
                const valueType = (zodSchema as any)._def?.valueType;
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
                default:
                    // Final fallback - try to infer from the schema structure
                    const def = (zodSchema as any)._def;
                    if (def && def.typeName) {
                        switch (def.typeName) {
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
            const shape = (paramsSchema as any)._def?.shape;
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
            const shape = (querySchema as any)._def?.shape;
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

function createRequestBody(bodySchema?: ZodTypeAny, registry?: SchemaRegistry): RequestBody | undefined {
    if (!bodySchema || !registry) {
        return undefined;
    }

    return {
        required: true,
        content: {
            'application/json': {
                schema: registry.zodToOpenAPI(bodySchema, true) // Register complex schemas
            }
        }
    };
}

function createResponses(responses: Record<number, ZodTypeAny>, registry: SchemaRegistry): Record<string, Response> {
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
                        schema: registry.zodToOpenAPI(responseSchema, true) // Register complex schemas
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
    domain: string
): Operation {
    const pathParams = extractPathParameters(route.path);
    const parameters = createParameters(pathParams, route.params, route.query, registry);
    const requestBody = createRequestBody(route.body, registry);
    const responses = createResponses(route.responses, registry);

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
    registry: SchemaRegistry
): Record<string, PathItem> {
    const paths: Record<string, PathItem> = {};

    for (const [domain, routes] of Object.entries(definition.endpoints)) {
        for (const route of Object.values(routes)) {
            const fullPath = (definition.prefix || '') + route.path;
            const openApiPath = convertPathToOpenAPI(fullPath);

            if (!paths[openApiPath]) {
                paths[openApiPath] = {};
            }

            const operation = processRoute(route, fullPath, registry, domain);
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

    const allPaths: Record<string, PathItem> = {};

    // Process each definition
    for (const definition of definitionsArray) {
        const paths = processApiDefinition(definition, registry);

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

    // Add components with schemas if any were registered
    const schemas = registry.getSchemas();
    if (Object.keys(schemas).length > 0) {
        spec.components = {
            schemas
        };
    }

    return spec;
}
