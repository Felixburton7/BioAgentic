"""
PubMed Linker — reasoning agent that finds publications for a clinical trial.

Uses structured NCT ID search (high-precision) and heuristic metadata search
(high-recall), then asks an LLM to rank candidates by match confidence.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List

from ...config import acall_llm, REASONING_MODEL
from ...prompts import BIOTECH_PROMPTS
from ...tools.pubmed import search_by_nct, search_by_trial_metadata

logger = logging.getLogger("bioagentic.linking.pubmed_linker")


async def link_trial_to_publications(
    registry: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Find PubMed publications linked to a clinical trial.

    1. Structured search by NCT ID (high-precision).
    2. If few results, heuristic search by title/condition/PI.
    3. LLM ranks candidates and assigns confidence scores.

    Args:
        registry: Enriched trial metadata from the registry enricher.

    Returns:
        Ranked list of publication candidates with confidence scores.
    """
    nct_id = registry.get("nct_id", "")
    if not nct_id:
        return []

    # Step 1: Structured NCT search
    nct_md, nct_citations = await asyncio.to_thread(search_by_nct, nct_id)

    # Step 2: Heuristic search if structured search yields few results
    heuristic_md = ""
    heuristic_citations: list[dict] = []
    if len(nct_citations) < 3:
        title = registry.get("brief_title", "") or registry.get("official_title", "")
        conditions = registry.get("conditions", [])
        condition = conditions[0] if conditions else ""
        pi_name = registry.get("pi_name", "")
        completion = registry.get("completion_date", "")
        # Extract year from date string
        comp_year = ""
        if completion:
            parts = completion.split()
            for p in parts:
                if p.isdigit() and len(p) == 4:
                    comp_year = p
                    break

        heuristic_md, heuristic_citations = await asyncio.to_thread(
            search_by_trial_metadata,
            title=title,
            condition=condition,
            pi_name=pi_name,
            completion_year=comp_year,
        )

    # Combine results for LLM ranking
    combined = f"## Structured NCT Search Results\n{nct_md}\n\n"
    if heuristic_md:
        combined += f"## Heuristic Metadata Search Results\n{heuristic_md}\n"

    all_citations = nct_citations + heuristic_citations

    if not all_citations:
        return []

    # Step 3: LLM ranking
    trial_context = json.dumps({
        "nct_id": nct_id,
        "title": registry.get("brief_title", ""),
        "official_title": registry.get("official_title", ""),
        "conditions": registry.get("conditions", []),
        "pi_name": registry.get("pi_name", ""),
        "sponsor": registry.get("sponsor", ""),
        "completion_date": registry.get("completion_date", ""),
        "status": registry.get("status", ""),
    }, indent=2)

    user_prompt = (
        f"## Trial Metadata\n```json\n{trial_context}\n```\n\n"
        f"## PubMed Search Results\n{combined}\n"
    )

    try:
        response = await acall_llm(
            system_prompt=BIOTECH_PROMPTS["pubmed_linker"],
            user_prompt=user_prompt,
            model=REASONING_MODEL,
            json_mode=True,
        )

        # Parse JSON response
        # Handle cases where response might be wrapped
        response = response.strip()
        if response.startswith("```"):
            lines = response.split("\n")
            response = "\n".join(lines[1:-1])

        parsed = json.loads(response)

        # Handle both array and object responses
        if isinstance(parsed, list):
            candidates = parsed
        elif isinstance(parsed, dict) and "candidates" in parsed:
            candidates = parsed["candidates"]
        else:
            candidates = [parsed] if parsed else []

        return candidates

    except (json.JSONDecodeError, Exception) as e:
        logger.warning("PubMed Linker LLM parsing failed: %s", e)
        # Fall back to returning raw citations with basic scoring
        fallback: List[Dict[str, Any]] = []
        for c in all_citations[:5]:
            fallback.append({
                "pmid": c.get("pmid", ""),
                "doi": c.get("doi", ""),
                "title": c.get("title", ""),
                "authors": c.get("authors", ""),
                "year": c.get("year", ""),
                "confidence": 40 if nct_id.upper() in (c.get("title", "") or "").upper() else 25,
                "match_reason": "Raw PubMed search result (LLM ranking unavailable)",
                "match_type": "metadata_heuristic",
            })
        return fallback
