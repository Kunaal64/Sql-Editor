# SQL Editor (POC)

A lightweight web SQL editor proof-of-concept. It gives you a Monaco-powered
SQL editor in the browser and runs queries against either an in-memory SQLite
database (default) or a remote Neon PostgreSQL database.

The backend executes **real SQL** — not a hand-written parser — so joins,
aggregations, subqueries, window functions, and other supported syntax work
out of the box. The active provider is controlled by the `DATA_PROVIDER`
environment variable (`sqlite` or `neon`).

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
- AG Grid Community

### Backend

- Node.js + Express + JavaScript
- `better-sqlite3` (in-memory SQLite) — default/fallback
- `pg` + Neon PostgreSQL — optional remote database

---

## Folder Structure

```
.
├── README.md
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js            # Environment / provider config
│   │   ├── controllers/
│   │   │   └── QueryController.js
│   │   ├── data/
│   │   │   ├── *.sql                  # Dataset dumps
│   │   │   └── schemaLoader.js        # Dynamic schema inference / loader
│   │   ├── providers/
│   │   │   ├── index.js               # Provider factory
│   │   │   ├── SqliteDataProvider.js  # In-memory SQLite provider
│   │   │   └── NeonDataProvider.js    # PostgreSQL / Neon provider
│   │   ├── routes/
│   │   │   └── index.js
│   │   ├── sync/
│   │   │   └── DataSync.js            # Incremental file -> Neon sync
│   │   └── index.js
│   ├── .env.example
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
    │   │   └── setup.js               # Monaco configuration
    │   ├── services/
    │   │   └── api.js                 # Backend API client
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- (Optional) A [Neon](https://neon.tech) project if you want to use PostgreSQL

### 1. Start the backend

#### SQLite mode (default)

No external database is required.

```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:3001`.

#### Neon PostgreSQL mode

1. Copy the environment template:

   ```bash
   cd backend
   cp .env.example .env
   ```

2. Fill in `.env`:

   ```env
   DATA_PROVIDER=neon
   DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
   NEON_SYNC_ON_START=true
   NEON_WATCH_DATA_DIR=true
   NEON_FORCE_RESEED=false
   NEON_POOL_MAX=5
   ```

3. Install dependencies and start:

   ```bash
   npm install
   npm run dev
   ```

   On first start the backend uploads every `.sql` file from `backend/src/data/`
   to Neon. On later starts it only uploads new or changed files (hash-based
   incremental sync).

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

The POC ships with sample `.sql` files in `backend/src/data/`:

- `Trade.sql` — 1,000 synthetic stock trades
- `Social_Media.sql` — social media profile data
- `auther.sql`, `posts.sql` — MariaDB-style author/post dumps

### SQLite mode

On startup the backend scans `backend/src/data/`, builds a table registry, and
lazy-loads each dataset the first time it is queried.

### Neon PostgreSQL mode

Datasets are synced to Neon automatically:

- On startup the backend hashes each `.sql` file and compares it with the
  `_seed_log` table in Neon.
- Only new or changed files are uploaded, so restarts stay fast.
- In development the backend also watches `backend/src/data/`; dropping in a
  new file or editing an existing one triggers a sync.
- Each file is uploaded inside a transaction. If a file fails, it is skipped
  and the rest continue.

### Columns in `Trade.sql`

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
┌─────────────────────┴─────────────────────┐
│                                           │
SqliteDataProvider                 NeonDataProvider
│                                           │
better-sqlite3 (:memory:)                   pg + Neon PostgreSQL
```

The frontend never talks directly to the database. The backend exposes a
stable API contract (`QueryRequest`, `QueryResult`, `Schema`, `ApiError`).
Switching between SQLite and PostgreSQL only changes the provider
implementation; the UI stays the same.

When Neon is enabled, `DataSync` keeps the local `backend/src/data/`
folder in sync with the remote database.

---

## License

MIT
