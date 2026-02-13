"""
Hypothesis Generator agent node.
Takes combined API data + prior analysis and generates 3 novel,
testable hypotheses via ``BIOTECH_PROMPTS["hypothesis_generator"]``.
"""

from __future__ import annotations

from typing import Any, Dict, List

from ..config import acall_llm
from ..prompts import BIOTECH_PROMPTS
from ..state import BiotechState


class HypothesisGenerator:
    """Synthesise all gathered data into 3 actionable hypotheses."""

    PROMPT_KEY = "hypothesis_generator"

    async def call(self, state: BiotechState) -> Dict[str, Any]:
        """
        Build rich context from every prior agent and ask the LLM to
        produce exactly 3 hypotheses.

        Returns
        -------
        dict with ``hypotheses`` (full text) and ``agents_log`` entry.
        """
        target: str = state["target"]
        analysis: str = state.get("analysis", "")  # type: ignore[arg-type]
        api_data: dict = state.get("api_data", {})  # type: ignore[arg-type]

        # Aggregate previous agent outputs for maximum context
        agents_log: List[dict] = state.get("agents_log", [])  # type: ignore[arg-type]
        previous_insights = "\n\n".join(
            f"### {entry['agent']}\n{entry['content']}"
            for entry in agents_log
        )

        context = (
            f"Target: {target}\n\n"
            f"## Target Analysis\n{analysis}\n\n"
            f"## Agent Insights\n{previous_insights}\n\n"
            f"## Raw Trial Data (summary)\n"
            f"{api_data.get('trials', 'N/A')[:500]}\n\n"
            f"## Raw Literature Data (summary)\n"
            f"{api_data.get('papers', api_data.get('pubmed', 'N/A'))[:500]}"
        )

        hypotheses = await acall_llm(
            system_prompt=BIOTECH_PROMPTS[self.PROMPT_KEY],
            user_prompt=context,
        )

        return {
            "hypotheses": hypotheses,
            "agents_log": [
                {"agent": "Hypothesis Generator", "content": hypotheses},
            ],
        }


# ------------------------------------------------------------------
# Module-level node function for LangGraph
# ------------------------------------------------------------------
_generator = HypothesisGenerator()


async def hypothesis_generator(state: BiotechState) -> Dict[str, Any]:
    """LangGraph node entry-point."""
    return await _generator.call(state)
