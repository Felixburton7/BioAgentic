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
    from .config import DEFAULT_DEBATE_ROUNDS, acall_llm, REASONING_MODEL
    from .prompts import CLARIFIER, BIOTECH_PROMPTS
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
    clarification: Optional[str] = None


class AgentMessage(BaseModel):
    """One agent's contribution to the conversation."""
    agent: str
    content: str
    timestamp: str


class CitationModel(BaseModel):
    """Structured citation from the research pipeline."""
    id: str
    type: str
    title: str
    authors: str = ""
    year: str = ""
    journal: str = ""
    url: str = ""
    pmid: str = ""
    doi: str = ""
    nct_id: str = ""
    source_agent: str = ""


class ResearchResponse(BaseModel):
    """Full pipeline response."""
    target: str
    hypotheses: str
    debate_history: str
    brief: str
    agents_log: List[AgentMessage]
    citations: List[CitationModel] = []


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



class ClarificationOption(BaseModel):
    id: str
    label: str
    description: str

class ClarificationResponse(BaseModel):
    """Response from the clarification endpoint."""
    needs_clarification: bool = True
    focus_question: str
    focus_options: List[ClarificationOption]
    target_question: str
    disambiguation: Optional[str] = None


def _build_initial_state(target: str, rounds: int, clarification: str = "") -> dict:
    """Create the initial state dict for the graph."""
    return {
        "target": target,
        "clarification": clarification,
        "analysis": "",
        "search_criteria": {},
        "api_data": {},
        "hypotheses": "",
        "debate": {
            "round": 0,
            "max_rounds": rounds,
            "history": "",
        },
        "brief": "",
        "agents_log": [],
        "citations": [],
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

    graph = build_graph(debate_rounds=req.rounds or DEFAULT_DEBATE_ROUNDS)

    initial_state = _build_initial_state(req.target, req.rounds or DEFAULT_DEBATE_ROUNDS, req.clarification or "")
    thread_id = str(uuid.uuid4())

    try:
        result = await graph.ainvoke(
            initial_state,
            config={"configurable": {"thread_id": thread_id}},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")

    raw_citations = result.get("citations", [])
    citations = [CitationModel(**c) for c in raw_citations]

    return ResearchResponse(
        target=req.target,
        hypotheses=result.get("hypotheses", ""),
        debate_history=result.get("debate", {}).get("history", ""),
        brief=result.get("brief", ""),
        agents_log=_format_log(result.get("agents_log", [])),
        citations=citations,
    )


@app.post("/research/clarify", response_model=ClarificationResponse)
async def clarify_research(req: ResearchRequest):
    """
    Step 1: Ask the user a clarifying question before starting the pipeline.
    """
    try:
        # Call LLM to get question and options
        response_json = await acall_llm(
            system_prompt=CLARIFIER.format(target=req.target), # Basic formatting, though CLARIFIER needs {target}
            user_prompt=f"Target: {req.target}",
            json_mode=True
        )
        # Parse JSON
        data = json.loads(response_json)
        return ClarificationResponse(
            needs_clarification=data.get("needs_clarification", True),
            focus_question=data.get("focus_question", f"What aspect of {req.target} interests you?"),
            focus_options=[ClarificationOption(**opt) for opt in data.get("focus_options", [])],
            target_question=data.get("target_question", "Any specific drug or trial?"),
            disambiguation=data.get("disambiguation")
        )
    except Exception as e:
        logger.error(f"Clarification error: {e}")
        # Fallback — assume clarification needed if LLM call fails
        return ClarificationResponse(
            needs_clarification=True,
            focus_question=f"What aspect of {req.target} interests you?",
            focus_options=[
                ClarificationOption(id="general", label="General Overview", description="Broad summary."),
                ClarificationOption(id="clinical", label="Clinical Data", description="Trials and results.")
            ],
            target_question="Any specific details?"
        )


@app.post("/research/stream")
async def stream_research(req: ResearchRequest):
    """
    Run the pipeline with SSE streaming — yields agent outputs in real-time.
    Emits status/progress events so the frontend can show activity traces.
    """
    async def event_generator():
        graph = build_graph(debate_rounds=req.rounds or DEFAULT_DEBATE_ROUNDS)
        initial_state = _build_initial_state(req.target, req.rounds or DEFAULT_DEBATE_ROUNDS, req.clarification or "")
        thread_id = str(uuid.uuid4())

        # Emit the initial status for the first node
        first_node = PIPELINE_ORDER[0]
        yield f"data: {json.dumps({'event': 'status', 'node': first_node, 'message': PIPELINE_STATUS.get(first_node, 'Processing…')})}\n\n"

        node_start = time.time()
        all_citations: list[dict] = []

        try:
            async for chunk in graph.astream(
                initial_state,
                config={"configurable": {"thread_id": thread_id}},
            ):
                now = time.time()

                # Each chunk is {node_name: state_update}
                for node_name, update in chunk.items():
                    duration = round(now - node_start, 1)

                    # Collect citations from this chunk
                    chunk_citations = update.get("citations", [])
                    if chunk_citations:
                        all_citations = chunk_citations  # state accumulates, so latest is complete

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

            # Emit structured citations before done
            if all_citations:
                yield f"data: {json.dumps({'event': 'citations', 'citations': all_citations})}\n\n"

            yield f"data: {json.dumps({'event': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


class FollowUpRequest(BaseModel):
    """Request for a follow-up question about completed research."""
    target: str
    question: str
    context: str  # The original brief
    rounds: int = 1  # Number of debate rounds


@app.post("/research/followup")
async def followup_research(req: FollowUpRequest):
    """
    Run a structured follow-up analysis:
      1. Query Analyzer (reasoning model) — decompose the question
      2. N rounds of Advocate → Skeptic → Mediator debate
      3. Synthesizer (reasoning model) — polished final answer
    Streams each step as SSE events.
    """
    async def event_generator():
        full_context = (
            f"# Original Research Brief\n{req.context}\n\n"
            f"# Follow-Up Question\n{req.question}"
        )
        debate_history = ""
        node_start = time.time()

        try:
            # ── Step 1: Query Analyzer (reasoning model) ──
            yield f"data: {json.dumps({'event': 'status', 'node': 'followup', 'message': 'Analyzing follow-up question…'})}\n\n"

            analysis = await acall_llm(
                system_prompt=BIOTECH_PROMPTS["followup_analyzer"],
                user_prompt=full_context,
                model=REASONING_MODEL,
            )
            debate_history += f"### Query Analysis\n{analysis}"
            duration = round(time.time() - node_start, 1)
            node_start = time.time()

            yield f"data: {json.dumps({'node': 'followup', 'agent': 'Follow-Up Analyzer', 'content': analysis, 'timestamp': datetime.utcnow().isoformat()})}\n\n"
            yield f"data: {json.dumps({'event': 'node_complete', 'node': 'followup_analyzer', 'duration': duration})}\n\n"

            # ── Step 2: Debate rounds (Advocate → Skeptic → Mediator) × N ──
            num_rounds = max(1, min(req.rounds, 5))  # clamp 1-5
            for r in range(1, num_rounds + 1):
                round_label = f"Round {r}/{num_rounds}" if num_rounds > 1 else ""

                for prompt_key, agent_name in [
                    ("followup_advocate", "Advocate"),
                    ("followup_skeptic", "Skeptic"),
                    ("followup_mediator", "Mediator"),
                ]:
                    yield f"data: {json.dumps({'event': 'status', 'node': 'followup', 'message': f'{agent_name} {round_label} debating…'})}\n\n"

                    user_prompt = f"{full_context}\n\n# Analysis & Debate History\n{debate_history}"
                    response = await acall_llm(
                        system_prompt=BIOTECH_PROMPTS[prompt_key],
                        user_prompt=user_prompt,
                    )

                    debate_history += f"\n\n### {agent_name} {round_label}\n{response}"
                    duration = round(time.time() - node_start, 1)
                    node_start = time.time()

                    display_name = f"Follow-Up {agent_name}" + (f" ({round_label})" if round_label else "")
                    yield f"data: {json.dumps({'node': 'followup', 'agent': display_name, 'content': response, 'timestamp': datetime.utcnow().isoformat()})}\n\n"
                    yield f"data: {json.dumps({'event': 'node_complete', 'node': f'followup_{agent_name.lower()}_{r}', 'duration': duration})}\n\n"

            # ── Step 3: Synthesizer (reasoning model) ──
            yield f"data: {json.dumps({'event': 'status', 'node': 'followup', 'message': 'Synthesizing final answer…'})}\n\n"

            synth_prompt = f"{full_context}\n\n# Full Analysis & Debate Transcript\n{debate_history}"
            synthesis = await acall_llm(
                system_prompt=BIOTECH_PROMPTS["followup_synthesizer"],
                user_prompt=synth_prompt,
                model=REASONING_MODEL,
            )

            duration = round(time.time() - node_start, 1)
            yield f"data: {json.dumps({'node': 'followup', 'agent': 'Follow-Up Synthesizer', 'content': synthesis, 'timestamp': datetime.utcnow().isoformat()})}\n\n"
            yield f"data: {json.dumps({'event': 'node_complete', 'node': 'followup_synthesizer', 'duration': duration})}\n\n"

            yield f"data: {json.dumps({'event': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")



class AuthRequest(BaseModel):
    """Password submission."""
    password: str


@app.post("/auth")
async def authenticate(req: AuthRequest):
    """
    Verify the site password.
    The expected password is read from the APP_PASSWORD env var.
    If APP_PASSWORD is not set, all passwords are accepted (local dev).
    """
    expected = os.environ.get("APP_PASSWORD", "")
    if not expected or req.password == expected:
        return {"valid": True}
    raise HTTPException(status_code=401, detail="Invalid password")


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
