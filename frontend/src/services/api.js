const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function handleResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    data = { message: `Unexpected response (${response.status})` };
  }

  if (!response.ok) {
    throw new Error(data.message || 'Request failed', { cause: data.code });
  }

  return data;
}

export async function getSchema() {
  const response = await fetch(`${API_BASE}/schema`);
  return handleResponse(response);
}

export async function executeQuery(
  sql,
  { page = 0, pageSize = 100, includeTotalRows = true } = {}
) {
  const response = await fetch(`${API_BASE}/execute-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, page, pageSize, includeTotalRows }),
  });
  return handleResponse(response);
}
