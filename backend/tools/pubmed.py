"""
PubMed E-utilities integration.
Two-step search: esearch (find PMIDs) → efetch (get abstracts).
Replaces the mock fetch_papers() from backend/main.py.
"""

import requests
import xml.etree.ElementTree as ET
from ..config import MAX_API_TIMEOUT, NCBI_API_KEY

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


def fetch_papers(target: str, max_results: int = 8) -> tuple[str, list[dict]]:
    """
    Search PubMed for recent papers matching a biotech target.

    Step 1: esearch to get PMIDs
    Step 2: efetch to retrieve abstracts in XML

    Args:
        target: Search term (e.g. "KRAS G12C inhibitor resistance").
        max_results: Number of papers to retrieve.

    Returns:
        Tuple of (formatted markdown string, list of citation dicts).
    """
    try:
        # --- Step 1: Search for PMIDs ---
        search_params = {
            "db": "pubmed",
            "term": target,
            "retmax": max_results,
            "retmode": "json",
            "sort": "relevance",
        }
        if NCBI_API_KEY:
            search_params["api_key"] = NCBI_API_KEY

        search_resp = requests.get(
            f"{EUTILS_BASE}/esearch.fcgi",
            params=search_params,
            timeout=MAX_API_TIMEOUT,
        )
        search_resp.raise_for_status()
        search_data = search_resp.json()

        id_list = search_data.get("esearchresult", {}).get("idlist", [])
        total_count = search_data.get("esearchresult", {}).get("count", "0")

        if not id_list:
            return f"**No PubMed papers found for '{target}'.** Try different keywords.", []

        # --- Step 2: Fetch abstracts ---
        fetch_params = {
            "db": "pubmed",
            "id": ",".join(id_list),
            "retmode": "xml",
            "rettype": "abstract",
        }
        if NCBI_API_KEY:
            fetch_params["api_key"] = NCBI_API_KEY

        fetch_resp = requests.get(
            f"{EUTILS_BASE}/efetch.fcgi",
            params=fetch_params,
            timeout=MAX_API_TIMEOUT,
        )
        fetch_resp.raise_for_status()

        # --- Parse XML ---
        return _parse_pubmed_xml(fetch_resp.text, total_count, target)

    except requests.Timeout:
        return f"**PubMed timeout** for '{target}'. Try again or use a NCBI API key for higher limits.", []
    except requests.RequestException as e:
        return f"**PubMed API error**: {e}", []
    except ET.ParseError as e:
        return f"**Error parsing PubMed XML**: {e}", []


