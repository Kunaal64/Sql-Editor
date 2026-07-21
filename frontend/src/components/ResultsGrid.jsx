import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ClientSideRowModelModule, ModuleRegistry } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

export function ResultsGrid({
  result,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
}) {
  if (!result) {
    return <div className="results-empty">Run a query to see results</div>;
  }

  const columnDefs = useMemo(
    () =>
      result.columns.map((col) => ({
        field: col.name,
        headerName: `${col.name} (${col.type})`,
        sortable: true,
        filter: true,
        resizable: true,
      })),
    [result.columns]
  );

  const totalPages = Math.max(1, Math.ceil(result.totalRowCount / result.pageSize));
  const canGoPrevious = result.page > 0 && !loading;
  const canGoNext = result.page < totalPages - 1 && !loading;

  return (
    <div className="ag-theme-alpine results-grid-wrapper">
      <div className="results-grid-table">
        <AgGridReact
          rowData={result.rows}
          columnDefs={columnDefs}
          defaultColDef={{ flex: 1, minWidth: 100 }}
        />
      </div>

      <div className="results-pagination-bar">
        <span className="results-stats">
          Page <strong>{result.page + 1}</strong> of{' '}
          <strong>{totalPages.toLocaleString()}</strong> ·{' '}
          {result.rowCount.toLocaleString()} of{' '}
          {result.totalRowCount.toLocaleString()} rows ·{' '}
          {result.executionTimeMs}ms
          {loading && <span className="results-loading"> · Loading…</span>}
        </span>

        <div className="results-pagination-controls">
          <button
            type="button"
            className="results-page-btn"
            onClick={() => onPageChange(result.page - 1)}
            disabled={!canGoPrevious}
          >
            ← Previous
          </button>

          <select
            className="results-page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>

          <button
            type="button"
            className="results-page-btn"
            onClick={() => onPageChange(result.page + 1)}
            disabled={!canGoNext}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
