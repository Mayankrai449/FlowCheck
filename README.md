# FlowCheck — agent reference

Concise facts for anyone (including AI agents) changing this repo.

## What it is

Monorepo: a **React flow editor** (HTTP “API” nodes) plus a **FastAPI backend** that **executes a DAG** by proxying outbound HTTP requests. Intended as a **local workflow sandbox**, not a public proxy.

## Layout

| Path | Role |
|------|------|
| `frontend/` | Vite + React 19 + TypeScript UI |
| `backend/` | FastAPI app (`main.py`), Pydantic models (`schemas.py`) |

## Stacks

- **Frontend:** Vite 8, React 19, TypeScript, Tailwind 4, `@xyflow/react`, UI primitives via `@base-ui/react` / shadcn-style setup, Zustand.
- **Backend:** FastAPI, `httpx` (async HTTP), Pydantic v2.

## Run locally

**Backend** (from `backend/`):

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Default URL: `http://127.0.0.1:8000`.

**Frontend** (from `frontend/`):

```bash
npm install
npm run dev
```

Default Vite dev server: `http://localhost:5173`. The app calls the API at `import.meta.env.VITE_API_URL` if set; otherwise `http://127.0.0.1:8000` (see `frontend/src/lib/executeFlow.ts`).

Backend CORS is configured for the Vite dev origins (`localhost` / `127.0.0.1` on port 5173).

## Conventions for changes

- Match existing patterns in the subdirectory you touch (imports, component style, FastAPI route style).
- **Security:** do not treat the backend as safe to expose internet-wide; `main.py` documents proxy behavior and SSRF-style risk — preserve allowlisting/auth if extending URL handling.
- **Graph logic:** cycle detection and topological execution live in `backend/main.py`; node/request shapes in `schemas.py`. Frontend node data types align with API payloads (`frontend/src/types/`, execution client).

## Useful commands

- Frontend: `npm run build`, `npm run lint`
- Backend: run via `uvicorn` as above; no test harness in repo by default
