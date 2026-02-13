"""
Hypothesis Generator agent node.
Takes combined API data + analysis and generates 3 novel hypotheses.
"""

from ..config import call_llm
from ..prompts import HYPOTHESIS_GENERATOR
from ..state import BiotechState


def hypothesis_generator(state: BiotechState) -> dict:
    """
    Generate 3 testable hypotheses from all collected data.

    Input: state["analysis"], state["api_data"], state["agents_log"]
    Output: state["hypotheses"] (full text of 3 hypotheses)
    """
    target = state["target"]
    analysis = state.get("analysis", "")
    api_data = state.get("api_data", {})

    # Build context from all previous agent outputs
    agents_log = state.get("agents_log", [])
    previous_insights = "\n\n".join(
        f"### {entry['agent']}\n{entry['content']}"
        for entry in agents_log
    )

    context = (
        f"Target: {target}\n\n"
        f"## Target Analysis\n{analysis}\n\n"
        f"## Agent Insights\n{previous_insights}\n\n"
        f"## Raw Trial Data (summary)\n{api_data.get('trials', 'N/A')[:500]}\n\n"
        f"## Raw Literature Data (summary)\n{api_data.get('pubmed', 'N/A')[:500]}"
    )

    hypotheses = call_llm(
        system_prompt=HYPOTHESIS_GENERATOR,
        user_prompt=context,
    )

    return {
        "hypotheses": hypotheses,
        "agents_log": [{"agent": "Hypothesis Generator", "content": hypotheses}],
    }
