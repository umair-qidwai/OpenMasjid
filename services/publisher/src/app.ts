import publisher, { type PublisherEnv } from './index';

interface AppEnv extends PublisherEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** Static assets normally bypass this handler; only /api/* runs Worker-first. */
export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api' || path.startsWith('/api/')) {
      return publisher.fetch(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
