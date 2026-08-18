from typing import Any

from fastapi import APIRouter

from app.data_loader import InvestigationType, load

router = APIRouter(prefix="/api", tags=["pages"])


@router.get("/intelligence/{type}")
def get_intelligence(type: InvestigationType) -> dict[str, Any]:
    return load("pages-by-type")[type]["intelligence"]


@router.get("/simulation/{type}")
def get_simulation(type: InvestigationType) -> dict[str, Any]:
    return load("pages-by-type")[type]["simulation"]


@router.get("/decision/{type}")
def get_decision(type: InvestigationType) -> dict[str, Any]:
    return load("pages-by-type")[type]["decision"]


# Pre-multi-type baseline blocks (top-level DATA.intelligence/simulation/decision
# in the vanilla app) — kept for fidelity, not used by the per-type pages above.
@router.get("/intelligence-default")
def get_intelligence_default() -> dict[str, Any]:
    return load("intelligence")


@router.get("/simulation-default")
def get_simulation_default() -> dict[str, Any]:
    return load("simulation")


@router.get("/decision-default")
def get_decision_default() -> dict[str, Any]:
    return load("decision")
