"""
Link Validator & Aggregator — reasoning agent that consolidates all linking
results into a final per-trial record with confidence tiers.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from ...config import acall_llm, REASONING_MODEL
from ...prompts import BIOTECH_PROMPTS

logger = logging.getLogger("bioagentic.linking.link_validator")


def _build_validation_context(trial_record: Dict[str, Any]) -> str:
    """Build a JSON context string from the trial record for the LLM."""
    compact = {
        "nct_id": trial_record.get("nct_id", ""),
        "registry": trial_record.get("registry", {}),
        "pubmed_candidates": trial_record.get("pubmed_candidates", []),
        "fulltext_data": trial_record.get("fulltext_data", []),
        "repository_hits": trial_record.get("repository_hits", []),
    }
    return json.dumps(compact, indent=2, default=str)


async def validate_links(
    trial_records: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Validate and aggregate linking results across all trials.

    Uses the LLM to:
    1. Deduplicate publications across sources
    2. Assign confidence tiers (high/medium/low)
    3. Associate datasets with trials/publications
    4. Generate a final summary

    Args:
        trial_records: List of per-NCT trial records with linking data.

    Returns:
        Validated linking results with confidence scores and markdown.
    """
    if not trial_records:
        return {"trial_links": [], "summary": "No trials to validate."}

    # Build context for LLM
    context_parts: list[str] = []
    for rec in trial_records:
        context_parts.append(_build_validation_context(rec))

    full_context = "\n\n---\n\n".join(context_parts)

    user_prompt = (
        f"## Trial Linking Data ({len(trial_records)} trials)\n\n"
        f"{full_context}\n\n"
        f"Validate, deduplicate, assign confidence tiers, and produce the final JSON."
    )

    try:
        response = await acall_llm(
            system_prompt=BIOTECH_PROMPTS["link_validator"],
            user_prompt=user_prompt,
            model=REASONING_MODEL,
            json_mode=True,
        )

        response = response.strip()
        if response.startswith("```"):
            lines = response.split("\n")
            response = "\n".join(lines[1:-1])

        validated = json.loads(response)

        # Ensure expected structure
        if "trial_links" not in validated:
            validated = {"trial_links": [], "summary": str(validated)}

        return validated

    except (json.JSONDecodeError, Exception) as e:
        logger.warning("Link validator LLM failed: %s", e)
        # Fallback: build basic results from raw data
        return _fallback_validation(trial_records)


