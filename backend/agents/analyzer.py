"""
Target Analyzer agent node.
First node in the pipeline — parses the user's input target
into structured JSON search criteria for the downstream scouts.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict

from ..config import acall_llm, REASONING_MODEL
from ..prompts import BIOTECH_PROMPTS
from ..state import BiotechState

logger = logging.getLogger("bioagentic.analyzer")


class TargetAnalyzer:
    """Parse a research target string into structured search criteria JSON."""

    PROMPT_KEY = "analyzer"

    # Simple heuristic: first token = gene, rest = mutation/variant
    _TARGET_RE = re.compile(
        r"^(?P<gene>[A-Z0-9a-z][A-Za-z0-9-]+)"
        r"(?:\s+(?P<mutation>.+))?$"
    )

    # ------------------------------------------------------------------
    # Public API — called by LangGraph as an async node
    # ------------------------------------------------------------------
    async def call(self, state: BiotechState) -> Dict[str, Any]:
        """
        Analyse ``state["target"]`` and return structured search criteria.

        Steps
        -----
        1. Ask the LLM to produce a structured JSON search specification.
        2. Parse the JSON and validate it has the expected keys.
        3. Fall back to a heuristic-built criteria dict if JSON parsing fails.
        4. Return ``analysis`` (narrative), ``search_criteria`` (JSON), and
           an ``agents_log`` entry.
        """
        target: str = state["target"]
        clarification: str = state.get("clarification", "None")  # type: ignore[arg-type]

        user_prompt = (
            f"Research target: {target}\n"
            f"User clarification: {clarification}"
        )

        raw_response = await acall_llm(
            system_prompt=BIOTECH_PROMPTS[self.PROMPT_KEY],
            user_prompt=user_prompt,
            json_mode=True,
            model=REASONING_MODEL,
        )

        search_criteria = self._parse_response(raw_response, target)
        narrative = search_criteria.get(
            "narrative_summary",
            f"Parsed research target: {target}",
        )

        return {
            "analysis": narrative,
            "search_criteria": search_criteria,
            "agents_log": [
                {
                    "agent": "Target Analyzer",
                    "content": (
                        f"{narrative}\n\n"
                        f"**Structured criteria:** "
                        f"{json.dumps(search_criteria, indent=2)}"
                    ),
                }
            ],
        }

    # ------------------------------------------------------------------
    # Response parsing with fallback
    # ------------------------------------------------------------------
    def _parse_response(self, raw: str, target: str) -> dict:
        """
        Try to parse the LLM response as JSON.  If it fails, build a
        minimal search-criteria dict from the regex heuristic.
        """
        try:
            data = json.loads(raw)
            # Validate expected top-level keys exist
            if "primary_concepts" not in data or "search_queries" not in data:
                raise ValueError("Missing required keys")
            return data
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning(
                "Analyzer JSON parse failed (%s); using heuristic fallback",
                exc,
            )
            return self._build_fallback(target)

    # ------------------------------------------------------------------
    # Heuristic fallback
    # ------------------------------------------------------------------
    def _build_fallback(self, target: str) -> dict:
        """Build a minimal search-criteria dict from the raw target string."""
        gene, mutation = self._parse_target(target)
        return {
            "primary_concepts": {
                "conditions": [],
                "interventions": [],
                "gene_target": {
                    "gene": gene,
                    "mutation": mutation,
                    "pathway": None,
                },
            },
            "nice_to_have_filters": {
                "population": {
                    "age_range": None, "sex": None, "stage": None,
                    "line_of_therapy": None, "biomarkers": [],
                },
                "study_design": {
                    "phase": [], "design": None, "masking": None,
                },
                "geography": [],
                "status": [],
                "date_window": {"start_after": None, "complete_before": None},
            },
            "search_queries": {
                "clinicaltrials_condition": target,
                "clinicaltrials_intervention": None,
                "pubmed_query": target,
                "semantic_scholar_query": target,
            },
            "narrative_summary": f"Parsed research target: {target} (gene={gene}, mutation={mutation or 'none'}).",
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_target(target: str) -> tuple[str, str | None]:
        """
        Best-effort split of ``target`` into (gene, mutation).

        Examples
        --------
        >>> TargetAnalyzer._parse_target("KRAS G12C")
        ('KRAS', 'G12C')
        >>> TargetAnalyzer._parse_target("TP53")
        ('TP53', None)
        """
        m = TargetAnalyzer._TARGET_RE.match(target.strip())
        if m:
            return m.group("gene"), m.group("mutation")
        return target.strip(), None


# ------------------------------------------------------------------
# Module-level node function for LangGraph
# ------------------------------------------------------------------
_analyzer = TargetAnalyzer()


async def target_analyzer(state: BiotechState) -> Dict[str, Any]:
    """LangGraph node entry-point — delegates to :class:`TargetAnalyzer`."""
    return await _analyzer.call(state)
