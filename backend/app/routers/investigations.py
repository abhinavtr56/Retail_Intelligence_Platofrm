from typing import Any

from fastapi import APIRouter

from app.data_loader import InvestigationType, load

router = APIRouter(prefix="/api", tags=["investigations"])


@router.get("/investigation-types")
def get_investigation_types() -> list[dict[str, Any]]:
    """The 4 archetypes (diagnostic/optimization/launch/strategic) shown on
    the "start an investigation" picker, each with its own example questions."""
    return load("investigation-types")


@router.get("/investigations/legacy")
def get_legacy_investigation() -> dict[str, Any]:
    """The original pre-multi-type investigation block. Kept for fidelity
    with the vanilla app; superseded in practice by /investigations/{type}."""
    return load("investigations")["legacyDefault"]


@router.get("/investigations/{type}")
def get_investigation_orchestration(type: InvestigationType) -> dict[str, Any]:
    """Causal graph (nodes, accelerators, progress, node detail popovers)
    for one investigation type — powers the Investigations page."""
    return load("investigations")["orchestrations"][type]


@router.get("/intelligence-answers/{type}")
def get_intelligence_answer(type: InvestigationType) -> dict[str, Any]:
    """The AI-synthesized narrative for one investigation type, with its
    [g]/[r]/[n] tone markup intact — the frontend owns rendering that."""
    return load("intelligence-answers")[type]
