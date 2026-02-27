"""
Repository search tool for finding clinical trial datasets.

Searches a small set of clinical data repositories by NCT ID or trial title:
- Zenodo (via REST API)
- Vivli (basic search)
- NIDA Data Share (basic search)

These are lightweight HTTP-based lookups with no LLM reasoning required.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import requests
from ..config import MAX_API_TIMEOUT

logger = logging.getLogger("bioagentic.tools.repositories")


def search_zenodo(
    query: str,
    max_results: int = 5,
) -> List[Dict[str, str]]:
    """
    Search Zenodo for datasets related to a clinical trial.

    Args:
        query: Search term (NCT ID, trial title, etc.).
        max_results: Maximum results to return.

    Returns:
        List of dicts with keys: title, url, doi, description, created.
    """
    try:
        params = {
            "q": query,
            "size": max_results,
            "type": "dataset",
            "sort": "bestmatch",
        }
        resp = requests.get(
            "https://zenodo.org/api/records",
            params=params,
            timeout=MAX_API_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.debug("Zenodo search returned %d for %r", resp.status_code, query)
            return []

        data = resp.json()
        hits = data.get("hits", {}).get("hits", [])

        results: List[Dict[str, str]] = []
        for hit in hits[:max_results]:
            metadata = hit.get("metadata", {})
            results.append({
                "title": metadata.get("title", "Untitled"),
                "url": hit.get("links", {}).get("html", ""),
                "doi": metadata.get("doi", ""),
                "description": (metadata.get("description", "") or "")[:300],
                "created": metadata.get("publication_date", ""),
                "source": "Zenodo",
            })
        return results

    except (requests.RequestException, ValueError) as e:
        logger.warning("Zenodo search error: %s", e)
        return []


def search_vivli(
    query: str,
    max_results: int = 5,
) -> List[Dict[str, str]]:
    """
    Search Vivli for clinical trial data sharing records.

    Uses Vivli's public search API. Note: Vivli's API may have
    limited public endpoints; this searches their catalogue.

    Args:
        query: Search term (NCT ID, trial title).
        max_results: Maximum results to return.

    Returns:
        List of dicts with keys: title, url, description, source.
    """
    try:
        # Vivli search endpoint
        params = {
            "search": query,
            "rows": max_results,
        }
        resp = requests.get(
            "https://search.vivli.org/api/search",
            params=params,
            timeout=MAX_API_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.debug("Vivli search returned %d for %r", resp.status_code, query)
            return []

        data = resp.json()
        studies = data if isinstance(data, list) else data.get("studies", [])

        results: List[Dict[str, str]] = []
        for study in studies[:max_results]:
            if not isinstance(study, dict):
                continue
            title = study.get("title") or study.get("studyTitle") or "Untitled"
            nct = study.get("nctId") or study.get("registryId") or ""
            results.append({
                "title": str(title),
                "url": f"https://vivli.org/study/{nct}" if nct else "https://vivli.org",
                "description": str(study.get("description", "") or "")[:300],
                "nct_id": str(nct),
                "source": "Vivli",
            })
        return results

    except (requests.RequestException, ValueError) as e:
        logger.debug("Vivli search error (may be expected): %s", e)
        return []


def search_repositories(
    nct_id: str = "",
    trial_title: str = "",
    max_results: int = 5,
) -> List[Dict[str, str]]:
    """
    Search multiple repositories for clinical trial datasets.

    Searches Zenodo and Vivli using the NCT ID and/or trial title.

    Args:
        nct_id: NCT ID to search for.
        trial_title: Trial title to search for.
        max_results: Max results per repository.

    Returns:
        Combined list of dataset records from all repositories.
    """
    all_results: List[Dict[str, str]] = []
    queries: list[str] = []

    if nct_id:
        queries.append(nct_id)
    if trial_title:
        # Use first 60 chars of title for search
        queries.append(trial_title[:60])

    if not queries:
        return []

    for query in queries[:2]:  # limit to 2 queries
        zenodo_hits = search_zenodo(query, max_results=max_results)
        all_results.extend(zenodo_hits)

        vivli_hits = search_vivli(query, max_results=max_results)
        all_results.extend(vivli_hits)

    # Deduplicate by URL
    seen_urls: set[str] = set()
    deduplicated: List[Dict[str, str]] = []
    for r in all_results:
        url = r.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            deduplicated.append(r)

    return deduplicated[:max_results * 2]
