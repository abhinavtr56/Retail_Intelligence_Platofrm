"""TPO backend configuration — every tunable number, in one place.

Nothing else in app/tpo/ reads os.environ or hardcodes a rate, a target or a
path. Two of these in particular are things the spec forbids scattering:

  * `EXCHANGE_RATE_USD_PER_INR` — currency conversion is a PRESENTATION
    concern. KPI functions never see it; they return canonical INR and the
    formatter applies this once. See app/tpo/formatting.py.
  * `PROMOTION_TARGET_ROI_PCT` — the hurdle the Risk Alert severity bands,
    the "vs Target" column and the trend chart's benchmark line all read.
    Two independently hardcoded targets would silently drift apart.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- datasets --------------------------------------------------------------

#: The finalized TPO star schema, resolved in priority order:
#:
#:   1. $TPO_DATA_DIR              — explicit override, always wins
#:   2. <repo>/Data                — the in-repo copy, so a clone is self-contained
#:   3. ~/OneDrive/Desktop/TPO_FINAL — where the datasets were authored
#:
#: Deliberately NOT the previous project's fact_sales — that dataset is stale
#: (61,360 rows, no Channel_Id) and is superseded by these five files.
FACT_FILE = "fact_sales_2024_2025_all_channels.csv"
DIM_FILES = {
    "product": "dim_product_reordered.csv",
    "geo_store": "dim_geo_store_final.csv",
    "channel": "dim_channel.csv",
    "promotion": "dim_promotion_final.csv",
    "date": "dim_date2425_corrected.csv",
}

_REPO_ROOT = Path(__file__).resolve().parents[3]
_CANDIDATES = (
    _REPO_ROOT / "Data",
    Path.home() / "OneDrive" / "Desktop" / "TPO_FINAL",
)


def _resolve_data_dir() -> Path:
    override = os.environ.get("TPO_DATA_DIR")
    if override:
        return Path(override)
    for candidate in _CANDIDATES:
        if (candidate / FACT_FILE).is_file():
            return candidate
    return _CANDIDATES[-1]  # report the canonical path in the not-found error


DATA_DIR = _resolve_data_dir()


# --- targets ---------------------------------------------------------------

#: The ROI a promotion must clear, as a percentage — the same units the
#: Promotion ROI card displays. Carried over from the validated project.
PROMOTION_TARGET_ROI_PCT: float = 50.0

#: Risk Alert severity bands, in ROI percent. A promotion at or above the
#: target is not an alert at all.
SEVERITY_BANDS = {
    "critical": 25.0,  # ROI < 25
    "high": 40.0,      # 25 <= ROI < 40
    "medium": 50.0,    # 40 <= ROI < 50
}


def target_incremental_sales(trade_spend: float) -> float:
    """Incremental revenue a given trade spend must return to hit target.

    Inverting the ROI definition,
        ROI = (Incremental Sales - Trade Spend) / Trade Spend x 100
    at ROI = PROMOTION_TARGET_ROI_PCT gives
        Target Incremental Sales = Trade Spend x (1 + target/100)

    which at the default 50% target is `trade_spend x 1.50` — the "At Stake"
    formula. Written as the inversion rather than as a literal 1.5 so the two
    cannot disagree if the target ever moves.
    """
    return round(trade_spend * (1 + PROMOTION_TARGET_ROI_PCT / 100), 2)


# --- currency --------------------------------------------------------------

#: Base currency of every stored figure and every KPI calculation. Nothing
#: converts on the way in.
BASE_CURRENCY = "INR"

#: USD per 1 INR. ONE configurable value, applied once at display time.
EXCHANGE_RATE_USD_PER_INR: float = float(os.environ.get("TPO_USD_PER_INR", "0.0115"))

SUPPORTED_CURRENCIES = ("INR", "USD")
