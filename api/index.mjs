import handler from '../apps/api/src/server.mjs';

export default function vercelHandler(request, response) {
  const value = request.query?.path;
  const path = (Array.isArray(value) ? value.join('/') : String(value || '')).replace(/^\/+/, '');
  const current = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  current.searchParams.delete('path');
  const query = current.searchParams.toString();
  request.url = `/api${path ? `/${path}` : ''}${query ? `?${query}` : ''}`;
  return handler(request, response);
}
