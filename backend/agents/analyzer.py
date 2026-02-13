"""
Target Analyzer agent node.
First node in the pipeline — parses the user's input target
(e.g. "KRAS G12C") into structured gene / mutation context.
"""

from __future__ import annotations

import re
from typing import Any, Dict

from ..config import acall_llm
from ..prompts import BIOTECH_PROMPTS
from ..state import BiotechState


class TargetAnalyzer:
    """Parse a research target string into structured biological context."""

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
        Analyse ``state["target"]`` and return a state update.

        Steps
        -----
        1. Extract gene / mutation from the raw target string.
        2. Ask the LLM (via ``BIOTECH_PROMPTS["analyzer"]``) to provide
           structured bullet-point context.
        3. Return ``analysis`` text and an ``agents_log`` entry.
        """
        target: str = state["target"]
        gene, mutation = self._parse_target(target)

        user_prompt = (
            f"Analyze this biotech research target: {target}\n"
            f"Gene/Target: {gene}\n"
            f"Mutation/Variant: {mutation or 'none specified'}"
        )

        analysis = await acall_llm(
            system_prompt=BIOTECH_PROMPTS[self.PROMPT_KEY],
            user_prompt=user_prompt,
        )

        return {
            "analysis": analysis,
            "agents_log": [{"agent": "Target Analyzer", "content": analysis}],
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
