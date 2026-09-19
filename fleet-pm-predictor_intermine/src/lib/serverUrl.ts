/**
 * Server-side fetch (e.g. a Next.js Route Handler calling the sibling
 * Python function) needs an absolute URL — relative paths don't resolve
 * outside a browser context. Vercel injects VERCEL_URL at runtime; locally,
 * both `next dev` and `vercel dev` serve everything from one origin.
 */
export function getBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
