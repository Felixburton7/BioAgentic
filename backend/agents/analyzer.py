"""
Target Analyzer agent node.
First node in the pipeline — parses the user's input target.
"""

from ..config import call_llm
from ..prompts import TARGET_ANALYZER
from ..state import BiotechState


def target_analyzer(state: BiotechState) -> dict:
    """
    Parse a research target into structured biological context.

    Input:  state["target"] (e.g. "KRAS G12C")
    Output: state["analysis"] (structured bullet points)
    """
    target = state["target"]
    analysis = call_llm(
        system_prompt=TARGET_ANALYZER,
        user_prompt=f"Analyze this biotech research target: {target}",
    )

    return {
        "analysis": analysis,
        "agents_log": [{"agent": "Target Analyzer", "content": analysis}],
    }
