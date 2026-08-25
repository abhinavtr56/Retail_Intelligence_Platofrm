"""The AI decision brief route.

A THIRD ROUTER ON `/api/decision`, beside `decision.py` (`/record`) and
`briefing.py` (`/briefing`). FastAPI mounts them all on the same prefix and
neither existing file has to change to make room -- which matters, because both
carry frozen contracts.

`/record` and `/briefing` are deterministic and always available. THIS one
depends on an external service and an API key that may not be configured, and
that difference is the reason it is a separate route rather than a field on the
record: Decision Center must render completely without ever calling it. Nothing
on the page waits for this, and nothing on the page reads its result for a
value.

No business logic here. The route validates a body and delegates to
app/tpo/decision_brief.py, which explains -- and calculates nothing.

THE API KEY IS NEVER IN THIS FILE. It is read server-side by
app/agents/client.py from backend/.env. No request model below accepts one, no
response carries one, and a missing key produces a message naming the SETTING
and never a value.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.agents.client import AgentConfigError
from app.tpo import decision_brief

router = APIRouter(prefix="/api/decision", tags=["decision"])


class BriefRequest(BaseModel):
    """One decision record, and nothing else.

    Deliberately the whole request. No question, no instruction, no persona and
    no free text: a prompt field would let a caller redirect the model away from
    explaining the record, which is the only thing it is here to do. `extra` is
    forbidden so anything else arriving is a 422 rather than a silent ignore.
    """

    model_config = ConfigDict(extra="forbid")

    #: The payload returned by POST /api/decision/record, or the `record` inside
    #: a stored decision -- they are the same bytes.
    record: dict[str, Any]


@router.post("/brief")
async def decision_ai_brief(body: BriefRequest) -> dict[str, Any]:
    """Explain one decision record in executive language.

    AN EXPLANATION, NOT A DECISION. No KPI, uplift, comparison, recommendation
    policy or risk policy is touched; no dataset is read; nothing is persisted,
    approved or notified. The model receives display strings the engines already
    produced and returns six paragraphs of prose.

    The response carries `authoritative: false` and a disclaimer, because the
    deterministic record remains the source of truth for every number on the
    page. It also carries `unverified_figures` -- any number the model wrote
    that is not in the record it was given.

    Failure is expected and handled: no key configured, the service unreachable,
    a timeout. Every one of them returns a status code and a reason, and
    Decision Center stays fully usable.
    """
    try:
        return await decision_brief.generate(body.record)
    except AgentConfigError as exc:
        # 503, not 500: the server is working correctly and one optional
        # capability is switched off. The message names the setting to add and
        # never its value.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except decision_brief.BriefError as exc:
        # 502: this endpoint did its job and the thing it depends on did not.
        raise HTTPException(status_code=502, detail=str(exc)) from exc
