// Example of using the client-only import for browser environments
// This import will NOT include server dependencies like multer/busboy

import { ApiClient, CreateApiDefinition, CreateResponses } from 'ts-typed-api/client';
import { z } from 'zod';

// Define a simple API (this would typically be shared between client and server)
const ApiDefinition = CreateApiDefinition({
    prefix: '/api',
    endpoints: {
        users: {
            getUser: {
                path: '/users/:id',
                method: 'GET',
                params: z.object({
                    id: z.string()
                }),
                responses: CreateResponses({
                    200: z.object({
                        id: z.string(),
                        name: z.string(),
                        email: z.string()
                    })
                })
            },
            createUser: {
                path: '/users',
                method: 'POST',
                body: z.object({
                    name: z.string(),
                    email: z.string()
                }),
                responses: CreateResponses({
                    201: z.object({
                        id: z.string(),
                        name: z.string(),
                        email: z.string()
                    })
                })
            }
        }
    }
});

// Create client instance
const client = new ApiClient('http://localhost:3000', ApiDefinition);

// Example usage in browser
async function exampleUsage() {
    try {
        // Get a user
        const getUserResult = await client.callApi('users', 'getUser',
            { params: { id: '123' } },
            {
                200: ({ data }) => {
                    console.log('User found:', data);
                    return data;
                },
                422: ({ error }) => {
                    console.error('Validation error:', error);
                    throw new Error('Validation failed');
                }
            }
        );

        // Create a user
        const createUserResult = await client.callApi('users', 'createUser',
            {
                body: {
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            },
            {
                201: ({ data }) => {
                    console.log('User created:', data);
                    return data;
                },
                422: ({ error }) => {
                    console.error('Validation error:', error);
                    throw new Error('Validation failed');
                }
            }
        );

        return { getUserResult, createUserResult };
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Export for use in browser
export { client, exampleUsage };
