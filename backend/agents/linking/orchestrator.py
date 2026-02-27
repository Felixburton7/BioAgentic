"""
Linking Orchestrator — coordinates the full trial → publication linking pipeline.

Receives a target, fetches trials, then for each NCT ID:
1. Registry Enricher (deterministic API)
2. In parallel: PubMed Linker + Repository search
3. Full-Text Extractor on found publications
4. Link Validator to aggregate and score

Designed to be called from the SSE-streaming server endpoint.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List

from ...tools.clinical_trials import fetch_trials
from ...tools.repositories import search_repositories
from .registry_enricher import enrich_trial
from .pubmed_linker import link_trial_to_publications
from .fulltext_extractor import extract_batch
from .link_validator import validate_links, format_linking_markdown

logger = logging.getLogger("bioagentic.linking.orchestrator")


async def run_linking_pipeline(
    target: str,
    nct_ids: list[str] | None = None,
    max_trials: int = 10,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Run the full trial → publication linking pipeline, yielding status events.

    Yields dicts with keys:
        event: "status" | "agent" | "result" | "error" | "done"
        agent: agent name (for "agent" events)
        content: text content
        data: structured data (for "result" events)

    Args:
        target: Research target / condition (used only as fallback).
        nct_ids: Pre-identified NCT IDs from the initial research pipeline.
                 When provided, skips the ClinicalTrials.gov search step.
        max_trials: Maximum number of trials to process.
    """
    # ── Step 1: Determine NCT IDs ─────────────────────────────────────────
    if nct_ids:
        # Use NCT IDs already found during initial research
        nct_ids = [nct for nct in nct_ids if nct][:max_trials]
        yield {
            "event": "status",
            "agent": "Linking Orchestrator",
            "content": f"Using {len(nct_ids)} trials from research results…",
        }
        yield {
            "event": "agent",
            "agent": "Linking Orchestrator",
            "content": f"Starting deep linking analysis for {len(nct_ids)} trials: {', '.join(nct_ids[:5])}{'…' if len(nct_ids) > 5 else ''}",
        }
    else:
        # Fallback: search ClinicalTrials.gov by target
        yield {
            "event": "status",
            "agent": "Linking Orchestrator",
            "content": f"Searching ClinicalTrials.gov for '{target}'…",
        }

        try:
            raw_summary, trial_list = await asyncio.to_thread(
                fetch_trials, target, max_results=max_trials, include_publications=True,
            )
        except Exception as e:
            yield {"event": "error", "detail": f"Failed to fetch trials: {e}"}
            return

        if not trial_list:
            yield {
                "event": "agent",
                "agent": "Linking Orchestrator",
                "content": f"No clinical trials found for '{target}'.",
            }
            yield {"event": "done"}
            return

        nct_ids = [t.get("nct_id", "") for t in trial_list if t.get("nct_id")][:max_trials]

        yield {
            "event": "agent",
            "agent": "Linking Orchestrator",
            "content": f"Found {len(nct_ids)} trials. Beginning deep linking analysis…",
        }

    # ── Step 2: Registry Enrichment (per-trial) ───────────────────────────
    yield {
        "event": "status",
        "agent": "Registry Enricher",
        "content": f"Enriching {len(nct_ids)} trial records from ClinicalTrials.gov…",
    }

    enrichment_tasks = [asyncio.to_thread(enrich_trial, nct) for nct in nct_ids]
    enriched_records = await asyncio.gather(*enrichment_tasks)

    # Filter out errored records
    valid_records = [r for r in enriched_records if not r.get("error")]

    yield {
        "event": "agent",
        "agent": "Registry Enricher",
        "content": (
            f"Enriched {len(valid_records)}/{len(nct_ids)} trial records. "
            f"Extracted metadata including titles, conditions, PIs, dates, "
            f"and {sum(len(r.get('registry_pmids', [])) for r in valid_records)} "
            f"registry-linked references."
        ),
    }

    # ── Step 3: PubMed Linking + Repository Search (parallel per-trial) ──
    yield {
        "event": "status",
        "agent": "PubMed Linker",
        "content": "Searching PubMed for linked publications…",
    }

    trial_records: List[Dict[str, Any]] = []

    for registry in valid_records:
        nct_id = registry.get("nct_id", "")

        # Run PubMed linking and repository search in parallel
        pubmed_task = link_trial_to_publications(registry)
        repo_task = asyncio.to_thread(
            search_repositories,
            nct_id=nct_id,
            trial_title=registry.get("brief_title", ""),
        )

        pubmed_candidates, repo_hits = await asyncio.gather(pubmed_task, repo_task)

        trial_records.append({
            "nct_id": nct_id,
            "registry": registry,
            "pubmed_candidates": pubmed_candidates,
            "repository_hits": repo_hits,
            "fulltext_data": [],
        })

    total_pubs = sum(len(r.get("pubmed_candidates", [])) for r in trial_records)
    total_repos = sum(len(r.get("repository_hits", [])) for r in trial_records)

    yield {
        "event": "agent",
        "agent": "PubMed Linker",
        "content": (
            f"Found {total_pubs} candidate publications across {len(trial_records)} trials. "
            f"Repository search found {total_repos} dataset records."
        ),
    }

    # ── Step 4: Full-Text Extraction (on top candidates) ─────────────────
    if total_pubs > 0:
        yield {
            "event": "status",
            "agent": "Full-Text Extractor",
            "content": "Fetching full texts and extracting data availability…",
        }

        for rec in trial_records:
            candidates = rec.get("pubmed_candidates", [])
            if candidates:
                fulltext_results = await extract_batch(
                    publications=candidates[:3],  # top 3 per trial
                    nct_id=rec.get("nct_id", ""),
                )
                rec["fulltext_data"] = fulltext_results

        nct_mentions = sum(
            1 for r in trial_records
            for ft in r.get("fulltext_data", [])
            if ft.get("nct_mentioned")
        )
        data_sections = sum(
            1 for r in trial_records
            for ft in r.get("fulltext_data", [])
            if ft.get("fulltext_available")
        )

        yield {
            "event": "agent",
            "agent": "Full-Text Extractor",
            "content": (
                f"Analysed {data_sections} publication full texts. "
                f"Found {nct_mentions} publications mentioning trial NCT IDs in text."
            ),
        }

    # ── Step 5: Link Validation & Aggregation ────────────────────────────
    yield {
        "event": "status",
        "agent": "Link Validator",
        "content": "Validating and aggregating trial–publication links…",
    }

    validated = await validate_links(trial_records)

    # Format to markdown
    final_markdown = format_linking_markdown(validated)

    yield {
        "event": "agent",
        "agent": "Link Validator",
        "content": (
            f"Validation complete. "
            f"{validated.get('summary', 'Results aggregated.')}"
        ),
    }

    # ── Final Result ─────────────────────────────────────────────────────
    yield {
        "event": "result",
        "content": final_markdown,
        "data": validated,
    }

    yield {"event": "done"}
