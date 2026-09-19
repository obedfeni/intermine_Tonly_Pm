import { getBaseUrl } from './serverUrl';
import type { PredictRequestBody, PredictResponseBody } from './types';

interface RunPredictionOptions {
  /**
   * The origin (protocol + host) of the *incoming* browser request, e.g.
   * `req.nextUrl.origin` from the calling route handler. Prefer this over
   * the `VERCEL_URL`-based fallback in getBaseUrl(): if Vercel Deployment
   * Protection is turned on for the project, the auto-generated VERCEL_URL
   * domain is gated behind Vercel's own login wall even when your regular
   * site URL is public, so a server-to-server call built from VERCEL_URL
   * gets rejected with an authentication-wall response instead of reaching
   * api/predict.py. Reusing the exact host the browser already used avoids
   * that entirely, since that's the URL that's actually reachable.
   */
  origin?: string;
  /**
   * Forwarded from the incoming request's `cookie` header, if present. Only
   * matters when Deployment Protection is on with Vercel Authentication —
   * it lets an already-authenticated browser session's cookie carry through
   * to this internal call. Harmless to omit otherwise.
   */
  cookie?: string | null;
}

/** Calls the Python ML function (api/predict.py) from server-side code. */
export async function runPrediction(
  body: PredictRequestBody,
  options: RunPredictionOptions = {}
): Promise<PredictResponseBody> {
  const base = options.origin || getBaseUrl();
  const url = `${base}/api/predict`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.cookie) headers.cookie = options.cookie;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    let message = `Prediction engine returned HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      // Our own api/predict.py always sends { error: "a string" }. But if
      // Vercel's platform intercepts the request before our handler code
      // even runs (a crashed/timed-out/failed-to-build Python function),
      // it returns its own error shape instead — typically an object like
      // { code: "FUNCTION_INVOCATION_FAILED", message: "..." } rather than
      // a plain string. Handle both so a platform-level failure shows a
      // real message instead of the value coercing to the literal text
      // "[object Object]" when passed into `new Error(...)` below.
      if (typeof errBody?.error === 'string') {
        message = errBody.error;
      } else if (errBody?.error?.message) {
        message = String(errBody.error.message);
      } else if (errBody?.error) {
        message = JSON.stringify(errBody.error);
      }
    } catch {
      /* ignore parse failure, use default message */
    }
    throw new Error(message);
  }

  return (await res.json()) as PredictResponseBody;
}
