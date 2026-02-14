"""
Scout agent nodes: TrialsScout and LitScout.
These consume the structured search criteria from the analyzer,
call real API tools, then pass the raw data through the LLM
for structured analysis.  All calls are async.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict

from ..config import acall_llm
from ..prompts import BIOTECH_PROMPTS
from ..state import BiotechState
from ..tools.clinical_trials import fetch_trials
from ..tools.pubmed import fetch_papers
from ..tools.semantic_scholar import search_papers

logger = logging.getLogger("bioagentic.scouts")


def _get_query(state: BiotechState, key: str) -> str:
    """Extract a pre-built query from search_criteria, falling back to target."""
    criteria: dict = state.get("search_criteria", {})  # type: ignore[arg-type]
    queries: dict = criteria.get("search_queries", {})
    query = queries.get(key)
    if query and isinstance(query, str):
        return query
    return state["target"]


def _criteria_context(state: BiotechState) -> str:
    """Format the search criteria as a JSON context block for LLM prompts."""
    criteria: dict = state.get("search_criteria", {})  # type: ignore[arg-type]
    if criteria:
        return f"\n\n## Structured Search Criteria\n```json\n{json.dumps(criteria, indent=2)}\n```"
    return ""


# =====================================================================
# Trials Scout
# =====================================================================
class TrialsScout:
    """Fetch clinical-trial data and produce an LLM-analysed summary."""

    PROMPT_KEY = "trials_scout"

    async def call(self, state: BiotechState) -> Dict[str, Any]:
        """
        1. Build query from analyzer's search criteria.
        2. Fetch trials from ClinicalTrials.gov (sync tool → threaded).
        3. LLM-analyse the raw data using ``BIOTECH_PROMPTS["trials_scout"]``.
        4. Store raw data in ``state.api_data["trials"]``.
        """
        condition_query = _get_query(state, "clinicaltrials_condition")
        intervention_query = _get_query(state, "clinicaltrials_intervention")
        # Only pass intervention if it's not just the raw target fallback
        intervention = (
            intervention_query
            if intervention_query != state["target"]
            else None
        )

        logger.info(
            "TrialsScout searching: condition=%r, intervention=%r",
            condition_query,
            intervention,
        )

        raw_trials: str = await asyncio.to_thread(
            fetch_trials, condition_query, intervention=intervention
        )

        criteria_block = _criteria_context(state)
        analysis = await acall_llm(
            system_prompt=BIOTECH_PROMPTS[self.PROMPT_KEY],
            user_prompt=(
                f"Target: {state['target']}\n\n"
                f"Clinical trial data:\n{raw_trials}"
                f"{criteria_block}"
            ),
        )

        existing_api: dict = state.get("api_data", {})  # type: ignore[arg-type]
        updated_api = {**existing_api, "trials": raw_trials}

        return {
            "api_data": updated_api,
            "agents_log": [{"agent": "Trials Scout", "content": analysis}],
        }


# =====================================================================
# Literature Scout (LitScout)
# =====================================================================
class LitScout:
    """Fetch academic papers from PubMed + Semantic Scholar."""

    PROMPT_KEY = "literature_miner"

    async def call(self, state: BiotechState) -> Dict[str, Any]:
        """
        1. Build queries from analyzer's search criteria.
        2. Fetch PubMed and Semantic Scholar data concurrently.
        3. Combine and LLM-analyse using ``BIOTECH_PROMPTS["literature_miner"]``.
        4. Store combined raw data in ``state.api_data["papers"]``.
        """
        pubmed_query = _get_query(state, "pubmed_query")
        semantic_query = _get_query(state, "semantic_scholar_query")

        logger.info(
            "LitScout searching: pubmed=%r, semantic=%r",
            pubmed_query,
            semantic_query,
        )

        pubmed_data, semantic_data = await asyncio.gather(
            asyncio.to_thread(fetch_papers, pubmed_query),
            asyncio.to_thread(search_papers, semantic_query),
        )

        combined = (
            f"## PubMed Results\n{pubmed_data}\n\n"
            f"## Semantic Scholar Results\n{semantic_data}"
        )

        criteria_block = _criteria_context(state)
        analysis = await acall_llm(
            system_prompt=BIOTECH_PROMPTS[self.PROMPT_KEY],
            user_prompt=(
                f"Target: {state['target']}\n\n"
                f"Academic literature data:\n{combined}"
                f"{criteria_block}"
            ),
        )

        existing_api: dict = state.get("api_data", {})  # type: ignore[arg-type]
        updated_api = {
            **existing_api,
            "pubmed": pubmed_data,
            "semantic": semantic_data,
            "papers": combined,
        }

        return {
            "api_data": updated_api,
            "agents_log": [{"agent": "Literature Miner", "content": analysis}],
        }


# =====================================================================
# Module-level node functions for LangGraph
# =====================================================================
_trials_scout = TrialsScout()
_lit_scout = LitScout()


async def trials_scout(state: BiotechState) -> Dict[str, Any]:
    """LangGraph node — clinical trials."""
    return await _trials_scout.call(state)


async def literature_miner(state: BiotechState) -> Dict[str, Any]:
    """LangGraph node — academic literature."""
    return await _lit_scout.call(state)
