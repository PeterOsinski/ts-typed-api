import { Hono, Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { ApiDefinitionSchema, RouteSchema, UnifiedError, FileUploadConfig } from './definition';
import { TypedRequest, TypedResponse } from './router';
import { SpecificRouteHandler } from './handler';
import { ObjectHandlers, AnyMiddleware, EndpointMiddleware, SimpleMiddleware } from './object-handlers';

// Hono-specific file type for Cloudflare Workers
export type HonoFile = File;

// Hono-compatible file schema for Workers environment
export const honoFileSchema = z.object({
    fieldname: z.string(),
    originalname: z.string(),
    encoding: z.string(),
    mimetype: z.string(),
    size: z.number(),
    buffer: z.instanceof(Uint8Array).optional(), // Workers use Uint8Array instead of Buffer
    file: z.instanceof(File).optional(), // Direct File object access
    destination: z.string().optional(),
    filename: z.string().optional(),
    path: z.string().optional(),
    stream: z.any().optional(),
});

export type HonoFileType = z.infer<typeof honoFileSchema>;

// Typed Hono Context that matches our Express-like API
export type HonoTypedContext<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteKey extends keyof TDef['endpoints'][TDomain]
> = Context & {
    // Add typed request properties
    params: TypedRequest<TDef, TDomain, TRouteKey>['params'];
    query: TypedRequest<TDef, TDomain, TRouteKey>['query'];
    body: TypedRequest<TDef, TDomain, TRouteKey>['body'];
    file?: HonoFile;
    files?: HonoFile[] | { [fieldname: string]: HonoFile[] };

    // Add typed response method
    respond: TypedResponse<TDef, TDomain, TRouteKey>['respond'];
};

// Helper function to preprocess query parameters for type coercion
function preprocessQueryParams(query: any, querySchema?: z.ZodTypeAny): any {
    if (!querySchema || !query) return query;

    const processedQuery = { ...query };

    if (querySchema instanceof z.ZodObject) {
        const shape = querySchema.shape;

        for (const [key, value] of Object.entries(processedQuery)) {
            if (typeof value === 'string' && shape[key]) {
                const fieldSchema = shape[key];

                let innerSchema = fieldSchema;
                if (fieldSchema instanceof z.ZodOptional) {
                    innerSchema = fieldSchema._def.innerType;
                }
                if (fieldSchema instanceof z.ZodDefault) {
                    innerSchema = fieldSchema._def.innerType;
                }

                while (innerSchema instanceof z.ZodOptional || innerSchema instanceof z.ZodDefault) {
                    if (innerSchema instanceof z.ZodOptional) {
                        innerSchema = innerSchema._def.innerType;
                    } else if (innerSchema instanceof z.ZodDefault) {
                        innerSchema = innerSchema._def.innerType;
                    }
                }

                if (innerSchema instanceof z.ZodNumber) {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        processedQuery[key] = numValue;
                    }
                } else if (innerSchema instanceof z.ZodBoolean) {
                    if (value === 'true') {
                        processedQuery[key] = true;
                    } else if (value === 'false') {
                        processedQuery[key] = false;
                    }
                }
            }
        }
    }

    return processedQuery;
}

