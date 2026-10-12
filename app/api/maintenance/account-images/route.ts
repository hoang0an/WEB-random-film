import {createCleanupHandler, createCleanupHttpDependencies} from '@/lib/account-image-cleanup-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  return createCleanupHandler({
    secret: () => process.env.CRON_SECRET,
    createDependencies() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('maintenance backend unavailable');
      return createCleanupHttpDependencies(url, key);
    },
  })(request);
}

// Next otherwise implements HEAD by invoking GET; maintenance must not run
// through link probes or unsupported methods, and their responses cannot cache.
function unsupported() {
  return new Response(null, {status: 405, headers: {Allow: 'GET', 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store'}});
}
export const HEAD = unsupported;
export const POST = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const OPTIONS = unsupported;
