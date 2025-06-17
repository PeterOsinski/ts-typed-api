import { z } from "zod";
import { ApiDefinitionSchema, RouteSchema, UnifiedError } from "./definition";
import { createRouteHandler, TypedRequest, TypedResponse } from "./router";
import express from "express";

// A handler entry, now generic over TDef
export type SpecificRouteHandler<TDef extends ApiDefinitionSchema> = {
    // Pick a domain from TDef
    [TDomain_ in keyof TDef['endpoints']]: {
        // Pick a route key from that domain
        [TRouteKey_ in keyof TDef['endpoints'][TDomain_]]: ReturnType<typeof createRouteHandler<TDef, TDomain_, TRouteKey_>>;
    }[keyof TDef['endpoints'][TDomain_]]; // Get the union of all possible handler objects for TDomain_
}[keyof TDef['endpoints']]; // Get the union of all possible handler objects for TDef

// Type for middleware function that receives endpoint information
type EndpointMiddleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    endpointInfo: { domain: string; routeKey: string }
) => void | Promise<void>;

// Register route handlers with Express, now generic over TDef
export function registerRouteHandlers<TDef extends ApiDefinitionSchema>(
    app: express.Express,
    apiDefinition: TDef, // Pass the actual API definition object
    routeHandlers: Array<SpecificRouteHandler<TDef>>, // Use the generic handler type
    middlewares?: EndpointMiddleware[]
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
                const parsedParams = ('params' in routeDefinition && routeDefinition.params)
                    ? (routeDefinition.params as z.ZodTypeAny).parse(expressReq.params)
                    : expressReq.params;

                const parsedQuery = ('query' in routeDefinition && routeDefinition.query)
                    ? (routeDefinition.query as z.ZodTypeAny).parse(expressReq.query)
                    : expressReq.query;

                const parsedBody = (method === 'POST' || method === 'PUT') && ('body' in routeDefinition && routeDefinition.body)
                    ? (routeDefinition.body as z.ZodTypeAny).parse(expressReq.body)
                    : expressReq.body;

                // Construct TypedRequest using TDef, currentDomain, currentRouteKey
                const finalTypedReq = {
                    ...expressReq,
                    params: parsedParams,
                    query: parsedQuery,
                    body: parsedBody,
                } as TypedRequest<TDef, typeof currentDomain, typeof currentRouteKey>;

                // Augment expressRes with the .respond method, using TDef
                const typedExpressRes = expressRes as TypedResponse<TDef, typeof currentDomain, typeof currentRouteKey>;

                typedExpressRes.respond = (status, dataForResponse) => {
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
                            validationResult.error.errors
                        );
                        console.error("Response body was:", responseBodyToValidate);
                        typedExpressRes.status(500).json({
                            // data: null,
                            error: [{ field: "general", type: "general", message: "Internal server error: Constructed response failed validation." }]
                        });
                    }
                };

                const specificHandlerFn = handler as (
                    req: TypedRequest<TDef, typeof currentDomain, typeof currentRouteKey>,
                    res: TypedResponse<TDef, typeof currentDomain, typeof currentRouteKey>
                ) => Promise<void> | void;

                await specificHandlerFn(finalTypedReq, typedExpressRes);

            } catch (error) {
                if (error instanceof z.ZodError) {
                    const mappedErrors: UnifiedError = error.errors.map(err => {
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
                            console.error("FATAL: Constructed 422 error response failed its own schema validation.", validationResult.error.errors);
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
        if (middlewares && middlewares.length > 0) {
            middlewares.forEach(middleware => {
                const wrappedMiddleware: express.RequestHandler = async (req, res, next) => {
                    try {
                        await middleware(req, res, next, { domain: currentDomain, routeKey: currentRouteKey });
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
            case 'PUT': app.put(fullPath, ...allHandlers); break;
            case 'DELETE': app.delete(fullPath, ...allHandlers); break;
            default:
                console.warn(`Unsupported HTTP method: ${method} for path ${fullPath}`);
        }
    });
}
