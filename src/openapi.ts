import { ApiDefinitionSchema, RouteSchema } from './definition';
import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z, ZodTypeAny } from 'zod';

// Extend Zod with OpenAPI capabilities
extendZodWithOpenApi(z);

export function generateOpenApiSpec(
    definition: ApiDefinitionSchema,
    options: {
        info?: {
            title?: string;
            version?: string;
            description?: string;
        };
        servers?: { url: string, description?: string }[];
    } = {}
) {
    const registry = new OpenAPIRegistry();

    // Helper to convert Zod schema to OpenAPI schema component
    function registerSchema(name: string, schema: ZodTypeAny) {
        try {
            return registry.register(name, schema as any); // Cast to any to handle complex Zod types
        } catch (error) {
            console.warn(`Could not register schema ${name}: ${(error as Error).message}`);
            // Fallback or simplified schema if registration fails
            return registry.register(name, z.object({}).openapi({ description: `Schema for ${name} (fallback due to registration error)` }) as any);
        }
    }

    // Function to convert Zod schema to OpenAPI Parameter Object or Request Body Object
    function zodSchemaToOpenApiParameter(schema: ZodTypeAny | undefined, inType: 'query' | 'path' | 'header' | 'cookie') {
        if (!schema || !(schema instanceof z.ZodObject)) return []; // Ensure schema is a ZodObject
        const shape = schema.shape as Record<string, ZodTypeAny>;
        return Object.entries(shape).map(([key, val]) => ({
            name: key,
            in: inType,
            required: !val.isOptional(),
            schema: registerSchema(`${inType}_${key}_${Date.now()}`, val), // Unique name for registration
            description: val.description,
        }));
    }

    function zodSchemaToOpenApiRequestBody(schema: ZodTypeAny | undefined) {
        if (!schema) return undefined;
        return {
            required: true, // Assuming body is required if schema is provided
            content: {
                'application/json': {
                    schema: registerSchema(`RequestBody_${Date.now()}`, schema), // Unique name
                },
            },
        };
    }

    // Iterate over the API definition to register routes
    Object.keys(definition.endpoints).forEach(domainNameKey => {
        // domainNameKey is a string, representing the domain like 'users', 'products'
        const domain = definition.endpoints[domainNameKey];
        Object.keys(domain).forEach(routeNameKey => {
            // routeNameKey is a string, representing the route name like 'getUser', 'createProduct'
            const route: RouteSchema = domain[routeNameKey];

            const parameters: any[] = [];
            if (route.params) {
                parameters.push(...zodSchemaToOpenApiParameter(route.params, 'path'));
            }
            if (route.query) {
                parameters.push(...zodSchemaToOpenApiParameter(route.query, 'query'));
            }

            const requestBody = zodSchemaToOpenApiRequestBody(route.body);

            const responses: any = {};
            for (const statusCode in route.responses) {
                const responseSchema = route.responses[parseInt(statusCode)];
                if (responseSchema) {
                    responses[statusCode] = {
                        description: `Response for status code ${statusCode}`,
                        content: {
                            'application/json': {
                                schema: registerSchema(`Response_${statusCode}_${routeNameKey}_${domainNameKey}`, responseSchema),
                            },
                        },
                    };
                }
            }

            // Add 422 response if not already defined, as it's a default in createResponses
            // Assuming route.responses[422] would exist if it's a standard part of the definition
            if (!responses['422'] && route.responses && route.responses[422]) {
                responses['422'] = {
                    description: 'Validation Error',
                    content: {
                        'application/json': {
                            schema: registerSchema(`Response_422_${routeNameKey}_${domainNameKey}`, route.responses[422]),
                        },
                    },
                };
            }


            const operation = {
                summary: `${domainNameKey} - ${routeNameKey}`, // Use keys directly for summary
                tags: [domainNameKey], // Use domainNameKey for tags
                parameters: parameters.length > 0 ? parameters : undefined,
                requestBody: requestBody,
                responses: responses,
            };

            // Register the route with the registry
            // The path needs to be transformed from Express-style (:param) to OpenAPI-style ({param})
            const openApiPath = route.path.replace(/:(\w+)/g, '{$1}');

            registry.registerPath({
                method: route.method.toLowerCase() as any, // Ensure method is lowercase
                path: openApiPath,
                ...operation,
                // Add description or other OpenAPI fields if available in RouteSchema
            });
        });
    });

    // Generate the OpenAPI document
    const generator = new OpenApiGeneratorV3(registry.definitions);
    const openApiDocument = generator.generateDocument({
        openapi: '3.0.0',
        info: {
            title: options.info?.title ?? 'My API',
            version: options.info?.version ?? '1.0.0',
            description: options.info?.description ?? 'Automatically generated OpenAPI specification',
        },
        servers: options.servers ?? [{ url: '/api' }], // Adjust as needed
    });

    return openApiDocument;
}