def _parse_pubmed_xml(xml_text: str, total_count: str, target: str) -> tuple[str, list[dict]]:
    """Parse PubMed efetch XML into formatted markdown and structured citations."""
    root = ET.fromstring(xml_text)
    articles = root.findall(".//PubmedArticle")

    if not articles:
        return f"**No abstracts available** for '{target}' papers.", []

    summary = f"**{total_count} PubMed results for '{target}'** (showing {len(articles)}):\n\n"
    citations: list[dict] = []

    for idx, article in enumerate(articles):
        medline = article.find(".//MedlineCitation")
        if medline is None:
            continue

        # PMID
        pmid_elem = medline.find("PMID")
        pmid = pmid_elem.text if pmid_elem is not None else "N/A"

        # Title
        title_elem = medline.find(".//ArticleTitle")
        title = title_elem.text if title_elem is not None else "Untitled"
        title = (title[:150] + "...") if title and len(title) > 150 else (title or "Untitled")

        # Authors (first 3)
        authors = []
        for author in medline.findall(".//Author")[:3]:
            last = author.find("LastName")
            init = author.find("Initials")
            if last is not None and last.text:
                name = last.text
                if init is not None and init.text:
                    name += f" {init.text}"
                authors.append(name)
        author_str = ", ".join(authors)
        total_authors = len(medline.findall(".//Author"))
        if total_authors > 3:
            author_str += " et al."

        # Year
        year_elem = medline.find(".//PubDate/Year")
        year = year_elem.text if year_elem is not None else "N/A"

        # Journal
        journal_elem = medline.find(".//Journal/Title")
        journal = journal_elem.text if journal_elem is not None else ""
        journal = (journal[:60] + "...") if journal and len(journal) > 60 else (journal or "")

        # DOI
        doi = ""
        article_id_list = article.findall(".//ArticleIdList/ArticleId")
        for aid in article_id_list:
            if aid.get("IdType") == "doi" and aid.text:
                doi = aid.text
                break

        # Abstract
        abstract_parts = medline.findall(".//AbstractText")
        if abstract_parts:
            abstract = " ".join(
                (part.text or "") for part in abstract_parts
            )
            abstract = (abstract[:300] + "...") if len(abstract) > 300 else abstract
        else:
            abstract = "No abstract available."

        url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        summary += (
            f"- **{title}** (PMID: {pmid}, {year})\n"
            f"  Authors: {author_str}\n"
            f"  Journal: {journal}\n"
            f"  Abstract: {abstract}\n\n"
        )

        # Build structured citation
        citations.append({
            "id": f"pm-{idx + 1}",
            "type": "pubmed",
            "title": title,
            "authors": author_str,
            "year": year,
            "journal": journal,
            "url": f"https://doi.org/{doi}" if doi else url,
            "pmid": pmid,
            "doi": doi,
            "nct_id": "",
            "source_agent": "Literature Miner",
        })

    return summary, citations


# ---------------------------------------------------------------------------
# NCT-specific search helpers (used by the linking pipeline)
# ---------------------------------------------------------------------------

def search_by_nct(nct_id: str, max_results: int = 10) -> tuple[str, list[dict]]:
    """
    Search PubMed for publications linked to a specific NCT ID.

    Uses the secondary-identifier field tag ``[si]`` for high-precision
    matches, then falls back to free-text search.

    Args:
        nct_id: Clinical trial NCT ID (e.g. "NCT01234567").
        max_results: Maximum number of papers.

    Returns:
        Tuple of (formatted markdown, list of citation dicts).
    """
    if not nct_id:
        return "No NCT ID provided.", []

    # High-precision: secondary identifier field
    query = f'"{nct_id}"[si] OR "{nct_id}"'
    return fetch_papers(query, max_results=max_results)


def search_by_trial_metadata(
    title: str = "",
    condition: str = "",
    pi_name: str = "",
    completion_year: str = "",
    max_results: int = 8,
) -> tuple[str, list[dict]]:
    """
    Heuristic PubMed search using trial metadata when no direct NCT link exists.

    Combines fragments of the trial title, condition, and PI surname,
    filtered by clinical-trial publication type and date window.

    Args:
        title: Trial title (will be split into key phrases).
        condition: Disease/condition name.
        pi_name: PI last name.
        completion_year: Trial completion year for date filtering.
        max_results: Maximum papers to return.

    Returns:
        Tuple of (formatted markdown, list of citation dicts).
    """
    parts: list[str] = []

    if title:
        # Take first few significant words from the title
        words = [w for w in title.split() if len(w) > 3][:6]
        if words:
            title_phrase = " ".join(words)
            parts.append(f'"{title_phrase}"')

    if condition:
        parts.append(f'"{condition}"')

    if pi_name:
        # Extract last name if full name given
        surname = pi_name.strip().split()[-1] if pi_name.strip() else ""
        if surname and len(surname) > 2:
            parts.append(f"{surname}[Author]")

    if not parts:
        return "Insufficient metadata for heuristic search.", []

    query = " AND ".join(parts)

    # Add clinical trial filter
    query += ' AND ("clinical trial"[pt] OR "randomized controlled trial"[pt])'

    # Add date filter if we have a completion year
    if completion_year and completion_year.isdigit():
        year = int(completion_year)
        query += f" AND {year - 2}:{year + 2}[dp]"

    return fetch_papers(query, max_results=max_results)
