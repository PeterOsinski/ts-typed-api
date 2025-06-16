import express from 'express';
import { PublicApiDefinition } from './definitions';
import { makeRouteHandlerCreator } from '../src/router/router';
import { registerRouteHandlers, SpecificRouteHandler } from '../src/router/handler';
const app = express();
const port = 3001;
app.set('etag', false);
app.use(express.json()); // Middleware to parse JSON bodies

const route = makeRouteHandlerCreator<typeof PublicApiDefinition>();
export const PublicApiHandlers: SpecificRouteHandler<typeof PublicApiDefinition>[] = [
    route('api', 'ping', async (req, res) => {
        res.respond(200, 'pong')
    }),
]

// Register all route handlers
// If example routes were also to be served, they'd need their own registration
// or a merged API definition strategy.
registerRouteHandlers(app, PublicApiDefinition, PublicApiHandlers);

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
});