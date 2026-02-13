import os
import json
from datetime import datetime
from typing import Optional, Dict, List, Annotated
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import requests

# LiteLLM for Grok (pip install litellm)
from litellm import completion

load_dotenv(dotenv_path="../.env", override=True)

# Grok config (add to .env: XAI_API_KEY=your_key)
os.environ["XAI_API_KEY"] = os.getenv("XAI_API_KEY")

MODEL = "grok-4-1-fast-non-reasoning"  

#models: grok-3, grok-3-mini, grok-4-0709, grok-4-1-fast-non-reasoning, 
# grok-4-1-fast-reasoning, grok-4-fast-non-reasoning, grok-4-fast-reasoning, grok-code-fast-1





TITLE = "Biotech Agent API"
BIOTECH_ROUNDS = 2  # Debate rounds

# Reused/Adapted prompts (your style, biotech-focused)
BIOTECH_PROMPTS = {
    "analyzer": """Analyze target (e.g., "KRAS G12C"): extract gene, mutation, disease. 
    - Bold key terms. Max 3 bullets. No verification.""",
    "trials_scout": """Fetch trials for {target}. Highlight phases, outcomes, failures. Bold signals. Use tool.""",
    "lit_miner": """From papers, extract mechanisms, safety, resistance for {target}. Bold novel insights. Use tool.""",
    "hyp_gen": """Generate 3 hypotheses from trials+lit data (e.g., resistance pathways). Specific/novel.""",
    "advocate": """Argue hypothesis is **supported** by evidence. Address skeptic. 1 para (100 words), **bold strongest evidence**.""",
    "skeptic": """Argue hypothesis is **weak**. Flaws/gaps in evidence. 1 para (100 words), **bold biggest issue**.""",
    "mediator": """Neutral synthesis. Resolve issues. Max 2 sentences.""",
    "synthesizer": """Summarize key insights/hypotheses from debate. Structure as markdown brief: Trials, Lit, Hypotheses, Risks."""
}

# Tools (real APIs)
def fetch_trials(target: str) -> str:
    """Agent tool: Search clinical trials by condition/drug."""
    try:
        # Complex query example
        params = {
            "query.cond": target,
            "filter.overallStatus": "RECRUITING,ACTIVE_NOT_RECRUITING",  # Optional
            "pageSize": 10,
            "fields": "BriefTitle,OfficialTitle,OverallStatus,Phase,EnrollmentCount,StartDateStruct.CompletionDateStruct,Conditions,SponsorCollaboratorsModule.LeadSponsor.Name"
        }
        resp = requests.get("https://clinicaltrials.gov/api/v2/studies", params=params, timeout=10).json()
        studies = resp.get("studies", [])
        
        summary = f"**{len(studies)} trials for '{target}'**:\n"
        for s in studies[:5]:  # Top 5
            title = s["protocolSection"]["identificationModule"].get("briefTitle", "N/A")[:100]
            status = s["protocolSection"]["statusModule"].get("overallStatus", "N/A")
            phase = ", ".join(s["protocolSection"]["designModule"].get("phases", []))
            enroll = s["protocolSection"]["designModule"]["enrollmentInfo"].get("count", "N/A")
            sponsor = s["protocolSection"]["sponsorCollaboratorsModule"]["leadSponsor"]["name"]
            summary += f"- **{title}** (NCT: {s['protocolSection']['identificationModule']['nctId']})\n  Status: {status}, Phase: {phase}, N={enroll}, Sponsor: {sponsor}\n"
        return summary if studies else "**No trials found.** Try broader term."
    except Exception as e:
        return f"**API error**: {str(e)} (check connection)."

# Grok tool format (in your call_llm)
TOOLS = [{
    "type": "function",
    "function": {
        "name": "fetch_trials",
        "description": "Search ClinicalTrials.gov by condition/drug/target. Returns top trials with status/phase/enrollment.",
        "parameters": {
            "type": "object",
            "properties": {"target": {"type": "string", "description": "e.g., 'KRAS G12C', 'lung cancer'"}},
            "required": ["target"]
        }
    }
}]


def fetch_papers(target: str) -> str:
    # PubMed stub (add eutils.ncbi.nlm.nih.gov real query)
    return f"**Papers on {target}**: 45 hits. Key: Resistance via bypass pathways, safety in NSCLC (mock; add Semantic Scholar API)."

TOOLS_DESC = [{"type": "function", "function": {"name": "fetch_trials", "description": "Get clinical trials", "parameters": {"type": "object", "properties": {"target": {"type": "string"}}}}},
              {"type": "function", "function": {"name": "fetch_papers", "description": "Get papers", "parameters": {"type": "object", "properties": {"target": {"type": "string"}}}}}]

