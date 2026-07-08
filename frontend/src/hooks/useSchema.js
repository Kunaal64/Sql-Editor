import { useEffect, useState } from 'react';
import { getSchema } from '../services/api';

export function useSchema() {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getSchema();
        if (!cancelled) {
          setSchema(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toApiError(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { schema, loading, error };
}

function toApiError(err) {
  if (err instanceof Error) {
    return {
      code: err.cause || 'INTERNAL_ERROR',
      message: err.message,
    };
  }
  return { code: 'INTERNAL_ERROR', message: 'Failed to load schema' };
}
