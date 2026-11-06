/**
 * Accent Lab — Azure Speech token server (Cloudflare Worker).
 *
 * Keeps your Azure Speech key secret. The app calls this URL and receives a
 * temporary token (valid for 10 minutes) that works only for speech requests.
 *
 * Environment variables (set in the Cloudflare dashboard → Worker → Settings → Variables):
 *   AZURE_SPEECH_KEY  (secret)  your Azure Speech resource key
 *   AZURE_REGION                your resource region, for example eastus or westeurope
 *   ALLOWED_ORIGINS             your app's origin, for example https://yourname.github.io
 *                               (comma-separated; leave empty only while testing)
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const originOk = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    if (!originOk) return new Response('Origin not allowed', { status: 403, headers: cors });
    if (!env.AZURE_SPEECH_KEY || !env.AZURE_REGION) {
      return json({ error: 'Server is missing AZURE_SPEECH_KEY or AZURE_REGION' }, 500, cors);
    }
    const res = await fetch(`https://${env.AZURE_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': '0' },
    });
    if (!res.ok) return json({ error: 'Azure refused the key or region', status: res.status }, 502, cors);
    return json({ token: await res.text(), region: env.AZURE_REGION }, 200, cors);
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
