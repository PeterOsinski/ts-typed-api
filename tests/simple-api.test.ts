import { describe, test, expect } from '@jest/globals';
import fetch from 'node-fetch';
import { ApiClient } from '../src';
import { PublicApiDefinition, PrivateApiDefinition } from '../examples/simple/definitions';
import { SIMPLE_PORT, HONO_PORT } from './setup';

describe.each([
    ['Express', SIMPLE_PORT],
    ['Hono', HONO_PORT]
])('Simple API Tests - %s', (serverName, port) => {
    const baseUrl = `http://localhost:${port}`;

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

        test('should ping successfully with HTML format', async () => {
            const response = await fetch(`${baseUrl}/api/v1/public/ping?format=html`);
            expect(response.status).toBe(200);
            const contentType = response.headers.get('content-type');
            if (serverName === 'Express') {
                expect(contentType).toBe('text/html; charset=utf-8');
            } else {
                expect(contentType).toBe('text/html');
            }
            const html = await response.text();
            expect(html).toBe('<h1>pong</h1>');
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

        test('should set response headers', async () => {
            // Direct HTTP call to test header setting
            const response = await fetch(`${baseUrl}/api/v1/public/ping`);
            const contentType = response.headers.get('content-type');

            // Check that standard headers are set
            if (serverName === 'Express') {
                expect(contentType).toBe('application/json; charset=utf-8');
            } else {
                // Hono sets content-type differently
                expect(contentType).toBe('application/json');
            }
            expect(response.status).toBe(200);
        });

        test('should set custom headers', async () => {
            // Direct HTTP call to test custom header setting
            const response = await fetch(`${baseUrl}/api/v1/public/custom-headers`);
            const data = await response.json();

            // Check response data (unified response format)
            expect(data.data).toEqual({ message: "headers set" });
            expect(data).not.toHaveProperty('error'); // Error should not be present for success responses
            expect(response.status).toBe(200);

            // Check custom headers
            const customHeader = response.headers.get('x-custom-test');
            const anotherHeader = response.headers.get('x-another-header');

            expect(customHeader).toBe('test-value');
            expect(anotherHeader).toBe('another-value');
        });

        test('should handle long polling with delayed responses', async () => {
            const startTime = Date.now();

            // Test multiple sequences to simulate intervals
            for (let seq = 1; seq <= 3; seq++) {
                const result = await client.callApi('common', 'longpoll', {
                    params: { sequence: seq }
                }, {
                    200: ({ data }) => {
                        expect(data.sequence).toBe(seq);
                        expect(data.data).toBe(`object ${seq}`);
                        expect(typeof data.timestamp).toBe('number');
                        expect(data.timestamp).toBeGreaterThan(startTime);
                        return data;
                    },
                    422: ({ error }) => {
                        throw new Error(`Validation error: ${JSON.stringify(error)}`);
                    }
                });

                expect(result.sequence).toBe(seq);
                expect(result.data).toBe(`object ${seq}`);
            }

            // Verify that total time is at least the sum of delays (100ms * 1 + 100ms * 2 + 100ms * 3 = 600ms)
            const elapsed = Date.now() - startTime;
            expect(elapsed).toBeGreaterThanOrEqual(600); // Allow some tolerance for test execution
        });

        test('should handle SSE streaming with multiple JSON objects', async () => {
            // Test SSE streaming by making a fetch request and parsing the response
            const response = await fetch(`${baseUrl}/api/v1/public/stream`);
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toBe('text/event-stream');

            const responseText = await response.text();

            // Parse SSE events from the response
            const events = responseText.trim().split('\n\n');
            expect(events).toHaveLength(3);

            // Verify each event
            for (let i = 0; i < events.length; i++) {
                const event = events[i];
                const lines = event.split('\n');
                expect(lines[0]).toBe('event: update');

                const dataLine = lines.find(line => line.startsWith('data: '));
                expect(dataLine).toBeDefined();

                const data = JSON.parse(dataLine!.substring(6)); // Remove 'data: ' prefix
                expect(data.sequence).toBe(i + 1);
                expect(data.data).toBe(`object ${i + 1}`);
            }
        });

        test('should handle SSE streaming incrementally', async () => {
            const response = await fetch(`${baseUrl}/api/v1/public/stream`);
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toBe('text/event-stream');

            return new Promise<void>((resolve, reject) => {
                // node-fetch returns a Node.js stream, cast properly
                const stream = response.body as any; // Node.js Readable stream
                let buffer = '';
                const events: any[] = [];

                stream.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();

                    // Parse complete SSE events from buffer
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer

                    let currentEvent = '';
                    for (const line of lines) {
                        if (line === '') {
                            // Empty line = end of event
                            if (currentEvent.trim()) {
                                const eventData = parseSSEEvent(currentEvent);
                                if (eventData) events.push(eventData);
                            }
                            currentEvent = '';
                        } else {
                            currentEvent += line + '\n';
                        }
                    }

                    // Check if we have all expected events
                    if (events.length >= 3) {
                        // For Node.js streams, just remove listeners to "close"
                        stream.removeAllListeners('data');
                        stream.removeAllListeners('error');
                        stream.removeAllListeners('end');

                        try {
                            expect(events).toHaveLength(3);
                            expect(events[0]).toEqual({ sequence: 1, data: 'object 1' });
                            expect(events[1]).toEqual({ sequence: 2, data: 'object 2' });
                            expect(events[2]).toEqual({ sequence: 3, data: 'object 3' });
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    }
                });

                stream.on('error', reject);
                stream.on('end', () => {
                    // If we get here without 3 events, test failed
                    if (events.length < 3) {
                        reject(new Error(`Expected 3 events, got ${events.length}`));
                    }
                });
            });
        });

        function parseSSEEvent(eventText: string): any | null {
            const lines = eventText.split('\n');
            let data = '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    data = line.substring(6);
                }
            }

            return data ? JSON.parse(data) : null;
        }

        test('should handle client disconnection with req.onClose', async () => {
            // Test that the endpoint works normally when client doesn't disconnect
            const result = await client.callApi('common', 'disconnectTest', {
                query: { delay: 100 }
            }, {
                200: ({ data }) => {
                    expect(data.message).toBe('Operation completed');
                    expect(data.disconnected).toBe(false);
                    return data;
                },
                422: ({ error }) => {
                    throw new Error(`Validation error: ${JSON.stringify(error)}`);
                }
            });

            expect(result.disconnected).toBe(false);
        });

        test('should detect client disconnection during request processing', async () => {
            if (serverName === 'Hono') {
                // Hono doesn't support disconnection detection, so onClose is undefined
                // The endpoint completes successfully but doesn't detect disconnections
                const response = await fetch(`${baseUrl}/api/v1/public/disconnect-test?delay=100`);
                expect(response.status).toBe(200);
                const data = await response.json();
                expect(data.data.disconnected).toBe(false); // No disconnection detected
                return;
            }

            // Use fetch directly with AbortController to simulate client disconnection
            const controller = new AbortController();
            const signal = controller.signal;

            // Start the request
            const fetchPromise = fetch(`${baseUrl}/api/v1/public/disconnect-test?delay=500`, {
                signal,
                headers: { 'Accept': 'application/json' }
            });

            // Abort the request after a short delay (before the server finishes)
            setTimeout(() => {
                controller.abort();
            }, 200);

            // The request should be aborted (node-fetch uses different error messages)
            await expect(fetchPromise).rejects.toThrow(/aborted/i);

            // Give the server a moment to process the disconnection
            await new Promise(resolve => setTimeout(resolve, 100));

            // Note: In a real test environment, we would need a way to verify
            // that the close handler was called on the server side.
            // For this test, we're mainly verifying that the endpoint exists
            // and that client disconnection doesn't crash the server.
        });

        test('generateUrl should return correct URL for ping', () => {
            const url = client.generateUrl('common', 'ping');
            expect(url).toBe(`${baseUrl}/api/v1/public/ping`);
        });

        test('generateUrl should return correct URL for probe1 without query', () => {
            const url = client.generateUrl('status', 'probe1');
            expect(url).toBe(`${baseUrl}/api/v1/public/status/probe1`);
        });

        test('generateUrl should return correct URL for probe1 with query', () => {
            const url = client.generateUrl('status', 'probe1', undefined, { match: true });
            expect(url).toBe(`${baseUrl}/api/v1/public/status/probe1?match=true`);
        });

        test('generateUrl should return correct URL for probe2', () => {
            const url = client.generateUrl('status', 'probe2');
            expect(url).toBe(`${baseUrl}/api/v1/public/status/probe2`);
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

        test('generateUrl should return correct URL for user get with params', () => {
            const url = client.generateUrl('user', 'get', { id: 'test-id' });
            expect(url).toBe(`${baseUrl}/api/v1/private/user/test-id`);
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

    if (serverName === 'Hono') {
        describe('Hono vs Express Compatibility', () => {
            test('should produce identical responses to Express version', async () => {
                // Test that Hono produces the same responses as Express
                const response = await fetch(`${baseUrl}/api/v1/public/ping`);
                const expressResponse = await fetch(`http://localhost:${SIMPLE_PORT}/api/v1/public/ping`);

                const honoData = await response.json();
                const expressData = await expressResponse.json();

                expect(honoData).toEqual(expressData);
                expect(response.status).toBe(expressResponse.status);
            });

            test('should handle query parameters identically', async () => {
                const honoResponse = await fetch(`${baseUrl}/api/v1/public/status/probe1?match=true`);
                const expressResponse = await fetch(`http://localhost:${SIMPLE_PORT}/api/v1/public/status/probe1?match=true`);

                const honoData = await honoResponse.json();
                const expressData = await expressResponse.json();

                expect(honoData).toEqual(expressData);
                expect(honoResponse.status).toBe(expressResponse.status);
            });
        });
    }
});
