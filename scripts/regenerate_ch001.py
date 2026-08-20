"""Regenerate CH001 (E-commerce) fact rows with the missing promotion uplift.

WHY
---
`TPO_FINAL/ecommerce.ipynb` never applies a promotional uplift. Its quantity
chain is

    Base_Quantity   = normal_demand.round().astype(int).clip(lower=1)
    Actual_Quantity = Base_Quantity

with no `* (1 + Promotion_Uplift)` term — the word "uplift" does not appear in
that notebook at all, while CH002-CH005 each carry an `UPLIFT_RANGES` table and
apply it. The result: CH001 promotions moved price and cost but never volume,
producing ~0% measured uplift at every discount depth in both years and 55-65%
of promotion events with negative incremental units. Audited and approved for
regeneration; CH002-CH005 are correct and are NOT touched.

WHAT THIS DOES
--------------
Rather than re-running the notebook (which would redraw every random factor and
so change store, product and promotion assignments), this transforms the
EXISTING CH001 rows in place. Because CH001 currently has no uplift, its
`Base_Quantity` IS the Normal_Demand the other generators start from, so the
correction is exactly the multiplier the notebook is missing:

    Normal_Demand   = existing Base_Quantity          (uplift-free by definition)
    Base_Quantity   = round(Normal_Demand * (1 + Promotion_Uplift))
    Actual_Quantity = Base_Quantity                   (project invariant)

Everything else is then recomputed from the generator's own identities, all
four verified to hold on all 37,440 current CH001 rows before any change:

    Base_Revenue   = Base_Quantity   * Base_Price
    Actual_Revenue = Actual_Quantity * Actual_Price
    Total_Cost     = round(MANUFACTURING_COST_RATE * Base_Revenue)
    Promotion_Cost = round(PROMOTION_COST_RATE     * Base_Revenue)   [promoted only]

PRESERVED EXACTLY (nothing below is recomputed or reordered)
------------------------------------------------------------
Transaction_Id, Date, Week, Month, Product_id, Store_Id, Channel_Id,
Promotion_Id, Base_Price, Actual_Price, Schedule, row order, row count, and
every byte of every CH002-CH005 line.
"""

from __future__ import annotations

import csv
import hashlib
import io
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
FACT = REPO / "Data" / "fact_sales_2024_2025_all_channels.csv"

CHANNEL = "CH001"

# --- constants lifted verbatim from the validated CH002-CH005 generators ----

#: TPO_FINAL/Modern_Trade.ipynb §20. The project's promotion response curve.
UPLIFT_RANGES: dict[str, tuple[float, float]] = {
    "-1": (0.00, 0.00),
    "PR001": (0.15, 0.20),
    "PR002": (0.25, 0.35),
    "PR003": (0.40, 0.50),
    "PS001": (0.55, 0.65),
    "PB001": (0.60, 0.72),
}


def treatment_uplift(treatment_id: str) -> float:
    """TPO_FINAL/Modern_Trade.ipynb §20, copied verbatim.

    Deterministic — the midpoint of the range, not a random draw. Reused rather
    than reinvented so CH001 lands on the same curve as the other four channels.
    """
    low, high = UPLIFT_RANGES[treatment_id]
    return (low + high) / 2


#: TPO_FINAL/*.ipynb cell 1. Verified against all 37,440 current CH001 rows.
MANUFACTURING_COST_RATE = 0.65
PROMOTION_COST_RATE = 0.03

NO_PROMOTION = "-1"


def treatment_of(promotion_id: str) -> str:
    """fact Promotion_Id -> the treatment whose uplift range applies.

    The seasonal calendar books six distinct ids per year, all sharing one
    mechanic: the 2024 events are the 20%-discount treatment (verified — every
    CH001 PBxx24 row carries Actual_Price/Base_Price = 0.8000 exactly), the 2025
    events are Buy3Get1 (ratio 1.0000, no price discount, by design).
    """
    if promotion_id == NO_PROMOTION or promotion_id.startswith("PR"):
        return promotion_id
    if promotion_id.endswith("24"):
        return "PS001"
    if promotion_id.endswith("25"):
        return "PB001"
    raise ValueError(f"Unmapped Promotion_Id: {promotion_id!r}")


# --- the transform ----------------------------------------------------------

NUMERIC = ("Base_Quantity", "Actual_Quantity", "Base_Revenue",
           "Actual_Revenue", "Total_Cost", "Promotion_Cost")


