"""
Scout agent nodes: Trials Scout and Literature Miner.
These call the real API tools, then pass the data through the LLM for analysis.
Fixed key issue from backend/main.py: tools are actually called here,
not just described to the LLM.
"""

from ..config import call_llm
from ..prompts import TRIALS_SCOUT, LITERATURE_MINER
from ..state import BiotechState
from ..tools.clinical_trials import fetch_trials
from ..tools.pubmed import fetch_papers
from ..tools.semantic_scholar import search_papers


def trials_scout(state: BiotechState) -> dict:
    """
    Fetch clinical trial data and analyze it.

    1. Call ClinicalTrials.gov API (real data)
    2. Pass results to LLM for structured analysis
    """
    target = state["target"]

    # Actually call the API (fixed from backend/main.py)
    raw_trials = fetch_trials(target)

    # LLM analysis of the raw data
    analysis = call_llm(
        system_prompt=TRIALS_SCOUT,
        user_prompt=f"Target: {target}\n\nClinical trial data:\n{raw_trials}",
    )

    # Merge into api_data
    existing_api = state.get("api_data", {})
    updated_api = {**existing_api, "trials": raw_trials}

    return {
        "api_data": updated_api,
        "agents_log": [{"agent": "Trials Scout", "content": analysis}],
    }


def literature_miner(state: BiotechState) -> dict:
    """
    Fetch academic papers and extract insights.

    1. Call PubMed + Semantic Scholar APIs (real data)
    2. Pass combined results to LLM for insight extraction
    """
    target = state["target"]

    # Fetch from both sources
    pubmed_data = fetch_papers(target)
    semantic_data = search_papers(target)

    combined = f"## PubMed Results\n{pubmed_data}\n\n## Semantic Scholar Results\n{semantic_data}"

    # LLM analysis
    analysis = call_llm(
        system_prompt=LITERATURE_MINER,
        user_prompt=f"Target: {target}\n\nAcademic literature data:\n{combined}",
    )

    # Merge into api_data
    existing_api = state.get("api_data", {})
    updated_api = {**existing_api, "pubmed": pubmed_data, "semantic": semantic_data}

    return {
        "api_data": updated_api,
        "agents_log": [{"agent": "Literature Miner", "content": analysis}],
    }
