import express from 'express';
import { PrivateApiDefinition, PublicApiDefinition } from './definitions';
import { registerHandlers, EndpointMiddleware } from '../../src/router';
import { runClientExample } from './client';

// Simple UUID generator for demo purposes
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const app = express();
const port = 3001;
app.set('etag', false);
app.use(express.json()); // Middleware to parse JSON bodies

// Simulated in-memory databases
const users: Record<string, any> = {
    '550e8400-e29b-41d4-a716-446655440000': {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'john_doe',
        email: 'john@example.com',
        role: 'user',
        createdAt: new Date('2024-01-01')
    },
    '550e8400-e29b-41d4-a716-446655440001': {
        id: '550e8400-e29b-41d4-a716-446655440001',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        createdAt: new Date('2024-01-01')
    }
};

const products: Record<string, any> = {
    '660e8400-e29b-41d4-a716-446655440000': {
        id: '660e8400-e29b-41d4-a716-446655440000',
        name: 'Laptop',
        description: 'High-performance laptop',
        price: 999.99,
        category: 'electronics'
    },
    '660e8400-e29b-41d4-a716-446655440001': {
        id: '660e8400-e29b-41d4-a716-446655440001',
        name: 'T-Shirt',
        description: 'Cotton t-shirt',
        price: 19.99,
        category: 'clothing'
    },
    '660e8400-e29b-41d4-a716-446655440002': {
        id: '660e8400-e29b-41d4-a716-446655440002',
        name: 'Programming Book',
        description: 'Learn TypeScript',
        price: 39.99,
        category: 'books'
    }
};

const sessions: Record<string, any> = {};

