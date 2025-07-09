import { describe, test, expect } from '@jest/globals';
import { ApiClient } from '../src';
import { PublicApiDefinition, PrivateApiDefinition } from '../examples/advanced/definitions';
import { ADVANCED_PORT } from './setup';

describe('Advanced API Tests', () => {
    const baseUrl = `http://localhost:${ADVANCED_PORT}`;

    describe('Public API - Authentication', () => {
        const client = new ApiClient(baseUrl, PublicApiDefinition);

        test('should login successfully with valid credentials', async () => {
            const result = await client.callApi('auth', 'login', {
                body: {
                    username: 'testuser',
                    password: 'password'
                }
            }, {
                200: ({ data }) => {
                    expect(data).toHaveProperty('token');
                    expect(data).toHaveProperty('user');
                    expect(data.token).toBe('mock-jwt-token');
                    expect(data.user.username).toBe('testuser');
                    expect(data.user.email).toBe('test@example.com');
                    expect(data.user.role).toBe('user');
                    return data;
                },
                401: ({ data }) => {
                    throw new Error(`Authentication failed: ${data.error}`);
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.token).toBe('mock-jwt-token');
        });

        test('should fail login with invalid credentials', async () => {
            await expect(
                client.callApi('auth', 'login', {
                    body: {
                        username: 'wronguser',
                        password: 'wrongpassword'
                    }
                }, {
                    200: ({ data }) => data,
                    401: ({ data }) => {
                        expect(data.error).toBe('Invalid credentials');
                        throw new Error('Authentication failed');
                    },
                    422: ({ error }) => {
                        throw new Error(`Validation error: ${JSON.stringify(error)}`);
                    }
                })
            ).rejects.toThrow('Authentication failed');
        });

        test('should logout successfully', async () => {
            const result = await client.callApi('auth', 'logout', {}, {
                200: ({ data }) => {
                    expect(data.message).toBe('Logged out successfully');
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.message).toBe('Logged out successfully');
        });
    });

    describe('Public API - Products', () => {
        const client = new ApiClient(baseUrl, PublicApiDefinition);

        test('should list products with default pagination', async () => {
            const result = await client.callApi('products', 'list', {}, {
                200: ({ data }) => {
                    expect(data).toHaveProperty('products');
                    expect(data).toHaveProperty('total');
                    expect(data).toHaveProperty('page');
                    expect(data).toHaveProperty('totalPages');
                    expect(Array.isArray(data.products)).toBe(true);
                    expect(data.products.length).toBeGreaterThan(0);
                    expect(data.page).toBe(1);
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.products).toBeDefined();
            expect(result.products[0]).toHaveProperty('id');
            expect(result.products[0]).toHaveProperty('name');
            expect(result.products[0]).toHaveProperty('price');
            expect(result.products[0]).toHaveProperty('category');
        });

        test('should list products with custom pagination', async () => {
            const result = await client.callApi('products', 'list', {
                query: {
                    page: 1,
                    limit: 5
                }
            }, {
                200: ({ data }) => {
                    expect(data.page).toBe(1);
                    expect(data.products.length).toBeLessThanOrEqual(5);
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.page).toBe(1);
        });

        test('should filter products by category', async () => {
            const result = await client.callApi('products', 'list', {
                query: {
                    category: 'electronics'
                }
            }, {
                200: ({ data }) => {
                    data.products.forEach(product => {
                        expect(product.category).toBe('electronics');
                    });
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.products).toBeDefined();
        });
    });

    describe('Private API - User Management', () => {
        const client = new ApiClient(baseUrl, PrivateApiDefinition);
        const testUserId = '123e4567-e89b-12d3-a456-426614174000';

        test('should get user by ID', async () => {
            const result = await client.callApi('user', 'get', {
                params: { id: testUserId }
            }, {
                200: ({ data }) => {
                    expect(data.id).toBe(testUserId);
                    expect(data.username).toBe('testuser');
                    expect(data.email).toBe('test@example.com');
                    expect(data.role).toBe('user');
                    expect(data.createdAt).toBeDefined();
                    return data;
                },
                404: ({ data }) => {
                    throw new Error(`User not found: ${data.error}`);
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.id).toBe(testUserId);
        });

        test('should return 404 for non-existent user', async () => {
            const nonExistentId = '123e4567-e89b-12d3-a456-426614174999';

            await expect(
                client.callApi('user', 'get', {
                    params: { id: nonExistentId }
                }, {
                    200: ({ data }) => data,
                    404: ({ data }) => {
                        expect(data.error).toBe('User not found');
                        throw new Error('User not found');
                    },
                    422: ({ error }) => {
                        throw new Error(`Validation error: ${JSON.stringify(error)}`);
                    }
                })
            ).rejects.toThrow('User not found');
        });

        test('should create new user', async () => {
            const newUser = {
                username: 'newuser',
                email: 'newuser@example.com',
                role: 'user' as const
            };

            const result = await client.callApi('user', 'create', {
                body: newUser
            }, {
                201: ({ data }) => {
                    expect(data.id).toBeDefined();
                    expect(data.username).toBe(newUser.username);
                    expect(data.email).toBe(newUser.email);
                    expect(data.role).toBe(newUser.role);
                    expect(data.createdAt).toBeDefined();
                    return data;
                },
                400: ({ data }) => {
                    throw new Error(`Creation failed: ${JSON.stringify(data.errors)}`);
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.username).toBe(newUser.username);
        });

        test('should update existing user', async () => {
            const updates = {
                email: 'updated@example.com'
            };

            const result = await client.callApi('user', 'update', {
                params: { id: testUserId },
                body: updates
            }, {
                200: ({ data }) => {
                    expect(data.id).toBe(testUserId);
                    expect(data.email).toBe(updates.email);
                    return data;
                },
                404: ({ data }) => {
                    throw new Error(`User not found: ${data.error}`);
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.email).toBe(updates.email);
        });

        test('should delete user', async () => {
            const result = await client.callApi('user', 'delete', {
                params: { id: testUserId }
            }, {
                204: ({ data }) => {
                    expect(data).toBeNull();
                    return data;
                },
                404: ({ data }) => {
                    throw new Error(`User not found: ${data.error}`);
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result).toBeNull();
        });
    });

    describe('Private API - File Upload', () => {
        const client = new ApiClient(baseUrl, PrivateApiDefinition);

        test('should handle file upload request', async () => {
            const uploadRequest = {
                fileName: 'test-image.jpg',
                fileType: 'image' as const,
                fileSize: 1024 * 1024 // 1MB
            };

            const result = await client.callApi('fileUpload', 'upload', {
                body: uploadRequest
            }, {
                200: ({ data }) => {
                    expect(data.fileId).toBeDefined();
                    expect(data.uploadUrl).toBeDefined();
                    expect(data.uploadUrl).toMatch(/^https?:\/\//);
                    return data;
                },
                400: ({ data }) => {
                    throw new Error(`Upload failed: ${data.error}`);
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.fileId).toBe('123e4567-e89b-12d3-a456-426614174003');
            expect(result.uploadUrl).toBe('https://example.com/upload/123');
        });
    });

    describe('Schema Validation Tests', () => {
        const client = new ApiClient(baseUrl, PublicApiDefinition);

        test('should validate query parameters strictly', async () => {
            // Test with invalid page number (should be >= 1)
            await expect(
                client.callApi('products', 'list', {
                    query: {
                        page: 0 // Invalid: should be >= 1
                    }
                }, {
                    200: ({ data }) => data,
                    422: ({ error }) => {
                        expect(error).toBeDefined();
                        expect(Array.isArray(error)).toBe(true);
                        throw new Error('Validation failed as expected');
                    }
                })
            ).rejects.toThrow('Validation failed as expected');
        });

        test('should validate body parameters strictly', async () => {
            // Test with extra properties that should be rejected by strict validation
            await expect(
                client.callApi('auth', 'login', {
                    body: {
                        username: 'testuser',
                        password: 'password',
                        extraField: 'should not be allowed' // This should cause validation to fail
                    } as any
                }, {
                    200: ({ data }) => data,
                    401: ({ data }) => data,
                    422: ({ error }) => {
                        expect(error).toBeDefined();
                        expect(Array.isArray(error)).toBe(true);
                        throw new Error('Validation failed as expected');
                    }
                })
            ).rejects.toThrow('Validation failed as expected');
        });
    });
});
