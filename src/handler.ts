import { z } from "zod";
import { ApiDefinitionSchema, RouteSchema, UnifiedError, FileUploadConfig } from "./definition";
import { createRouteHandler, TypedRequest, TypedResponse } from "./router";
import { MiddlewareResponse } from "./object-handlers";
import express from "express";
import multer from "multer";

// A handler entry, now generic over TDef
export type SpecificRouteHandler<TDef extends ApiDefinitionSchema> = {
    // Pick a domain from TDef
    [TDomain_ in keyof TDef['endpoints']]: {
        // Pick a route key from that domain
        [TRouteKey_ in keyof TDef['endpoints'][TDomain_]]: ReturnType<typeof createRouteHandler<TDef, TDomain_, TRouteKey_>>;
    }[keyof TDef['endpoints'][TDomain_]]; // Get the union of all possible handler objects for TDomain_
}[keyof TDef['endpoints']]; // Get the union of all possible handler objects for TDef

// Type for middleware function that receives endpoint information with type safety
export type EndpointMiddleware<TDef extends ApiDefinitionSchema = ApiDefinitionSchema> = (
    req: express.Request,
    res: MiddlewareResponse,
    next: express.NextFunction,
    endpointInfo: {
        [TDomain in keyof TDef['endpoints']]: {
            domain: TDomain;
            routeKey: keyof TDef['endpoints'][TDomain];
        }
    }[keyof TDef['endpoints']]
) => void | Promise<void>;

// Helper function to preprocess parameters for type coercion
function preprocessParams(params: any, paramsSchema?: z.ZodTypeAny): any {
    if (!paramsSchema || !params) return params;

    // Create a copy to avoid mutating the original
    const processedParams = { ...params };

    // Get the shape of the schema if it's a ZodObject
    if (paramsSchema instanceof z.ZodObject) {
        const shape = paramsSchema.shape;

        for (const [key, value] of Object.entries(processedParams)) {
            if (typeof value === 'string' && shape[key]) {
                const fieldSchema = shape[key];

                // Handle ZodOptional and ZodDefault wrappers
                let innerSchema = fieldSchema;
                if (fieldSchema instanceof z.ZodOptional) {
                    innerSchema = fieldSchema._def.innerType;
                }
                if (fieldSchema instanceof z.ZodDefault) {
                    innerSchema = fieldSchema._def.innerType;
                }

                // Handle nested ZodOptional/ZodDefault combinations
                while (innerSchema instanceof z.ZodOptional || innerSchema instanceof z.ZodDefault) {
                    if (innerSchema instanceof z.ZodOptional) {
                        innerSchema = innerSchema._def.innerType;
                    } else if (innerSchema instanceof z.ZodDefault) {
                        innerSchema = innerSchema._def.innerType;
                    }
                }

                // Convert based on the inner schema type
                if (innerSchema instanceof z.ZodNumber) {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        processedParams[key] = numValue;
                    }
                } else if (innerSchema instanceof z.ZodBoolean) {
                    if (value === 'true') {
                        processedParams[key] = true;
                    } else if (value === 'false') {
                        processedParams[key] = false;
                    }
                }
            }
        }
    }

    return processedParams;
}

