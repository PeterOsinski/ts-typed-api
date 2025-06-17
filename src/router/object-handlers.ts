import express from "express";
import { ApiDefinitionSchema } from "./definition";
import { registerRouteHandlers, SpecificRouteHandler } from "./handler";
import { TypedRequest, TypedResponse } from "./router";

// Type for a single handler function
type HandlerFunction<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef['endpoints'],
    TRouteKey extends keyof TDef['endpoints'][TDomain]
> = (
    req: TypedRequest<TDef, TDomain, TRouteKey>,
    res: TypedResponse<TDef, TDomain, TRouteKey>
) => Promise<void> | void;

// Type for the object-based handler definition
// This ensures all domains and routes are required
export type ObjectHandlers<TDef extends ApiDefinitionSchema> = {
    [TDomain in keyof TDef['endpoints']]: {
        [TRouteKey in keyof TDef['endpoints'][TDomain]]: HandlerFunction<TDef, TDomain, TRouteKey>;
    };
};

// Transform object-based handlers to array format
function transformObjectHandlersToArray<TDef extends ApiDefinitionSchema>(
    objectHandlers: ObjectHandlers<TDef>
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
export function registerHandlers<TDef extends ApiDefinitionSchema>(
    app: express.Express,
    apiDefinition: TDef,
    objectHandlers: ObjectHandlers<TDef>
): void {
    const handlerArray = transformObjectHandlersToArray(objectHandlers);
    registerRouteHandlers(app, apiDefinition, handlerArray);
}

// Factory function to create a typed handler registrar for a specific API definition
export function makeObjectHandlerRegistrar<TDef extends ApiDefinitionSchema>(
    apiDefinition: TDef
) {
    return function (
        app: express.Express,
        objectHandlers: ObjectHandlers<TDef>
    ): void {
        registerHandlers(app, apiDefinition, objectHandlers);
    };
}
