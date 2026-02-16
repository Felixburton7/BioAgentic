"""
State definitions for the LangGraph pipeline.
Inspired by Denario's parameters.py TypedDict pattern.
"""

from __future__ import annotations

from typing import Any, Dict, List
from typing_extensions import TypedDict


class SearchCriteria(TypedDict, total=False):
    """Structured search specification produced by the analyzer agent.

    Contains parsed primary concepts (conditions, interventions, gene/target),
    nice-to-have filters (population, study design, geography, etc.),
    pre-built search queries for each API, and a narrative summary.
    """
    primary_concepts: dict       # conditions, interventions, gene_target
    nice_to_have_filters: dict   # population, study_design, geography, status, dates
    search_queries: dict         # clinicaltrials_condition, pubmed_query, etc.
    narrative_summary: str       # Plain-English summary of what was parsed


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


class Citation(TypedDict, total=False):
    """Structured citation metadata tracked across all agents."""
    id: str           # e.g. "ct-1", "pm-3", "ss-5"
    type: str         # "clinical_trial" | "pubmed" | "semantic_scholar"
    title: str
    authors: str      # "Smith J, Doe A et al."
    year: str
    journal: str
    url: str          # direct link to the paper/trial
    pmid: str         # PubMed ID (if applicable)
    doi: str          # DOI (if applicable)
    nct_id: str       # NCT ID (if applicable)
    source_agent: str # which agent discovered this citation


class BiotechState(TypedDict, total=False):
    """
    Main graph state — passed between all LangGraph nodes.

    This is a proper TypedDict (not a class inheriting dict) so that
    LangGraph can track state updates correctly.
    """
    # Input
    target: str                 # User's research target (e.g. "KRAS G12C")
    clarification: str          # User's clarification response (optional)

    # Intermediate
    analysis: str               # Target analyzer output (narrative summary)
    search_criteria: SearchCriteria  # Structured search spec from analyzer
    api_data: APIData           # Raw API results
    hypotheses: str             # Generated hypotheses text
    debate: DebateState         # Debate tracking

    # Output
    brief: str                  # Final synthesized markdown brief
    agents_log: List[AgentLog]  # Full conversation log of all agents
    citations: List[Citation]   # Structured citation registry
