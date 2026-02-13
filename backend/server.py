"""
FastAPI server with SSE streaming for the BioAgentic pipeline.
Adapted from backend/main.py's FastAPI structure with fixed streaming.
"""

import json
import os
import sys
import time
import uuid
import logging
from datetime import datetime
from typing import List, Optional

# Debug: log startup progress
print("BioAgentic server process started...", file=sys.stderr)
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger("bioagentic")
logger.info("Starting BioAgentic server...")
logger.info(f"PORT env = {os.environ.get('PORT', 'NOT SET')}")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger.info("FastAPI imported OK")

try:
    from .graph import build_graph
    from .config import DEFAULT_DEBATE_ROUNDS
    logger.info("Backend modules imported OK")
except Exception as e:
    logger.error(f"Import error: {e}", exc_info=True)
    raise

# ---------------------------------------------------------------------------
# Pipeline status messages — shown in the frontend activity trace
# ---------------------------------------------------------------------------

PIPELINE_STATUS: dict[str, str] = {
    "analyzer": "Analysing research target…",
    "trials_scout": "Searching for clinical trials…",
    "literature_miner": "Mining academic literature…",
    "hypothesis_generator": "Generating hypotheses…",
    "debate": "Running debate rounds…",
    "synthesizer": "Writing research brief…",
}

PIPELINE_ORDER = [
    "analyzer",
    "trials_scout",
    "literature_miner",
    "hypothesis_generator",
    "debate",
    "synthesizer",
]

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ResearchRequest(BaseModel):
    """Request body for the /research endpoint."""
    target: str
    rounds: Optional[int] = DEFAULT_DEBATE_ROUNDS


class AgentMessage(BaseModel):
    """One agent's contribution to the conversation."""
    agent: str
    content: str
    timestamp: str


class ResearchResponse(BaseModel):
    """Full pipeline response."""
    target: str
    hypotheses: str
    debate_history: str
    brief: str
    agents_log: List[AgentMessage]


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="BioAgentic API",
    description="Agentic biotech research: clinical trials, literature, hypothesis generation & debate",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_initial_state(target: str, rounds: int) -> dict:
    """Create the initial state dict for the graph."""
    return {
        "target": target,
        "analysis": "",
        "api_data": {},
        "hypotheses": "",
        "debate": {
            "round": 0,
            "max_rounds": rounds,
            "history": "",
        },
        "brief": "",
        "agents_log": [],
    }


def _format_log(agents_log: list) -> List[AgentMessage]:
    """Convert raw agent log entries to Pydantic models."""
    now = datetime.utcnow().isoformat()
    return [
        AgentMessage(
            agent=entry.get("agent", "Unknown"),
            content=entry.get("content", ""),
            timestamp=now,
        )
        for entry in agents_log
    ]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/research", response_model=ResearchResponse)
async def run_research(req: ResearchRequest):
    """
    Run the full research pipeline asynchronously.
    Returns the complete analysis including hypotheses, debate, and brief.
    """
    graph = build_graph(debate_rounds=req.rounds or DEFAULT_DEBATE_ROUNDS)

    initial_state = _build_initial_state(req.target, req.rounds or DEFAULT_DEBATE_ROUNDS)
    thread_id = str(uuid.uuid4())

    try:
        result = await graph.ainvoke(
            initial_state,
            config={"configurable": {"thread_id": thread_id}},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")

    return ResearchResponse(
        target=req.target,
        hypotheses=result.get("hypotheses", ""),
        debate_history=result.get("debate", {}).get("history", ""),
        brief=result.get("brief", ""),
        agents_log=_format_log(result.get("agents_log", [])),
    )


@app.post("/research/stream")
async def stream_research(req: ResearchRequest):
    """
    Run the pipeline with SSE streaming — yields agent outputs in real-time.
    Emits status/progress events so the frontend can show activity traces.
    """
    async def event_generator():
        graph = build_graph(debate_rounds=req.rounds or DEFAULT_DEBATE_ROUNDS)
        initial_state = _build_initial_state(req.target, req.rounds or DEFAULT_DEBATE_ROUNDS)
        thread_id = str(uuid.uuid4())

        # Emit the initial status for the first node
        first_node = PIPELINE_ORDER[0]
        yield f"data: {json.dumps({'event': 'status', 'node': first_node, 'message': PIPELINE_STATUS.get(first_node, 'Processing…')})}\n\n"

        node_start = time.time()

        try:
            async for chunk in graph.astream(
                initial_state,
                config={"configurable": {"thread_id": thread_id}},
            ):
                now = time.time()

                # Each chunk is {node_name: state_update}
                for node_name, update in chunk.items():
                    duration = round(now - node_start, 1)

                    # Emit node_complete with duration
                    yield f"data: {json.dumps({'event': 'node_complete', 'node': node_name, 'duration': duration})}\n\n"

                    # Emit the agent log entries (content)
                    log_entries = update.get("agents_log", [])
                    for entry in log_entries:
                        event = {
                            "node": node_name,
                            "agent": entry.get("agent", node_name),
                            "content": entry.get("content", ""),
                            "timestamp": datetime.utcnow().isoformat(),
                        }
                        yield f"data: {json.dumps(event)}\n\n"

                    # Emit status for the next node
                    try:
                        idx = PIPELINE_ORDER.index(node_name)
                        if idx + 1 < len(PIPELINE_ORDER):
                            next_node = PIPELINE_ORDER[idx + 1]
                            yield f"data: {json.dumps({'event': 'status', 'node': next_node, 'message': PIPELINE_STATUS.get(next_node, 'Processing…')})}\n\n"
                    except ValueError:
                        pass

                    node_start = now

            yield f"data: {json.dumps({'event': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "bioagentic"}


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

logger.info("BioAgentic app object created and ready")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting uvicorn on port {port}")
    # Enable proxy headers for Railway
    uvicorn.run(app, host="0.0.0.0", port=port, proxy_headers=True)
