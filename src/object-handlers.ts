import express from "express";
import { ApiDefinitionSchema, ApiParams, ApiBody, ApiQuery } from "./definition";
import { registerRouteHandlers, SpecificRouteHandler } from "./handler";
import { TypedRequest, TypedResponse } from "./router";

export type EndpointInfo<TDef extends ApiDefinitionSchema = ApiDefinitionSchema> = {
    [TDomain in keyof TDef['endpoints']]: {
        domain: TDomain;
        routeKey: keyof TDef['endpoints'][TDomain];
    }
}[keyof TDef['endpoints']]

// Type for middleware function that receives endpoint information
export type EndpointMiddleware<TDef extends ApiDefinitionSchema = ApiDefinitionSchema> = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    endpointInfo: EndpointInfo<TDef>
) => void | Promise<void>;

// Type for simple middleware that doesn't need endpoint information
export type SimpleMiddleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) => void | Promise<void>;

// Type for middleware that can work with any API definition
export type UniversalEndpointMiddleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    endpointInfo: {
        domain: string;
        routeKey: string;
    }
) => void | Promise<void>;

// Unified middleware type that works for both Express and Hono with context typing
export type EndpointMiddlewareCtx<
    Ctx extends Record<string, any> = Record<string, any>,
    TDef extends ApiDefinitionSchema = ApiDefinitionSchema
> =
    // Express version: (req, res, next, endpointInfo)
    ((req: express.Request & { ctx?: Ctx }, res: express.Response, next: express.NextFunction, endpointInfo: EndpointInfo<TDef>) => void | Promise<void>) |
    // Hono version: (c, next) - context is passed via c.req.ctx -> c.ctx copying
    ((c: any, next: any) => void | Promise<void>);

// Union type that accepts endpoint-aware, universal, and simple middleware
export type AnyMiddleware<TDef extends ApiDefinitionSchema = ApiDefinitionSchema> =
    | EndpointMiddleware<TDef>
    | UniversalEndpointMiddleware
    | SimpleMiddleware;

// Type for a single handler function
type HandlerFunction<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteKey extends keyof TDef['endpoints'][TDomain],
    Ctx extends Record<string, any> = Record<string, any>
> = (
    req: TypedRequest<TDef, TDomain, TRouteKey, ApiParams<TDef, TDomain, TRouteKey>, ApiBody<TDef, TDomain, TRouteKey>, ApiQuery<TDef, TDomain, TRouteKey>, Record<string, any>, Ctx>,
    res: TypedResponse<TDef, TDomain, TRouteKey>
) => Promise<void> | void;

// Type for the object-based handler definition
// This ensures all domains and routes are required
export type ObjectHandlers<
    TDef extends ApiDefinitionSchema,
    Ctx extends Record<string, any> = Record<string, any>
> = {
        [TDomain in keyof TDef['endpoints']]: {
            [TRouteKey in keyof TDef['endpoints'][TDomain]]: HandlerFunction<TDef, TDomain, TRouteKey, Ctx>;
        };
    };

// Transform object-based handlers to array format
function transformObjectHandlersToArray<
    TDef extends ApiDefinitionSchema,
    Ctx extends Record<string, any> = Record<string, any>
>(
    objectHandlers: ObjectHandlers<TDef, Ctx>
): Array<SpecificRouteHandler<TDef>> {
    const handlerArray: Array<SpecificRouteHandler<TDef>> = [];

    // Iterate through domains
    for (const domain in objectHandlers) {
        if (Object.prototype.hasOwnProperty.call(objectHandlers, domain)) {
            const domainHandlers = objectHandlers[domain];

            // Iterate through routes in this domain
            for (const routeKey in domainHandlers) {
                if (Object.prototype.hasOwnProperty.call(domainHandlers, routeKey)) {
                    const handler = domainHandlers[routeKey];

                    // Create the handler object in the format expected by registerRouteHandlers
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

// Main utility function that registers object-based handlers
export function RegisterHandlers<
    TDef extends ApiDefinitionSchema,
    Ctx extends Record<string, any> = Record<string, any>
>(
    app: express.Express,
    apiDefinition: TDef,
    objectHandlers: ObjectHandlers<TDef, Ctx>,
    middlewares?: AnyMiddleware<TDef>[]
): void {
    const handlerArray = transformObjectHandlersToArray(objectHandlers);

    // Convert AnyMiddleware to EndpointMiddleware by checking function arity
    const endpointMiddlewares: EndpointMiddleware<TDef>[] = middlewares?.map(middleware => {
        // Check if middleware expects 4 parameters (including endpointInfo)
        if (middleware.length === 4) {
            // It's already an EndpointMiddleware
            return middleware as EndpointMiddleware<TDef>;
        } else {
            // It's a SimpleMiddleware, wrap it to ignore endpointInfo
            return ((req, res, next) => {
                return (middleware as SimpleMiddleware)(req, res, next);
            }) as EndpointMiddleware<TDef>;
        }
    }) || [];

    registerRouteHandlers(app, apiDefinition, handlerArray, endpointMiddlewares);
}

// Factory function to create a typed handler registrar for a specific API definition
export function makeObjectHandlerRegistrar<TDef extends ApiDefinitionSchema>(
    apiDefinition: TDef
) {
    return function (
        app: express.Express,
        objectHandlers: ObjectHandlers<TDef>,
        middlewares?: EndpointMiddleware<TDef>[]
    ): void {
        RegisterHandlers(app, apiDefinition, objectHandlers, middlewares);
    };
}
