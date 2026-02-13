"""
Debate agent nodes: Advocate, Skeptic, Mediator, Synthesizer.
Implements the ASCollab-inspired iterative debate loop
and the Denario maker/hater iterative pattern.
"""

from ..config import call_llm
from ..prompts import ADVOCATE, SKEPTIC, MEDIATOR, SYNTHESIZER
from ..state import BiotechState


def debate_round(state: BiotechState) -> dict:
    """
    Run N rounds of advocate → skeptic → mediator debate.

    Each round:
    1. Advocate argues hypotheses are supported
    2. Skeptic challenges with gaps/weaknesses
    3. Mediator synthesizes and rates evidence strength

    The debate state tracks rounds and accumulates history.
    """
    debate = state.get("debate", {})
    current_round = debate.get("round", 0)
    max_rounds = debate.get("max_rounds", 2)
    history = debate.get("history", "")
    hypotheses = state.get("hypotheses", "")

    log_entries = []

    for r in range(current_round, max_rounds):
        round_label = f"Round {r + 1}/{max_rounds}"

        # --- Advocate ---
        adv_prompt = (
            f"Hypotheses:\n{hypotheses}\n\n"
            f"Debate history:\n{history}\n\n"
            f"This is {round_label}."
        )
        adv_response = call_llm(system_prompt=ADVOCATE, user_prompt=adv_prompt)
        history += f"\n\n### {round_label} — Advocate\n{adv_response}"
        log_entries.append({"agent": f"Advocate (R{r+1})", "content": adv_response})

        # --- Skeptic ---
        skep_prompt = (
            f"Hypotheses:\n{hypotheses}\n\n"
            f"Debate history:\n{history}\n\n"
            f"This is {round_label}."
        )
        skep_response = call_llm(system_prompt=SKEPTIC, user_prompt=skep_prompt)
        history += f"\n\n### {round_label} — Skeptic\n{skep_response}"
        log_entries.append({"agent": f"Skeptic (R{r+1})", "content": skep_response})

        # --- Mediator ---
        med_prompt = (
            f"Hypotheses:\n{hypotheses}\n\n"
            f"Full debate so far:\n{history}"
        )
        med_response = call_llm(system_prompt=MEDIATOR, user_prompt=med_prompt)
        history += f"\n\n### {round_label} — Mediator\n{med_response}"
        log_entries.append({"agent": f"Mediator (R{r+1})", "content": med_response})

    return {
        "debate": {
            "round": max_rounds,
            "max_rounds": max_rounds,
            "history": history,
        },
        "agents_log": log_entries,
    }


def synthesizer(state: BiotechState) -> dict:
    """
    Generate the final executive research brief from all pipeline data.

    Combines target analysis, API data, hypotheses, and debate
    into a structured markdown report.
    """
    target = state["target"]
    analysis = state.get("analysis", "")
    api_data = state.get("api_data", {})
    hypotheses = state.get("hypotheses", "")
    debate = state.get("debate", {})
    debate_history = debate.get("history", "")

    full_context = (
        f"# Research Target: {target}\n\n"
        f"## Target Analysis\n{analysis}\n\n"
        f"## Clinical Trial Data\n{api_data.get('trials', 'N/A')}\n\n"
        f"## PubMed Literature\n{api_data.get('pubmed', 'N/A')[:800]}\n\n"
        f"## Semantic Scholar Literature\n{api_data.get('semantic', 'N/A')[:800]}\n\n"
        f"## Generated Hypotheses\n{hypotheses}\n\n"
        f"## Debate Transcript\n{debate_history}"
    )

    brief = call_llm(
        system_prompt=SYNTHESIZER,
        user_prompt=full_context,
    )

    return {
        "brief": brief,
        "agents_log": [{"agent": "Synthesizer", "content": brief}],
    }
