import { ApiClient } from '../../src';
import { PublicApiDefinition, PrivateApiDefinition } from './definitions';

// Type-safe wrapper function with explicit return type
async function runClientExample(): Promise<void> {
    const baseUrl = 'http://localhost:3001';

    // Create API clients for both public and private APIs
    const publicApiClient = new ApiClient(baseUrl, PublicApiDefinition);

    const privateApiClient = new ApiClient(baseUrl, PrivateApiDefinition);

    console.log('🚀 Starting comprehensive API client examples...\n');

    // 3. Authentication flow
    console.log('\n1. Testing authentication:');
    let authToken = '';

    // Login
    await publicApiClient.callApi('auth', 'login', {
        body: {
            username: 'admin',
            password: 'password'
        }
    }, {
        200: (payload) => {
            console.log('✅ Login successful:', payload.data);
            authToken = payload.data.token;
        },
        401: (payload) => {
            console.log('❌ Login failed:', payload.data);
        },
        422: (payload) => {
            console.log('❌ Login validation error:', payload.error);
        }
    });

    // 4. Products listing with filters and pagination
    console.log('\n2. Testing product catalog:');

    // Get all products
    await publicApiClient.callApi('products', 'list', {}, {
        200: (payload) => {
            console.log('✅ All products:', {
                count: payload.data.products.length,
                total: payload.data.total,
                page: payload.data.page,
                totalPages: payload.data.totalPages
            });
        },
        422: (payload) => {
            console.log("error", payload.error)
        }
    });

    // Get electronics with pagination
    await publicApiClient.callApi('products', 'list', {
        query: {
            category: 'electronics',
            page: 1,
            limit: 5
        }
    }, {
        200: (payload) => {
            console.log('✅ Electronics products:', {
                products: payload.data.products.map(p => ({ name: p.name, price: p.price })),
                total: payload.data.total
            });
        },
        422: (payload) => {
            console.log("error", payload.error)
        }
    });

    // Get products with price filter
    await publicApiClient.callApi('products', 'list', {
        query: {
            minPrice: 20,
            maxPrice: 100
        }
    }, {
        200: (payload) => {
            console.log('✅ Products ($20-$100):', {
                products: payload.data.products.map(p => ({ name: p.name, price: p.price }))
            });
        },
        422: (payload) => {
            console.log("error", payload.error)
        }
    });

    // 5. Private API calls (requires authentication)
    if (authToken) {
        console.log('\n3. Testing private API with authentication:');

        // Set auth header for private API client
        const authHeaders = { 'Authorization': `Bearer ${authToken}` };

        // Get existing user
        await privateApiClient.callApi('user', 'get', {
            params: { id: '550e8400-e29b-41d4-a716-446655440000' },
            headers: authHeaders
        }, {
            200: (payload) => {
                console.log('✅ User retrieved:', {
                    username: payload.data.username,
                    email: payload.data.email,
                    role: payload.data.role
                });
            },
            404: (payload) => {
                console.log('❌ User not found:', payload);
            },
            422: (payload) => {
                console.log("error", payload.error)
            }
        });

        // Create new user
        await privateApiClient.callApi('user', 'create', {
            body: {
                username: 'new_user',
                email: 'newuser@example.com',
                role: 'user'
            },
            headers: authHeaders
        }, {
            201: (payload) => {
                console.log('✅ User created:', {
                    id: payload.data.id,
                    username: payload.data.username,
                    email: payload.data.email
                });

                // Update the newly created user
                return privateApiClient.callApi('user', 'update', {
                    params: { id: payload.data.id },
                    body: {
                        role: 'moderator'
                    },
                    headers: authHeaders
                }, {
                    200: (updatedPayload) => {
                        console.log('✅ User updated:', {
                            id: updatedPayload.data.id,
                            role: updatedPayload.data.role
                        });
                    },
                    404: (error) => {
                        console.log('❌ User update failed:', error);
                    },
                    422: (payload) => {
                        console.log("error", payload.error)
                    }
                });
            },
            400: (payload) => {
                console.log('❌ User creation failed:', payload);
            },
            422: (payload) => {
                console.log("error", payload.error)
            }
        });

        // File upload simulation
        await privateApiClient.callApi('fileUpload', 'upload', {
            body: {
                fileName: 'document.pdf',
                fileType: 'document',
                fileSize: 1024 * 1024 // 1MB
            },
            headers: authHeaders
        }, {
            200: (payload) => {
                console.log('✅ File upload prepared:', {
                    fileId: payload.data.fileId,
                    uploadUrl: payload.data.uploadUrl
                });
            },
            400: (payload) => {
                console.log('❌ File upload failed:', payload);
            },
            422: (payload) => {
                console.log("error", payload.error)
            }
        });

        // Test file size validation
        await privateApiClient.callApi('fileUpload', 'upload', {
            body: {
                fileName: 'large-video.mp4',
                fileType: 'video',
                fileSize: 5 * 1024 * 1024 // 15MB (exceeds 10MB limit)
            },
            headers: authHeaders
        }, {
            200: (payload) => {
                console.log('✅ Large file upload prepared:', payload);
            },
            400: (payload) => {
                console.log('✅ File size validation working:', payload);
            },
            422: (payload) => {
                console.log("error", payload.error)
            }
        });
    }

    // 6. Logout
    console.log('\n4. Testing logout:');
    await publicApiClient.callApi('auth', 'logout', {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
    }, {
        200: (payload) => {
            console.log('✅ Logout successful:', payload);
        },
        422: (payload) => {
            console.log("error", payload.error)
        }
    });

    console.log('\n🎉 All API client examples completed!');
}

// Export for potential use in other modules
export { runClientExample };
