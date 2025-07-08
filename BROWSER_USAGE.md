# Browser Usage Guide

This guide explains how to use `ts-typed-api` in browser environments without including server-side dependencies.

## Problem

When using the main package import in browsers, you might encounter issues with Node.js-specific dependencies like `busboy` and `multer` that are used for server-side file uploads. These dependencies reference Node.js APIs like `Buffer` that don't exist in browsers.

## Solution

The package now provides separate entry points for client-side and server-side code:

### Client-Only Import (Browser-Safe)

```typescript
// ✅ Browser-safe import - no server dependencies
import { ApiClient, CreateApiDefinition, CreateResponses } from 'ts-typed-api/client';
```

This import includes:
- `ApiClient` - HTTP client for making API calls
- `CreateApiDefinition` - Function to define API structure
- `CreateResponses` - Function to define response schemas
- All necessary types for client-side usage
- Zod for validation

This import **does NOT include**:
- `RegisterHandlers` (server-side)
- `UploadedFile` type (server-side)
- Express/Multer dependencies
- Any Node.js-specific code

### Server-Only Import

```typescript
// Server-side import - includes server dependencies
import { RegisterHandlers, UploadedFile } from 'ts-typed-api/server';
```

### Full Import (Node.js Only)

```typescript
// Traditional import - includes everything (Node.js only)
import { ApiClient, RegisterHandlers } from 'ts-typed-api';
```

## Example Usage

### Browser Client

```typescript
import { ApiClient, CreateApiDefinition, CreateResponses } from 'ts-typed-api/client';
import { z } from 'zod';

const ApiDefinition = CreateApiDefinition({
    prefix: '/api',
    endpoints: {
        users: {
            getUser: {
                path: '/users/:id',
                method: 'GET',
                params: z.object({ id: z.string() }),
                responses: CreateResponses({
                    200: z.object({
                        id: z.string(),
                        name: z.string(),
                        email: z.string()
                    })
                })
            }
        }
    }
});

const client = new ApiClient('http://localhost:3000', ApiDefinition);

// Use in browser
const result = await client.callApi('users', 'getUser', 
    { params: { id: '123' } },
    {
        200: ({ data }) => data,
        422: ({ error }) => { throw new Error('Validation failed'); }
    }
);
```

### Server Implementation

```typescript
import express from 'express';
import { RegisterHandlers } from 'ts-typed-api/server';
// Import the same ApiDefinition used by the client

const app = express();

RegisterHandlers(app, ApiDefinition, {
    users: {
        getUser: async (req, res) => {
            const { id } = req.params;
            // ... server logic
            res.respond(200, { id, name: 'John', email: 'john@example.com' });
        }
    }
});
```

## Bundle Size Benefits

Using the client-only import significantly reduces bundle size for browser applications by excluding:
- Express framework
- Multer file upload middleware
- Busboy multipart parser
- Other Node.js-specific dependencies

## Migration Guide

If you're currently using the main import in browser code:

**Before:**
```typescript
import { ApiClient } from 'ts-typed-api';
```

**After:**
```typescript
import { ApiClient } from 'ts-typed-api/client';
```

The API remains exactly the same - only the import path changes.

## TypeScript Support

All imports provide full TypeScript support with proper type inference and autocompletion.
