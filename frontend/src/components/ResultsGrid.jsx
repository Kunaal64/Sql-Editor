import { AgGridReact } from 'ag-grid-react';
import { ClientSideRowModelModule, ModuleRegistry } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

export function ResultsGrid({ result }) {
  if (!result) {
    return (
      <div className="results-empty">
        Run a query to see results
      </div>
    );
  }

  const columnDefs = result.columns.map((col) => ({
    field: col.name,
    headerName: `${col.name} (${col.type})`,
    sortable: true,
    filter: true,
    resizable: true,
  }));

  return (
    <div className="ag-theme-alpine results-grid">
      <AgGridReact
        rowData={result.rows}
        columnDefs={columnDefs}
        domLayout="autoHeight"
        defaultColDef={{ flex: 1, minWidth: 100 }}
      />
      <div className="results-meta">
        {result.rowCount} row{result.rowCount === 1 ? '' : 's'} · {result.executionTimeMs}ms
      </div>
    </div>
  );
}
