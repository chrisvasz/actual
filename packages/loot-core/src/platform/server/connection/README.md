# Server-side connection package

This is the server counterpart of the `connection` client-side package (packages/loot-core/src/platform/client/connection). This contains methods to receive, reply, and push messages from/to the client web application.

- `index.main-thread.ts` (the `main-thread` condition): the browser app's backend, running on the page's main thread behind an in-process channel (`platform/in-process-channel.ts`).
- `index.ts`: a backend running in a Worker (the API's browser build).
- `index.api.ts`: the Node API, which has no client to push events to.
