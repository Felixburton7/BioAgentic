"""
LangGraph StateGraph builder for the BioAgentic pipeline.
Inspired by Denario's agents_graph.py — defines nodes, edges,
and conditional routing for the debate loop.

Pipeline:
  analyzer → trials_scout → literature_miner → hypothesis_generator
  → debate_round → synthesizer → END
"""

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .state import BiotechState
from .agents.analyzer import target_analyzer
from .agents.scouts import trials_scout, literature_miner
from .agents.hypothesis import hypothesis_generator
from .agents.debate import debate_round, synthesizer
from .config import DEFAULT_DEBATE_ROUNDS


def build_graph(debate_rounds: int = DEFAULT_DEBATE_ROUNDS):
    """
    Build and compile the BioAgentic LangGraph.

    Args:
        debate_rounds: Number of advocate/skeptic/mediator rounds.

    Returns:
        Compiled LangGraph ready to invoke.
    """
    builder = StateGraph(BiotechState)

    # --- Define nodes ---
    builder.add_node("analyzer", target_analyzer)
    builder.add_node("trials_scout", trials_scout)
    builder.add_node("literature_miner", literature_miner)
    builder.add_node("hypothesis_generator", hypothesis_generator)
    builder.add_node("debate", debate_round)
    builder.add_node("synthesizer", synthesizer)

    # --- Define edges (sequential pipeline) ---
    builder.set_entry_point("analyzer")
    builder.add_edge("analyzer", "trials_scout")
    builder.add_edge("trials_scout", "literature_miner")
    builder.add_edge("literature_miner", "hypothesis_generator")
    builder.add_edge("hypothesis_generator", "debate")
    builder.add_edge("debate", "synthesizer")
    builder.add_edge("synthesizer", END)

    # Compile with memory checkpointer
    memory = MemorySaver()
    graph = builder.compile(checkpointer=memory)

    return graph


# Lazy-loaded graph instance to avoid slow startup on Railway
_default_graph = None


def get_default_graph():
    """Return (and cache) a default graph instance."""
    global _default_graph
    if _default_graph is None:
        _default_graph = build_graph()
    return _default_graph


# Keep backward compat – but prefer get_default_graph()
default_graph = None  # built lazily via get_default_graph()
