# ts-typed-api 🚀

A lightweight, type-safe API library for TypeScript with Zod validation.

## 🤖 Built for LLM-Assisted Development

This module is specifically designed to make coding with Large Language Models (LLMs) easier and more efficient. When working on bigger applications with extensive APIs, maintaining context becomes challenging for both developers and AI assistants. ts-typed-api solves this by:

- **Centralized Type Definitions**: Keep all API contracts in one place, making it easier for LLMs to understand your entire API surface
- **Automatic Type Synchronization**: The type system ensures both client and server stay perfectly in sync, preventing the drift that commonly occurs in large codebases
- **Context-Friendly Structure**: Organized domain-based API definitions that LLMs can easily parse and understand
- **Compile-Time Validation**: Catch integration issues before runtime, reducing the debugging cycles when working with AI-generated code

## 🌟 Features

- **Type-Safe API Definitions**: Create fully type-safe API routes with compile-time type checking
- **Domain-Based Organization**: Structure APIs by logical domains for better maintainability
- **Zod Validation**: Built-in runtime validation using Zod schemas
- **Flexible HTTP Client**: Supports custom HTTP adapters (fetch, axios, etc.)
- **Middleware Support**: Add authentication, logging, and other cross-cutting concerns
- **Minimal Overhead**: Lightweight implementation with powerful type inference

## 📦 Installation

```bash
npm install ts-typed-api zod
```

## 🚀 Quick Start

### 1. Define API Routes with Domains

Create your API definitions organized by logical domains:

```typescript
// definitions.ts
import { z } from 'zod';
import { createApiDefinition, createResponses } from 'ts-typed-api';

export const PublicApiDefinition = createApiDefinition({
    prefix: '/api/v1/public',
    endpoints: {
        common: { // domain
            ping: { // endpoint
                method: 'GET',
                path: '/ping',
                responses: createResponses({
                    200: z.enum(["pong"]),
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
import { PrivateApiDefinition, PublicApiDefinition } from './definitions';
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
        422: (payload) => {
            console.log('Validation error:', payload);
        }
    });
}
```

## 🔑 Key Benefits for LLM Development

- **Context Preservation**: Centralized API definitions make it easier for LLMs to understand your entire API surface
- **Type Safety**: Compile-time checks prevent the common client-server mismatches that occur in AI-assisted development
- **Reduced Debugging**: Catch integration issues before runtime, minimizing the back-and-forth debugging cycles
- **Scalable Architecture**: Domain-based organization keeps large APIs manageable for both humans and AI assistants
- **Self-Documenting**: Type definitions serve as living documentation that LLMs can easily parse

## 🛠️ Advanced Features

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

### Supported Features

- Domain-based API organization
- Type-safe route definitions with parameters
- Zod schema validation
- Flexible error handling with typed responses
- Middleware support with endpoint context
- Custom HTTP adapters

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

ISC License
