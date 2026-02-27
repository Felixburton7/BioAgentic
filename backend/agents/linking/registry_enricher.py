"""
Registry Enricher — deterministic API wrapper for ClinicalTrials.gov.

No LLM reasoning; purely fetches and normalises a single trial's metadata
including any references/results_references with PMIDs.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import requests
from ...config import MAX_API_TIMEOUT

logger = logging.getLogger("bioagentic.linking.registry_enricher")

CT_STUDY_URL = "https://clinicaltrials.gov/api/v2/studies"


def _safe(val: Any, max_len: int = 300) -> str:
    if val is None:
        return ""
    return str(val).replace("\n", " ").strip()[:max_len]


def enrich_trial(nct_id: str) -> Dict[str, Any]:
    """
    Fetch and normalise a single trial record from ClinicalTrials.gov v2.

    Returns a compact dict with:
        nct_id, brief_title, official_title, conditions, interventions,
        sponsor, pi_name, start_date, completion_date, status, phases,
        enrollment, registry_pmids (PMIDs from results-references).
    """
    try:
        resp = requests.get(
            f"{CT_STUDY_URL}/{nct_id}",
            timeout=MAX_API_TIMEOUT,
        )
        if resp.status_code == 404:
            logger.warning("Trial %s not found on ClinicalTrials.gov", nct_id)
            return {"nct_id": nct_id, "error": "not_found"}
        resp.raise_for_status()
        study = resp.json()
    except requests.RequestException as e:
        logger.error("ClinicalTrials.gov error for %s: %s", nct_id, e)
        return {"nct_id": nct_id, "error": str(e)}

    proto = study.get("protocolSection", {}) or {}

    # Identification
    ident = proto.get("identificationModule", {}) or {}
    brief_title = _safe(ident.get("briefTitle"))
    official_title = _safe(ident.get("officialTitle"))

    # Status
    status_mod = proto.get("statusModule", {}) or {}
    overall_status = _safe(status_mod.get("overallStatus"))
    start_date_struct = status_mod.get("startDateStruct", {}) or {}
    start_date = _safe(start_date_struct.get("date"))
    completion_struct = status_mod.get("completionDateStruct", {}) or {}
    completion_date = _safe(completion_struct.get("date"))

    # Design
    design = proto.get("designModule", {}) or {}
    phases = design.get("phases", [])
    enrollment_info = design.get("enrollmentInfo", {})
    enrollment = enrollment_info.get("count", "") if isinstance(enrollment_info, dict) else ""

    # Sponsor / PI
    sponsor_mod = proto.get("sponsorCollaboratorsModule", {}) or {}
    lead_sponsor = sponsor_mod.get("leadSponsor", {}) or {}
    sponsor_name = _safe(lead_sponsor.get("name"))

    contacts_mod = proto.get("contactsLocationsModule", {}) or {}
    overall_officials = contacts_mod.get("overallOfficials", []) or []
    pi_name = ""
    if overall_officials:
        pi = overall_officials[0]
        pi_name = _safe(pi.get("name"))

    # Conditions
    conditions_mod = proto.get("conditionsModule", {}) or {}
    conditions = conditions_mod.get("conditions", []) or []

    # Interventions
    arms_mod = proto.get("armsInterventionsModule", {}) or {}
    interventions_raw = arms_mod.get("interventions", []) or []
    interventions: List[str] = []
    for intr in interventions_raw:
        if isinstance(intr, dict):
            name = _safe(intr.get("name"))
            if name:
                interventions.append(name)

    # References — extract PMIDs from results references
    refs_mod = proto.get("referencesModule", {}) or {}
    references = refs_mod.get("references", []) or []
    registry_pmids: List[Dict[str, str]] = []
    for ref in references:
        if not isinstance(ref, dict):
            continue
        ref_type = _safe(ref.get("type"), max_len=40).upper()
        is_result = "RESULT" in ref_type or bool(ref.get("isResultsReference"))
        pmid = _safe(ref.get("pmid"), max_len=32)
        citation = _safe(ref.get("citation"), max_len=500)
        if pmid or citation:
            registry_pmids.append({
                "pmid": pmid,
                "citation": citation,
                "is_result": is_result,
                "type": _safe(ref.get("type"), max_len=40),
            })

    return {
        "nct_id": nct_id,
        "brief_title": brief_title,
        "official_title": official_title,
        "conditions": conditions[:5],
        "interventions": interventions[:5],
        "sponsor": sponsor_name,
        "pi_name": pi_name,
        "start_date": start_date,
        "completion_date": completion_date,
        "status": overall_status,
        "phases": phases,
        "enrollment": str(enrollment),
        "registry_pmids": registry_pmids,
        "trial_url": f"https://clinicaltrials.gov/study/{nct_id}",
    }
