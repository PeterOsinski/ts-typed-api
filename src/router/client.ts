import {
    type ApiDefinitionSchema as BaseApiDefinitionSchema, // Renamed for clarity
    type ApiClientParams,
    type ApiClientQuery,
    type ApiClientBody,
    type RouteSchema,
    type UnifiedError,
    type InferDataFromUnifiedResponse
} from "./definition";
import { type ZodTypeAny } from 'zod';

// --- HTTP Client Adapter Interfaces ---

/**
 * Options for an HTTP request made by an adapter.
 */
export interface HttpRequestOptions {
    method: RouteSchema['method'];
    headers?: Record<string, string>;
    body?: string | FormData; // Body is typically string for JSON, or FormData for multipart
}

/**
 * Represents an HTTP response from an adapter.
 * @template T The expected type of the JSON body.
 */
export interface HttpResponse<T = any> {
    status: number;
    headers: Headers; // Using the native Headers type from Fetch API for convenience
    json(): Promise<T>;
    text(): Promise<string>;
    /**
     * Gets the underlying raw response object from the adapter (e.g., Fetch API's Response object).
     * The type of this object depends on the adapter implementation.
     */
    getRawResponse(): any;
}

/**
 * Interface for an HTTP client adapter.
 * Allows swapping out the underlying HTTP request mechanism (e.g., fetch, axios).
 */
export interface HttpClientAdapter {
    /**
     * Makes an HTTP request.
     * @template T The expected type of the JSON response body.
     * @param url The URL to request.
     * @param options The request options.
     * @returns A promise that resolves to an HttpResponse.
     */
    request<T = any>(url: string, options: HttpRequestOptions): Promise<HttpResponse<T>>;
}

// --- Fetch Implementation of the Adapter ---

/**
 * An HttpClientAdapter implementation that uses the native Fetch API.
 */
export class FetchHttpClientAdapter implements HttpClientAdapter {
    async request<T = any>(url: string, options: HttpRequestOptions): Promise<HttpResponse<T>> {
        const fetchOptions: RequestInit = {
            method: options.method,
            headers: options.headers,
            // Note: `credentials` (e.g., 'include' for cookies) is not set by default.
            // It can be configured by extending this adapter or by managing cookies via the 'Cookie' header.
        };

        if (options.body !== undefined) {
            fetchOptions.body = options.body;
        }

        const nativeFetchResponse = await fetch(url, fetchOptions);

        return {
            status: nativeFetchResponse.status,
            headers: nativeFetchResponse.headers,
            json: () => nativeFetchResponse.json() as Promise<T>,
            text: () => nativeFetchResponse.text(),
            getRawResponse: () => nativeFetchResponse,
        };
    }
}

// --- API Client Types ---

// Helper to get the specific route schema, ensuring it conforms to RouteSchema
// Now generic over TActualDef
type GetRoute<
    TActualDef extends BaseApiDefinitionSchema,
    TDomain extends keyof TActualDef['endpoints'],
    K extends keyof TActualDef['endpoints'][TDomain]
> = TActualDef['endpoints'][TDomain][K] extends infer Rte ? Rte extends RouteSchema ? Rte : never : never;

// Helper to safely get the 'responses' record from a RouteSchema
type GetResponses<Rte extends RouteSchema> = Rte['responses'];

/**
 * Discriminated union type for the result of callApi.
 * @template TDef The specific ApiDefinition structure being used.
 * @template TDomain The domain (controller) of the API.
 * @template TRouteKey The key of the route within the domain.
 */
// Helper type to define the payload structure for a single status
type ApiCallResultPayload<S_STATUS_NUM extends number, ActualSchema extends ZodTypeAny> =
    S_STATUS_NUM extends 422 ? { status: S_STATUS_NUM; error: UnifiedError; rawResponse: any; data?: undefined } :
    S_STATUS_NUM extends 204 ? { status: S_STATUS_NUM; data: void; rawResponse: any; error?: undefined } :
    // For all other statuses, their schemas from createResponses are wrapped in { data: ... } by the backend.
    // InferDataFromUnifiedResponse will correctly extract the inner data.
    { status: S_STATUS_NUM; data: InferDataFromUnifiedResponse<ActualSchema>; rawResponse: any; error?: undefined; };

