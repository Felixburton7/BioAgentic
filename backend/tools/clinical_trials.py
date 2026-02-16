"""
ClinicalTrials.gov API v2 integration.
Adapted from backend/main.py's fetch_trials() with improved error handling
and structured field extraction.
"""

import requests
from ..config import MAX_API_TIMEOUT


def fetch_trials(
    target: str,
    max_results: int = 10,
    intervention: str | None = None,
) -> tuple[str, list[dict]]:
    """
    Search ClinicalTrials.gov for studies matching a target/condition.

    Uses the REST API v2 endpoint:
    https://clinicaltrials.gov/data-api/api

    Args:
        target: Search term for the condition field (e.g. "KRAS G12C", "lung cancer").
        max_results: Maximum number of studies to return.
        intervention: Optional intervention/drug search term for the intervention field.

    Returns:
        Tuple of (formatted markdown string, list of citation dicts).
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
            return f"**No clinical trials found for '{target}'.** Try a broader search term.", []

        total = data.get("totalCount", len(studies))
        summary = f"**{total} total trials found for '{target}'** (showing top {len(studies)}):\n\n"
        citations: list[dict] = []

        for idx, study in enumerate(studies):
            proto = study.get("protocolSection", {})
            ident = proto.get("identificationModule", {})
            status_mod = proto.get("statusModule", {})
            design = proto.get("designModule", {})
            sponsor_mod = proto.get("sponsorCollaboratorsModule", {})

            nct_id = ident.get("nctId", "N/A")
            title = ident.get("briefTitle", "Untitled")[:120]
            status = status_mod.get("overallStatus", "Unknown")
            phases = ", ".join(design.get("phases", ["N/A"]))

            # Enrollment (may be nested)
            enrollment_info = design.get("enrollmentInfo", {})
            enrollment = enrollment_info.get("count", "N/A") if isinstance(enrollment_info, dict) else "N/A"

            # Sponsor
            lead_sponsor = sponsor_mod.get("leadSponsor", {})
            sponsor_name = lead_sponsor.get("name", "Unknown")

            # Conditions
            conditions_mod = proto.get("conditionsModule", {})
            conditions = ", ".join(conditions_mod.get("conditions", [])[:3])

            summary += (
                f"- **{title}** (`{nct_id}`)\n"
                f"  Status: {status} | Phase: {phases} | N={enrollment}\n"
                f"  Sponsor: {sponsor_name}\n"
                f"  Conditions: {conditions}\n\n"
            )

            # Build structured citation
            url = f"https://clinicaltrials.gov/study/{nct_id}"
            citations.append({
                "id": f"ct-{idx + 1}",
                "type": "clinical_trial",
                "title": title,
                "authors": sponsor_name,
                "year": "",
                "journal": "",
                "url": url,
                "pmid": "",
                "doi": "",
                "nct_id": nct_id,
                "source_agent": "Trials Scout",
            })

        return summary, citations

    except requests.Timeout:
        return f"**ClinicalTrials.gov timeout** for '{target}'. Service may be slow — try again.", []
    except requests.RequestException as e:
        return f"**ClinicalTrials.gov API error**: {e}", []
    except (KeyError, TypeError) as e:
        return f"**Error parsing trial data**: {e}. Raw response may have unexpected format.", []
