"""Correct the two promotional-giveaway defects in the fact data.

Both defects are the same mistake in two places: VOLUME WAS GIVEN AWAY AND
NEVER BOOKED AS INVESTMENT. The KPI engine is untouched — Trade Spend is
`Sum(Base_Revenue - Actual_Revenue + Promotion_Cost)` before and after, and ROI
is `(Incremental Sales - Trade Spend) / Trade Spend x 100` before and after.
What changes is that the fact rows now record what the promotion actually cost.

Diagnosis behind this: scripts/diagnose_promotion_economics.py.
Every other promotion is already healthy — PR001 78%, PR002 60%, PR003 46%,
PS001 (where it carries its 20%) 29-37% ROI, all uplifts inside the approved
ranges. Nothing about them is touched.


DEFECT A — CH002 2024 seasonal sold at list price
-------------------------------------------------
dim_promotion_final.csv defines PBNY24 / PBHO24 / PBSU24 / PBIN24 / PBDU24 /
PBDI24 as "20% Discount". In CH002 2024, exactly half those rows carry
Actual_Price == Base_Price:

    price ratio 0.80 : 2,430 rows   9 products
    price ratio 1.00 : 2,430 rows  18 products   <- no discount at all

The split is purely by Product_id with ZERO overlap (same 10 stores, same 27
weeks), so it is a generator bug, not a business rule: 18 of the 27 promoted
products were granted the full 60.9% seasonal uplift while their promotion
recorded no price investment. The other four channels carry ratio 0.80 on every
single PB*24 row. CH002 F24 ROI 114.5% against 45.9-54.2% elsewhere.

    FIX: Actual_Price = round(0.80 x Base_Price) on those rows, matching the
         promotion they are already assigned to.

Quantity is not touched, so uplift is unchanged. Base_Price is not touched, so
Base_Revenue, Total_Cost and Promotion_Cost are unchanged.


DEFECT B — Buy3Get1 free goods costed nowhere
---------------------------------------------
The 2025 seasonal calendar (PB*25) is Buy3Get1: `Actual_Price / Base_Price =
1.0000` on every row, by design — the mechanic is not a price discount and must
not become one. But the generator then books only the flat 3% promotional
overhead, so one unit in every four walks out of the door charged to nobody
while the row still claims a 60-72% uplift.

    ROI by channel, F25 Buy3Get1: CH001 1278%  CH003 1210%  CH004 1295%
                                  CH005 1253%  CH002 109% (partially patched)

    FIX: Promotion_Cost = round(BUY3GET1_COST_RATE x Base_Revenue)

           BUY3GET1_COST_RATE = PROMOTION_COST_RATE + FREE_GOODS_SHARE
                              = 0.03                + 0.25
                              = 0.28

Both terms fall out of the mechanic and the generator's own constants; neither
is fitted to an ROI target:

  * 0.03 is PROMOTION_COST_RATE, the promotional overhead EVERY promoted row in
    the file already carries. Unchanged.
  * 0.25 is the arithmetic of Buy 3 Get 1 — one unit in four is free — valued
    at LIST price, exactly as `Base_Revenue - Actual_Revenue` values a price
    discount at list. Trade Spend measures forgone revenue everywhere else in
    this model; costing the giveaway at manufacturing cost instead would price
    it on a basis the definition uses nowhere.

This supersedes scripts/correct_ch002_f25_buy3get1.py, which applied
0.03 + 0.25 x 0.65 = 0.1925 to CH002 only and whose own docstring records that
choice as "an accepted deviation... If the treatment is ever applied globally,
this script is the definition to reuse." It is now applied globally, at the
forgone-revenue basis rather than the COGS one. CH002's already-rewritten rows
are re-rated to 0.28 along with everyone else's, so all five channels finally
describe the same mechanic the same way.


NOT TOUCHED BY EITHER FIX
-------------------------
Transaction_Id, Date, Week, Month, Product_id, Store_Id, Channel_Id,
Promotion_Id, Base_Quantity, Actual_Quantity, Base_Price, Base_Revenue,
Total_Cost, Schedule, row order, row count. The
`Base_Quantity == Actual_Quantity` invariant is preserved by construction —
neither fix reads or writes a quantity.

Usage
-----
    python scripts/fix_promotion_economics.py <destination.csv> [--rate 0.28]

Writing to a staging path first is the norm here: Data/ lives in OneDrive and
is routinely open in Excel, which takes an exclusive lock.
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
FACT = REPO / "Data" / "fact_sales_2024_2025_all_channels.csv"

NO_PROMOTION = "-1"

#: Generator constants, verified against every promoted row in the live file.
PROMOTION_COST_RATE = 0.03
MANUFACTURING_COST_RATE = 0.65

#: One unit in every four shipped is free under Buy 3 Get 1.
FREE_GOODS_SHARE = 0.25

#: Promotional overhead + the list value of the free goods.
DEFAULT_BUY3GET1_RATE = PROMOTION_COST_RATE + FREE_GOODS_SHARE

#: dim_promotion_final.csv: PS001 and every PB*24 seasonal id is "20% Discount".
SEASONAL_DISCOUNT = 0.20

CH002 = "CH002"


def is_buy3get1(promotion_id: str) -> bool:
    """The 2025 seasonal calendar. dim_promotion_final.csv names every PB*25 id
    "Buy3Get1"; every one carries Actual_Price / Base_Price = 1.0000."""
    return promotion_id.startswith("PB") and promotion_id.endswith("25")


def is_seasonal_discount_24(promotion_id: str) -> bool:
    """The 2024 seasonal calendar, which dim_promotion names "20% Discount"."""
    return promotion_id.startswith("PB") and promotion_id.endswith("24")


def year_of(row: dict) -> str:
    return row["Date"].strip()[-4:]


def _fmt(value: float) -> str:
    """Match the file's convention: every numeric cell is a plain integer."""
    rounded = round(value)
    return str(int(rounded)) if abs(value - rounded) < 1e-9 else repr(value)


