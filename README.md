# BioAgentic

Agentic system for biotech research — searches clinical trials + academic literature, generates hypotheses, and debates their merits using a multi-agent LangGraph pipeline powered by Grok.

## Architecture

```
User Input (e.g. "KRAS G12C")
    → Target Analyzer
    → Trials Scout (ClinicalTrials.gov API)
    → Literature Miner (PubMed + Semantic Scholar)
    → Hypothesis Generator (3 novel hypotheses)
    → Debate Loop (Advocate ↔ Skeptic ↔ Mediator × N rounds)
    → Synthesizer → Markdown Brief
```

Inspired by [Denario](https://github.com/AstroPilot-AI/Denario)'s LangGraph modularity and ASCollab's peer-review debate dynamics.

## Quick Start

```bash
# 1. Install
pip install -e .

# 2. Set your Grok API key
cp .env.example .env
# Edit .env and add your XAI_API_KEY from https://x.ai

# 3. Run the server
uvicorn bioagentic.server:app --reload --port 8000

# 4. Test
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
bioagentic/
├── config.py              # Model config, LLM client
├── state.py               # TypedDict state definitions
├── prompts.py             # Agent role prompts
├── graph.py               # LangGraph pipeline builder
├── server.py              # FastAPI server
├── tools/
│   ├── clinical_trials.py # ClinicalTrials.gov API v2
│   ├── pubmed.py          # PubMed E-utilities
│   └── semantic_scholar.py# Semantic Scholar API
└── agents/
    ├── analyzer.py        # Target parser
    ├── scouts.py          # Trials + Literature agents
    ├── hypothesis.py      # Hypothesis generator
    └── debate.py          # Advocate/Skeptic/Mediator/Synthesizer
```

## Configuration

Set in `.env`:
- `XAI_API_KEY` (required) — Grok API from [x.ai](https://x.ai)
- `NCBI_API_KEY` (optional) — PubMed rate limits
- `SEMANTIC_SCHOLAR_KEY` (optional) — Semantic Scholar rate limits