// Helper function to create file upload middleware for Hono/Workers
function createHonoFileUploadMiddleware(config: FileUploadConfig): MiddlewareHandler {
    return async (c: any, next: any) => {
        try {
            if (config.single) {
                const formData = await c.req.parseBody({ all: false });
                const file = formData[config.single.fieldName];

                if (file instanceof File) {
                    // Validate file
                    if (config.single.maxSize && file.size > config.single.maxSize) {
                        return c.json({
                            data: null,
                            error: [{ field: 'file', message: `File size exceeds ${config.single.maxSize} bytes`, type: 'body' }]
                        }, 422);
                    }

                    if (config.single.allowedMimeTypes && !config.single.allowedMimeTypes.includes(file.type)) {
                        return c.json({
                            data: null,
                            error: [{ field: 'file', message: `File type ${file.type} not allowed`, type: 'body' }]
                        }, 422);
                    }

                    // Attach file to context
                    (c as any).file = {
                        fieldname: config.single.fieldName,
                        originalname: file.name,
                        encoding: '7bit',
                        mimetype: file.type,
                        size: file.size,
                        buffer: new Uint8Array(await file.arrayBuffer()),
                        file: file
                    };
                }
            } else if (config.array) {
                const formData = await c.req.parseBody({ all: true });
                const files = formData[config.array.fieldName];

                if (Array.isArray(files)) {
                    // Validate files
                    if (config.array.maxCount && files.length > config.array.maxCount) {
                        return c.json({
                            data: null,
                            error: [{ field: 'file', message: `Maximum ${config.array.maxCount} files allowed`, type: 'body' }]
                        }, 422);
                    }

                    const processedFiles = [];
                    for (const file of files) {
                        if (file instanceof File) {
                            if (config.array.maxSize && file.size > config.array.maxSize) {
                                return c.json({
                                    data: null,
                                    error: [{ field: 'file', message: `File size exceeds ${config.array.maxSize} bytes`, type: 'body' }]
                                }, 422);
                            }

                            if (config.array.allowedMimeTypes && !config.array.allowedMimeTypes.includes(file.type)) {
                                return c.json({
                                    data: null,
                                    error: [{ field: 'file', message: `File type ${file.type} not allowed`, type: 'body' }]
                                }, 422);
                            }

                            processedFiles.push({
                                fieldname: config.array.fieldName,
                                originalname: file.name,
                                encoding: '7bit',
                                mimetype: file.type,
                                size: file.size,
                                buffer: new Uint8Array(await file.arrayBuffer()),
                                file: file
                            });
                        }
                    }

                    (c as any).files = processedFiles;
                }
            } else if (config.fields) {
                const formData = await c.req.parseBody({ all: true });
                const filesMap: { [fieldname: string]: HonoFileType[] } = {};

                for (const fieldConfig of config.fields) {
                    const files = formData[fieldConfig.fieldName];
                    if (Array.isArray(files)) {
                        if (fieldConfig.maxCount && files.length > fieldConfig.maxCount) {
                            return c.json({
                                data: null,
                                error: [{ field: fieldConfig.fieldName, message: `Maximum ${fieldConfig.maxCount} files allowed`, type: 'body' }]
                            }, 422);
                        }

                        const processedFiles = [];
                        for (const file of files) {
                            if (file instanceof File) {
                                if (fieldConfig.maxSize && file.size > fieldConfig.maxSize) {
                                    return c.json({
                                        data: null,
                                        error: [{ field: fieldConfig.fieldName, message: `File size exceeds ${fieldConfig.maxSize} bytes`, type: 'body' }]
                                    }, 422);
                                }

                                if (fieldConfig.allowedMimeTypes && !fieldConfig.allowedMimeTypes.includes(file.type)) {
                                    return c.json({
                                        data: null,
                                        error: [{ field: fieldConfig.fieldName, message: `File type ${file.type} not allowed`, type: 'body' }]
                                    }, 422);
                                }

                                processedFiles.push({
                                    fieldname: fieldConfig.fieldName,
                                    originalname: file.name,
                                    encoding: '7bit',
                                    mimetype: file.type,
                                    size: file.size,
                                    buffer: new Uint8Array(await file.arrayBuffer()),
                                    file: file
                                });
                            }
                        }

                        filesMap[fieldConfig.fieldName] = processedFiles;
                    }
                }

                (c as any).files = filesMap;
            } else if (config.any) {
                const formData = await c.req.parseBody({ all: true });

                // Process all files
                const allFiles: HonoFileType[] = [];
                for (const [key, value] of Object.entries(formData)) {
                    if (value instanceof File) {
                        if (config.any.maxSize && value.size > config.any.maxSize) {
                            return c.json({
                                data: null,
                                error: [{ field: key, message: `File size exceeds ${config.any.maxSize} bytes`, type: 'body' }]
                            }, 422);
                        }

                        if (config.any.allowedMimeTypes && !config.any.allowedMimeTypes.includes(value.type)) {
                            return c.json({
                                data: null,
                                error: [{ field: key, message: `File type ${value.type} not allowed`, type: 'body' }]
                            }, 422);
                        }

                        allFiles.push({
                            fieldname: key,
                            originalname: value.name,
                            encoding: '7bit',
                            mimetype: value.type,
                            size: value.size,
                            buffer: new Uint8Array(await value.arrayBuffer()),
                            file: value
                        });
                    }
                }

                (c as any).files = allFiles;
            }

            await next();
        } catch (error) {
            console.error('File upload middleware error:', error);
            return c.json({
                data: null,
                error: [{ field: 'file', message: 'File upload processing failed', type: 'body' }]
            }, 422);
        }
    };
}