export type ApiCallResult<
    TActualDef extends BaseApiDefinitionSchema,
    TDomain extends keyof TActualDef['endpoints'],
    TRouteKey extends keyof TActualDef['endpoints'][TDomain],
    CurrentRoute extends RouteSchema = GetRoute<TActualDef, TDomain, TRouteKey>,
    ResponsesMap = GetResponses<CurrentRoute>
> = ResponsesMap extends Record<any, ZodTypeAny> // Ensure ResponsesMap is a record
    ? { // Iterate over each status code (key) in ResponsesMap
        [S_STATUS_NUM in keyof ResponsesMap]: S_STATUS_NUM extends number // Ensure the key is a number (status code)
        ? ResponsesMap[S_STATUS_NUM] extends infer ActualSchema extends ZodTypeAny // Get the Zod schema for this specific status
        ? ApiCallResultPayload<S_STATUS_NUM, ActualSchema> // Construct the payload type using the specific status and its schema
        : never
        : never;
    }[keyof ResponsesMap] // Create a union of all the constructed payload types
    : never;

/**
 * Options for the callApi method.
 * @template TDef The specific ApiDefinition structure being used.
 * @template TDomainParam The domain (controller) of the API.
 * @template TRouteKeyParam The key of the route within the domain.
 */
export type CallApiOptions<
    TActualDef extends BaseApiDefinitionSchema, // Made generic over TActualDef
    TDomainParam extends keyof TActualDef['endpoints'],
    TRouteKeyParam extends keyof TActualDef['endpoints'][TDomainParam]
> = {
    params?: ApiClientParams<TActualDef, TDomainParam, TRouteKeyParam>;
    query?: ApiClientQuery<TActualDef, TDomainParam, TRouteKeyParam>;
    body?: ApiClientBody<TActualDef, TDomainParam, TRouteKeyParam>;
    headers?: Record<string, string>;
};

// --- API Client Class ---

/**
 * A client for making API calls defined by an ApiDefinition.
 * It uses an HttpClientAdapter for making actual HTTP requests and supports persistent headers.
 */
export class ApiClient<TActualDef extends BaseApiDefinitionSchema> { // Made generic
    private baseUrl: string;
    private apiDefinitionObject: TActualDef; // Uses generic type TActualDef
    private adapter: HttpClientAdapter;
    private persistentHeaders: Record<string, string> = {};