def _fallback_validation(
    trial_records: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build basic validated results without LLM when parsing fails."""
    trial_links: list[dict] = []

    for rec in trial_records:
        nct_id = rec.get("nct_id", "")
        registry = rec.get("registry", {})
        candidates = rec.get("pubmed_candidates", [])
        fulltext = rec.get("fulltext_data", [])
        repo_hits = rec.get("repository_hits", [])

        publications: list[dict] = []
        for c in candidates[:3]:
            confidence = c.get("confidence", 30)
            tier = "high" if confidence >= 70 else ("medium" if confidence >= 50 else "low")
            publications.append({
                "pmid": c.get("pmid", ""),
                "title": c.get("title", ""),
                "authors": c.get("authors", ""),
                "year": c.get("year", ""),
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{c.get('pmid', '')}/",
                "confidence_tier": tier,
                "confidence_score": confidence,
                "match_reason": c.get("match_reason", "PubMed search match"),
            })

        # Check fulltext for NCT mentions — upgrade confidence
        for pub in publications:
            for ft in fulltext:
                if ft.get("pmid") == pub.get("pmid") and ft.get("nct_mentioned"):
                    pub["confidence_tier"] = "high"
                    pub["confidence_score"] = max(pub.get("confidence_score", 0), 80)
                    pub["match_reason"] += " (NCT ID confirmed in full text)"

        datasets: list[dict] = []
        for hit in repo_hits:
            datasets.append({
                "source": hit.get("source", "Unknown"),
                "url": hit.get("url", ""),
                "title": hit.get("title", ""),
                "availability_type": "unknown",
            })

        # Summarise data availability
        avail_types = [ft.get("availability_type", "not_stated") for ft in fulltext]
        data_avail = "No data availability information found"
        if "open_access" in avail_types:
            data_avail = "Open-access data available"
        elif "on_request" in avail_types:
            data_avail = "Data available on request"
        elif "restricted" in avail_types:
            data_avail = "Restricted access data"

        trial_links.append({
            "nct_id": nct_id,
            "trial_title": registry.get("brief_title", ""),
            "trial_url": registry.get("trial_url", f"https://clinicaltrials.gov/study/{nct_id}"),
            "publications": publications,
            "datasets": datasets,
            "data_availability": data_avail,
        })

    total_pubs = sum(len(t.get("publications", [])) for t in trial_links)
    return {
        "trial_links": trial_links,
        "summary": f"Found {total_pubs} publications across {len(trial_links)} trials.",
    }


def format_linking_markdown(validated: Dict[str, Any]) -> str:
    """
    Convert validated linking results into a formatted markdown report.

    Args:
        validated: Output from validate_links().

    Returns:
        Markdown string with tables for trial-publication mappings.
    """
    trial_links = validated.get("trial_links", [])
    summary = validated.get("summary", "")

    if not trial_links:
        return "### Clinical Trial Publication Links\n\nNo trial-publication links were found.\n"

    md = "### Clinical Trial Publication Links\n\n"
    md += f"{summary}\n\n"

    # Summary stats
    total_pubs = sum(len(t.get("publications", [])) for t in trial_links)
    total_datasets = sum(len(t.get("datasets", [])) for t in trial_links)
    high_conf = sum(
        1 for t in trial_links
        for p in t.get("publications", [])
        if p.get("confidence_tier") == "high"
    )

    md += f"**{len(trial_links)} trials analysed** · "
    md += f"**{total_pubs} publications found** · "
    md += f"**{high_conf} high-confidence matches** · "
    md += f"**{total_datasets} datasets identified**\n\n"

    # Publication table
    md += "| NCT ID | Clinical Trial | Publication | Confidence | Data |\n"
    md += "|--------|---------------|-------------|------------|------|\n"

    for trial in trial_links:
        nct_id = trial.get("nct_id", "N/A")
        title = trial.get("trial_title", "Untitled")
        trial_url = trial.get("trial_url", "")
        nct_cell = f"[{nct_id}]({trial_url})" if trial_url else nct_id

        pubs = trial.get("publications", [])
        data_avail = trial.get("data_availability", "")

        if pubs:
            for pub in pubs:
                pub_title = pub.get("title", "")[:80]
                pmid = pub.get("pmid", "")
                pub_url = pub.get("url", "")
                if pub_url and pub_title:
                    pub_cell = f"[{pub_title}]({pub_url})"
                elif pmid:
                    pub_cell = f"PMID: {pmid}"
                else:
                    pub_cell = pub_title or "Unknown"

                tier = pub.get("confidence_tier", "low")
                score = pub.get("confidence_score", 0)
                conf_emoji = "🟢" if tier == "high" else ("🟡" if tier == "medium" else "🔴")
                conf_cell = f"{conf_emoji} {tier.capitalize()} ({score}%)"

                md += f"| {nct_cell} | {title[:60]} | {pub_cell} | {conf_cell} | {data_avail} |\n"
        else:
            md += f"| {nct_cell} | {title[:60]} | No publications found | — | {data_avail} |\n"

    # Dataset section
    all_datasets = [
        (t.get("nct_id", ""), d)
        for t in trial_links
        for d in t.get("datasets", [])
    ]
    if all_datasets:
        md += "\n### Associated Datasets\n\n"
        md += "| NCT ID | Dataset | Source | Access |\n"
        md += "|--------|---------|--------|--------|\n"
        for nct, ds in all_datasets:
            ds_title = ds.get("title", "Dataset")[:80]
            ds_url = ds.get("url", "")
            ds_cell = f"[{ds_title}]({ds_url})" if ds_url else ds_title
            md += f"| {nct} | {ds_cell} | {ds.get('source', '')} | {ds.get('availability_type', '')} |\n"

    return md
