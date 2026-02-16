"""
ADMETlab 3.0 API integration.
Predicts ADMET (Absorption, Distribution, Metabolism, Excretion, Toxicity)
properties for molecules given as SMILES strings.

API docs: https://admetlab3.scbdd.com/apis/
"""

import requests
from ..config import MAX_API_TIMEOUT

ADMET_API_URL = "https://admetlab3.scbdd.com/api/aio-admet/"

# Key ADMET properties to highlight in the summary
_KEY_PROPERTIES = [
    # Physicochemical
    "MW", "LogP", "LogS", "TPSA",
    # Absorption
    "Caco-2", "HIA", "Pgp-inh", "Pgp-sub", "F(20%)", "F(50%)",
    # Distribution
    "BBB", "PPB", "VDss",
    # Metabolism
    "CYP1A2-inh", "CYP2C19-inh", "CYP2C9-inh", "CYP2D6-inh", "CYP3A4-inh",
    "CYP1A2-sub", "CYP2C9-sub", "CYP2D6-sub", "CYP3A4-sub",
    # Excretion
    "T12", "CL",
    # Toxicity
    "hERG", "AMES", "DILI", "Carcinogenicity", "Respiratory",
    "Nephrotoxicity", "Hepatotoxicity",
    # Medicinal Chemistry
    "SAscore", "Lipinski", "PAINS",
]


def fetch_admet(smiles_list: list[str]) -> str:
    """
    Predict ADMET properties for one or more molecules via ADMETlab 3.0.

    Uses the all-in-one ADMET prediction endpoint which returns all 119
    property predictions for each molecule.

    Args:
        smiles_list: List of SMILES strings (max ~50 recommended per call).

    Returns:
        Formatted markdown string with ADMET property summaries.
    """
    if not smiles_list:
        return "**No SMILES provided.** Supply at least one molecule."

    try:
        # ADMETlab API expects: {"SMILES": ["molecule", "SMI1", "SMI2", ...]}
        # The first element "molecule" is a required header string.
        payload = {
            "SMILES": ["molecule"] + list(smiles_list),
        }

        resp = requests.post(
            ADMET_API_URL,
            json=payload,
            timeout=MAX_API_TIMEOUT * 4,  # ADMET predictions take longer
            verify=False,  # ADMETlab cert can be expired
        )
        resp.raise_for_status()
        data = resp.json()

        return _format_admet_results(data, smiles_list)

    except requests.Timeout:
        return (
            "**ADMETlab timeout.** The server may be slow — try fewer "
            "molecules or try again later."
        )
    except requests.RequestException as e:
        return f"**ADMETlab API error**: {e}"
    except (KeyError, TypeError, ValueError) as e:
        return f"**Error parsing ADMET data**: {e}"


def _format_admet_results(data: dict, original_smiles: list[str]) -> str:
    """Format the ADMETlab JSON response into readable markdown."""
    results = data.get("data", [])

    if not results:
        return "**No ADMET predictions returned.** The SMILES may be invalid."

    summary = (
        f"**ADMET predictions for {len(results)} molecule(s)** "
        f"via [ADMETlab 3.0](https://admetlab3.scbdd.com):\n\n"
    )

    for i, mol_data in enumerate(results):
        smiles = mol_data.get("smiles", original_smiles[i] if i < len(original_smiles) else "Unknown")
        short_smi = smiles if len(smiles) <= 50 else smiles[:47] + "..."

        summary += f"### Molecule {i + 1}: `{short_smi}`\n\n"

        # Build a table of key properties
        summary += "| Property | Value | Category |\n"
        summary += "|----------|-------|----------|\n"

        for prop in _KEY_PROPERTIES:
            val = mol_data.get(prop)
            if val is None:
                continue
            category = _categorise_property(prop)
            # Format value — round floats, keep strings as-is
            if isinstance(val, float):
                display_val = f"{val:.3f}"
            else:
                display_val = str(val)
            summary += f"| {prop} | {display_val} | {category} |\n"

        summary += "\n"

        # Drug-likeness flags
        flags = _extract_flags(mol_data)
        if flags:
            summary += "**⚠ Flags:** " + ", ".join(flags) + "\n\n"
        else:
            summary += "**✅ No major flags detected.**\n\n"

    return summary


def _categorise_property(prop: str) -> str:
    """Return the ADMET category for a property name."""
    categories = {
        "MW": "Physico-chem", "LogP": "Physico-chem", "LogS": "Physico-chem",
        "TPSA": "Physico-chem",
        "Caco-2": "Absorption", "HIA": "Absorption", "Pgp-inh": "Absorption",
        "Pgp-sub": "Absorption", "F(20%)": "Absorption", "F(50%)": "Absorption",
        "BBB": "Distribution", "PPB": "Distribution", "VDss": "Distribution",
        "T12": "Excretion", "CL": "Excretion",
        "hERG": "Toxicity", "AMES": "Toxicity", "DILI": "Toxicity",
        "Carcinogenicity": "Toxicity", "Respiratory": "Toxicity",
        "Nephrotoxicity": "Toxicity", "Hepatotoxicity": "Toxicity",
        "SAscore": "Med Chem", "Lipinski": "Med Chem", "PAINS": "Med Chem",
    }
    if "CYP" in prop:
        return "Metabolism"
    return categories.get(prop, "Other")


def _extract_flags(mol_data: dict) -> list[str]:
    """Pull out noteworthy alerts from predictions."""
    flags = []

    # PAINS filter
    pains = mol_data.get("PAINS")
    if pains and str(pains) not in ("0", "0.0", "Accepted"):
        flags.append("PAINS alert")

    # hERG cardiotoxicity
    herg = mol_data.get("hERG")
    if isinstance(herg, (int, float)) and herg > 0.5:
        flags.append("hERG risk (cardiotoxicity)")
    elif isinstance(herg, str) and herg.lower() in ("active", "positive", "blocker"):
        flags.append("hERG risk (cardiotoxicity)")

    # AMES mutagenicity
    ames = mol_data.get("AMES")
    if isinstance(ames, (int, float)) and ames > 0.5:
        flags.append("AMES positive (mutagenic)")
    elif isinstance(ames, str) and ames.lower() in ("active", "positive", "mutagenic"):
        flags.append("AMES positive (mutagenic)")

    # DILI (drug-induced liver injury)
    dili = mol_data.get("DILI")
    if isinstance(dili, (int, float)) and dili > 0.5:
        flags.append("DILI risk (liver)")
    elif isinstance(dili, str) and dili.lower() in ("active", "positive"):
        flags.append("DILI risk (liver)")

    # Lipinski violations
    lipinski = mol_data.get("Lipinski")
    if isinstance(lipinski, str) and "rejected" in lipinski.lower():
        flags.append("Lipinski rule violation")
    elif isinstance(lipinski, (int, float)) and lipinski > 0:
        flags.append(f"Lipinski violations: {int(lipinski)}")

    return flags
