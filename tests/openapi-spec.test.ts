import { describe, test, expect } from '@jest/globals';
import { generateOpenApiSpec } from '../src/openapi-self';
import { PublicApiDefinition } from '../examples/simple/definitions';
import { PrivateApiDefinition } from '../examples/simple/definitions';
import { z } from 'zod';
import { CreateApiDefinition } from '../src/definition';

describe('OpenAPI Specification Generation', () => {
    test('should generate OpenAPI spec for a single definition', () => {
        const spec = generateOpenApiSpec(PublicApiDefinition);

        expect(spec).toBeDefined();
        expect(spec.openapi).toBe('3.0.0');
        expect(spec.info).toBeDefined();
        expect(spec.paths).toBeDefined();
    });

    test('should generate OpenAPI spec for multiple definitions', () => {
        const spec = generateOpenApiSpec([PublicApiDefinition, PrivateApiDefinition]);

        expect(spec).toBeDefined();
        expect(spec.openapi).toBe('3.0.0');
        expect(spec.info).toBeDefined();
        expect(spec.paths).toBeDefined();

        // Verify paths from both definitions are included
        const publicPaths = Object.keys(spec.paths ?? {}).filter(path =>
            path.includes('/public/')
        );
        const privatePaths = Object.keys(spec.paths ?? {}).filter(path =>
            path.includes('/private/')
        );

        expect(publicPaths.length).toBeGreaterThan(0);
        expect(privatePaths.length).toBeGreaterThan(0);
    });

    test('should handle custom OpenAPI spec options', () => {
        const spec = generateOpenApiSpec(PublicApiDefinition, {
            info: {
                title: 'Test API',
                version: '2.0.0',
                description: 'A test API description'
            },
            servers: [{ url: 'https://api.example.com', description: 'Production server' }]
        });

        expect(spec.info.title).toBe('Test API');
        expect(spec.info.version).toBe('2.0.0');
        expect(spec.info.description).toBe('A test API description');
        expect(spec.servers?.[0]?.url).toBe('https://api.example.com');
    });

    test('should handle complex Zod schemas', () => {
        // Create a complex Zod schema to test schema registration
        const ComplexSchema = z.object({
            id: z.string().uuid(),
            name: z.string().min(3).max(50),
            age: z.number().int().positive(),
            metadata: z.record(z.string(), z.unknown()).optional(),
            tags: z.array(z.string()).optional()
        });

        const TestDefinition = CreateApiDefinition({
            endpoints: {
                test: {
                    complexEndpoint: {
                        method: 'POST' as const,
                        path: '/test/complex',
                        body: ComplexSchema,
                        responses: {
                            200: ComplexSchema,
                            422: z.object({ error: z.string() })
                        }
                    }
                }
            }
        });

        const spec = generateOpenApiSpec(TestDefinition);

        expect(spec).toBeDefined();
        expect(spec.components).toBeDefined();
        expect(spec.components?.schemas).toBeDefined();
    });
});
