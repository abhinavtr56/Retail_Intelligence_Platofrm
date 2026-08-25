"""
OpenAI client wiring.

The API key is read from backend/.env (gitignored) and lives only on the
server — it is never sent to the browser and never appears in a response
body. That's the whole reason this is separate from the existing
/api/openai/chat proxy in routers/connectors.py, which is the portal
Advisor's deliberately different bring-your-own-key flow.
"""
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import AsyncOpenAI

# backend/.env — explicit path rather than find_dotenv(), which walks the call
# stack and misbehaves depending on how the process was started.
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(BACKEND_ROOT / ".env")

DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


class AgentConfigError(RuntimeError):
    """Raised when the server has no API key configured."""


def get_client() -> AsyncOpenAI:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise AgentConfigError(
            "No OPENAI_API_KEY configured. Add it to backend/.env and restart the server."
        )
    return AsyncOpenAI(api_key=key)


async def complete_json(
    system: str,
    user: str,
    schema: dict[str, Any],
    schema_name: str,
    *,
    model: str | None = None,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """One structured-output call.

    Uses json_schema response format with strict=True so the model must
    return exactly this shape — the graph renders from these fields, so
    parsing prose and hoping would be the wrong trade.
    """
    client = get_client()
    response = await client.chat.completions.create(
        model=model or DEFAULT_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        response_format={
            "type": "json_schema",
            "json_schema": {"name": schema_name, "strict": True, "schema": schema},
        },
    )
    content = response.choices[0].message.content or "{}"
    return json.loads(content)
