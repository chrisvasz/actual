# Client-side connection package

This is the client counterpart of the `connection` server-side package (packages/loot-core/src/platform/server/connection). This contains methods to send and listen to messages to/from the backend.

- `index.main-thread.ts` (the `main-thread` condition): the browser app, whose backend runs on the page's main thread and is called directly over an in-process channel (`platform/in-process-channel.ts`).
- `index.ts`: a backend running in a Worker (the API's browser build).
- `index.api.ts`: the Node API, which calls the backend in-process.
