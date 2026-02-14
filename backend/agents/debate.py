"""
Debate agent nodes: Advocate, Skeptic, Mediator, Synthesizer.
Implements the ASCollab-inspired iterative debate loop and the
Denario maker/hater iterative pattern.  All calls are async.
"""

from __future__ import annotations

from typing import Any, Dict, List

from ..config import acall_llm, SYNTHESIZER_MODEL
from ..prompts import BIOTECH_PROMPTS
from ..state import BiotechState


class Debate:
    """Run N rounds of advocate → skeptic → mediator debate."""

    async def call(self, state: BiotechState) -> Dict[str, Any]:
        """
        Execute multi-round structured debate on the generated hypotheses.

        Each round cycles through three roles:
        1. **Advocate** — argues the hypotheses are well-supported.
        2. **Skeptic** — challenges with gaps / weaknesses.
        3. **Mediator** — synthesises and rates evidence strength.

        The full transcript is accumulated in ``state.debate.history``
        and also exposed as ``state.debate_history`` for convenience.
        """
        debate: dict = state.get("debate", {})  # type: ignore[arg-type]
        current_round: int = debate.get("round", 0)
        max_rounds: int = debate.get("max_rounds", 2)
        history: str = debate.get("history", "")
        hypotheses: str = state.get("hypotheses", "")  # type: ignore[arg-type]

        log_entries: List[Dict[str, str]] = []

        for r in range(current_round, max_rounds):
            round_label = f"Round {r + 1}/{max_rounds}"

            # --- Advocate ---
            adv_prompt = (
                f"Hypotheses:\n{hypotheses}\n\n"
                f"Debate history:\n{history}\n\n"
                f"This is {round_label}."
            )
            adv_response = await acall_llm(
                system_prompt=BIOTECH_PROMPTS["advocate"],
                user_prompt=adv_prompt,
            )
            history += f"\n\n### {round_label} — Advocate\n{adv_response}"
            log_entries.append(
                {"agent": f"Advocate (R{r + 1})", "content": adv_response}
            )

            # --- Skeptic ---
            skep_prompt = (
                f"Hypotheses:\n{hypotheses}\n\n"
                f"Debate history:\n{history}\n\n"
                f"This is {round_label}."
            )
            skep_response = await acall_llm(
                system_prompt=BIOTECH_PROMPTS["skeptic"],
                user_prompt=skep_prompt,
            )
            history += f"\n\n### {round_label} — Skeptic\n{skep_response}"
            log_entries.append(
                {"agent": f"Skeptic (R{r + 1})", "content": skep_response}
            )

            # --- Mediator ---
            med_prompt = (
                f"Hypotheses:\n{hypotheses}\n\n"
                f"Full debate so far:\n{history}"
            )
            med_response = await acall_llm(
                system_prompt=BIOTECH_PROMPTS["mediator"],
                user_prompt=med_prompt,
            )
            history += f"\n\n### {round_label} — Mediator\n{med_response}"
            log_entries.append(
                {"agent": f"Mediator (R{r + 1})", "content": med_response}
            )

        return {
            "debate": {
                "round": max_rounds,
                "max_rounds": max_rounds,
                "history": history,
            },
            "agents_log": log_entries,
        }


class Synthesizer:
    """Generate the final executive research brief."""

    PROMPT_KEY = "synthesizer"

    async def call(self, state: BiotechState) -> Dict[str, Any]:
        """
        Combine target analysis, API data, hypotheses, and the full
        debate transcript into a structured markdown report.
        """
        target: str = state["target"]
        analysis: str = state.get("analysis", "")  # type: ignore[arg-type]
        api_data: dict = state.get("api_data", {})  # type: ignore[arg-type]
        hypotheses: str = state.get("hypotheses", "")  # type: ignore[arg-type]
        debate: dict = state.get("debate", {})  # type: ignore[arg-type]
        debate_history: str = debate.get("history", "")

        full_context = (
            f"# Research Target: {target}\n\n"
            f"## Target Analysis\n{analysis}\n\n"
            f"## Clinical Trial Data\n{api_data.get('trials', 'N/A')}\n\n"
            f"## PubMed Literature\n{api_data.get('pubmed', 'N/A')[:800]}\n\n"
            f"## Semantic Scholar Literature\n{api_data.get('semantic', 'N/A')[:800]}\n\n"
            f"## Generated Hypotheses\n{hypotheses}\n\n"
            f"## Debate Transcript\n{debate_history}"
        )

        brief = await acall_llm(
            system_prompt=BIOTECH_PROMPTS[self.PROMPT_KEY],
            user_prompt=full_context,
            model=SYNTHESIZER_MODEL,
        )

        return {
            "brief": brief,
            "agents_log": [{"agent": "Synthesizer", "content": brief}],
        }


# ------------------------------------------------------------------
# Module-level node functions for LangGraph
# ------------------------------------------------------------------
_debate = Debate()
_synthesizer = Synthesizer()


async def debate_round(state: BiotechState) -> Dict[str, Any]:
    """LangGraph node — multi-round debate."""
    return await _debate.call(state)


async def synthesizer(state: BiotechState) -> Dict[str, Any]:
    """LangGraph node — final brief synthesis."""
    return await _synthesizer.call(state)
