"""
FastAPI server with SSE streaming for the BioAgentic pipeline.
Adapted from backend/main.py's FastAPI structure with fixed streaming.
"""

import json
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .graph import build_graph, default_graph
from .config import DEFAULT_DEBATE_ROUNDS

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
    Uses LangGraph's built-in graph.astream() for async node compatibility.
    """
    async def event_generator():
        graph = build_graph(debate_rounds=req.rounds or DEFAULT_DEBATE_ROUNDS)
        initial_state = _build_initial_state(req.target, req.rounds or DEFAULT_DEBATE_ROUNDS)
        thread_id = str(uuid.uuid4())

        try:
            async for chunk in graph.astream(
                initial_state,
                config={"configurable": {"thread_id": thread_id}},
            ):
                # Each chunk is {node_name: state_update}
                for node_name, update in chunk.items():
                    log_entries = update.get("agents_log", [])
                    for entry in log_entries:
                        event = {
                            "node": node_name,
                            "agent": entry.get("agent", node_name),
                            "content": entry.get("content", ""),
                            "timestamp": datetime.utcnow().isoformat(),
                        }
                        yield f"data: {json.dumps(event)}\n\n"

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