    /**
     * Creates an instance of ApiClient.
     * @param baseUrl The base URL for all API calls (e.g., 'http://localhost:3001').
     * @param apiDefinitionObject The API definition object.
     * @param adapter An instance of HttpClientAdapter to use for requests.
     */
    constructor(
        baseUrl: string,
        apiDefinitionObject: TActualDef, // Parameter uses TActualDef
        adapter: HttpClientAdapter
    ) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.apiDefinitionObject = apiDefinitionObject;
        this.adapter = adapter;
    }

    /**
     * Sets a persistent header that will be included in all subsequent API calls.
     * If the header already exists, its value will be updated.
     * @param name The name of the header.
     * @param value The value of the header.
     */
    public setHeader(name: string, value: string): void {
        this.persistentHeaders[name] = value;
    }

    /**
     * Gets the value of a persistent header.
     * @param name The name of the header.
     * @returns The value of the header, or undefined if not set.
     */
    public getHeader(name: string): string | undefined {
        return this.persistentHeaders[name];
    }

    /**
     * Removes a persistent header.
     * @param name The name of the header to remove.
     */
    public removeHeader(name: string): void {
        delete this.persistentHeaders[name];
    }

    /**
     * Clears all persistent headers.
     */
    public clearHeaders(): void {
        this.persistentHeaders = {};
    }

    /**
     * Gets the full base URL including any prefix from the API definition.
     * @returns The base URL with prefix applied.
     */
    private getBaseUrlWithPrefix(): string {
        const prefix = this.apiDefinitionObject.prefix;
        if (prefix) {
            const cleanPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
            return this.baseUrl + cleanPrefix.replace(/\/$/, '');
        }
        return this.baseUrl;
    }

    /**
     * Makes an API call to a specified domain and route.
     * @template TDomain The domain (controller) of the API.
     * @template TRouteKey The key of the route within the domain.
     * @template TInferredHandlers A type inferred from the handlers object, ensuring all defined statuses are handled.
     * @param domain The API domain (e.g., 'user').
     * @param routeKey The API route key (e.g., 'getUsers').
     * @param callData Optional parameters, query, body, and headers for the request.
     * @param handlers An object where keys are status codes and values are handler functions for those statuses.
     * @returns A promise that resolves to the return value of the executed handler.
     * @throws Error if the route configuration is invalid, a network error occurs, an unhandled status code is received, or JSON parsing fails.
     */
    public async callApi<
        TDomain extends keyof TActualDef['endpoints'],
        TRouteKey extends keyof TActualDef['endpoints'][TDomain],
        TInferredHandlers extends {
            [KStatus in ApiCallResult<TActualDef, TDomain, TRouteKey>['status']]: (
                payload: Extract<ApiCallResult<TActualDef, TDomain, TRouteKey>, { status: KStatus }>
            ) => any;
        }
    >(
        domain: TDomain,
        routeKey: TRouteKey,
        callData: CallApiOptions<TActualDef, TDomain, TRouteKey> | undefined, // Uses TActualDef
        handlers: TInferredHandlers
    ): Promise<{ [SKey in keyof TInferredHandlers]: TInferredHandlers[SKey] extends (...args: any[]) => infer R ? R : never }[keyof TInferredHandlers]> {
        const routeInfo = this.apiDefinitionObject.endpoints[domain as string][routeKey as string] as RouteSchema; // Accessing from TActualDef instance

        if (!routeInfo || typeof routeInfo.path !== 'string') {
            throw new Error(`API route configuration ${String(domain)}.${String(routeKey)} not found or invalid.`);
        }

        let urlPath = routeInfo.path;
        if (callData?.params) {
            const params = callData.params as Record<string, string | number | boolean>;
            for (const key in params) {
                if (Object.prototype.hasOwnProperty.call(params, key) && params[key] !== undefined) {
                    urlPath = urlPath.replace(`:${key}`, String(params[key]));
                }
            }
        }

        const url = new URL(this.getBaseUrlWithPrefix() + urlPath);

        if (callData?.query) {
            const queryParams = callData.query as Record<string, any>;
            for (const key in queryParams) {
                if (Object.prototype.hasOwnProperty.call(queryParams, key) && queryParams[key] !== undefined) {
                    url.searchParams.append(key, String(queryParams[key]));
                }
            }
        }

        const requestHeaders: Record<string, string> = {
            ...this.persistentHeaders,
            'Content-Type': 'application/json', // Default, can be overridden by callData.headers or persistentHeaders
            ...(callData?.headers || {}),
        };

        const adapterRequestOptions: HttpRequestOptions = {
            method: routeInfo.method,
            headers: requestHeaders,
        };

        if (routeInfo.method !== 'GET' && routeInfo.method !== 'HEAD' && callData?.body !== undefined) {
            adapterRequestOptions.body = JSON.stringify(callData.body);
        }

        let adapterResponse: HttpResponse;
        try {
            adapterResponse = await this.adapter.request(url.toString(), adapterRequestOptions);
        } catch (networkError) {
            const errorMessage = networkError instanceof Error ? networkError.message : `Unknown network error calling API ${String(domain)}.${String(routeKey)}`;
            console.error(`Network error for ${String(domain)}.${String(routeKey)}:`, networkError);
            throw new Error(`Network error: ${errorMessage}`);
        }

        const runtimeStatus = adapterResponse.status;

        // Directly use TDomain and TRouteKey with GetRoute, using TActualDef
        type CurrentGetRoute = GetRoute<TActualDef, TDomain, TRouteKey>;
        type CurrentDefinedResponses = GetResponses<CurrentGetRoute>;
        type CurrentDefinedStatusLiterals = CurrentDefinedResponses extends Record<number, ZodTypeAny> ? keyof CurrentDefinedResponses : never;

        const definedStatusCodes = Object.keys(routeInfo.responses).map(Number);
        if (!definedStatusCodes.includes(runtimeStatus)) {
            const responseText = await adapterResponse.text().catch(() => "Could not read response text.");
            const errorMsg = `API ${String(domain)}.${String(routeKey)}: Received unhandled status code ${runtimeStatus}. Expected one of: ${definedStatusCodes.join(', ')}. Response: ${responseText}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        const currentStatusLiteral = runtimeStatus as Extract<CurrentDefinedStatusLiterals, number>;
        // apiResultPayload now uses ApiCallResult with TActualDef
        let apiResultPayload: ApiCallResult<TActualDef, TDomain, TRouteKey>;

        if (currentStatusLiteral === 204) {
            apiResultPayload = {
                status: 204 as const,
                data: undefined, // data is undefined for 204
                rawResponse: adapterResponse.getRawResponse(),
            } as Extract<ApiCallResult<TActualDef, TDomain, TRouteKey>, { status: 204 }>;
        } else {
            let responseBodyJson: any;
            const contentType = adapterResponse.headers.get("content-type");

            if (contentType && contentType.includes("application/json")) {
                try {
                    responseBodyJson = await adapterResponse.json();
                } catch (e) {
                    const parseErrorMsg = `API ${String(domain)}.${String(routeKey)}: Failed to parse JSON for status ${currentStatusLiteral}. Error: ${e instanceof Error ? e.message : String(e)}`;
                    console.error(parseErrorMsg, adapterResponse.getRawResponse());
                    throw new Error(parseErrorMsg);
                }
            } else if (runtimeStatus >= 400) { // Handle non-JSON error responses
                const responseText = await adapterResponse.text().catch(() => "Could not read response text.");
                if (currentStatusLiteral === 422) { // Try to conform to UnifiedError for 422
                    responseBodyJson = {
                        error: [{ field: 'general', type: 'general', message: `Non-JSON error response for 422: ${responseText}` }] satisfies UnifiedError // Adjusted: type to 'general'
                    };
                } else { // For other non-JSON errors, data will likely be undefined. Log a warning.
                    console.warn(`API ${String(domain)}.${String(routeKey)}: Received non-JSON response for status ${currentStatusLiteral}. Response: ${responseText}`);
                    // responseBodyJson remains undefined or as is, data extraction below will handle it.
                }
            }

            if (currentStatusLiteral === 422) {
                const errorData: UnifiedError = (responseBodyJson?.error as UnifiedError) || [{ field: 'general', type: 'general', message: `HTTP error 422: ${await adapterResponse.text().catch(() => 'Unknown error text')}` }];
                // Assign directly to apiResultPayload, relying on its type ApiCallResult<TActualDef, TDomain, TRouteKey>
                // to correctly match the 422 variant.
                apiResultPayload = {
                    status: 422 as const,
                    error: errorData,
                    rawResponse: adapterResponse.getRawResponse(),
                } as unknown as Extract<ApiCallResult<TActualDef, TDomain, TRouteKey>, { status: 422 }>; // Force cast via unknown
            } else {
                // Assuming responseBodyJson is an object like { data: <actual_payload> }
                // as per backend contract for non-204/non-422 responses.
                apiResultPayload = {
                    status: currentStatusLiteral,
                    data: responseBodyJson.data, // Extract the actual data from the wrapped response
                    rawResponse: adapterResponse.getRawResponse(),
                } as Extract<ApiCallResult<TActualDef, TDomain, TRouteKey>, { status: typeof currentStatusLiteral }>;
            }
        }

        const handler = handlers[apiResultPayload.status as keyof TInferredHandlers];
        return handler(apiResultPayload as any); // Reverting to `as any` as TS struggles with direct narrowing here
    }
}
