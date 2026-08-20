"""Re-represent the Buy3Get1 mechanic as a 25% effective price discount.

APPROVED BUSINESS TREATMENT
---------------------------
Buy 3 Get 1 is to be carried in the data as an effective PRICE effect rather
than as a promotional cost:

    Actual_Price   = round(0.75 x Base_Price)      (25% effective discount)
    Actual_Revenue = Actual_Quantity x Actual_Price
    Promotion_Cost = round(0.03 x Base_Revenue)    (the ordinary 3% overhead)

This REPLACES the representation written by scripts/fix_promotion_economics.py,
which carried the identical investment on the other side of the formula:

    before:  Actual_Price = Base_Price   (0% discount) + Promotion_Cost 28%
    after :  Actual_Price = 0.75 x Base  (25% discount) + Promotion_Cost 3%

The 25% is NOT double counted: Promotion_Cost drops back to 3% in the same
pass, so Trade Spend is arithmetically identical under both representations:

    before:  (Base_Rev - Base_Rev)      + 0.28 x Base_Rev = 0.28 x Base_Rev
    after :  (Base_Rev - 0.75 Base_Rev) + 0.03 x Base_Rev = 0.28 x Base_Rev

Trade Spend is unchanged. Incremental Sales is NOT: the KPI engine values every
incremental unit at that row's own Actual_Price, so moving the investment from
the cost side to the price side revalues promoted volume at 75% of list and
lowers Incremental Sales, and therefore ROI, on Buy3Get1 rows.

Promotion_Id is untouched (still PB*25). Quantities are untouched, so uplift is
untouched. Base_Price is untouched, so Base_Revenue and Total_Cost are too.

Usage:  python scripts/represent_pb001_as_price_discount.py <destination.csv>
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

#: The effective price discount assigned to the Buy3Get1 mechanic.
PB001_EFFECTIVE_DISCOUNT = 0.25

#: The ordinary promotional overhead every promoted row carries.
PROMOTION_COST_RATE = 0.03

#: What fix_promotion_economics.py wrote, and what this pass expects to find.
CURRENT_BUY3GET1_RATE = 0.28

#: Dataset fingerprint, not a business rule -- see the same note in
#: fix_promotion_economics.py. 6,930 -> 6,390 after the generator's date-parsing
#: fix moved which rows carry Buy3Get1.
EXPECTED_BUY3GET1_ROWS = 6390


def is_buy3get1(promotion_id: str) -> bool:
    return promotion_id.startswith("PB") and promotion_id.endswith("25")


def _fmt(value: float) -> str:
    rounded = round(value)
    return str(int(rounded)) if abs(value - rounded) < 1e-9 else repr(value)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()

    with FACT.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames
        rows = list(reader)

    # Pre-flight: the input must be the 0%-price / 28%-cost representation.
    problems = []
    targets = 0
    for i, row in enumerate(rows):
        if not is_buy3get1(row["Promotion_Id"].strip()):
            continue
        targets += 1
        bp, ap = float(row["Base_Price"]), float(row["Actual_Price"])
        br, pc = float(row["Base_Revenue"]), float(row["Promotion_Cost"])
        if abs(ap - bp) > 1e-9:
            problems.append(f"row {i}: Buy3Get1 already carries a price discount")
        if abs(pc - round(CURRENT_BUY3GET1_RATE * br)) > 1.01:
            problems.append(f"row {i}: Promotion_Cost is not the expected 28% of Base_Revenue")
        if len(problems) > 10:
            break
    if targets != EXPECTED_BUY3GET1_ROWS:
        problems.append(f"expected {EXPECTED_BUY3GET1_ROWS:,} Buy3Get1 rows, found {targets:,}")
    if problems:
        print("ABORT: input is not the representation this pass expects:", file=sys.stderr)
        for p in problems[:10]:
            print("  " + p, file=sys.stderr)
        return 2
    print(f"input verified: {targets:,} Buy3Get1 rows at 0% price / 28% promotion cost")

    stats = Counter()
    ts_before = ts_after = 0.0
    disc = 0.0
    for row in rows:
        if not is_buy3get1(row["Promotion_Id"].strip()):
            continue
        base_price = float(row["Base_Price"])
        base_revenue = float(row["Base_Revenue"])
        quantity = float(row["Actual_Quantity"])
        ts_before += base_revenue - float(row["Actual_Revenue"]) + float(row["Promotion_Cost"])

        actual_price = round((1 - PB001_EFFECTIVE_DISCOUNT) * base_price)
        row["Actual_Price"] = _fmt(actual_price)
        row["Actual_Revenue"] = _fmt(quantity * actual_price)
        row["Promotion_Cost"] = _fmt(round(PROMOTION_COST_RATE * base_revenue))

        ts_after += base_revenue - quantity * actual_price + round(PROMOTION_COST_RATE * base_revenue)
        disc += 1 - actual_price / base_price
        stats["rewritten"] += 1

    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=header, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_bytes(buffer.getvalue().encode("utf-8"))

    print(f"Buy3Get1 rows re-represented : {stats['rewritten']:,}")
    print(f"mean effective discount      : {100 * disc / stats['rewritten']:.2f}%")
    print(f"Buy3Get1 Trade Spend         : {ts_before/1e7:.2f}Cr -> {ts_after/1e7:.2f}Cr "
          f"({(ts_after/ts_before - 1) * 100:+.2f}%  -- expected ~0%)")
    print(f"written                      : {args.destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
