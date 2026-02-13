"""
State definitions for the LangGraph pipeline.
Inspired by Denario's parameters.py TypedDict pattern.
"""

from __future__ import annotations

from typing import Any, Dict, List
from typing_extensions import TypedDict


class APIData(TypedDict, total=False):
    """Raw results from external API calls."""
    trials: str       # Formatted clinical trials summary
    pubmed: str       # Formatted PubMed abstracts
    semantic: str     # Formatted Semantic Scholar results


class DebateState(TypedDict, total=False):
    """Tracks the multi-round advocate/skeptic/mediator debate."""
    round: int        # Current debate round
    max_rounds: int   # Total debate rounds to run
    history: str      # Accumulated debate transcript


class AgentLog(TypedDict):
    """One agent's output for the conversation log."""
    agent: str        # Agent name (e.g. "Analyzer", "Advocate")
    content: str      # Agent's output text


class BiotechState(TypedDict, total=False):
    """
    Main graph state — passed between all LangGraph nodes.

    This is a proper TypedDict (not a class inheriting dict) so that
    LangGraph can track state updates correctly.
    """
    # Input
    target: str                 # User's research target (e.g. "KRAS G12C")

    # Intermediate
    analysis: str               # Target analyzer output
    api_data: APIData           # Raw API results
    hypotheses: str             # Generated hypotheses text
    debate: DebateState         # Debate tracking

    # Output
    brief: str                  # Final synthesized markdown brief
    agents_log: List[AgentLog]  # Full conversation log of all agents
