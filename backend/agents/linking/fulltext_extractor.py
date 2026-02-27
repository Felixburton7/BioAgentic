"""
Full-Text Data Extractor — reasoning agent that finds data-availability
information in publication full texts.

Fetches open-access full text from Europe PMC, runs rule-based extraction,
then uses an LLM to interpret and classify data-availability statements.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List

from ...config import acall_llm
from ...prompts import BIOTECH_PROMPTS
from ...tools.europe_pmc import (
    fetch_fulltext,
    extract_data_availability,
    search_fulltext_for_nct,
)

logger = logging.getLogger("bioagentic.linking.fulltext_extractor")


async def extract_publication_data(
    pmid: str,
    doi: str = "",
    nct_id: str = "",
) -> Dict[str, Any]:
    """
    Extract data-availability information from a publication's full text.

    1. Fetch full text from Europe PMC.
    2. Rule-based extraction of data sections and URLs.
    3. LLM interpretation of data-availability statements.

    Args:
        pmid: PubMed ID.
        doi: DOI (optional fallback).
        nct_id: NCT ID to check for mention in full text.

    Returns:
        Dict with availability_type, urls, repositories, nct_mentioned, etc.
    """
    result: Dict[str, Any] = {
        "pmid": pmid,
        "doi": doi,
        "nct_mentioned": False,
        "fulltext_available": False,
        "availability_type": "not_stated",
        "statement_snippet": "",
        "repository_urls": [],
        "repository_names": [],
        "supplementary_urls": [],
        "notes": "",
    }

    # Step 1: Fetch full text
    fulltext = await asyncio.to_thread(fetch_fulltext, pmid=pmid, doi=doi)

    if not fulltext:
        result["notes"] = "Full text not available (abstract-only or closed access)"
        return result

    result["fulltext_available"] = True

    # Step 2: Check for NCT mention
    if nct_id:
        result["nct_mentioned"] = search_fulltext_for_nct(fulltext, nct_id)

    # Step 3: Rule-based extraction
    data_info = extract_data_availability(fulltext)

    result["repository_urls"] = data_info.get("urls", [])
    result["repository_names"] = data_info.get("repositories", [])

    # Step 4: LLM interpretation (only if we found data sections)
    if data_info.get("has_data_section") or data_info.get("repositories"):
        try:
            # Truncate fulltext for LLM context
            context_text = fulltext[:3000] if len(fulltext) > 3000 else fulltext

            user_prompt = (
                f"## Publication: PMID {pmid}\n\n"
                f"## Extracted Data-Availability Information\n"
                f"- Has data section: {data_info.get('has_data_section')}\n"
                f"- Detected repositories: {data_info.get('repositories', [])}\n"
                f"- Extracted URLs: {data_info.get('urls', [])}\n"
                f"- Statement snippet: {data_info.get('statement', '')}\n\n"
                f"## Full Text Excerpt\n{context_text}\n"
            )

            response = await acall_llm(
                system_prompt=BIOTECH_PROMPTS["fulltext_extractor"],
                user_prompt=user_prompt,
                json_mode=True,
            )

            response = response.strip()
            if response.startswith("```"):
                lines = response.split("\n")
                response = "\n".join(lines[1:-1])

            parsed = json.loads(response)

            result["availability_type"] = parsed.get("availability_type", "not_stated")
            result["statement_snippet"] = parsed.get("statement_snippet", "")
            result["supplementary_urls"] = parsed.get("supplementary_urls", [])
            result["notes"] = parsed.get("notes", "")

            # Merge LLM-found URLs with rule-based ones
            llm_urls = parsed.get("repository_urls", [])
            llm_repos = parsed.get("repository_names", [])
            result["repository_urls"] = list(set(result["repository_urls"] + llm_urls))
            result["repository_names"] = list(set(result["repository_names"] + llm_repos))

        except (json.JSONDecodeError, Exception) as e:
            logger.warning("Full-text extractor LLM failed for PMID %s: %s", pmid, e)
            # Use rule-based results only
            result["availability_type"] = (
                "open_access" if data_info.get("repositories") else "not_stated"
            )
            result["statement_snippet"] = data_info.get("statement", "")[:200]
    else:
        # No data section found — mark as not stated
        result["availability_type"] = "not_stated"

    return result


async def extract_batch(
    publications: List[Dict[str, Any]],
    nct_id: str = "",
    max_concurrent: int = 3,
) -> List[Dict[str, Any]]:
    """
    Extract data-availability for multiple publications concurrently.

    Args:
        publications: List of publication dicts (must have 'pmid' key).
        nct_id: NCT ID to check for in each full text.
        max_concurrent: Max concurrent extractions.

    Returns:
        List of extraction results.
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def _limited(pub: Dict[str, Any]) -> Dict[str, Any]:
        async with semaphore:
            return await extract_publication_data(
                pmid=pub.get("pmid", ""),
                doi=pub.get("doi", ""),
                nct_id=nct_id,
            )

    tasks = [_limited(pub) for pub in publications[:5]]  # cap at 5
    return await asyncio.gather(*tasks)
