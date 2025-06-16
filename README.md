# ts-rpc 🚀

A lightweight, type-safe RPC (Remote Procedure Call) library for TypeScript with Zod validation.

## 🌟 Features

- **Type-Safe API Definitions**: Create fully type-safe API routes with compile-time type checking
- **Zod Validation**: Built-in runtime validation using Zod schemas
- **Flexible HTTP Client**: Supports custom HTTP adapters (fetch, axios, etc.)
- **OpenAPI Schema Generation**: Automatic OpenAPI/Swagger schema creation
- **Minimal Overhead**: Lightweight implementation with powerful type inference

## 📦 Installation

```bash
npm install ts-rpc zod
```

## 🚀 Quick Start

### 1. Define API Routes with Zod Schemas

```typescript
import { z } from 'zod';

// Define input and output schemas
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

const CreateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format")
});

const ApiDefinition = {
  app: {
    ping: {
      method: 'GET',
      path: '/users/:id',
      params: z.object({ id: z.coerce.number() }),
      responses: {
        200: UserSchema,
        404: z.object({ message: z.string() })
      }
    },
  }
};
```

### 2. Implement Server-Side Handlers

```typescript

```

### 3. Client-Side API Calls

```typescript

```

## 🔑 Key Benefits

- **Compile-Time Type Safety**: Catch type mismatches before runtime
- **Runtime Validation**: Zod ensures data integrity
- **Flexible Error Handling**: Detailed error responses with type inference
- **Minimal Boilerplate**: Clean, concise API definition and usage

## 🛠️ Customization

### HTTP Client Adapters

You can create custom HTTP client adapters by implementing the `HttpClientAdapter` interface:

```typescript
interface HttpClientAdapter {
  request<T = any>(url: string, options: HttpRequestOptions): Promise<HttpResponse<T>>;
}
```

### Supported Features

- Custom HTTP adapters
- Type-safe route definitions
- Zod schema validation
- Flexible error handling
- OpenAPI schema generation (coming soon)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

ISC License
