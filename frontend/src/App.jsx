import { useCallback, useEffect, useMemo, useState } from 'react';
import { SqlEditor } from './components/SqlEditor';
import { ResultsGrid } from './components/ResultsGrid';
import { SchemaExplorer } from './components/SchemaExplorer';
import { ErrorPanel } from './components/ErrorPanel';
import { useQuery } from './hooks/useQuery';
import { useSchema } from './hooks/useSchema';

const DEFAULT_QUERY = "SELECT * FROM Trade LIMIT 10;";
const DEFAULT_PAGE_SIZE = 100;

function App() {
  const [sql, setSql] = useState(DEFAULT_QUERY);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRowCount, setTotalRowCount] = useState(0);
  const { result, loading, error, run } = useQuery();
  const { schema, loading: schemaLoading, error: schemaError } = useSchema();

  const handleRun = useCallback(async () => {
    setPage(0);
    await run(sql, { page: 0, pageSize, includeTotalRows: true });
  }, [run, sql, pageSize]);

  const handlePageChange = useCallback(
    (newPage) => {
      setPage(newPage);
      run(sql, { page: newPage, pageSize, includeTotalRows: false });
    },
    [run, sql, pageSize]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize) => {
      setPageSize(newPageSize);
      setPage(0);
      run(sql, { page: 0, pageSize: newPageSize, includeTotalRows: false });
    },
    [run, sql]
  );

  const handleSelectTable = useCallback(
    (tableName) => {
      const newSql = `SELECT * FROM ${tableName} LIMIT 10;`;
      setSql(newSql);
      setPage(0);
      run(newSql, { page: 0, pageSize, includeTotalRows: true });
    },
    [run, pageSize]
  );

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRun]);

  useEffect(() => {
    if (result?.totalRowCount != null) {
      setTotalRowCount(result.totalRowCount);
    }
  }, [result?.totalRowCount]);

  const gridResult = useMemo(() => {
    if (!result) return null;
    return {
      ...result,
      totalRowCount: result.totalRowCount ?? totalRowCount,
    };
  }, [result, totalRowCount]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>SQL Editor</h1>
        <button
          className="run-button"
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? 'Running…' : 'Run Query'} <kbd>Ctrl+Enter</kbd>
        </button>
      </header>

      <main className="app-main">
        <aside className="app-sidebar">
          <SchemaExplorer
            schema={schema}
            loading={schemaLoading}
            error={schemaError?.message ?? null}
            onSelectTable={handleSelectTable}
          />
        </aside>

        <section className="app-content">
          <div className="editor-panel">
            <SqlEditor value={sql} onChange={setSql} schema={schema} />
          </div>

          <ErrorPanel error={error} />

          <div className="results-panel">
            <ResultsGrid
              result={gridResult}
              page={page}
              pageSize={pageSize}
              loading={loading}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
