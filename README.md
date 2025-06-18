# ts-typed-api 🚀

A lightweight, type-safe API library for TypeScript with Zod validation.

## Motivation

After building several full-stack applications, I discovered that Large Language Models (LLMs) face significant challenges when implementing features that span both backend and frontend components, particularly around API interfaces.

The core issues I observed:
- **API Contract Drift**: LLMs struggle to maintain consistency when defining an API endpoint and then implementing its usage in the frontend
- **Context Loss**: Without a clear, shared contract, LLMs lack the contextual assistance needed to ensure proper integration between client and server
- **Integration Errors**: The disconnect between backend definitions and frontend consumption leads to runtime errors that could be prevented

**The Solution**: Leverage TypeScript's powerful type system to provide real-time feedback and compile-time validation for both LLMs and developers. By creating a shared contract that enforces consistency across the entire stack, we eliminate the guesswork and reduce integration issues.

## 🤖 Built for LLM-Assisted Development

This module is specifically designed to make coding with Large Language Models (LLMs) easier and more efficient. When working on bigger applications with extensive APIs, maintaining context becomes challenging for both developers and AI assistants. ts-typed-api solves this by:

### 🔑 Key Benefits for LLM Development
- **Centralized Type Definitions**: Keep all API contracts in one place, making it easier for LLMs to understand your entire API surface
- **Automatic Type Synchronization**: The type system ensures both client and server stay perfectly in sync, preventing the drift that commonly occurs in large codebases. Compile-time checks prevent the common client-server mismatches that occur in AI-assisted development
- **Context-Friendly Structure**: Organized domain-based API definitions that LLMs can easily parse and understand
- **Compile-Time Validation**: Catch integration issues before runtime, reducing the debugging cycles when working with AI-generated code
- **Self-Documenting**: Type definitions serve as living documentation that LLMs can easily parse

## 📦 Installation

```bash
npm install ts-typed-api
```


## How to use it?
1. Define your API in a file that will be shared by both the server and the client
2. Implement handlers in the server, leveraging the type system and request/response validation
3. Implement the client based on the contract from #1 leveraging type system


## Examples

Check out the `examples/` directory:
- `simple/` - Basic usage with ping endpoints and middleware
- `advanced/` - Complex schemas with authentication, CRUD operations, and file uploads

## 🚀 Quick Start

### 1. Define API Routes with Domains

Create your API definitions organized by logical domains:

```typescript
// definitions.ts
import { z } from 'zod';
import { createApiDefinition, createResponses } from 'ts-typed-api';

// you can create multiple definitions per app
export const PublicApiDefinition = createApiDefinition({
    prefix: '/api/v1/public',
    endpoints: {
        common: { // domain name
            ping: { // endpoint name
                method: 'GET',
                path: '/ping',
                // validate route parameters with Zod
                params: z.object({}),
                // validate query parameters with Zod
                query: z.object({}), 
                // validate body with Zod
                body: z.object({}),
                // validate query parameters with Zod
                responses: createResponses({
                    // specify response codes and response shapes
                    200: z.enum(["pong"]),
                    201: z.boolean()
                })
            },
        }
    }
});
```

### 2. Implement Server-Side Handlers

Register handlers with full type safety and middleware support:

```typescript
// server.ts
import express from 'express';
import { PublicApiDefinition } from './definitions';
import { registerHandlers, EndpointMiddleware } from 'ts-typed-api';

const app = express();
app.use(express.json());

// Example middleware with endpoint information
const loggingMiddleware: EndpointMiddleware = (req, res, next, endpointInfo) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Endpoint: ${endpointInfo.domain}.${endpointInfo.routeKey}`);
    next();
};

// Register handlers with TypeScript enforcing all required handlers are present
registerHandlers(app, PublicApiDefinition, {
    common: {
        ping: async (req, res) => {
            console.log('Ping endpoint called');
            res.respond(200, "pong");
        }
    },
}, [loggingMiddleware]);

app.listen(3001, () => {
    console.log('Server running on http://localhost:3001');
});
```

### 3. Type-Safe Client Calls

Make API calls with full type safety and response handling:

```typescript
// client.ts
import { ApiClient, FetchHttpClientAdapter } from 'ts-typed-api';
import { PublicApiDefinition } from './definitions';

async function runClientExample(): Promise<void> {
    const apiClient = new ApiClient(
        'http://localhost:3001',
        PublicApiDefinition,
        new FetchHttpClientAdapter()
    );

    // Type-safe API calls with response handlers
    await apiClient.callApi('common', 'ping', {}, {
        200: (payload) => {
            console.log('Success:', payload); // payload is typed as "pong"
        },
        201: (payload) => {
            console.log('Success:', payload); // payload is typed as boolean
        },
        422: (payload) => {
            console.log('Request validation error:', payload);
        }
    });
}
```

**Now both server and client are type safe and in sync! The moment you change the definition of the API, type system will let you know about potential changes you need to handle (like additional response code or a change request body schema).**

## 🌟 Features

### Custom HTTP Client Adapters

Create custom HTTP client adapters by implementing the `HttpClientAdapter` interface:

```typescript
interface HttpClientAdapter {
  request<T = any>(url: string, options: HttpRequestOptions): Promise<HttpResponse<T>>;
}
```

### Middleware System

Add cross-cutting concerns like authentication, logging, and validation:

```typescript
const customMiddleware: EndpointMiddleware = (req, res, next, endpointInfo) => {
    // Access to endpoint metadata
    console.log(`Domain: ${endpointInfo.domain}, Route: ${endpointInfo.routeKey}`);
    next();
};
```

## Roadmap

- OpenAPI generation with dynamic documentation based on Swagger

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

Apache 2.0 License
