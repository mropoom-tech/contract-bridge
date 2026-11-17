import { createApp } from './app';

export { BridgeRoom } from './room/BridgeRoom';

const app = createApp();

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
      return app.fetch(request, env, ctx);
    }
    // Static assets / SPA fallback are served by Workers Assets before reaching here.
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
