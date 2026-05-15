const DEFAULT_BACKEND_ORIGIN = '';

function getBackendOrigin(env) {
  const configured =
    env?.BACKEND_ORIGIN ||
    env?.API_ORIGIN ||
    env?.VITE_API_ORIGIN ||
    DEFAULT_BACKEND_ORIGIN;

  return configured.replace(/\/+$/, '');
}

function appendForwardedHeaders(headers, request) {
  const next = new Headers(headers);
  const url = new URL(request.url);

  next.set('x-forwarded-host', url.host);
  next.set('x-forwarded-proto', url.protocol.replace(':', ''));

  return next;
}

export default async function onRequest(context) {
  const backendOrigin = getBackendOrigin(context.env);

  if (!backendOrigin) {
    return Response.json(
      {
        success: false,
        error: {
          code: 'backend_origin_not_configured',
          message:
            'Set BACKEND_ORIGIN or API_ORIGIN in EdgeOne Pages environment variables, for example https://api.example.com',
        },
      },
      { status: 502 },
    );
  }

  const request = context.request;
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, backendOrigin);

  return fetch(targetUrl.toString(), {
    method: request.method,
    headers: appendForwardedHeaders(request.headers, request),
    body: request.body,
    redirect: 'manual',
  });
}