// Register route handlers with Hono, now generic over TDef
export function registerHonoRouteHandlers<TDef extends ApiDefinitionSchema>(
    app: Hono,
    apiDefinition: TDef,
    routeHandlers: Array<SpecificRouteHandler<TDef>>,
    middlewares?: EndpointMiddleware<TDef>[]
) {
    routeHandlers.forEach((specificHandlerIterationItem) => {
        const { domain, routeKey, handler } = specificHandlerIterationItem as any;

        const currentDomain = domain as string;
        const currentRouteKey = routeKey as string;

        const routeDefinition = apiDefinition.endpoints[currentDomain][currentRouteKey] as RouteSchema;

        if (!routeDefinition) {
            console.error(`Route definition not found for domain "${String(currentDomain)}" and routeKey "${String(currentRouteKey)}"`);
            return;
        }

        const { path, method } = routeDefinition;

        // Apply prefix from API definition if it exists
        const fullPath = apiDefinition.prefix
            ? `${apiDefinition.prefix.startsWith('/') ? apiDefinition.prefix : `/${apiDefinition.prefix}`}${path}`.replace(/\/+/g, '/')
            : path;

        const honoMiddleware = async (
            c: HonoTypedContext<TDef, typeof currentDomain, typeof currentRouteKey>
        ) => {
            try {
                // Parse and validate request
                const parsedParams = ('params' in routeDefinition && routeDefinition.params)
                    ? (routeDefinition.params as z.ZodTypeAny).parse(c.req.param())
                    : c.req.param();

                const preprocessedQuery = ('query' in routeDefinition && routeDefinition.query)
                    ? preprocessQueryParams(c.req.query(), routeDefinition.query as z.ZodTypeAny)
                    : c.req.query();

                const parsedQuery = ('query' in routeDefinition && routeDefinition.query)
                    ? (routeDefinition.query as z.ZodTypeAny).parse(preprocessedQuery)
                    : preprocessedQuery;

                let parsedBody: any = undefined;
                if (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') {
                    if ('body' in routeDefinition && routeDefinition.body) {
                        // For JSON requests
                        if (c.req.header('content-type')?.includes('application/json')) {
                            parsedBody = (routeDefinition.body as z.ZodTypeAny).parse(await c.req.json());
                        } else {
                            // For form data or other body types
                            parsedBody = (routeDefinition.body as z.ZodTypeAny).parse(await c.req.parseBody());
                        }
                    } else {
                        parsedBody = await c.req.parseBody();
                    }
                }

                // Attach parsed data to context
                (c as any).params = parsedParams;
                (c as any).query = parsedQuery;
                (c as any).body = parsedBody;

                // Add respond method to context
                (c as any).respond = (status: number, data: any) => {
                    const responseSchema = routeDefinition.responses[status];

                    if (!responseSchema) {
                        console.error(`No response schema defined for status ${status} in route ${String(currentDomain)}/${String(currentRouteKey)}`);
                        (c as any).__response = c.json({
                            data: null,
                            error: [{ field: "general", type: "general", message: "Internal server error: Undefined response schema for status." }]
                        }, 500);
                        return;
                    }

                    let responseBody: any;

                    if (status === 422) {
                        responseBody = {
                            data: null,
                            error: data
                        };
                    } else {
                        // Always use unified response format since CreateResponses wraps all schemas
                        responseBody = {
                            data: data,
                            error: null
                        };
                    }

                    const validationResult = responseSchema.safeParse(responseBody);

                    if (validationResult.success) {
                        (c as any).__response = c.json(validationResult.data, status as any);
                    } else {
                        console.error(
                            `FATAL: Constructed response body failed Zod validation for status ${status} in route ${String(currentDomain)}/${String(currentRouteKey)}.`,
                            validationResult.error.issues,
                            'Expected schema shape:', (responseSchema._def as any)?.shape,
                            'Provided data:', data,
                            'Constructed response body:', responseBody
                        );
                        (c as any).__response = c.json({
                            data: null,
                            error: [{ field: "general", type: "general", message: "Internal server error: Constructed response failed validation." }]
                        }, 500);
                    }
                };

                // Create Express-like req/res objects for handler compatibility
                const fakeReq = {
                    params: parsedParams,
                    query: parsedQuery,
                    body: parsedBody,
                    file: (c as any).file,
                    files: (c as any).files,
                    headers: c.req.header(),
                    ip: c.req.header('CF-Connecting-IP') || '127.0.0.1',
                    method: c.req.method,
                    path: c.req.path,
                    originalUrl: c.req.url
                } as TypedRequest<TDef, typeof currentDomain, typeof currentRouteKey>;

                const fakeRes = {
                    respond: (c as any).respond
                } as TypedResponse<TDef, typeof currentDomain, typeof currentRouteKey>;

                const specificHandlerFn = handler as (
                    req: TypedRequest<TDef, typeof currentDomain, typeof currentRouteKey>,
                    res: TypedResponse<TDef, typeof currentDomain, typeof currentRouteKey>
                ) => Promise<void> | void;

                await specificHandlerFn(fakeReq, fakeRes);

                // Return the response created by the handler
                if ((c as any).__response) {
                    return (c as any).__response;
                } else {
                    console.error('No response was set by the handler');
                    return c.json({
                        data: null,
                        error: [{ field: "general", type: "general", message: "Internal server error: No response set by handler." }]
                    }, 500);
                }

            } catch (error) {
                if (error instanceof z.ZodError) {
                    const mappedErrors: UnifiedError = error.issues.map(err => {
                        let errorType: 'param' | 'query' | 'body' | 'general' = 'general';
                        const pathZero = String(err.path[0]);
                        if (pathZero === 'params') errorType = 'param';
                        else if (pathZero === 'query') errorType = 'query';
                        else if (pathZero === 'body') errorType = 'body';

                        return {
                            field: err.path.join('.') || 'request',
                            message: err.message,
                            type: errorType,
                        };
                    });

                    const errorResponseBody = { data: null, error: mappedErrors };
                    const schema422 = routeDefinition.responses[422];

                    if (schema422) {
                        const validationResult = schema422.safeParse(errorResponseBody);
                        if (validationResult.success) {
                            return c.json(validationResult.data, 422);
                        } else {
                            console.error("FATAL: Constructed 422 error response failed its own schema validation.", validationResult.error.issues);
                            return c.json({ error: [{ field: "general", type: "general", message: "Internal server error constructing validation error response." }] }, 500);
                        }
                    } else {
                        console.error("Error: 422 schema not found for route, sending raw Zod errors.");
                        return c.json({ error: mappedErrors }, 422);
                    }
                } else if (error instanceof Error) {
                    console.error(`Error in ${method} ${path}:`, error.message);
                    return c.json({ error: [{ field: "general", type: "general", message: 'Internal server error' }] }, 500);
                } else {
                    console.error(`Unknown error in ${method} ${path}:`, error);
                    return c.json({ error: [{ field: "general", type: "general", message: 'An unknown error occurred' }] }, 500);
                }
            }
        };

        // Create middleware wrappers
        const middlewareWrappers: MiddlewareHandler[] = [];

        // Add file upload middleware if configured
        if (routeDefinition.fileUpload) {
            try {
                const fileUploadMiddleware = createHonoFileUploadMiddleware(routeDefinition.fileUpload);
                middlewareWrappers.push(fileUploadMiddleware);
            } catch (error) {
                console.error(`Error creating file upload middleware for ${currentDomain}.${currentRouteKey}:`, error);
                return;
            }
        }

        if (middlewares && middlewares.length > 0) {
            middlewares.forEach(middleware => {
                const wrappedMiddleware: MiddlewareHandler = async (c: any, next: any) => {
                    try {
                        await middleware(c.req as any, c.res as any, next, { domain: currentDomain, routeKey: currentRouteKey } as any);
                    } catch (error) {
                        console.error('Middleware error:', error);
                        return next();
                    }
                };
                middlewareWrappers.push(wrappedMiddleware);
            });
        }

        // Register route with middlewares
        const allHandlers = [...middlewareWrappers, honoMiddleware];

        // Register with Hono
        switch (method.toUpperCase()) {
            case 'GET': app.get(fullPath, ...(allHandlers as any)); break;
            case 'POST': app.post(fullPath, ...(allHandlers as any)); break;
            case 'PATCH': app.patch(fullPath, ...(allHandlers as any)); break;
            case 'PUT': app.put(fullPath, ...(allHandlers as any)); break;
            case 'DELETE': app.delete(fullPath, ...(allHandlers as any)); break;
            default:
                console.warn(`Unsupported HTTP method: ${method} for path ${fullPath}`);
        }
    });
}