// Helper function to preprocess query parameters for type coercion
function preprocessQueryParams(query: any, querySchema?: z.ZodTypeAny): any {
    if (!querySchema || !query) return query;

    // Create a copy to avoid mutating the original
    const processedQuery = { ...query };

    // Get the shape of the schema if it's a ZodObject
    if (querySchema instanceof z.ZodObject) {
        const shape = querySchema.shape;

        for (const [key, value] of Object.entries(processedQuery)) {
            if (typeof value === 'string' && shape[key]) {
                const fieldSchema = shape[key];

                // Handle ZodOptional and ZodDefault wrappers
                let innerSchema = fieldSchema;
                if (fieldSchema instanceof z.ZodOptional) {
                    innerSchema = fieldSchema._def.innerType;
                }
                if (fieldSchema instanceof z.ZodDefault) {
                    innerSchema = fieldSchema._def.innerType;
                }

                // Handle nested ZodOptional/ZodDefault combinations
                while (innerSchema instanceof z.ZodOptional || innerSchema instanceof z.ZodDefault) {
                    if (innerSchema instanceof z.ZodOptional) {
                        innerSchema = innerSchema._def.innerType;
                    } else if (innerSchema instanceof z.ZodDefault) {
                        innerSchema = innerSchema._def.innerType;
                    }
                }

                // Convert based on the inner schema type
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

// Helper function to create respond method for middleware compatibility
function createRespondFunction(
    routeDefinition: RouteSchema,
    responseSetter: (status: number, data: any) => void,
    middlewareRes?: any
) {
    return (status: number, data: any) => {
        // Call any registered response callbacks
        if (middlewareRes && middlewareRes._responseCallbacks) {
            middlewareRes._responseCallbacks.forEach((callback: (status: number, data: any) => void) => {
                try {
                    callback(status, data);
                } catch (error) {
                    console.error('Error in response callback:', error);
                }
            });
        }

        const responseSchema = routeDefinition.responses[status];

        if (!responseSchema) {
            console.error(`No response schema defined for status ${status}`);
            responseSetter(500, {
                data: null,
                error: [{ field: "general", type: "general", message: "Internal server error: Undefined response schema for status." }]
            });
            return;
        }

        let responseBody: any;

        if (status === 422) {
            responseBody = {
                data: null,
                error: data
            };
        } else {
            responseBody = {
                data: data,
                error: null
            };
        }

        const validationResult = responseSchema.safeParse(responseBody);

        if (validationResult.success) {
            // Handle 204 responses specially - they must not have a body
            if (status === 204) {
                responseSetter(status, null);
            } else {
                responseSetter(status, validationResult.data);
            }
        } else {
            console.error(
                `FATAL: Constructed response body failed Zod validation for status ${status}.`,
                validationResult.error.issues,
                'Provided data:', data,
                'Constructed response body:', responseBody
            );
            responseSetter(500, {
                data: null,
                error: [{ field: "general", type: "general", message: "Internal server error: Constructed response failed validation." }]
            });
        }
    };
}

// Helper function to create multer middleware based on file upload configuration
function createFileUploadMiddleware(config: FileUploadConfig): express.RequestHandler {
    // Default multer configuration
    const storage = multer.memoryStorage(); // Store files in memory by default

    let multerMiddleware: express.RequestHandler;

    if (config.single) {
        const upload = multer({
            storage,
            limits: {
                fileSize: config.single.maxSize || 10 * 1024 * 1024, // Default 10MB
            },
            fileFilter: (req, file, cb) => {
                if (config.single!.allowedMimeTypes && !config.single!.allowedMimeTypes.includes(file.mimetype)) {
                    cb(new Error(`File type ${file.mimetype} not allowed`));
                    return;
                }
                cb(null, true);
            }
        });
        multerMiddleware = upload.single(config.single.fieldName);
    } else if (config.array) {
        const upload = multer({
            storage,
            limits: {
                fileSize: config.array.maxSize || 10 * 1024 * 1024, // Default 10MB per file
                files: config.array.maxCount || 10, // Default max 10 files
            },
            fileFilter: (req, file, cb) => {
                if (config.array!.allowedMimeTypes && !config.array!.allowedMimeTypes.includes(file.mimetype)) {
                    cb(new Error(`File type ${file.mimetype} not allowed`));
                    return;
                }
                cb(null, true);
            }
        });
        multerMiddleware = upload.array(config.array.fieldName, config.array.maxCount);
    } else if (config.fields) {
        const upload = multer({
            storage,
            limits: {
                fileSize: Math.max(...config.fields.map(f => f.maxSize || 10 * 1024 * 1024)), // Use max size from all fields
            },
            fileFilter: (req, file, cb) => {
                const fieldConfig = config.fields!.find(f => f.fieldName === file.fieldname);
                if (fieldConfig?.allowedMimeTypes && !fieldConfig.allowedMimeTypes.includes(file.mimetype)) {
                    cb(new Error(`File type ${file.mimetype} not allowed for field ${file.fieldname}`));
                    return;
                }
                cb(null, true);
            }
        });
        const fields = config.fields.map(f => ({ name: f.fieldName, maxCount: f.maxCount || 1 }));
        multerMiddleware = upload.fields(fields);
    } else if (config.any) {
        const upload = multer({
            storage,
            limits: {
                fileSize: config.any.maxSize || 10 * 1024 * 1024, // Default 10MB per file
            },
            fileFilter: (req, file, cb) => {
                if (config.any!.allowedMimeTypes && !config.any!.allowedMimeTypes.includes(file.mimetype)) {
                    cb(new Error(`File type ${file.mimetype} not allowed`));
                    return;
                }
                cb(null, true);
            }
        });
        multerMiddleware = upload.any();
    } else {
        // Fallback - should not reach here if config is valid
        throw new Error('Invalid file upload configuration');
    }

    // Wrap multer middleware with error handling to format errors as 422 JSON responses
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        multerMiddleware(req, res, (error) => {
            if (error) {
                // Convert multer errors to UnifiedError format
                const mappedErrors: UnifiedError = [];

                if (error instanceof multer.MulterError) {
                    let errorMessage = error.message;
                    let fieldName = 'file';

                    switch (error.code) {
                        case 'LIMIT_FILE_SIZE':
                            errorMessage = 'File size exceeds the allowed limit';
                            break;
                        case 'LIMIT_FILE_COUNT':
                            errorMessage = 'Too many files uploaded';
                            break;
                        case 'LIMIT_UNEXPECTED_FILE':
                            errorMessage = `Unexpected field: ${error.field}`;
                            fieldName = error.field || 'file';
                            break;
                        case 'LIMIT_FIELD_KEY':
                            errorMessage = 'Field name too long';
                            break;
                        case 'LIMIT_FIELD_VALUE':
                            errorMessage = 'Field value too long';
                            break;
                        case 'LIMIT_FIELD_COUNT':
                            errorMessage = 'Too many fields';
                            break;
                        case 'LIMIT_PART_COUNT':
                            errorMessage = 'Too many parts';
                            break;
                        default:
                            errorMessage = error.message || 'File upload error';
                    }

                    mappedErrors.push({
                        field: fieldName,
                        message: errorMessage,
                        type: 'body',
                    });
                } else if (error instanceof Error) {
                    // Handle custom errors from fileFilter
                    mappedErrors.push({
                        field: 'file',
                        message: error.message,
                        type: 'body',
                    });
                } else {
                    mappedErrors.push({
                        field: 'file',
                        message: 'File upload error',
                        type: 'body',
                    });
                }

                // Send 422 response with structured error format
                res.status(422).json({
                    data: null,
                    error: mappedErrors
                });
            } else {
                next();
            }
        });
    };
}

// Register route handlers with Express, now generic over TDef
export function registerRouteHandlers<TDef extends ApiDefinitionSchema>(
    app: express.Express,
    apiDefinition: TDef, // Pass the actual API definition object
    routeHandlers: Array<SpecificRouteHandler<TDef>>, // Use the generic handler type
    middlewares?: EndpointMiddleware<TDef>[]
) {
    routeHandlers.forEach((specificHandlerIterationItem) => {
        const { domain, routeKey, handler } = specificHandlerIterationItem as any; // Use 'as any' for simplicity in destructuring union

        const currentDomain = domain as string;
        const currentRouteKey = routeKey as string;

        // Use the passed apiDefinition object
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

        const expressMiddleware = async (
            expressReq: express.Request,
            expressRes: express.Response
        ) => {
            try {
                // Ensure TDef is correctly used for type inference if this section needs it.
                // Currently, parsedParams,Query,Body are based on runtime routeDefinition.
                const preprocessedParams = ('params' in routeDefinition && routeDefinition.params)
                    ? preprocessParams(expressReq.params, routeDefinition.params as z.ZodTypeAny)
                    : expressReq.params;

                const parsedParams = ('params' in routeDefinition && routeDefinition.params)
                    ? (routeDefinition.params as z.ZodTypeAny).parse(preprocessedParams)
                    : preprocessedParams;

                // Preprocess query parameters to handle type coercion from strings
                const preprocessedQuery = ('query' in routeDefinition && routeDefinition.query)
                    ? preprocessQueryParams(expressReq.query, routeDefinition.query as z.ZodTypeAny)
                    : expressReq.query;

                const parsedQuery = ('query' in routeDefinition && routeDefinition.query)
                    ? (routeDefinition.query as z.ZodTypeAny).parse(preprocessedQuery)
                    : preprocessedQuery;

                const parsedBody = (method === 'POST' || method === 'PUT') && ('body' in routeDefinition && routeDefinition.body)
                    ? (routeDefinition.body as z.ZodTypeAny).parse(expressReq.body)
                    : expressReq.body;

                // Construct TypedRequest using TDef, currentDomain, currentRouteKey
                // Create a new object that inherits from expressReq to preserve prototype methods like .on()
                const finalTypedReq = Object.create(expressReq, {
                    // Core parsed/validated properties
                    params: { value: parsedParams, writable: true, enumerable: true, configurable: true },
                    query: { value: parsedQuery, writable: true, enumerable: true, configurable: true },
                    body: { value: parsedBody, writable: true, enumerable: true, configurable: true },
                    ctx: { value: (expressReq as any).ctx, writable: true, enumerable: true, configurable: true },

                    // Unified API for client disconnection
                    onClose: {
                        value: (callback: () => void) => expressReq.on('close', callback),
                        writable: false,
                        enumerable: true,
                        configurable: false
                    },

                    // Restore original Express request properties for full compatibility
                    headers: { value: expressReq.headers, writable: false, enumerable: true, configurable: false },
                    cookies: { value: expressReq.cookies, writable: false, enumerable: true, configurable: false },
                    ip: { value: expressReq.ip, writable: false, enumerable: true, configurable: false },
                    ips: { value: expressReq.ips, writable: false, enumerable: true, configurable: false },
                    hostname: { value: expressReq.hostname, writable: false, enumerable: true, configurable: false },
                    protocol: { value: expressReq.protocol, writable: false, enumerable: true, configurable: false },
                    secure: { value: expressReq.secure, writable: false, enumerable: true, configurable: false },
                    xhr: { value: expressReq.xhr, writable: false, enumerable: true, configurable: false },
                    fresh: { value: expressReq.fresh, writable: false, enumerable: true, configurable: false },
                    stale: { value: expressReq.stale, writable: false, enumerable: true, configurable: false },
                    subdomains: { value: expressReq.subdomains, writable: false, enumerable: true, configurable: false },
                    path: { value: expressReq.path, writable: false, enumerable: true, configurable: false },
                    originalUrl: { value: expressReq.originalUrl, writable: false, enumerable: true, configurable: false },
                    baseUrl: { value: expressReq.baseUrl, writable: false, enumerable: true, configurable: false },
                    url: { value: expressReq.url, writable: false, enumerable: true, configurable: false },
                }) as TypedRequest<TDef, typeof currentDomain, typeof currentRouteKey>;

                // Augment expressRes with the .respond and .setHeader methods, using TDef
                const typedExpressRes = expressRes as TypedResponse<TDef, typeof currentDomain, typeof currentRouteKey>;

                typedExpressRes.respond = (status, dataForResponse) => {
                    // Call any registered response callbacks from middleware
                    if ((expressRes as any)._responseCallbacks) {
                        (expressRes as any)._responseCallbacks.forEach((callback: (status: number, data: any) => void) => {
                            try {
                                callback(status, dataForResponse);
                            } catch (error) {
                                console.error('Error in response callback:', error);
                            }
                        });
                    }

                    // Use the passed apiDefinition object
                    const routeSchemaForHandler = apiDefinition.endpoints[currentDomain][currentRouteKey] as RouteSchema;
                    const responseSchemaForStatus = routeSchemaForHandler.responses[status as number];

                    if (!responseSchemaForStatus) {
                        console.error(`No response schema defined for status ${status} in route ${String(currentDomain)}/${String(currentRouteKey)}`);
                        typedExpressRes.status(500).json({
                            // data: null, // data field might not be part of error schema for 500 if not using unified
                            error: [{ field: "general", type: "general", message: "Internal server error: Undefined response schema for status." }]
                        });
                        return;
                    }

                    let responseBodyToValidate: any; // This will be the object { data: ..., error: ... }

                    if (status === 422) {
                        // For 422, dataForResponse is expected to be the UnifiedError array or null
                        // The schema for 422 is errorUnifiedResponseSchema, expecting { error: UnifiedError }
                        responseBodyToValidate = {
                            data: null, // data is null for 422
                            error: dataForResponse // dataForResponse should be UnifiedError for 422
                        };
                    } else {
                        // For other statuses, dataForResponse is the actual data payload for the 'data' field
                        // The schema is createSuccessUnifiedResponseSchema, expecting { data: ActualData }
                        responseBodyToValidate = {
                            data: dataForResponse,
                            error: null // error is null for success
                        };
                    }

                    // Validate the constructed responseBodyToValidate against the full schema for that status
                    const validationResult = responseSchemaForStatus.safeParse(responseBodyToValidate);

                    if (validationResult.success) {
                        typedExpressRes.status(status).json(validationResult.data);
                    } else {
                        console.error(
                            `FATAL: Constructed response body failed Zod validation for status ${status} in route ${String(currentDomain)}/${String(currentRouteKey)}. This indicates an issue with respond logic or schemas.`,
                            validationResult.error.issues
                        );
                        console.error("Response body was:", responseBodyToValidate);
                        typedExpressRes.status(500).json({
                            // data: null,
                            error: [{ field: "general", type: "general", message: "Internal server error: Constructed response failed validation." }]
                        });
                    }
                };

                typedExpressRes.respondContentType = (status: number, data: any, contentType: string) => {
                    // Set the content type header
                    typedExpressRes.setHeader('Content-Type', contentType);
                    // Send the raw data without JSON wrapping or validation
                    typedExpressRes.status(status).send(data);
                };

                typedExpressRes.setHeader = (name: string, value: string) => {
                    // Call the original Express setHeader method to avoid recursion
                    Object.getPrototypeOf(expressRes).setHeader.call(expressRes, name, value);
                    return typedExpressRes;
                };

                // SSE streaming methods
                typedExpressRes.startSSE = () => {
                    typedExpressRes.setHeader('Content-Type', 'text/event-stream');
                    typedExpressRes.setHeader('Cache-Control', 'no-cache');
                    typedExpressRes.setHeader('Connection', 'keep-alive');
                    typedExpressRes.setHeader('Access-Control-Allow-Origin', '*');
                    typedExpressRes.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
                };

                typedExpressRes.streamSSE = (eventName?: string, data?: any, id?: string) => {
                    let event = '';
                    if (eventName) event += `event: ${eventName}\n`;
                    if (id) event += `id: ${id}\n`;
                    event += `data: ${JSON.stringify(data)}\n\n`;
                    expressRes.write(event);
                };

                typedExpressRes.endStream = () => {
                    expressRes.end();
                };

                const specificHandlerFn = handler as (
                    req: TypedRequest<TDef, typeof currentDomain, typeof currentRouteKey>,
                    res: TypedResponse<TDef, typeof currentDomain, typeof currentRouteKey>
                ) => Promise<void> | void;

                await specificHandlerFn(finalTypedReq, typedExpressRes);

            } catch (error) {
                if (error instanceof z.ZodError) {
                    const mappedErrors: UnifiedError = error.issues.map(err => {
                        let errorType: 'param' | 'query' | 'body' | 'general' = 'general';
                        const pathZero = String(err.path[0]); // Ensure pathZero is a string
                        if (pathZero === 'params') errorType = 'param'; // Corrected: 'params' from path maps to 'param' type
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
                            expressRes.status(422).json(validationResult.data);
                        } else {
                            console.error("FATAL: Constructed 422 error response failed its own schema validation.", validationResult.error.issues);
                            expressRes.status(500).json({ error: [{ field: "general", type: "general", message: "Internal server error constructing validation error response." }] });
                        }
                    } else {
                        console.error("Error: 422 schema not found for route, sending raw Zod errors.");
                        expressRes.status(422).json({ error: mappedErrors }); // Fallback
                    }
                } else if (error instanceof Error) {
                    console.error(`Error in ${method} ${path}:`, error.message, error.stack);
                    expressRes.status(500).json({ error: [{ field: "general", type: "general", message: 'Internal server error' }] });
                } else {
                    console.error(`Unknown error in ${method} ${path}:`, error);
                    expressRes.status(500).json({ error: [{ field: "general", type: "general", message: 'An unknown error occurred' }] });
                }
            }
        };

        // Create middleware wrappers that include endpoint information
        const middlewareWrappers: express.RequestHandler[] = [];

        // Add file upload middleware if configured
        if (routeDefinition.fileUpload) {
            try {
                const fileUploadMiddleware = createFileUploadMiddleware(routeDefinition.fileUpload);
                middlewareWrappers.push(fileUploadMiddleware);
            } catch (error) {
                console.error(`Error creating file upload middleware for ${currentDomain}.${currentRouteKey}:`, error);
                return; // Skip this route if file upload middleware creation fails
            }
        }

        if (middlewares && middlewares.length > 0) {
            middlewares.forEach(middleware => {
                const wrappedMiddleware: express.RequestHandler = async (req, res, next) => {
                    try {
                        // Add respond and onFinish methods to res for middleware compatibility
                        const middlewareRes = res as any;
                        middlewareRes.respond = createRespondFunction(routeDefinition, (status, data) => {
                            res.status(status).json(data);
                        }, middlewareRes);
                        middlewareRes.onResponse = (callback: (status: number, data: any) => void) => {
                            // Store callback on the underlying express response so it's accessible from TypedResponse
                            if (!(res as any)._responseCallbacks) {
                                (res as any)._responseCallbacks = [];
                            }
                            (res as any)._responseCallbacks.push(callback);
                        };
                        await middleware(req, middlewareRes as MiddlewareResponse, next, { domain: currentDomain, routeKey: currentRouteKey } as any);
                    } catch (error) {
                        next(error);
                    }
                };
                middlewareWrappers.push(wrappedMiddleware);
            });
        }

        // Register route with middlewares
        const allHandlers = [...middlewareWrappers, expressMiddleware];

        switch (method.toUpperCase()) {
            case 'GET': app.get(fullPath, ...allHandlers); break;
            case 'POST': app.post(fullPath, ...allHandlers); break;
            case 'PATCH': app.patch(fullPath, ...allHandlers); break;
            case 'OPTIONS': app.options(fullPath, ...allHandlers); break;
            case 'PUT': app.put(fullPath, ...allHandlers); break;
            case 'DELETE': app.delete(fullPath, ...allHandlers); break;
            default:
                console.warn(`Unsupported HTTP method: ${method} for path ${fullPath}`);
        }
    });
}
