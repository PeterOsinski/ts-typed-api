import { describe, test, expect } from '@jest/globals';
import { ApiClient } from '../src';
import { MiddlewareTestApiDefinition } from './setup';

// Test servers with middleware (will be defined in setup.ts)
export const MIDDLEWARE_EXPRESS_PORT = 3007;
export const MIDDLEWARE_HONO_PORT = 3008;

describe.each([
    ['Express', MIDDLEWARE_EXPRESS_PORT],
    ['Hono', MIDDLEWARE_HONO_PORT]
])('Middleware Tests - %s', (serverName, port) => {
    const baseUrl = `http://localhost:${port}`;
    const client = new ApiClient(baseUrl, MiddlewareTestApiDefinition);

    describe('Basic Middleware Functionality', () => {
        test('should execute middleware and allow request to proceed', async () => {
            const result = await client.callApi('public', 'ping', {}, {
                200: ({ data }) => {
                    expect(data.message).toBe('pong');
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.message).toBe('pong');
        });
    });

    describe('Context Modification Middleware', () => {
        test('should have access to context data set by middleware', async () => {
            const result = await client.callApi('public', 'context', {}, {
                200: ({ data }) => {
                    expect(data.message).toBe('context test');
                    expect(data.contextData).toBe('middleware-added-data');
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.contextData).toBe('middleware-added-data');
        });
    });

    describe('Authentication Middleware', () => {
        test('should allow access with valid auth header', async () => {
            // This test assumes the middleware checks for an 'authorization' header
            const result = await client.callApi('public', 'protected', { headers: { Authorization: 'Bearer valid-token' } }, {
                200: ({ data }) => {
                    expect(data.message).toBe('protected content');
                    expect(data.user).toBe('testuser');
                    return data;
                },
                401: ({ data }) => {
                    throw new Error(`Authentication failed: ${data.error}`);
                },
                403: ({ data }) => {
                    throw new Error(`Forbidden: ${data.error}`);
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.user).toBe('testuser');
        });

        test('should deny access without auth header', async () => {
            await expect(
                client.callApi('public', 'protected', {}, {
                    200: ({ data }) => data,
                    401: ({ data }) => {
                        expect(data.error).toBe('No authorization header');
                        throw new Error('Authentication failed as expected');
                    },
                    403: ({ data }) => {
                        throw new Error(`Unexpected forbidden: ${data.error}`);
                    },
                    422: ({ error }) => {
                        throw new Error(`Validation error: ${JSON.stringify(error)}`);
                    }
                })
            ).rejects.toThrow('Authentication failed as expected');
        });

        test('should deny access with invalid auth header', async () => {
            await expect(
                client.callApi('public', 'protected', { headers: { Authorization: 'Bearer invalid-token' } }, {
                    200: ({ data }) => data,
                    401: ({ data }) => {
                        throw new Error(`Unexpected auth failed: ${data.error}`);
                    },
                    403: ({ data }) => {
                        expect(data.error).toBe('Forbidden');
                        throw new Error('Forbidden as expected');
                    },
                    422: ({ error }) => {
                        throw new Error(`Validation error: ${JSON.stringify(error)}`);
                    }
                })
            ).rejects.toThrow('Forbidden as expected');
        });
    });

    describe('Response Logging Middleware', () => {
        let consoleSpy: jest.SpyInstance;

        beforeEach(() => {
            consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        test('should log response status without breaking functionality', async () => {
            // The response logging middleware should not interfere with normal operation
            const result = await client.callApi('public', 'ping', {}, {
                200: ({ data }) => {
                    expect(data.message).toBe('pong');
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.message).toBe('pong');

            // Assert that console.log was called with the expected message
            expect(consoleSpy).toHaveBeenCalledWith('[TIMING] public.ping responded with 200');
            expect(consoleSpy).toHaveBeenCalledWith('[Test] GET /api/v1/ping - Domain: public, Route: ping');
        });

        test('should log response status for protected routes', async () => {
            const result = await client.callApi('public', 'protected', { headers: { Authorization: 'Bearer valid-token' } }, {
                200: ({ data }) => {
                    expect(data.message).toBe('protected content');
                    expect(data.user).toBe('testuser');
                    return data;
                },
                401: ({ data }) => {
                    throw new Error(`Authentication failed: ${data.error}`);
                },
                403: ({ data }) => {
                    throw new Error(`Forbidden: ${data.error}`);
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.user).toBe('testuser');

            // Assert that console.log was called with the expected messages
            expect(consoleSpy).toHaveBeenCalledWith('[TIMING] public.protected responded with 200');
            expect(consoleSpy).toHaveBeenCalledWith('[Test] GET /api/v1/protected - Domain: public, Route: protected');
        });

        test('should log error status codes for auth failures', async () => {
            await expect(
                client.callApi('public', 'protected', {}, {
                    200: ({ data }) => data,
                    401: ({ data }) => {
                        expect(data.error).toBe('No authorization header');
                        throw new Error('Authentication failed as expected');
                    },
                    403: ({ data }) => {
                        throw new Error(`Unexpected forbidden: ${data.error}`);
                    },
                    422: ({ error }) => {
                        throw new Error(`Validation error: ${JSON.stringify(error)}`);
                    }
                })
            ).rejects.toThrow('Authentication failed as expected');

            // Assert that console.log was called with the error status
            expect(consoleSpy).toHaveBeenCalledWith('[TIMING] public.protected responded with 401');
        });
    });
});