// Transform object-based handlers to array format
function transformObjectHandlersToArray<TDef extends ApiDefinitionSchema>(
    objectHandlers: ObjectHandlers<TDef>
): Array<SpecificRouteHandler<TDef>> {
    const handlerArray: Array<SpecificRouteHandler<TDef>> = [];

    for (const domain in objectHandlers) {
        if (Object.prototype.hasOwnProperty.call(objectHandlers, domain)) {
            const domainHandlers = objectHandlers[domain];

            for (const routeKey in domainHandlers) {
                if (Object.prototype.hasOwnProperty.call(domainHandlers, routeKey)) {
                    const handler = domainHandlers[routeKey];

                    handlerArray.push({
                        domain,
                        routeKey,
                        handler
                    } as SpecificRouteHandler<TDef>);
                }
            }
        }
    }

    return handlerArray;
}

// Main utility function that registers object-based handlers with Hono
export function RegisterHonoHandlers<TDef extends ApiDefinitionSchema>(
    app: Hono,
    apiDefinition: TDef,
    objectHandlers: ObjectHandlers<TDef>,
    middlewares?: AnyMiddleware<TDef>[]
): void {
    const handlerArray = transformObjectHandlersToArray(objectHandlers);

    // Convert AnyMiddleware to EndpointMiddleware by checking function arity
    const endpointMiddlewares: EndpointMiddleware<TDef>[] = middlewares?.map(middleware => {
        if (middleware.length === 4) {
            return middleware as EndpointMiddleware<TDef>;
        } else {
            return ((req, res, next) => {
                return (middleware as SimpleMiddleware)(req, res, next);
            }) as EndpointMiddleware<TDef>;
        }
    }) || [];

    registerHonoRouteHandlers(app, apiDefinition, handlerArray, endpointMiddlewares);
}
