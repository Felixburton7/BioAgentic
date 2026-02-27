"""
Europe PMC integration for full-text fetching and data-availability extraction.

Provides:
- fetch_fulltext(): retrieve open-access full text for a PMID or DOI.
- extract_data_availability(): parse text for data-availability sections and
  repository URLs (Dryad, Figshare, Zenodo, Vivli, etc.).
"""

from __future__ import annotations

import re
import logging
from typing import Any, Dict, List, Optional

import requests
from ..config import MAX_API_TIMEOUT

logger = logging.getLogger("bioagentic.tools.europe_pmc")

EPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest"

# Repository patterns to detect in text
REPOSITORY_PATTERNS: list[tuple[str, str]] = [
    (r"dryad", "Dryad"),
    (r"figshare", "Figshare"),
    (r"zenodo", "Zenodo"),
    (r"vivli", "Vivli"),
    (r"clinicalstudydatarequest", "ClinicalStudyDataRequest"),
    (r"immport", "ImmPort"),
    (r"dbgap", "dbGaP"),
    (r"github\.com", "GitHub"),
    (r"gitlab\.com", "GitLab"),
    (r"synapse\.org", "Synapse"),
    (r"dataverse", "Dataverse"),
    (r"osf\.io", "OSF"),
    (r"datashare\.nida", "NIDA Data Share"),
    (r"accessclinicaldata", "AccessClinicalData@NIAID"),
    (r"ncbi\.nlm\.nih\.gov/geo", "GEO"),
    (r"ncbi\.nlm\.nih\.gov/sra", "SRA"),
    (r"ebi\.ac\.uk/arrayexpress", "ArrayExpress"),
]

# Section heading patterns for data availability
DATA_SECTION_PATTERNS: list[str] = [
    r"data\s*availab",
    r"data\s*sharing",
    r"data\s*access",
    r"supplementary\s*material",
    r"supplementary\s*data",
    r"code\s*availab",
    r"data\s*and\s*code",
    r"accession\s*number",
]

# URL extraction regex
URL_REGEX = re.compile(
    r"https?://[^\s<>\"\')}\]]+",
    re.IGNORECASE,
)


def fetch_fulltext(
    pmid: str | None = None,
    doi: str | None = None,
) -> Optional[str]:
    """
    Fetch open-access full text from Europe PMC.

    Tries PMC full-text XML first, falls back to abstract if full text
    is not open access.

    Args:
        pmid: PubMed ID.
        doi: DOI of the article.

    Returns:
        Full text as plain text, or None if unavailable.
    """
    if not pmid and not doi:
        return None

    # Try fetching full text XML via Europe PMC
    try:
        # First, search for the article to get PMCID
        identifier = f"EXT_ID:{pmid}" if pmid else f"DOI:{doi}"
        search_url = f"{EPMC_BASE}/search"
        search_params = {
            "query": identifier,
            "format": "json",
            "resultType": "core",
            "pageSize": 1,
        }
        resp = requests.get(search_url, params=search_params, timeout=MAX_API_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        results = data.get("resultList", {}).get("result", [])
        if not results:
            logger.debug("No Europe PMC result for %s", identifier)
            return None

        article = results[0]
        pmcid = article.get("pmcid")

        if not pmcid:
            # No full text available — return abstract as fallback
            abstract = article.get("abstractText", "")
            return abstract if abstract else None

        # Fetch full text
        ft_url = f"{EPMC_BASE}/{pmcid}/fullTextXML"
        ft_resp = requests.get(ft_url, timeout=MAX_API_TIMEOUT + 5)
        if ft_resp.status_code == 200:
            # Strip XML tags for plain text
            text = re.sub(r"<[^>]+>", " ", ft_resp.text)
            text = re.sub(r"\s+", " ", text).strip()
            return text

        # Fallback to abstract
        abstract = article.get("abstractText", "")
        return abstract if abstract else None

    except requests.Timeout:
        logger.warning("Europe PMC timeout for pmid=%s, doi=%s", pmid, doi)
        return None
    except requests.RequestException as e:
        logger.warning("Europe PMC error: %s", e)
        return None


def extract_data_availability(
    fulltext: str,
) -> Dict[str, Any]:
    """
    Parse full text for data-availability information.

    Scans for sections labelled "Data availability", "Data sharing",
    "Supplementary materials", etc., and extracts:
    - URLs found in those sections
    - Repository mentions (Dryad, Figshare, Zenodo, etc.)
    - A snippet of the data availability statement

    Args:
        fulltext: The article full text (plain text, XML tags stripped).

    Returns:
        Dict with keys:
        - urls: list of extracted URLs
        - repositories: list of detected repository names
        - statement: short snippet of the data-availability text
        - has_data_section: whether a data-availability section was found
    """
    if not fulltext:
        return {
            "urls": [],
            "repositories": [],
            "statement": "",
            "has_data_section": False,
        }

    text_lower = fulltext.lower()

    # Find data availability section(s)
    data_sections: list[str] = []
    for pattern in DATA_SECTION_PATTERNS:
        for match in re.finditer(pattern, text_lower):
            start = max(0, match.start() - 50)
            end = min(len(fulltext), match.end() + 1000)
            data_sections.append(fulltext[start:end])

    has_data_section = len(data_sections) > 0
    search_text = " ".join(data_sections) if data_sections else fulltext

    # Extract URLs
    urls = list(set(URL_REGEX.findall(search_text)))
    # Filter out common non-data URLs
    urls = [
        u for u in urls
        if not any(skip in u.lower() for skip in [
            "creativecommons.org",
            "doi.org/10.1",  # DOI links (not data repos)
            "crossref.org",
            "orcid.org",
        ])
    ]

    # Detect repositories
    repositories: list[str] = []
    for pattern, name in REPOSITORY_PATTERNS:
        if re.search(pattern, search_text, re.IGNORECASE):
            if name not in repositories:
                repositories.append(name)

    # Build statement snippet
    statement = ""
    if data_sections:
        # Take first section, truncate to 500 chars
        raw = data_sections[0].strip()
        statement = raw[:500] + ("..." if len(raw) > 500 else "")

    return {
        "urls": urls[:20],  # cap at 20 URLs
        "repositories": repositories,
        "statement": statement,
        "has_data_section": has_data_section,
    }


def search_fulltext_for_nct(
    fulltext: str,
    nct_id: str,
) -> bool:
    """
    Check whether the full text mentions a specific NCT ID.

    Args:
        fulltext: Article full text.
        nct_id: NCT ID to search for (e.g. "NCT01234567").

    Returns:
        True if the NCT ID appears in the text.
    """
    if not fulltext or not nct_id:
        return False
    return nct_id.upper() in fulltext.upper()