def verify_identities(row: dict[str, str]) -> list[str]:
    """The generator identities this script relies on. Checked on every CH001
    row BEFORE it is rewritten — if any fails the input is not what we think it
    is and the run aborts rather than writing something plausible."""
    bq, aq = float(row["Base_Quantity"]), float(row["Actual_Quantity"])
    bp, ap = float(row["Base_Price"]), float(row["Actual_Price"])
    br, ar = float(row["Base_Revenue"]), float(row["Actual_Revenue"])
    tc, pc = float(row["Total_Cost"]), float(row["Promotion_Cost"])
    promoted = row["Promotion_Id"].strip() != NO_PROMOTION

    failures = []
    if aq != bq:
        failures.append("Actual_Quantity != Base_Quantity")
    if abs(br - bq * bp) > 0.51:
        failures.append("Base_Revenue != Base_Quantity x Base_Price")
    if abs(ar - aq * ap) > 0.51:
        failures.append("Actual_Revenue != Actual_Quantity x Actual_Price")
    if abs(tc - round(MANUFACTURING_COST_RATE * br)) > 1.01:
        failures.append("Total_Cost != round(0.65 x Base_Revenue)")
    expected_pc = round(PROMOTION_COST_RATE * br) if promoted else 0
    if abs(pc - expected_pc) > 1.01:
        failures.append("Promotion_Cost != round(0.03 x Base_Revenue)")
    return failures


def rewrite(row: dict[str, str]) -> dict[str, str]:
    """One CH001 row, with the uplift the generator omitted."""
    promotion_id = row["Promotion_Id"].strip()
    uplift = treatment_uplift(treatment_of(promotion_id))

    # The current Base_Quantity carries no uplift, so it IS Normal_Demand.
    normal_demand = int(row["Base_Quantity"])
    base_quantity = max(1, int(round(normal_demand * (1 + uplift))))

    base_price = float(row["Base_Price"])
    actual_price = float(row["Actual_Price"])
    base_revenue = base_quantity * base_price
    actual_revenue = base_quantity * actual_price

    out = dict(row)
    out["Base_Quantity"] = str(base_quantity)
    out["Actual_Quantity"] = str(base_quantity)  # project invariant
    out["Base_Revenue"] = _fmt(base_revenue)
    out["Actual_Revenue"] = _fmt(actual_revenue)
    out["Total_Cost"] = _fmt(round(MANUFACTURING_COST_RATE * base_revenue))
    out["Promotion_Cost"] = (
        _fmt(round(PROMOTION_COST_RATE * base_revenue))
        if promotion_id != NO_PROMOTION else "0"
    )
    return out


def _fmt(value: float) -> str:
    """Match the file's convention: every CH001 numeric is a plain integer
    (verified — 0 of 299,520 numeric cells contain a decimal point)."""
    rounded = round(value)
    return str(int(rounded)) if abs(value - rounded) < 1e-9 else repr(value)


def main() -> int:
    if not FACT.is_file():
        print(f"missing {FACT}", file=sys.stderr)
        return 1

    # Optional staging target. The dataset lives in a OneDrive folder and is
    # routinely open in Excel, which takes an exclusive lock; writing to a
    # staging copy lets the whole validation run complete regardless, and the
    # swap into Data/ becomes a single file move afterwards.
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else FACT

    with FACT.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames
        rows = list(reader)

    stats = Counter()
    bad: list[tuple[int, list[str]]] = []
    for index, row in enumerate(rows):
        if row["Channel_Id"] != CHANNEL:
            continue
        stats["ch001"] += 1
        failures = verify_identities(row)
        if failures:
            bad.append((index, failures))

    if bad:
        print(f"ABORT: {len(bad)} CH001 rows violate the generator identities.", file=sys.stderr)
        for index, failures in bad[:5]:
            print(f"  row {index}: {failures}", file=sys.stderr)
        return 2
    print(f"input identities verified on all {stats['ch001']:,} CH001 rows")

    before_qty = after_qty = 0
    for row in rows:
        if row["Channel_Id"] != CHANNEL:
            continue
        promoted = row["Promotion_Id"].strip() != NO_PROMOTION
        stats["promoted" if promoted else "non_promoted"] += 1
        before_qty += int(row["Base_Quantity"])
        row.update(rewrite(row))
        after_qty += int(row["Base_Quantity"])

    # CRLF, no BOM — matching the input exactly.
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=header, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(buffer.getvalue().encode("utf-8"))

    print(f"CH001 rows rewritten : {stats['ch001']:,}")
    print(f"  promoted           : {stats['promoted']:,}")
    print(f"  non-promoted       : {stats['non_promoted']:,}")
    print(f"  Σ Base_Quantity    : {before_qty:,} -> {after_qty:,} ({(after_qty/before_qty-1)*100:+.2f}%)")
    print(f"written: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
