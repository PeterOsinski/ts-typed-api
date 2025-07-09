# Tests

This directory contains comprehensive tests for the ts-typed-api library based on the examples in the `examples/` directory.

## Test Structure

### Test Files

- **`setup.ts`** - Test setup and server initialization
- **`simple-api.test.ts`** - Tests based on `examples/simple/`
- **`advanced-api.test.ts`** - Tests based on `examples/advanced/`
- **`strict-validation.test.ts`** - Tests for strict schema validation

### Test Servers

The tests automatically start multiple test servers on different ports:

- **Simple API Server** (Port 3001) - Basic ping/pong and status endpoints
- **Advanced API Server** (Port 3002) - Authentication, user management, and product listing
- **File Upload Server** (Port 3003) - File upload functionality
- **Strict Validation Server** (Port 3004) - Tests strict schema validation

## Running Tests

### All Tests
```bash
npm test
```

### Individual Test Suites
```bash
# Simple API tests
npm run test:simple

# Advanced API tests  
npm run test:advanced

# Strict validation tests
npm run test:strict
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Coverage

The tests cover:

### Core Functionality
- ✅ API client creation and usage
- ✅ Type-safe request/response handling
- ✅ Route parameter validation
- ✅ Query parameter validation
- ✅ Request body validation
- ✅ Response schema validation

### Strict Validation
- ✅ Extra properties in responses cause 500 errors
- ✅ Extra properties in request bodies cause 422 errors
- ✅ Extra properties in query parameters cause 422 errors
- ✅ Valid requests/responses work correctly
- ✅ Schema definition strictness enforcement

### Error Handling
- ✅ Validation error responses (422)
- ✅ Authentication failures (401)
- ✅ Not found errors (404)
- ✅ Server errors (500)

### API Features
- ✅ Authentication endpoints
- ✅ CRUD operations
- ✅ Pagination
- ✅ Filtering
- ✅ File upload handling
- ✅ Middleware support

## Test Data

The tests use mock data and don't require external dependencies. All test servers are started automatically and use in-memory data storage.

## Strict Validation Testing

The strict validation tests specifically verify that:

1. **Response Validation**: When a handler tries to return data with properties not defined in the response schema, the server returns a 500 error instead of silently stripping the properties.

2. **Request Validation**: When a client sends request data (body, query, params) with extra properties not defined in the schema, the server returns a 422 validation error.

3. **Schema Definition**: The `CreateResponses()` and `CreateApiDefinition()` functions automatically apply `.strict()` to all Zod object schemas.

This ensures that your API contracts are strictly enforced and prevents data leakage or unexpected behavior.
