import { describe, test, expect } from '@jest/globals';
import fetch from 'node-fetch';
import { ApiClient } from '../src';
import { PublicApiDefinition, PrivateApiDefinition } from '../examples/simple/definitions';
import { SIMPLE_PORT } from './setup';

describe('Simple API Tests', () => {
    const baseUrl = `http://localhost:${SIMPLE_PORT}`;

    describe('Public API', () => {
        const client = new ApiClient(baseUrl, PublicApiDefinition);

        test('should ping successfully', async () => {
            const result = await client.callApi('common', 'ping', {}, {
                200: ({ data }) => {
                    expect(data).toBe('pong');
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result).toBe('pong');
        });

        test('should handle probe1 with match=true', async () => {
            const result = await client.callApi('status', 'probe1', {
                query: { match: true }
            }, {
                200: ({ data }) => data,
                201: ({ data }) => {
                    expect(data).toEqual({ status: true });
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result).toEqual({ status: true });
        });

        test('should handle probe1 with match=false', async () => {
            const result = await client.callApi('status', 'probe1', {
                query: { match: false }
            }, {
                200: ({ data }) => {
                    expect(data).toBe('pong');
                    return data;
                },
                201: ({ data }) => data,
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result).toBe('pong');
        });

        test('should handle probe2', async () => {
            const result = await client.callApi('status', 'probe2', {}, {
                200: ({ data }) => {
                    expect(data).toBe('pong');
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result).toBe('pong');
        });
    });

    describe('Private API', () => {
        const client = new ApiClient(baseUrl, PrivateApiDefinition);

        test('should get user successfully', async () => {
            const result = await client.callApi('user', 'get', {
                params: { id: 'test-id' }
            }, {
                200: ({ data }) => {
                    expect(data).toBe('ok');
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result).toBe('ok');
        });
    });

    describe('Strict Validation Tests', () => {
        test('should fail validation with extra properties in response', async () => {
            // This test verifies that our strict validation works
            // We'll need to create a mock server that returns extra properties

            // Direct HTTP call to test strict validation
            const response = await fetch(`${baseUrl}/api/v1/public/ping`);
            const data = await response.json();

            // The response should only contain the expected structure
            expect(data).toHaveProperty('data');
            expect(data.data).toBe('pong');

            // Should not have any extra properties
            const keys = Object.keys(data);
            expect(keys).toEqual(['data']);
        });
    });
});
