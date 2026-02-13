# BioAgentic

Agentic system for biotech research — searches clinical trials + academic literature, generates hypotheses, and debates their merits using a multi-agent LangGraph pipeline powered by Grok.

## Architecture

```
User Input (e.g. "KRAS G12C")
    → Target Analyzer       (parse gene/mutation context)
    → Trials Scout           (ClinicalTrials.gov API)
    → Literature Miner       (PubMed + Semantic Scholar)
    → Hypothesis Generator   (3 novel hypotheses)
    → Debate Loop            (Advocate ↔ Skeptic ↔ Mediator × N rounds)
    → Synthesizer            → Markdown Brief
```

Inspired by [Denario](https://github.com/AstroPilot-AI/Denario)'s LangGraph modularity and ASCollab's peer-review debate dynamics.

## Quick Start

### Prerequisites

- **Python ≥ 3.11**
- **Node.js ≥ 18** (for the Next.js frontend)
- A **Grok API key** from [x.ai](https://x.ai)

### 1. Clone & configure environment

```bash
git clone https://github.com/Felixburton7/BioAgentic.git
cd BioAgentic

# Copy the example env and add your API keys
cp .env.example .env
# Edit .env → set XAI_API_KEY (required)
```

### 2. Start everything (recommended)
Check you have activated your virtual environment then:

```bash
source BAvenv/bin/activate
```
```bash
chmod +x start.sh
./start.sh
```

This launches **both** the backend (port 8000) and frontend (port 3000) in one terminal. Press `Ctrl+C` to stop both.

### 3. Or start manually

```bash
# Terminal 1 — Backend
pip install -e .
uvicorn backend.server:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

### 4. Test the API directly

```bash
curl -X POST http://localhost:8000/research \
  -H "Content-Type: application/json" \
  -d '{"target": "KRAS G12C", "rounds": 2}'
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/research` | POST | Run full pipeline, returns JSON |
| `/research/stream` | POST | SSE streaming of agent outputs |
| `/health` | GET | Health check |

## Project Structure

```
BioAgentic/
├── start.sh                # Start frontend + backend together
├── pyproject.toml           # Python dependencies & build config
├── .env.example             # Template for API keys
├── Dockerfile               # Container build (Railway/Docker)
├── Procfile                 # Railway deployment entrypoint
│
├── backend/
│   ├── config.py            # Model config, LLM client (LiteLLM/Grok)
│   ├── state.py             # TypedDict state definitions
│   ├── prompts.py           # Agent role prompts + BIOTECH_PROMPTS dict
│   ├── graph.py             # LangGraph pipeline builder
│   ├── server.py            # FastAPI server (async endpoints)
│   ├── tools/
│   │   ├── clinical_trials.py  # ClinicalTrials.gov API v2
│   │   ├── pubmed.py           # PubMed E-utilities
│   │   └── semantic_scholar.py # Semantic Scholar API
│   └── agents/
│       ├── analyzer.py      # TargetAnalyzer — parse gene/mutation
│       ├── scouts.py         # TrialsScout + LitScout
│       ├── hypothesis.py    # HypothesisGenerator — 3 hypotheses
│       └── debate.py        # Debate (advocate/skeptic/mediator) + Synthesizer
│
└── frontend/                # Next.js 16 app
    ├── app/                 # App router pages
    ├── components/          # React components
    └── package.json
```

## Configuration

Set in `.env`:

| Variable | Required | Description |
|---|---|---|
| `XAI_API_KEY` | ✅ Yes | Grok API key from [x.ai](https://x.ai) |
| `NCBI_API_KEY` | Optional | Higher PubMed rate limits ([get free key](https://www.ncbi.nlm.nih.gov/account/)) |
| `SEMANTIC_SCHOLAR_KEY` | Optional | Semantic Scholar rate limits ([API docs](https://www.semanticscholar.org/product/api)) |

## Deployment

### Railway (backend)

The repo includes `Dockerfile`, `Procfile`, and `railway.json` for one-click Railway deployment.

### Vercel (frontend)

The `frontend/` directory includes `vercel.json` for Vercel deployment. Set the **root directory** to `frontend` in Vercel project settings.

## License

MIT
