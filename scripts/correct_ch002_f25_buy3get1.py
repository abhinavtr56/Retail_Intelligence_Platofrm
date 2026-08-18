"""Cost the CH002 F25 Buy3Get1 free goods, which the generator never charged for.

WHY
---
CH002 F25 reported ROI 540.1%. The cause is not the KPI engine — it is that
Buy3Get1 is generated with `PRICE_DISCOUNT = 0` ("Buy3Get1 is not a literal
price discount", per the channel notebooks) and only the flat 3%
`PROMOTION_COST_RATE`, while still carrying the full 60-72% uplift. The free
units are handed to the customer and charged to nobody.

Measured on the live file before this change, CH002 F25:

    Buy3Get1 produced  102,689,790  of  119,204,913  incremental sales (86.1%)
    on only              7,667,249  of   18,621,673  trade spend       (41.2%)
    -> per-offer ROI of 1,105% to 1,334%, against 38-88% for the real discounts.

THE CORRECTION (approved)
-------------------------
Value the free goods at what they cost to make, and keep the promotional
overhead every other promotion carries:

    Promotion_Cost = Base_Revenue x ( PROMOTION_COST_RATE + free_share x MANUFACTURING_COST_RATE )
                   = Base_Revenue x ( 0.03                + 0.25       x 0.65 )
                   = Base_Revenue x 0.1925

`free_share = 0.25` is the arithmetic of the mechanic: one unit in every four
shipped is free. `MANUFACTURING_COST_RATE = 0.65` is the generator's own
constant. Neither number is tuned to hit an ROI target — the resulting 98.2%
falls out of the mechanic.

Chosen over the alternatives after simulating all four:

    free goods costed nowhere (current)            ROI 540.1%
    forgone revenue as a price effect (75% list)   ROI  13.4%
    forgone revenue as a cost (3% + 25%)           ROI  44.5%
    COGS + 3% overhead  (this one)                 ROI  98.2%
    COGS replacing the 3%                          ROI 127.1%

SCOPE — deliberately narrow, and a known inconsistency
------------------------------------------------------
Only rows that are ALL of: Channel CH002, calendar year 2025, and a Buy3Get1
promotion (PB*25). Nothing else in the file is read for writing.

That means the same Buy3Get1 Promotion_Ids keep the old, uncosted economics in
CH001/CH003/CH004/CH005, where they each run only 6 promotional weeks against
CH002's 25. This is an accepted deviation, not an oversight: those four channels
are required to stay byte-identical. If the treatment is ever applied globally,
this script is the definition to reuse.

WHAT IS NOT TOUCHED
-------------------
Base_Quantity, Actual_Quantity, Base_Price, Actual_Price, Base_Revenue,
Actual_Revenue, Total_Cost, Promotion_Id, Date, Week, Month, Store_Id,
Product_id, Schedule, row order, row count. Promotional uplift is unchanged, so
Incremental Units and Incremental Sales are unchanged; only Trade Spend moves.
"""

from __future__ import annotations

import csv
import io
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
FACT = REPO / "Data" / "fact_sales_2024_2025_all_channels.csv"

CHANNEL = "CH002"
YEAR = "2025"

#: Generator constants, verified against the live file.
PROMOTION_COST_RATE = 0.03
MANUFACTURING_COST_RATE = 0.65

#: One unit in every four shipped is free under Buy 3 Get 1.
FREE_GOODS_SHARE = 0.25

#: The corrected rate: promotional overhead plus the cost of the free goods.
BUY3GET1_COST_RATE = PROMOTION_COST_RATE + FREE_GOODS_SHARE * MANUFACTURING_COST_RATE


def is_buy3get1(promotion_id: str) -> bool:
    """The 2025 seasonal calendar is Buy3Get1; the 2024 one is a 20% discount.

    Verified on the live file: every CH002 PB*25 row carries
    Actual_Price / Base_Price = 1.0000 exactly (no price discount), which is
    what leaves the mechanic uncosted.
    """
    return promotion_id.startswith("PB") and promotion_id.endswith("25")


def targets(row: dict[str, str]) -> bool:
    return (
        row["Channel_Id"] == CHANNEL
        and row["Date"].strip().endswith(YEAR)
        and is_buy3get1(row["Promotion_Id"].strip())
    )


def main() -> int:
    if not FACT.is_file():
        print(f"missing {FACT}", file=sys.stderr)
        return 1
    try:
        FACT.open("ab").close()
    except PermissionError as exc:
        print(f"ABORT: live file is locked ({exc}). Close it and re-run.", file=sys.stderr)
        return 2

    with FACT.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames
        rows = list(reader)

    stats = Counter()
    before_cost = after_cost = 0.0
    for row in rows:
        if not targets(row):
            continue
        base_revenue = float(row["Base_Revenue"])
        old = float(row["Promotion_Cost"])
        # Guard: only rewrite rows that carry the uncosted 3% rate. If a row
        # already looks corrected the input is not what this script assumes.
        if abs(old - round(PROMOTION_COST_RATE * base_revenue)) > 1.01:
            print(
                f"ABORT: {row['Transaction_Id']} does not carry the expected 3% "
                f"promotion cost (found {old}, expected "
                f"{round(PROMOTION_COST_RATE * base_revenue)}). Already corrected?",
                file=sys.stderr,
            )
            return 3
        new = round(BUY3GET1_COST_RATE * base_revenue)
        row["Promotion_Cost"] = str(int(new))
        before_cost += old
        after_cost += new
        stats["rewritten"] += 1

    if not stats["rewritten"]:
        print("ABORT: no CH002 2025 Buy3Get1 rows matched.", file=sys.stderr)
        return 4

    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=header, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    FACT.write_bytes(buffer.getvalue().encode("utf-8"))

    print(f"rate: {PROMOTION_COST_RATE:.2%} overhead + {FREE_GOODS_SHARE:.0%} free "
          f"x {MANUFACTURING_COST_RATE:.0%} COGS = {BUY3GET1_COST_RATE:.2%} of Base_Revenue")
    print(f"rows rewritten     : {stats['rewritten']:,}  (CH002, {YEAR}, Buy3Get1 only)")
    print(f"Promotion_Cost     : {before_cost:,.0f} -> {after_cost:,.0f} "
          f"(+{after_cost - before_cost:,.0f})")
    print(f"written            : {FACT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
