"""
ClinicalTrials.gov API v2 integration.
Adapted from backend/main.py's fetch_trials() with improved error handling
and structured field extraction.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import requests
from ..config import MAX_API_TIMEOUT


def _safe_text(value: Any, max_len: int = 220) -> str:
    """Convert values to a single-line string with a stable max length."""
    if value is None:
        return ""
    text = str(value).replace("\n", " ").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


def _escape_md_table(value: str, max_len: int = 220) -> str:
    """Escape markdown table delimiters so generated rows stay well-formed."""
    return (
        _safe_text(value, max_len=max_len)
        .replace("|", "\\|")
        .replace("[", "\\[")
        .replace("]", "\\]")
    )


def _is_results_reference(reference: Dict[str, Any]) -> bool:
    """Return True only for references explicitly marked as results-linked."""
    ref_type = _safe_text(reference.get("type"), max_len=40).upper()
    if "RESULT" in ref_type:
        return True
    return bool(reference.get("isResultsReference"))


def _extract_results_publications(study: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Extract publications explicitly linked to a trial's results from ClinicalTrials.gov.

    We only accept references marked as results-linked so that downstream mapping is
    trial-specific and avoids unrelated literature.
    """
    proto = study.get("protocolSection", {}) or {}
    references_module = proto.get("referencesModule", {}) or {}
    references = references_module.get("references", []) or []

    publications: List[Dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for reference in references:
        if not isinstance(reference, dict) or not _is_results_reference(reference):
            continue

        pmid = _safe_text(reference.get("pmid"), max_len=32)
        citation = _safe_text(reference.get("citation"), max_len=600)
        if not pmid and not citation:
            continue

        dedupe_key = (pmid, citation.lower())
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        pubmed_url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid.isdigit() else ""
        publications.append(
            {
                "pmid": pmid or "N/A",
                "citation": citation or "No citation text provided.",
                "url": pubmed_url,
                "reference_type": _safe_text(reference.get("type"), max_len=40) or "RESULT",
            }
        )

    return publications


def fetch_trials(
    target: str,
    max_results: int = 10,
    intervention: str | None = None,
    include_publications: bool = False,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Search ClinicalTrials.gov for studies matching a target/condition.
    
    Args:
        target: Search term for the condition field.
        max_results: Maximum number of studies to return.
        intervention: Optional intervention/drug search term.
        include_publications: Whether to fetch and map results publications (slower).

    Returns:
        Tuple:
          1) Formatted markdown string summary.
          2) Structured list of trial/publication mappings.
    """
    try:
        params: dict = {
            "query.cond": target,
            "pageSize": max_results,
        }
        if intervention:
            params["query.intr"] = intervention
            
        resp = requests.get(
            "https://clinicaltrials.gov/api/v2/studies",
            params=params,
            timeout=MAX_API_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        studies = data.get("studies", [])

        if not studies:
            return (
                f"**No clinical trials found for '{target}'.** Try a broader search term.",
                [],
            )

        total = data.get("totalCount", len(studies))
        summary = f"**{total} total trials found for '{target}'** (showing top {len(studies)}):\n\n"
        trial_publication_links: List[Dict[str, Any]] = []

        for study in studies:
            proto = study.get("protocolSection", {})
            ident = proto.get("identificationModule", {})
            status_mod = proto.get("statusModule", {})
            design = proto.get("designModule", {})
            sponsor_mod = proto.get("sponsorCollaboratorsModule", {})

            nct_id = _safe_text(ident.get("nctId"), max_len=20) or "N/A"
            title = _safe_text(ident.get("briefTitle"), max_len=120) or "Untitled"
            status = _safe_text(status_mod.get("overallStatus"), max_len=60) or "Unknown"
            phases_list = design.get("phases", [])
            if isinstance(phases_list, list) and phases_list:
                phases = ", ".join(_safe_text(phase, max_len=30) for phase in phases_list)
            else:
                phases = "N/A"
            trial_url = f"https://clinicaltrials.gov/study/{nct_id}" if nct_id != "N/A" else ""

            # Enrollment
            enrollment_info = design.get("enrollmentInfo", {})
            enrollment = enrollment_info.get("count", "N/A") if isinstance(enrollment_info, dict) else "N/A"

            # Sponsor
            lead_sponsor = sponsor_mod.get("leadSponsor", {})
            sponsor_name = _safe_text(lead_sponsor.get("name"), max_len=120) or "Unknown"

            # Conditions
            conditions_mod = proto.get("conditionsModule", {})
            raw_conditions = conditions_mod.get("conditions", [])
            conditions = (
                ", ".join(_safe_text(condition, max_len=60) for condition in raw_conditions[:3])
                if isinstance(raw_conditions, list)
                else ""
            )
            if not conditions:
                conditions = "N/A"

            # Only fetch publications if requested
            result_publications = []
            if include_publications:
                result_publications = _extract_results_publications(study)
            
            trial_publication_links.append(
                {
                    "nct_id": nct_id,
                    "title": title,
                    "trial_url": trial_url,
                    "status": status,
                    "phase": phases,
                    "results_publications": result_publications,
                }
            )

            summary += (
                f"- **{title}** (`{nct_id}`)\n"
                f"  Status: {status} | Phase: {phases} | N={enrollment}\n"
                f"  Sponsor: {sponsor_name}\n"
                f"  Conditions: {conditions}\n"
            )

            if include_publications:
                if result_publications:
                    summary += "  Results publications (verified trial-linked references):\n"
                    for publication in result_publications:
                        pmid = publication.get("pmid", "N/A")
                        citation = _safe_text(publication.get("citation", ""), max_len=180)
                        summary += f"  - PMID {pmid}: {citation}\n"
                else:
                    summary += "  Results publications: None listed on ClinicalTrials.gov\n"

            summary += "\n"

        if include_publications:
            summary += "### Trial-to-Publication Mapping (ClinicalTrials.gov Results References)\n\n"
            summary += "| NCT ID | Clinical Trial | Published Paper | PMID |\n"
            summary += "|---|---|---|---|\n"

            for trial in trial_publication_links:
                nct_id = _safe_text(trial.get("nct_id", "N/A"), max_len=20) or "N/A"
                title_cell = _escape_md_table(str(trial.get("title", "Untitled")), max_len=120) or "Untitled"
                trial_url = _safe_text(trial.get("trial_url", ""), max_len=200)
                trial_cell = f"[{nct_id}]({trial_url})" if trial_url else nct_id

                publications = trial.get("results_publications", []) or []
                if publications:
                    for publication in publications:
                        citation = _escape_md_table(
                            str(publication.get("citation", "Publication record")),
                            max_len=190,
                        ) or "Publication record"
                        pmid = _escape_md_table(str(publication.get("pmid", "N/A")), max_len=32) or "N/A"
                        pubmed_url = _safe_text(publication.get("url", ""), max_len=200)
                        paper_cell = f"[{citation}]({pubmed_url})" if pubmed_url else citation
                        summary += f"| {trial_cell} | {title_cell} | {paper_cell} | {pmid} |\n"
                else:
                    summary += (
                        f"| {trial_cell} | {title_cell} | "
                        "No results-linked publication listed on ClinicalTrials.gov | N/A |\n"
                    )
            summary += "\n"
            
        return summary, trial_publication_links

    except requests.Timeout:
        return (
            f"**ClinicalTrials.gov timeout** for '{target}'. Service may be slow — try again.",
            [],
        )
    except requests.RequestException as e:
        return (f"**ClinicalTrials.gov API error**: {e}", [])
    except (KeyError, TypeError) as e:
        return (
            f"**Error parsing trial data**: {e}. Raw response may have unexpected format.",
            [],
        )


def find_trial_papers(
    target: str,
    max_results: int = 15,
) -> str:
    """
    Specifically search for papers linked to clinical trials.
    
    Args:
        target: The condition/target to search trials for.
        max_results: Max trials to check.
        
    Returns:
        Formatted markdown containing ONLY the trial-to-publication mapping table.
    """
    # Reuse fetch_trials with include_publications=True
    # We ignore the main summary and just extract the table part manually or via a helper
    _, trials_data = fetch_trials(target, max_results=max_results, include_publications=True)
    
    if not trials_data:
        return f"No clinical trials found for '{target}' to check for papers."
        
    # Build just the table part
    has_any_papers = any(t.get("results_publications") for t in trials_data)
    
    output = f"### Clinical Trial Papers for '{target}'\n\n"
    
    if not has_any_papers:
        output += "No results-linked publications were found on ClinicalTrials.gov for the top trials matching your query.\n"
        return output
        
    output += "| NCT ID | Clinical Trial | Published Paper | PMID |\n"
    output += "|---|---|---|---|\n"

    for trial in trials_data:
        publications = trial.get("results_publications", [])
        if not publications:
            continue
            
        nct_id = _safe_text(trial.get("nct_id", "N/A"), max_len=20) or "N/A"
        title_cell = _escape_md_table(str(trial.get("title", "Untitled")), max_len=120) or "Untitled"
        trial_url = _safe_text(trial.get("trial_url", ""), max_len=200)
        trial_cell = f"[{nct_id}]({trial_url})" if trial_url else nct_id

        for publication in publications:
            citation = _escape_md_table(
                str(publication.get("citation", "Publication record")),
                max_len=190,
            ) or "Publication record"
            pmid = _escape_md_table(str(publication.get("pmid", "N/A")), max_len=32) or "N/A"
            pubmed_url = _safe_text(publication.get("url", ""), max_len=200)
            paper_cell = f"[{citation}]({pubmed_url})" if pubmed_url else citation
            output += f"| {trial_cell} | {title_cell} | {paper_cell} | {pmid} |\n"

    return output
