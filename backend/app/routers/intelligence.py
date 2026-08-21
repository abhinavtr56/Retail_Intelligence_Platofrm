import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.agents.client import AgentConfigError
from app.agents.intelligence_agent import analyse, recommend
from app.deps import current_user
from app.intelligence_engine import SECTIONS, build_intelligence_facts
from app.investigation_runs import create_run, get_run, list_runs, update_run

log = logging.getLogger(__name__)

# NOTE: deliberately NOT /api/intelligence — pages.py already owns
# GET /api/intelligence/{type}, whose Literal path param would swallow
# /facts and /runs. A distinct prefix is collision-proof; relying on
# router registration order is not.
router = APIRouter(prefix="/api/promotion-intelligence", tags=["promotion-intelligence"])


class IntelligenceRequest(BaseModel):
    question: str = "What is driving promotion performance, and what should we change?"
    # Same filter vocabulary as the investigation agents: year, month, channel,
    # region, state, city, retailer, category, brand, promotion_type.
    filters: dict[str, Any] | None = None


@router.get("/facts")
def get_facts(
    year: int | None = None,
    channel: str | None = None,
    region: str | None = None,
    sections: str = "core",
    _user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """The deterministic picture — no model involved.

    `sections` is a comma-separated subset of core|dimensions|risk|waterfall.
    Each breakdown re-runs the KPI engine once per group, so computing all of
    them is ~40s; the page requests one tab's worth at a time and results are
    memoised per scope.
    """
    filters: dict[str, Any] = {}
    if year:
        filters["year"] = year
    if channel:
        filters["channel"] = [channel]
    if region:
        filters["region"] = [region]

    wanted = tuple(s.strip() for s in sections.split(",") if s.strip() in SECTIONS)
    if not wanted:
        raise HTTPException(400, f"sections must name at least one of: {', '.join(SECTIONS)}")
    return build_intelligence_facts(filters, wanted)


async def _execute(run_id: str, question: str, filters: dict[str, Any]) -> None:
    """Analyst then Advisor, streaming stage updates into the run record."""
    try:
        update_run(run_id, stage="computing", specialists=[
            {"key": "analyst", "name": "Intelligence Analyst", "desc": "Interprets the portfolio facts",
             "icon": "sparkles", "status": "queued"},
            {"key": "advisor", "name": "Recommendation Advisor", "desc": "Turns the diagnosis into actions",
             "icon": "target", "status": "queued"},
        ])
        facts = build_intelligence_facts(filters)

        def mark(key: str, status: str) -> None:
            run = get_run(run_id)
            if not run:
                return
            update_run(run_id, specialists=[
                {**s, "status": status} if s["key"] == key else s for s in (run.get("specialists") or [])
            ])

        update_run(run_id, stage="analyzing")
        mark("analyst", "running")
        analysis = await analyse(question, facts)
        mark("analyst", "done")

        mark("advisor", "running")
        advice = await recommend(question, facts, analysis)
        mark("advisor", "done")

        update_run(
            run_id,
            status="done",
            stage="complete",
            result={
                "source": "star_schema",
                "scope": filters,
                "facts": facts,
                "analysis": analysis,
                "recommendations": advice.get("recommendations", []),
                "do_not_do": advice.get("do_not_do", []),
                "expected_combined_impact": advice.get("expected_combined_impact"),
            },
        )
    except AgentConfigError as e:
        update_run(run_id, status="error", error=str(e))
    except Exception as e:
        log.exception("Intelligence run %s failed", run_id)
        update_run(run_id, status="error", error=f"{type(e).__name__}: {e}")


@router.post("/analyze")
async def start_analysis(
    body: IntelligenceRequest, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    """Run the Analyst + Advisor pair. Returns immediately with a run id —
    poll /intelligence/runs/{id}. Reuses the investigation run store so results
    persist and a reload doesn't re-run (and re-bill) the analysis."""
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "question must not be empty")
    filters = {k: v for k, v in (body.filters or {}).items() if v not in (None, [], "")}
    run = create_run(question, None, user["email_key"])
    update_run(run["id"], stage="computing")
    asyncio.create_task(_execute(run["id"], question, filters))
    return get_run(run["id"]) or run


@router.get("/runs")
def get_runs(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    return list_runs(user["email_key"])


@router.get("/runs/{run_id}")
def get_analysis_run(run_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    run = get_run(run_id)
    if not run or run.get("owner") != user["email_key"]:
        raise HTTPException(404, "Run not found.")
    return run
