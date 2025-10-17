# Hono Cloudflare Workers Adapter

This adapter allows you to use `ts-typed-api` with [Hono](https://hono.dev/) framework in Cloudflare Workers, while maintaining the same API definitions and handler functions as the Express version.

## Installation

```bash
npm install hono
```

## Usage

### Basic Setup

```typescript
import { Hono } from 'hono';
import { RegisterHonoHandlers } from 'ts-typed-api';
import { ApiDefinition } from './definitions';

const app = new Hono();

// Use the same API definitions and handlers as Express
RegisterHonoHandlers(app, ApiDefinition, {
    domain: {
        endpoint: async (req, res) => {
            res.respond(200, { message: 'Hello from Cloudflare Workers!' });
        }
    }
});

// Export for Cloudflare Workers
export default app;
```

### File Upload Support

The adapter supports file uploads using Hono's `parseBody()` method, which is compatible with Cloudflare Workers:

```typescript
import { CreateApiDefinition, CreateResponses } from 'ts-typed-api';

const ApiDefinition = CreateApiDefinition({
    endpoints: {
        upload: {
            file: {
                method: 'POST',
                path: '/upload',
                fileUpload: {
                    single: {
                        fieldName: 'file',
                        maxSize: 10 * 1024 * 1024, // 10MB
                        allowedMimeTypes: ['image/jpeg', 'image/png']
                    }
                },
                responses: CreateResponses({
                    200: z.object({ filename: z.string() })
                })
            }
        }
    }
});

// Handler works the same as Express
RegisterHonoHandlers(app, ApiDefinition, {
    upload: {
        file: async (req, res) => {
            const file = req.file; // File object with buffer, mimetype, etc.
            // Process file...
            res.respond(200, { filename: file.originalname });
        }
    }
});
```

### Middleware Support

```typescript
const authMiddleware = async (req, res, next, endpointInfo) => {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            error: [{ field: "authorization", type: "general", message: "Unauthorized" }]
        });
    }
    await next();
};

RegisterHonoHandlers(app, ApiDefinition, handlers, [authMiddleware]);
```

## Key Differences from Express

1. **File Handling**: Uses `Uint8Array` instead of `Buffer` for file contents
2. **Headers**: Use `req.headers.get()` instead of `req.headers[]`
3. **Response Methods**: Hono uses `c.json()` instead of Express `res.json()`
4. **Middleware**: Adapted to work with Hono's middleware system

## Cloudflare Workers Deployment

```javascript
// wrangler.toml
name = "my-api"
main = "src/index.ts"
compatibility_date = "2023-01-01"

// src/index.ts
import app from './app';

export default {
    fetch: app.fetch
};
```

## API Compatibility

The `RegisterHonoHandlers` function has the same signature as `RegisterHandlers`:

```typescript
RegisterHonoHandlers<TDef extends ApiDefinitionSchema>(
    app: Hono,
    apiDefinition: TDef,
    objectHandlers: ObjectHandlers<TDef>,
    middlewares?: AnyMiddleware<TDef>[]
): void
```

This means you can switch between Express and Hono by simply changing the import and app initialization, while keeping your API definitions and handlers unchanged.

## Supported File Upload Configurations

- `single`: Single file upload
- `array`: Multiple files with same field name
- `fields`: Multiple files with different field names
- `any`: Accept any files

All configurations work the same as in the Express version but use Workers-compatible APIs.
