export async function api<T>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const [pathname, query] = path.split('?');
  const response = await fetch(`/api/${pathname}/${query ? `?${query}` : ''}`, {
    method: data ? 'POST' : 'GET',
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    signal,
  });
  const result = await response
    .json()
    .catch(() => ({ error: 'Server returned an unreadable response.' }));
  if (!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
  return result;
}
