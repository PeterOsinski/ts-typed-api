import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import { Server } from 'http';
import { RegisterHandlers, CreateApiDefinition, CreateResponses, ErrorHandler } from '../src';
import { z } from 'zod';

const ErrorHandlerTestApiDefinition = CreateApiDefinition({
    prefix: '/api',
    endpoints: {
        test: {
            success: {
                method: 'GET',
                path: '/success',
                responses: CreateResponses({
                    200: z.object({ message: z.string() })
                })
            },
            validationError: {
                method: 'POST',
                path: '/validation-error',
                body: z.object({
                    name: z.string().min(3, 'Name must be at least 3 characters'),
                    email: z.string().email('Invalid email format')
                }),
                responses: CreateResponses({
                    200: z.object({ message: z.string() })
                })
            },
            customError: {
                method: 'GET',
                path: '/custom-error',
                responses: CreateResponses({
                    200: z.object({ message: z.string() })
                })
            }
        }
    }
});

const testHandlers = {
    test: {
        success: async (req: any, res: any) => {
            res.respond(200, { message: 'success' });
        },
        validationError: async () => {
            // This will cause a Zod validation error - validation happens before handler
            throw new Error('Should not reach handler');
        },
        customError: async (req: any, res: any) => {
            // Throw a custom error to test error handler
            throw new Error('Custom application error');
        }
    }
};

describe('Error Handler Tests', () => {
    let server: Server;
    let port: number;

    beforeAll(async () => {
        port = 3009; // Use a different port
        const app = express();
        app.use(express.json());

        // Custom error handler
        const customErrorHandler: ErrorHandler = (error, routeDefinition, method, path, expressRes) => {
            if (error instanceof z.ZodError) {
                // Custom Zod error handling
                const customErrors = error.issues.map(issue => ({
                    field: issue.path.join('.'),
                    message: `Custom: ${issue.message}`,
                    type: issue.path[0] === 'body' ? 'body' : issue.path[0] === 'query' ? 'query' : 'param'
                }));

                expressRes.status(422).json({
                    data: null,
                    error: customErrors,
                    customHandled: true
                });
                return true; // Handled
            } else if (error instanceof Error && error.message === 'Custom application error') {
                // Custom application error handling
                expressRes.status(400).json({
                    data: null,
                    error: [{ field: 'general', message: 'Custom error message', type: 'general' }],
                    customHandled: true
                });
                return true; // Handled
            }

            return false; // Not handled, use default
        };

        RegisterHandlers(app, ErrorHandlerTestApiDefinition, testHandlers, undefined, customErrorHandler);

        server = app.listen(port);
    });

    afterAll(async () => {
        if (server) {
            server.close();
        }
    });

    test('should handle success response normally', async () => {
        const response = await fetch(`http://localhost:${port}/api/success`);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({
            data: { message: 'success' }
        });
    });

    test('should use custom error handler for Zod validation errors', async () => {
        const response = await fetch(`http://localhost:${port}/api/validation-error`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'A', email: 'invalid-email' })
        });
        expect(response.status).toBe(422);
        const data = await response.json() as any;
        expect(data.customHandled).toBe(true);
        expect(data.error).toBeDefined();
        expect(data.error.length).toBeGreaterThan(0);
        expect(data.error[0].message).toContain('Custom:');
    });

    test('should use custom error handler for application errors', async () => {
        const response = await fetch(`http://localhost:${port}/api/custom-error`);
        expect(response.status).toBe(400);
        const data = await response.json() as any;
        expect(data.customHandled).toBe(true);
        expect(data.error).toEqual([{
            field: 'general',
            message: 'Custom error message',
            type: 'general'
        }]);
    });

    test('should fall back to default error handler for unhandled errors', async () => {
        // Test with a route that doesn't exist to trigger a different error
        const response = await fetch(`http://localhost:${port}/api/nonexistent`);
        expect(response.status).toBe(404);
        // This would be handled by Express default 404 handler, not our error handler
    });
});