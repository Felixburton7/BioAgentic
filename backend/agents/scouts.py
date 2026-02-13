"""
Scout agent nodes: TrialsScout and LitScout.
These call real API tools, then pass the raw data through the LLM
for structured analysis.  All calls are async.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict

from ..config import acall_llm
from ..prompts import BIOTECH_PROMPTS
from ..state import BiotechState
from ..tools.clinical_trials import fetch_trials
from ..tools.pubmed import fetch_papers
from ..tools.semantic_scholar import search_papers


# =====================================================================
# Trials Scout
# =====================================================================
class TrialsScout:
    """Fetch clinical-trial data and produce an LLM-analysed summary."""

    PROMPT_KEY = "trials_scout"

    async def call(self, state: BiotechState) -> Dict[str, Any]:
        """
        1. Fetch trials from ClinicalTrials.gov (sync tool → threaded).
        2. LLM-analyse the raw data using ``BIOTECH_PROMPTS["trials_scout"]``.
        3. Store raw data in ``state.api_data["trials"]``.
        """
        target: str = state["target"]

        raw_trials: str = await asyncio.to_thread(fetch_trials, target)

        analysis = await acall_llm(
            system_prompt=BIOTECH_PROMPTS[self.PROMPT_KEY],
            user_prompt=f"Target: {target}\n\nClinical trial data:\n{raw_trials}",
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
        1. Fetch PubMed and Semantic Scholar data concurrently.
        2. Combine and LLM-analyse using ``BIOTECH_PROMPTS["literature_miner"]``.
        3. Store combined raw data in ``state.api_data["papers"]``.
        """
        target: str = state["target"]

        pubmed_data, semantic_data = await asyncio.gather(
            asyncio.to_thread(fetch_papers, target),
            asyncio.to_thread(search_papers, target),
        )

        combined = (
            f"## PubMed Results\n{pubmed_data}\n\n"
            f"## Semantic Scholar Results\n{semantic_data}"
        )

        analysis = await acall_llm(
            system_prompt=BIOTECH_PROMPTS[self.PROMPT_KEY],
            user_prompt=f"Target: {target}\n\nAcademic literature data:\n{combined}",
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
