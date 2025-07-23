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

    test('should handle enum schemas correctly and not generate empty enums', () => {
        // Test with valid enum
        const StatusEnum = z.enum(['active', 'inactive', 'pending']);

        // Test with a schema that might cause enum extraction issues
        const TestSchema = z.object({
            status: StatusEnum,
            priority: z.enum(['low', 'medium', 'high']),
            category: z.string() // fallback case
        });

        const EnumTestDefinition = CreateApiDefinition({
            endpoints: {
                test: {
                    enumEndpoint: {
                        method: 'POST' as const,
                        path: '/test/enum',
                        body: TestSchema,
                        responses: {
                            200: z.object({
                                result: StatusEnum,
                                message: z.string()
                            })
                        }
                    }
                }
            }
        });

        const spec = generateOpenApiSpec(EnumTestDefinition);

        expect(spec).toBeDefined();
        expect(spec.paths).toBeDefined();

        const enumEndpoint = spec.paths['/test/enum'];
        expect(enumEndpoint).toBeDefined();
        expect(enumEndpoint.post).toBeDefined();

        // Check request body schema
        const requestBodySchema = enumEndpoint.post?.requestBody?.content?.['application/json']?.schema;
        expect(requestBodySchema).toBeDefined();

        // The schema might be a reference to components or inline
        let actualSchema: any;
        if (requestBodySchema?.$ref) {
            // Extract schema name from $ref
            const schemaName = requestBodySchema.$ref.split('/').pop();
            actualSchema = spec.components?.schemas?.[schemaName!];
            expect(actualSchema).toBeDefined();
        } else {
            actualSchema = requestBodySchema;
        }

        expect(actualSchema?.type).toBe('object');
        expect(actualSchema?.properties).toBeDefined();

        // Verify enum properties are handled correctly
        const statusProperty = actualSchema?.properties?.status;
        expect(statusProperty).toBeDefined();
        expect(statusProperty?.type).toBe('string');

        // The enum should either have values or be a basic string type (no empty enum arrays)
        expect(statusProperty.enum.length).toBeGreaterThan(0);
        expect(statusProperty.enum).toContain('active');
        expect(statusProperty.enum).toContain('inactive');
        expect(statusProperty.enum).toContain('pending');

        const priorityProperty = actualSchema?.properties?.priority;
        expect(priorityProperty).toBeDefined();
        expect(priorityProperty?.type).toBe('string');

        // The enum should either have values or be a basic string type (no empty enum arrays)
        expect(priorityProperty.enum.length).toBeGreaterThan(0);
        expect(priorityProperty.enum).toContain('low');
        expect(priorityProperty.enum).toContain('medium');
        expect(priorityProperty.enum).toContain('high');

        // Check response schema
        const responseSchema = enumEndpoint.post?.responses?.['200']?.content?.['application/json']?.schema;
        expect(responseSchema).toBeDefined();

        // The response schema might also be a reference to components or inline
        let actualResponseSchema: any;
        if (responseSchema?.$ref) {
            // Extract schema name from $ref
            const schemaName = responseSchema.$ref.split('/').pop();
            actualResponseSchema = spec.components?.schemas?.[schemaName!];
            expect(actualResponseSchema).toBeDefined();
        } else {
            actualResponseSchema = responseSchema;
        }

        expect(actualResponseSchema?.type).toBe('object');
        expect(actualResponseSchema?.properties).toBeDefined();

        const resultProperty = actualResponseSchema?.properties?.result;
        expect(resultProperty).toBeDefined();
        expect(resultProperty?.type).toBe('string');

        // The enum should either have values or be a basic string type (no empty enum arrays)
        expect(resultProperty.enum.length).toBeGreaterThan(0);
    });

    test('should handle nested object arrays correctly', () => {
        // Test case for nested object array structure
        const s1 = z.object({
            version: z.number(),
        });

        const s2 = z.object({
            versions: z.array(s1),
        });

        const NestedArrayTestDefinition = CreateApiDefinition({
            endpoints: {
                test: {
                    nestedArrayEndpoint: {
                        method: 'POST' as const,
                        path: '/test/nested-array',
                        body: s2,
                        responses: {
                            200: z.object({
                                data: s2,
                                success: z.boolean()
                            })
                        }
                    }
                }
            }
        });

        const spec = generateOpenApiSpec(NestedArrayTestDefinition);

        expect(spec).toBeDefined();
        expect(spec.paths).toBeDefined();
        expect(spec.components?.schemas).toBeDefined();

        const nestedArrayEndpoint = spec.paths['/test/nested-array'];
        expect(nestedArrayEndpoint).toBeDefined();
        expect(nestedArrayEndpoint.post).toBeDefined();

        // Check request body schema
        const requestBodySchema = nestedArrayEndpoint.post?.requestBody?.content?.['application/json']?.schema;
        expect(requestBodySchema).toBeDefined();

        // The schema should be a reference to components
        expect(requestBodySchema?.$ref).toBeDefined();
        const schemaName = requestBodySchema?.$ref?.split('/').pop();
        const actualSchema = spec.components?.schemas?.[schemaName!];
        expect(actualSchema).toBeDefined();

        expect(actualSchema?.type).toBe('object');
        expect(actualSchema?.properties).toBeDefined();

        // Verify the versions property is an array
        const versionsProperty = actualSchema?.properties?.versions;
        expect(versionsProperty).toBeDefined();
        expect(versionsProperty?.type).toBe('array');
        expect(versionsProperty?.items).toBeDefined();

        // The array items should properly reference the nested object schema (s1)
        const arrayItemsSchema = versionsProperty?.items;
        if (arrayItemsSchema?.$ref) {
            // If it's a reference, resolve it and check the object structure
            const itemSchemaName = arrayItemsSchema.$ref.split('/').pop();
            const itemSchema = spec.components?.schemas?.[itemSchemaName!];
            expect(itemSchema).toBeDefined();
            expect(itemSchema?.type).toBe('object');
            expect(itemSchema?.properties?.version).toBeDefined();
            expect(itemSchema?.properties?.version?.type).toBe('number');
        } else {
            // If it's inline, it should be an object with version property
            expect(arrayItemsSchema?.type).toBe('object');
            expect(arrayItemsSchema?.properties?.version).toBeDefined();
            expect(arrayItemsSchema?.properties?.version?.type).toBe('number');
        }

        // Check response schema structure
        const responseSchema = nestedArrayEndpoint.post?.responses?.['200']?.content?.['application/json']?.schema;
        expect(responseSchema).toBeDefined();

        expect(responseSchema?.$ref).toBeDefined();
        const responseSchemaName = responseSchema?.$ref?.split('/').pop();
        const actualResponseSchema = spec.components?.schemas?.[responseSchemaName!];
        expect(actualResponseSchema).toBeDefined();

        expect(actualResponseSchema?.type).toBe('object');
        expect(actualResponseSchema?.properties).toBeDefined();
        expect(actualResponseSchema?.properties?.data).toBeDefined();
        expect(actualResponseSchema?.properties?.success).toBeDefined();
        expect(actualResponseSchema?.properties?.success?.type).toBe('boolean');

        // Verify that the nested data property has the correct structure
        const dataProperty = actualResponseSchema?.properties?.data;
        if (dataProperty?.$ref) {
            // If data is a reference, resolve it
            const dataSchemaName = dataProperty.$ref.split('/').pop();
            const dataSchema = spec.components?.schemas?.[dataSchemaName!];
            expect(dataSchema).toBeDefined();
            expect(dataSchema?.type).toBe('object');
            expect(dataSchema?.properties?.versions).toBeDefined();
            expect(dataSchema?.properties?.versions?.type).toBe('array');

            // The versions array items should be objects with version property
            const dataVersionsItems = dataSchema?.properties?.versions?.items;
            if (dataVersionsItems?.$ref) {
                const dataItemSchemaName = dataVersionsItems.$ref.split('/').pop();
                const dataItemSchema = spec.components?.schemas?.[dataItemSchemaName!];
                expect(dataItemSchema?.type).toBe('object');
                expect(dataItemSchema?.properties?.version?.type).toBe('number');
            } else {
                expect(dataVersionsItems?.type).toBe('object');
                expect(dataVersionsItems?.properties?.version?.type).toBe('number');
            }
        } else {
            // If data is inline
            expect(dataProperty?.type).toBe('object');
            expect(dataProperty?.properties?.versions).toBeDefined();
            expect(dataProperty?.properties?.versions?.type).toBe('array');

            const dataVersionsItems = dataProperty?.properties?.versions?.items;
            if (dataVersionsItems?.$ref) {
                const dataItemSchemaName = dataVersionsItems.$ref.split('/').pop();
                const dataItemSchema = spec.components?.schemas?.[dataItemSchemaName!];
                expect(dataItemSchema?.type).toBe('object');
                expect(dataItemSchema?.properties?.version?.type).toBe('number');
            } else {
                expect(dataVersionsItems?.type).toBe('object');
                expect(dataVersionsItems?.properties?.version?.type).toBe('number');
            }
        }
    });
});
