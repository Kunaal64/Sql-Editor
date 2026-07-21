export function SchemaExplorer({ schema, loading, error, onSelectTable }) {
  if (loading) return <div className="schema-loading">Loading schema…</div>;
  if (error) return <div className="schema-error">{error}</div>;
  if (!schema) return null;

  return (
    <div className="schema-explorer">
      <h3>Schema</h3>
      {schema.tables.map((table) => (
        <TableNode
          key={table.name}
          table={table}
          onSelectTable={onSelectTable}
        />
      ))}
    </div>
  );
}

function TableNode({ table, onSelectTable }) {
  return (
    <details className="schema-table">
      <summary>
        {table.name}
        {onSelectTable && (
          <button
            className="schema-run-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSelectTable(table.name);
            }}
            title={`Run sample query on ${table.name}`}
          >
            ▶
          </button>
        )}
      </summary>
      <ul>
        {table.columns.map((col) => (
          <li key={col.name}>
            <span className="column-name">{col.name}</span>
            <span className="column-type">{col.type}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
