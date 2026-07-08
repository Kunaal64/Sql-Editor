const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function handleResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    const error = data;
    throw new Error(error.message || 'Request failed', { cause: error.code });
  }

  return data;
}

export async function getSchema() {
  const response = await fetch(`${API_BASE}/schema`);
  return handleResponse(response);
}

export async function executeQuery(sql) {
  const response = await fetch(`${API_BASE}/execute-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  return handleResponse(response);
}