# --- pre-flight -------------------------------------------------------------


def verify_input(rows: list[dict]) -> list[str]:
    """Assumptions this script relies on, checked before anything is rewritten.

    If any fails, the input is not the dataset the diagnosis was run against and
    the run aborts rather than writing something plausible.
    """
    failures: list[str] = []
    defect_a = defect_b = 0
    for i, row in enumerate(rows):
        pid = row["Promotion_Id"].strip()
        bq, aq = float(row["Base_Quantity"]), float(row["Actual_Quantity"])
        bp, ap = float(row["Base_Price"]), float(row["Actual_Price"])
        br, ar = float(row["Base_Revenue"]), float(row["Actual_Revenue"])
        if aq != bq:
            failures.append(f"row {i}: Base_Quantity != Actual_Quantity")
        if abs(br - bq * bp) > 0.51:
            failures.append(f"row {i}: Base_Revenue != Base_Quantity x Base_Price")
        if abs(ar - aq * ap) > 0.51:
            failures.append(f"row {i}: Actual_Revenue != Actual_Quantity x Actual_Price")
        if targets_defect_a(row):
            defect_a += 1
            # 0.80 x Base_Price must land on a whole rupee, as it does on the
            # 2,430 sibling rows that already carry the discount.
            if abs(SEASONAL_DISCOUNT * bp - round(SEASONAL_DISCOUNT * bp)) > 1e-9:
                failures.append(f"row {i}: 0.80 x Base_Price {bp} is not a whole number")
        if targets_defect_b(row):
            defect_b += 1
            if abs(ap - bp) > 1e-9:
                failures.append(f"row {i}: Buy3Get1 row carries a price discount")
        if len(failures) > 20:
            break

    if defect_a != 2430:
        failures.append(f"expected 2,430 Defect A rows, found {defect_a:,}")
    if defect_b != 6930:
        failures.append(f"expected 6,930 Buy3Get1 rows, found {defect_b:,}")
    return failures


# --- targeting --------------------------------------------------------------


def targets_defect_a(row: dict) -> bool:
    """CH002 2024 seasonal rows still sold at list price."""
    return (
        row["Channel_Id"] == CH002
        and year_of(row) == "2024"
        and is_seasonal_discount_24(row["Promotion_Id"].strip())
        and abs(float(row["Actual_Price"]) - float(row["Base_Price"])) < 1e-9
    )


def targets_defect_b(row: dict) -> bool:
    """Every Buy3Get1 row, in every channel."""
    return is_buy3get1(row["Promotion_Id"].strip())


# --- the transform ----------------------------------------------------------


def apply_defect_a(row: dict) -> None:
    """Price the row at the 20% its own promotion is defined as."""
    base_price = float(row["Base_Price"])
    actual_price = round((1 - SEASONAL_DISCOUNT) * base_price)
    row["Actual_Price"] = _fmt(actual_price)
    row["Actual_Revenue"] = _fmt(float(row["Actual_Quantity"]) * actual_price)


def apply_defect_b(row: dict, rate: float) -> None:
    """Charge the free goods to the promotion that gave them away."""
    row["Promotion_Cost"] = _fmt(round(rate * float(row["Base_Revenue"])))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="where to write the corrected CSV")
    parser.add_argument("--rate", type=float, default=DEFAULT_BUY3GET1_RATE,
                        help="Buy3Get1 Promotion_Cost as a share of Base_Revenue")
    parser.add_argument("--only", choices=("a", "b", "both"), default="both",
                        help="apply one defect's fix in isolation (for the sensitivity run)")
    args = parser.parse_args()

    if not FACT.is_file():
        print(f"missing {FACT}", file=sys.stderr)
        return 1

    with FACT.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames
        rows = list(reader)

    failures = verify_input(rows)
    if failures:
        print("ABORT: input does not match the diagnosed dataset:", file=sys.stderr)
        for f in failures[:10]:
            print("  " + f, file=sys.stderr)
        return 2
    print(f"input verified: {len(rows):,} rows, identities hold, both defects present as diagnosed")

    stats = Counter()
    ts_before = ts_after = 0.0
    for row in rows:
        promoted = row["Promotion_Id"].strip() != NO_PROMOTION
        if promoted:
            ts_before += (float(row["Base_Revenue"]) - float(row["Actual_Revenue"])
                          + float(row["Promotion_Cost"]))
        if args.only in ("a", "both") and targets_defect_a(row):
            apply_defect_a(row)
            stats["defect_a"] += 1
        if args.only in ("b", "both") and targets_defect_b(row):
            apply_defect_b(row, args.rate)
            stats["defect_b"] += 1
        if promoted:
            ts_after += (float(row["Base_Revenue"]) - float(row["Actual_Revenue"])
                         + float(row["Promotion_Cost"]))

    # CRLF, no BOM — matching the input exactly.
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=header, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_bytes(buffer.getvalue().encode("utf-8"))

    print(f"Defect A rows repriced to 80% of list : {stats['defect_a']:,}")
    print(f"Defect B Buy3Get1 rows re-costed at {args.rate:.2%}: {stats['defect_b']:,}")
    print(f"Trade Spend : {ts_before/1e7:,.2f}Cr -> {ts_after/1e7:,.2f}Cr "
          f"({(ts_after/ts_before - 1) * 100:+.1f}%)")
    print(f"written     : {args.destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
