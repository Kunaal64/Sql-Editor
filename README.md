# SQL Editor (POC)

A lightweight web SQL editor proof-of-concept. It gives you a Monaco-powered
SQL editor in the browser and runs queries against an in-memory SQLite
database seeded from a real SQL dump.

The backend executes **real SQLite SQL** — not a hand-written parser — so
joins, aggregations, subqueries, window functions, and any other
SQLite-supported syntax work out of the box.

---

## Features

- **Monaco SQL editor**
  - Generic SQL syntax highlighting
  - Schema-aware autocomplete (tables + columns)
  - No false-positive validation errors — the backend is the source of truth
  - `Ctrl + Enter` to run
- **Real SQL execution** via in-memory SQLite
- **Schema explorer** sidebar showing tables and columns, with a one-click run button per table
- **AG Grid** results table
- **Error panel** with structured error messages
- **No Docker, no external database** required for the POC

---

## Tech Stack

### Frontend

- React 18 + JavaScript
- Vite
- `@monaco-editor/react`
- `monaco-sql-languages` (PostgreSQL dialect)
- AG Grid Community

### Backend

- Node.js + Express + JavaScript
- `better-sqlite3` (in-memory SQLite)

---

## Folder Structure

```
.
├── README.md
├── MOCK_DATA.sql                      # Sample SQL seed data
├── backend/
│   ├── src/
│   │   ├── data/
│   │   │   ├── MOCK_DATA.sql          # Copy of seed data
│   │   │   └── schemaLoader.js        # Dynamic schema inference / loader
│   │   ├── providers/
│   │   │   └── InMemoryDataProvider.js # SQLite-backed DataProvider
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   └── index.js
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── SqlEditor.jsx          # Monaco editor component
    │   │   ├── ResultsGrid.jsx
    │   │   ├── SchemaExplorer.jsx
    │   │   └── ErrorPanel.jsx
    │   ├── hooks/
    │   │   ├── useQuery.js
    │   │   └── useSchema.js
    │   ├── monaco/
    │   │   └── setup.js               # Monaco + monaco-sql-languages config
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json
    └── vite.config.js
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### 1. Start the backend

```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:3001`.

### 2. Start the frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API calls to the
backend.

### 3. Open the editor

Go to `http://localhost:5173`, type a query, and press **Run Query** or
`Ctrl + Enter`.

You can also click the ▶ button next to any table in the schema sidebar to
auto-fill and run `SELECT * FROM <table> LIMIT 10;`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Health check |
| `GET`  | `/schema` | List tables and columns |
| `POST` | `/execute-query` | Execute a SQL query |

### Example request

```bash
curl -X POST http://localhost:3001/execute-query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM MOCK_DATA LIMIT 5"}'
```

Or through the frontend proxy:

```bash
curl -X POST http://localhost:5173/api/execute-query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT sector, SUM(profit) FROM MOCK_DATA GROUP BY sector"}'
```

---

## Data

The POC ships with `MOCK_DATA.sql`, a dump of 1,000 synthetic stock trades
with the following columns:

| Column | Type |
|--------|------|
| `trade_id` | `INTEGER` |
| `stock_symbol` | `TEXT` |
| `quantity` | `INTEGER` |
| `purchase_price` | `REAL` |
| `sale_price` | `REAL` |
| `purchase_date` | `TEXT` |
| `sale_date` | `TEXT` |
| `profit` | `REAL` |
| `sector` | `TEXT` |
| `industry` | `TEXT` |
| `market_cap` | `REAL` |
| `dividend_yield` | `REAL` |
| `earnings_per_share` | `REAL` |
| `volume` | `INTEGER` |
| `price_to_earnings_ratio` | `REAL` |

On startup, the backend reads **every `.sql` file** in `backend/src/data/`.

- If a dump contains `CREATE TABLE`, that table is created as defined.
- If a dump is INSERT-only and uses the generic table name `MOCK_DATA`, the
  backend automatically renames it to the filename. So `Trade.sql` becomes a
  `Trade` table and `Social_Media.sql` becomes a `Social_Media` table.
- The `/schema` endpoint returns every table that exists in the in-memory
  database, no code changes needed.

This means you can drop in any number of `.sql` files and query them
immediately.

---

## Example Queries

```sql
-- Inspect the first 10 rows
SELECT * FROM MOCK_DATA LIMIT 10;

-- Count rows
SELECT COUNT(*) AS total_rows FROM MOCK_DATA;

-- Top profitable trades
SELECT trade_id, stock_symbol, profit
FROM MOCK_DATA
ORDER BY profit DESC
LIMIT 5;

-- Sector summary
SELECT sector,
       COUNT(*) AS trades,
       SUM(profit) AS total_profit,
       AVG(price_to_earnings_ratio) AS avg_pe
FROM MOCK_DATA
GROUP BY sector
ORDER BY total_profit DESC;

-- Filtered healthcare software trades
SELECT stock_symbol, quantity, profit
FROM MOCK_DATA
WHERE sector = 'Healthcare'
  AND industry = 'Software'
  AND profit > 100
ORDER BY profit DESC
LIMIT 5;

-- Average profit per sector
SELECT sector, ROUND(AVG(profit), 2) AS avg_profit
FROM MOCK_DATA
GROUP BY sector
ORDER BY avg_profit DESC;
```

---

## Monaco SQL Editor Integration

The Monaco editor is configured in two places:

- `frontend/src/components/SqlEditor.jsx` — the React component that renders
  the editor using `@monaco-editor/react`.
- `frontend/src/monaco/setup.js` — imports `monaco-sql-languages`, registers
  the PostgreSQL dialect, and wires up web workers for syntax parsing and
  validation.

`frontend/src/main.jsx` imports `monaco/setup` before mounting the React app.

---

## Development Scripts

### Backend

```bash
cd backend
npm run dev      # Start with hot reload (node --watch)
npm start        # Run without watch
```

### Frontend

```bash
cd frontend
npm run dev      # Start Vite dev server
npm run build    # Production build
npm run preview  # Preview production build
```

---

## Troubleshooting

### Port already in use

Kill any lingering Node processes:

```bash
# Windows PowerShell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Or Git Bash / WSL
taskkill //F //IM node.exe
```

### `better-sqlite3` install fails

`better-sqlite3` compiles a native addon. If installation fails, ensure you
have Python and a C++ compiler installed:

- Windows: Visual Studio Build Tools or `windows-build-tools`
- macOS: Xcode Command Line Tools
- Linux: `build-essential`

---

## Architecture

```
React UI
    │
Monaco SQL Editor
    │
QueryController
    │
QueryExecutionService
    │
InMemoryDataProvider
    │
SQLite (:memory:)
```

The frontend never talks directly to the database. The backend exposes a
stable API contract (`QueryRequest`, `QueryResult`, `Schema`, `ApiError`),
and the provider can later be swapped for PostgreSQL without changing the
UI.

---

## License

MIT
