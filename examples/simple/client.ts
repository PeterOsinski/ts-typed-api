import { ApiClient } from '../../src';
import { PublicApiDefinition } from './definitions';

// Type-safe wrapper function with explicit return type
async function runClientExample(): Promise<void> {
    // Create an API client with the definition
    const apiClient = new ApiClient('http://localhost:3001', PublicApiDefinition);
    // Get a user
    await apiClient.callApi('common', 'ping',
        {},
        {
            200: (payload) => {
                console.log(payload)
            },
            422: (payload) => {
                console.log(payload)
            }
        }
    );

}

// Export for potential use in other modules
export { runClientExample };
