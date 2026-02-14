"""
Configuration module: API keys, model settings, LLM client.
Uses LiteLLM (same as backend/main.py) for Grok API integration.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)

# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------
XAI_API_KEY = os.getenv("XAI_API_KEY", "")
NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")
SEMANTIC_SCHOLAR_KEY = os.getenv("SEMANTIC_SCHOLAR_KEY", "")

# Ensure XAI key is available to litellm
if XAI_API_KEY:
    os.environ["XAI_API_KEY"] = XAI_API_KEY

# ---------------------------------------------------------------------------
# Model Configuration
# ---------------------------------------------------------------------------
# Available Grok models (from backend/main.py):
#   grok-3, grok-3-mini, grok-4-0709, grok-4-1-fast-non-reasoning,
#   grok-4-1-fast-reasoning, grok-4-fast-non-reasoning,
#   grok-4-fast-reasoning, grok-code-fast-1
DEFAULT_MODEL = "xai/grok-4-1-fast-non-reasoning"
DEFAULT_TEMPERATURE = 0.3

# ---------------------------------------------------------------------------
# Pipeline Defaults
# ---------------------------------------------------------------------------
DEFAULT_DEBATE_ROUNDS = 2
MAX_API_TIMEOUT = 15  # seconds for external API calls


def call_llm(
    system_prompt: str,
    user_prompt: str,
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    json_mode: bool = False,
) -> str:
    """
    Call the LLM via LiteLLM. Adapted from backend/main.py's call_llm.

    Args:
        system_prompt: System-level instruction for the agent role.
        user_prompt: User-level context / data to process.
        model: LiteLLM model string (default: Grok via xAI).
        temperature: Sampling temperature.
        json_mode: If True, request structured JSON output.

    Returns:
        The assistant's text response.
    """
    from litellm import completion

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    resp = completion(**kwargs)
    content = resp.choices[0].message.content
    return content.strip() if content else ""


async def acall_llm(
    system_prompt: str,
    user_prompt: str,
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    json_mode: bool = False,
) -> str:
    """Async wrapper — runs call_llm in a thread to avoid blocking."""
    import asyncio
    return await asyncio.to_thread(
        call_llm, system_prompt, user_prompt, model, temperature, json_mode
    )
