"""Decision briefing route -- B8.

A SEPARATE ROUTER FROM routers/decision.py ON PURPOSE. B7's decision-record
contract is frozen; adding a route to its module would edit a frozen file for
no benefit. FastAPI is happy to mount two routers on the same `/api/decision`
prefix, so `/record` (B7) and `/briefing` (B8) sit side by side and neither
file has to know about the other.

No business logic here. The route validates a body and delegates to
app/tpo/briefing.py, which renders -- and calculates nothing.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.tpo import briefing

router = APIRouter(prefix="/api/decision", tags=["decision"])


class BriefingRequest(BaseModel):
    """One B7 decision record, and nothing else.

    Deliberately the whole request. No filters, no scenario id, no KPI, no
    recommendation or risk input, no author, no approver and no approval state:
    every one of those would be a second source of truth the artifact could
    disagree with, and the last three would be fabricated identity. `extra`
    is forbidden so any of them arriving is a 422 rather than a silent ignore.
    """

    model_config = ConfigDict(extra="forbid")

    #: The payload returned by POST /api/decision/record.
    record: dict[str, Any]


@router.post("/briefing")
def decision_briefing(body: BriefingRequest) -> dict[str, Any]:
    """Render one decision record as `briefing.json` and `briefing.html`.

    Nothing is recalculated: no KPI engine, no scenario execution, no
    comparison, no recommendation policy and no risk policy is touched, and no
    dataset is read. Nothing is persisted, nothing is approved and nobody is
    notified.

    A payload that is not a complete B7 record is refused rather than rendered
    with a hole in it -- see app/tpo/briefing.validate.
    """
    try:
        return briefing.build(body.record)
    except briefing.InvalidRecord as exc:
        # 422, not 500: the request parsed but does not describe a decision
        # record, and the message names exactly what is wrong with it.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