# Reused LLM call (Grok via LiteLLM, drop JSON parsing)
def call_llm(system_prompt: str, user_prompt: str, tools=None, temperature=0.3) -> str:
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    resp = completion(
        model=MODEL,
        messages=messages,
        tools=tools,
        temperature=temperature
    )
    return resp.choices[0].message.content.strip()

# LangGraph State (minimal)
class BiotechState(dict):
    target: str
    messages: List[Dict]
    api_data: Dict
    hypotheses: List[str]
    debate_history: str = ""

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

workflow = StateGraph(BiotechState)

def analyzer_node(state):
    content = call_llm(BIOTECH_PROMPTS["analyzer"], state["target"])
    return {"messages": [{"role": "assistant", "content": content, "name": "Analyzer"}]}

def scout_node(state, api_name):
    tool_call = f"fetch_{api_name}(state['target'])"
    content = call_llm(BIOTECH_PROMPTS[f"{api_name}_scout"].format(target=state["target"]), tool_call, TOOLS_DESC)
    state["api_data"][api_name] = content
    return {"messages": [{"role": "assistant", "content": content, "name": api_name.title()}]}

def hyp_gen_node(state):
    data = state["api_data"]
    prompt = f"Trials: {data.get('trials', '')}\nPapers: {data.get('papers', '')}"
    content = call_llm(BIOTECH_PROMPTS["hyp_gen"], prompt)
    state["hypotheses"] = content.split('\n')[:3]  # Parse top 3
    return {"messages": [{"role": "assistant", "content": content, "name": "HypothesisGen"}]}

def debate_node(state):
    history = state["debate_history"]
    for i in range(BIOTECH_ROUNDS):
        adv = call_llm(BIOTECH_PROMPTS["advocate"], f"History: {history}\nHypotheses: {state['hypotheses']}")
        history += f"\nAdvocate: {adv}"
        skep = call_llm(BIOTECH_PROMPTS["skeptic"], f"History: {history}\nHypotheses: {state['hypotheses']}")
        history += f"\nSkeptic: {skep}"
        med = call_llm(BIOTECH_PROMPTS["mediator"], f"History: {history}")
        history += f"\nMediator: {med}"
    state["debate_history"] = history
    return {"messages": [{"role": "assistant", "content": history, "name": "Debate"}]}

def synth_node(state):
    content = call_llm(BIOTECH_PROMPTS["synthesizer"], state["debate_history"])
    return {"messages": [{"role": "assistant", "content": content, "name": "Synthesizer"}]}

# Graph (no jury!)
workflow.add_node("analyzer", analyzer_node)
workflow.add_node("trials", lambda s: scout_node(s, "trials"))
workflow.add_node("papers", lambda s: scout_node(s, "papers"))
workflow.add_node("hyp_gen", hyp_gen_node)
workflow.add_node("debate", debate_node)
workflow.add_node("synth", synth_node)

workflow.set_entry_point("analyzer")
workflow.add_edge("analyzer", "trials")
workflow.add_edge("trials", "papers")
workflow.add_edge("papers", "hyp_gen")
workflow.add_edge("hyp_gen", "debate")
workflow.add_edge("debate", "synth")
workflow.add_edge("synth", END)

graph = workflow.compile()

# Models (reuse yours)
class BiotechRequest(BaseModel):
    target: str
    rounds: Optional[int] = BIOTECH_ROUNDS

class AgentMessage(BaseModel):
    agent: str
    message: str
    timestamp: Optional[str] = None

class BiotechPayload(BaseModel):
    target: str
    hypotheses: List[str]
    debate_history: str
    brief: str
    conversation: List[AgentMessage]

# Reused endpoints (adapted)
app = FastAPI(title="Biotech Agent", version="1.0")

@app.post("/biotech", response_model=BiotechPayload)
def run_biotech(req: BiotechRequest):
    state = {"target": req.target, "messages": [], "api_data": {}, "hypotheses": []}
    result = graph.invoke(state)
    return BiotechPayload(
        target=req.target,
        hypotheses=result["hypotheses"],
        debate_history=result["debate_history"],
        brief=result["messages"][-1]["content"],  # Synth output
        conversation=[{"agent": m["name"], "message": m["content"], "timestamp": "now"} for m in result["messages"]]
    )

# Streaming (your generator style, no jury)
def biotech_stream(req: BiotechRequest):
    state = {"target": req.target, "messages": [], "api_data": {}, "hypotheses": []}
    # Simulate streaming by yielding per node (extend with graph checkpoints)
    for node in ["analyzer", "trials", "papers"]:  # Partial stream
        state = graph.get_node(node)(state)
        yield f"data: {json.dumps({'agent': node.title(), 'message': state['messages'][-1]['content']})}\n\n"
    yield "data: [END STREAM]\n\n"

@app.post("/biotech/stream")
def biotech_stream_endpoint(req: BiotechRequest):
    return StreamingResponse(biotech_stream(req), media_type="text/event-stream")

app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    print("Shutdown")

app.router.lifespan_context = lifespan

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
