import { describe, test, expect } from '@jest/globals';
import fetch from 'node-fetch';
import { z } from 'zod';
import { CreateApiDefinition, CreateResponses, RegisterHandlers } from '../src';
import express from 'express';
import { Server } from 'http';

describe('Strict Validation Tests', () => {
    let server: Server;
    const port = 3004;
    const baseUrl = `http://localhost:${port}`;

    beforeAll(async () => {
        await startTestServer();
    });

    afterAll(async () => {
        if (server) {
            server.close();
        }
    });

    async function startTestServer(): Promise<void> {
        return new Promise((resolve) => {
            // Create API definition with strict schemas
            const StrictApiDefinition = CreateApiDefinition({
                prefix: '/api',
                endpoints: {
                    test: {
                        strictResponse: {
                            path: '/strict-response',
                            method: 'GET',
                            responses: CreateResponses({
                                200: z.object({
                                    name: z.string(),
                                    age: z.number()
                                })
                            })
                        },
                        strictBody: {
                            path: '/strict-body',
                            method: 'POST',
                            body: z.object({
                                title: z.string(),
                                count: z.number()
                            }),
                            responses: CreateResponses({
                                200: z.object({
                                    success: z.boolean()
                                })
                            })
                        },
                        strictQuery: {
                            path: '/strict-query',
                            method: 'GET',
                            query: z.object({
                                filter: z.string(),
                                limit: z.number()
                            }),
                            responses: CreateResponses({
                                200: z.object({
                                    results: z.array(z.string())
                                })
                            })
                        }
                    }
                }
            });

            const app = express();
            app.use(express.json());

            RegisterHandlers(app, StrictApiDefinition, {
                test: {
                    strictResponse: async (req, res) => {
                        // Try to send response with extra properties
                        // This should fail due to strict validation
                        const responseData = {
                            name: 'John',
                            age: 30,
                            // These extra properties should cause validation to fail
                            extraProperty: 'should not be allowed',
                            anotherExtra: 123
                        };

                        res.respond(200, responseData);
                    },
                    strictBody: async (req, res) => {
                        // The request body should be strictly validated
                        // Extra properties in the request should cause validation errors
                        res.respond(200, { success: true });
                    },
                    strictQuery: async (req, res) => {
                        // Query parameters should be strictly validated
                        res.respond(200, { results: ['item1', 'item2'] });
                    }
                }
            });

            server = app.listen(port, () => {
                resolve();
            });
        });
    }

    test('should fail when response contains extra properties', async () => {
        // This should return a 500 error because the response contains extra properties
        const response = await fetch(`${baseUrl}/api/strict-response`);

        expect(response.status).toBe(500);

        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(Array.isArray(data.error)).toBe(true);
        expect(data.error[0].message).toContain('Internal server error');
    });

    test('should fail when request body contains extra properties', async () => {
        const requestBody = {
            title: 'Test Title',
            count: 5,
            // Extra properties that should cause validation to fail
            extraField: 'not allowed',
            anotherField: true
        };

        const response = await fetch(`${baseUrl}/api/strict-body`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        expect(response.status).toBe(422);

        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(Array.isArray(data.error)).toBe(true);

        // Should contain validation errors for the extra properties
        const errorMessages = data.error.map((err: any) => err.message);
        expect(errorMessages.some((msg: string) => msg.includes('Unrecognized key'))).toBe(true);
    });

    test('should fail when query parameters contain extra properties', async () => {
        // Add extra query parameters that aren't in the schema
        const queryParams = new URLSearchParams({
            filter: 'test',
            limit: '10',
            // Extra parameters that should cause validation to fail
            extraParam: 'not allowed',
            anotherParam: 'also not allowed'
        });

        const response = await fetch(`${baseUrl}/api/strict-query?${queryParams}`);

        expect(response.status).toBe(422);

        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(Array.isArray(data.error)).toBe(true);

        // Should contain validation errors for the extra query parameters
        const errorMessages = data.error.map((err: any) => err.message);
        expect(errorMessages.some((msg: string) => msg.includes('Unrecognized key'))).toBe(true);
    });

    test('should succeed when request matches schema exactly', async () => {
        const requestBody = {
            title: 'Valid Title',
            count: 42
            // No extra properties
        };

        const response = await fetch(`${baseUrl}/api/strict-body`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('data');
        expect(data.data.success).toBe(true);
    });

    test('should succeed when query parameters match schema exactly', async () => {
        const queryParams = new URLSearchParams({
            filter: 'test-filter',
            limit: '5'
            // No extra parameters
        });

        const response = await fetch(`${baseUrl}/api/strict-query?${queryParams}`);

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty('data');
        expect(data.data.results).toEqual(['item1', 'item2']);
    });

    describe('Schema Definition Strictness', () => {
        test('CreateResponses should make schemas strict', () => {
            const responses = CreateResponses({
                200: z.object({
                    name: z.string(),
                    age: z.number()
                })
            });

            const testData = {
                data: {
                    name: 'John',
                    age: 30,
                    extraProperty: 'should fail'
                },
                error: null
            };

            // This should fail validation due to strict mode
            const result = responses[200].safeParse(testData);
            expect(result.success).toBe(false);

            if (!result.success) {
                const errorMessages = result.error.errors.map(err => err.message);
                expect(errorMessages.some(msg => msg.includes('Unrecognized key'))).toBe(true);
            }
        });

        test('CreateApiDefinition should make all schemas strict', () => {
            const apiDef = CreateApiDefinition({
                endpoints: {
                    test: {
                        endpoint: {
                            path: '/test',
                            method: 'POST',
                            body: z.object({
                                name: z.string()
                            }),
                            responses: CreateResponses({
                                200: z.object({
                                    success: z.boolean()
                                })
                            })
                        }
                    }
                }
            });

            // Test that body schema is strict
            const bodySchema = apiDef.endpoints.test.endpoint.body;
            const bodyResult = bodySchema?.safeParse({
                name: 'test',
                extraField: 'should fail'
            });

            expect(bodyResult?.success).toBe(false);
            if (bodyResult && !bodyResult.success) {
                const errorMessages = bodyResult.error.errors.map(err => err.message);
                expect(errorMessages.some(msg => msg.includes('Unrecognized key'))).toBe(true);
            }
        });
    });
});
