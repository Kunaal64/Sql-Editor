import { useCallback, useState } from 'react';
import { executeQuery } from '../services/api';

export function useQuery() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (sql, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const data = await executeQuery(sql, options);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, run };
}

function toApiError(err) {
  if (err instanceof Error) {
    return {
      code: err.cause || 'INTERNAL_ERROR',
      message: err.message,
    };
  }
  return { code: 'INTERNAL_ERROR', message: 'Failed to execute query' };
}
