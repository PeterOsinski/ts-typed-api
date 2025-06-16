import express from "express";
import {
    ApiDefinitionSchema, // Changed from ApiDefinition
    ApiBody,
    ApiParams,
    ApiQuery,
    InferDataFromUnifiedResponse,
} from './definition';

// Typed Request for Express handlers, now generic over TDef
export type TypedRequest<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef,
    TRouteKey extends keyof TDef[TDomain], // Using direct keyof for simplicity here
    // Params, ReqBody, Query types are now derived using TDef
    P extends ApiParams<TDef, TDomain, TRouteKey> = ApiParams<TDef, TDomain, TRouteKey>,
    ReqBody extends ApiBody<TDef, TDomain, TRouteKey> = ApiBody<TDef, TDomain, TRouteKey>,
    Q extends ApiQuery<TDef, TDomain, TRouteKey> = ApiQuery<TDef, TDomain, TRouteKey>,
    L extends Record<string, any> = Record<string, any>
> = express.Request<P, any, ReqBody, Q, L>

// --- Enhanced TypedResponse with res.respond, now generic over TDef ---

// Type for the data argument of res.respond
type ResponseDataForStatus<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef,
    TRouteName extends keyof TDef[TDomain],
    TStatus extends keyof TDef[TDomain][TRouteName]['responses'] & number // Ensure TStatus is a numeric key
> = InferDataFromUnifiedResponse<TDef[TDomain][TRouteName]['responses'][TStatus]>;

// Type for the res.respond method, now generic over TDef
type RespondFunction<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef,
    TRouteName extends keyof TDef[TDomain]
> = <
    TStatusLocal extends keyof TDef[TDomain][TRouteName]['responses'] & number
>(
    status: TStatusLocal,
    data: ResponseDataForStatus<TDef, TDomain, TRouteName, TStatusLocal>
) => void;

// Typed Response for Express handlers, now generic over TDef
export interface TypedResponse<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef,
    TRouteName extends keyof TDef[TDomain],
    L extends Record<string, any> = Record<string, any>
> extends express.Response<any, L> {
    respond: RespondFunction<TDef, TDomain, TRouteName>;
    json: <B = any>(body: B) => this; // Keep original json
}

// Type-safe route handler creation function, now generic over TDef
// This function is called within a context where TDef is known (e.g. specific handlers file)
export function createRouteHandler<
    TDef extends ApiDefinitionSchema,
    TDomain extends keyof TDef,
    TRouteKey extends keyof TDef[TDomain] // Using direct keyof for simplicity
>(
    domain: TDomain,
    routeKey: TRouteKey,
    handler: (
        // Use the TDef generic for TypedRequest and TypedResponse
        req: TypedRequest<TDef, TDomain, TRouteKey>,
        res: TypedResponse<TDef, TDomain, TRouteKey>
    ) => Promise<void> | void
) {
    // The returned object includes enough type information (domain, routeKey)
    // for registerRouteHandlers to correctly associate it with TDef.
    // The phantom type TDef is carried by the function's generic signature.
    return { domain, routeKey, handler };
}

// Factory function to create a route handler creator for a specific API definition
export function makeRouteHandlerCreator<TDef extends ApiDefinitionSchema>() {
    return function createHandler<
        TDomain extends keyof TDef,
        TRouteKey extends keyof TDef[TDomain]
    >(
        domain: TDomain,
        routeKey: TRouteKey,
        handler: (
            req: TypedRequest<TDef, TDomain, TRouteKey>,
            res: TypedResponse<TDef, TDomain, TRouteKey>
        ) => Promise<void> | void
    ): ReturnType<typeof createRouteHandler<TDef, TDomain, TRouteKey>> { // Ensure return type matches for SpecificRouteHandler
        // We call the original createRouteHandler, but TDef is fixed here by the factory's closure.
        // TDomain and TRouteKey are inferred from the arguments to createHandler.
        return createRouteHandler<TDef, TDomain, TRouteKey>(domain, routeKey, handler);
    };
}