// Example middlewares that receive endpoint information
const loggingMiddleware: EndpointMiddleware = (req, res, next, endpointInfo) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Endpoint: ${endpointInfo.domain}.${endpointInfo.routeKey}`);
    next();
};

const authMiddleware: EndpointMiddleware = async (req, res, next, endpointInfo) => {

    // Example auth logic
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log(`Auth failed for ${endpointInfo.domain}.${endpointInfo.routeKey} - No valid auth header`);
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const token = authHeader.split(' ')[1];
    if (!sessions[token]) {
        console.log(`Auth failed for ${endpointInfo.domain}.${endpointInfo.routeKey} - Invalid token`);
        res.status(401).json({ error: "Invalid token" });
        return;
    }

    console.log(`Auth passed for ${endpointInfo.domain}.${endpointInfo.routeKey}`);
    next();
};

// Register public API handlers
registerHandlers(app, PublicApiDefinition, {
    auth: {
        login: async (req, res) => {
            const { username, password } = req.body;
            console.log('Login attempt for username:', username);

            // Simulated login logic - check against our users database
            const user = Object.values(users).find(u => u.username === username);

            if (user && password === 'password') { // Simple password check for demo
                const token = `token-${Date.now()}-${Math.random()}`;

                // Store session
                sessions[token] = user;

                console.log('Login successful for user:', username);
                res.respond(200, {
                    token,
                    user: {
                        username: user.username,
                        email: user.email,
                        role: user.role
                    }
                });
            } else {
                console.log('Login failed for user:', username);
                res.respond(401, {
                    error: 'Invalid credentials'
                });
            }
        },
        logout: async (req, res) => {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                delete sessions[token];
                console.log('User logged out, token invalidated');
            }

            res.respond(200, {
                message: 'Logged out successfully'
            });
        }
    },
    products: {
        list: async (req, res) => {
            const { page = 1, limit = 10, category, minPrice, maxPrice } = req.query;
            console.log('Products list requested with filters:', { page, limit, category, minPrice, maxPrice });

            let filteredProducts = Object.values(products);

            // Apply filters
            if (category) {
                filteredProducts = filteredProducts.filter(p => p.category === category);
            }
            if (minPrice !== undefined) {
                filteredProducts = filteredProducts.filter(p => p.price >= minPrice);
            }
            if (maxPrice !== undefined) {
                filteredProducts = filteredProducts.filter(p => p.price <= maxPrice);
            }

            // Pagination
            const total = filteredProducts.length;
            const totalPages = Math.ceil(total / limit);
            const startIndex = (page - 1) * limit;
            const paginatedProducts = filteredProducts.slice(startIndex, startIndex + limit);

            res.respond(200, {
                products: paginatedProducts,
                total,
                page,
                totalPages
            });
        }
    }
}, [loggingMiddleware]);

// Register private API handlers with auth middleware
registerHandlers(app, PrivateApiDefinition, {
    user: {
        get: async (req, res) => {
            const userId = req.params.id;
            console.log('Fetching user with ID:', userId);

            const user = users[userId];
            if (!user) {
                console.log('User not found:', userId);
                return res.respond(404, {
                    error: 'User not found'
                });
            }

            res.respond(200, user);
        },
        create: async (req, res) => {
            const userData = req.body;
            console.log('Creating new user:', userData);

            // Check if username or email already exists
            const existingUser = Object.values(users).find(u =>
                u.username === userData.username || u.email === userData.email
            );

            if (existingUser) {
                return res.respond(400, {
                    errors: [
                        {
                            field: existingUser.username === userData.username ? 'username' : 'email',
                            message: 'Already exists'
                        }
                    ]
                });
            }

            const newUser = {
                id: generateUUID(),
                ...userData,
                createdAt: new Date()
            };

            users[newUser.id] = newUser;
            console.log('User created successfully:', newUser.id);

            res.respond(201, newUser);
        },
        update: async (req, res) => {
            const userId = req.params.id;
            const updateData = req.body;
            console.log('Updating user:', userId, 'with data:', updateData);

            const user = users[userId];
            if (!user) {
                console.log('User not found for update:', userId);
                return res.respond(404, {
                    error: 'User not found'
                });
            }

            // Update user data
            const updatedUser = { ...user, ...updateData };
            users[userId] = updatedUser;

            console.log('User updated successfully:', userId);
            res.respond(200, updatedUser);
        },
        delete: async (req, res) => {
            const userId = req.params.id;
            console.log('Deleting user:', userId);

            if (!users[userId]) {
                console.log('User not found for deletion:', userId);
                return res.respond(404, {
                    error: 'User not found'
                });
            }

            delete users[userId];
            console.log('User deleted successfully:', userId);

            res.respond(204, null);
        }
    },
    fileUpload: {
        upload: async (req, res) => {
            const { fileName, fileType, fileSize } = req.body;
            console.log('File upload request:', { fileName, fileType, fileSize });

            // Validate file size (10MB max)
            if (fileSize > 10 * 1024 * 1024) {
                return res.respond(400, {
                    error: 'File size exceeds 10MB limit'
                });
            }

            // Generate file ID and upload URL
            const fileId = generateUUID();
            const uploadUrl = `https://example-storage.com/upload/${fileId}`;

            console.log('File upload prepared:', { fileId, uploadUrl });

            res.respond(200, {
                fileId,
                uploadUrl
            });
        }
    }
}, [loggingMiddleware, authMiddleware]);

app.listen(port, async () => {
    console.log(`Backend server listening at http://localhost:${port}`);
    console.log('\nAvailable endpoints:');
    console.log('Public API:');
    console.log('  GET /api/v1/public/ping');
    console.log('  GET /api/v1/public/status/probe1?match=true');
    console.log('  GET /api/v1/public/status/probe2');
    console.log('  POST /api/v1/public/login');
    console.log('  POST /api/v1/public/logout');
    console.log('  GET /api/v1/public/products?page=1&limit=10&category=electronics');
    console.log('\nPrivate API (requires Bearer token):');
    console.log('  GET /api/v1/private/user/:id');
    console.log('  POST /api/v1/private/user');
    console.log('  PUT /api/v1/private/user/:id');
    console.log('  DELETE /api/v1/private/user/:id');
    console.log('  POST /api/v1/private/upload');
    console.log('\nTest credentials: username="admin", password="password"');
    await runClientExample()
});
