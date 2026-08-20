"""Promotion ASSIGNMENT schedule validation (read-only).

Checks that every promotion sits in the business month the TPO promotion
strategy assigns it to. Nothing here writes: it reads the live CSVs and reports.

THE ONE MONTH MAPPING
---------------------
    Year + Week  ->  dim_date2425_corrected.csv  ->  week-start month

`fact_sales.Date` and `fact_sales.Month` are NOT used to decide a promotion's
month. 25.1% of fact rows carry a Date outside their own (Year, Week) window
(CH002/CH004/CH005 ~39.4% each; CH001/CH003 0%), which is why the loader
recovers the month from the week and why this script does the same. Year is
still taken from Date because it is the only year source in the schema — no row
crosses a year boundary, so that is safe.

WHY THIS EXISTS
---------------
The Promotion Calendar was audited against this same derivation and reproduced
the source exactly in 120/120 cells. The off-month promotions it shows are real
assignments, not a display fault. This script is the gate that fails when the
assignment data drifts from the strategy, so the same class of defect cannot be
reintroduced silently by a future regeneration.

WHY THE OBVIOUS FIX DOES NOT WORK
---------------------------------
Moving an off-month promotion into a legal week of its own month looks like a
safe, economics-neutral correction. It is not, and this was proven empirically:

    fact_sales holds EXACTLY ONE row per (Product_id, Store_Id, Year, Week).

The target week is therefore never empty -- it already carries a row for that
product and store, normally a No-Promotion (-1) row. Rewriting a stray row's
Week does not move it into a free slot, it creates a SECOND row at that grain.
A trial correction of 405 rows produced 405 duplicate (Product, Store, Year,
Week) grains, 36 grains carrying both No-Promotion and a promotion, and an
uneven rows-per-week shape that broke
`tests/test_month_semantics.py::test_every_channel_shares_one_monthly_shape`
(all five channels must share one normalised monthly row distribution). The
attempt was reverted; the data is untouched.

The only correct repair is a SWAP: exchange Promotion_Id between the stray
row and the target week's row, then recompute both rows' promotion-dependent
values (Actual_Price, Promotion_Cost, and the uplift applied to quantities)
using the generator's own discount and uplift tables. That changes promotion
economics on both rows, so it cannot be done without the original generator.
Every off-month assignment is therefore CLASS 2 -- blocked pending
TPO_FINAL/*.ipynb or an authoritative generation rule.

Run:  python scripts/validate_promotion_schedule.py
Exit: 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import collections
import csv
import sys
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "Data"
FACT = DATA / "fact_sales_2024_2025_all_channels.csv"
DIM_DATE = DATA / "dim_date2425_corrected.csv"
DIM_PROMO = DATA / "dim_promotion_final.csv"
DIM_PRODUCT = DATA / "dim_product_reordered.csv"

NO_PROMOTION = "-1"

#: Cadence per channel — the project's stated channel structure, matching
#: app/tpo/promo_calendar.CADENCE.
MONTHLY_CHANNELS = {"CH002", "CH003", "CH005"}
WEEKLY_CHANNELS = {"CH001", "CH004"}

#: The established seasonal calendar, keyed by the event token inside the
#: Promotion_Id (PB**NY**25 -> "NY"). Diwali is the only event that moves:
#: November in 2024, October in 2025.
EVENT_MONTH: dict[str, dict[int, int]] = {
    "NY": {2024: 1, 2025: 1},
    "HO": {2024: 3, 2025: 3},
    "SU": {2024: 5, 2025: 5},
    "IN": {2024: 8, 2025: 8},
    "DU": {2024: 10, 2025: 10},
    "DI": {2024: 11, 2025: 10},
}

_failures = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global _failures
    if not ok:
        _failures += 1
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    if detail:
        for line in detail.splitlines():
            print(f"         {line}")


def _read(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def _parse_date(value: str) -> date:
    day, month, year = value.strip().split("-")
    return date(int(year), int(month), int(day))


def week_start_month() -> dict[tuple[int, int], int]:
    """(Year, Week) -> the month its FIRST calendar day falls in.

    A business week can straddle a month boundary (2025 W40 runs 29 Sep - 5 Oct);
    the project resolves such a week to the month it starts in.
    """
    first: dict[tuple[int, int], date] = {}
    for row in _read(DIM_DATE):
        key = (int(row["Year"]), int(row["Week"]))
        day = _parse_date(row["Date"])
        if key not in first or day < first[key]:
            first[key] = day
    return {key: day.month for key, day in first.items()}


def _pack_size(size: str) -> float:
    """Leading number of a pack size ("250 mL" -> 250.0). Mirrors the loader."""
    digits = ""
    for ch in size.strip():
        if ch.isdigit() or (ch == "." and digits):
            digits += ch
        elif digits:
            break
    return float(digits) if digits else 0.0


def _ranks(products: dict[str, dict[str, str]]) -> dict[str, int]:
    """Product_id -> 1-4 by pack size inside its Brand Form."""
    by_brand: dict[str, list[str]] = collections.defaultdict(list)
    for pid, row in products.items():
        by_brand[row["Brand"].strip()].append(pid)
    ranked: dict[str, int] = {}
    for pids in by_brand.values():
        for position, pid in enumerate(
            sorted(pids, key=lambda p: _pack_size(products[p]["Size"])), start=1
        ):
            ranked[pid] = position
    return ranked


def main() -> int:
    month_of = week_start_month()
    promotions = {r["Promotion_Id"].strip(): r for r in _read(DIM_PROMO)}
    products = {r["Product_id"].strip(): r for r in _read(DIM_PRODUCT)}
    fact = _read(FACT)


    print(f"Promotion schedule validation — {FACT.name}")
    print(f"  rows: {len(fact):,}   promotions: {len(promotions)}   products: {len(products)}\n")

    # --- A. seasonal events land in their designated month ------------------
    off_month: dict[tuple[str, int], set[tuple[str, int, int, int]]] = collections.defaultdict(set)
    unresolved: set[tuple[int, int]] = set()
    for row in fact:
        pid = row["Promotion_Id"].strip()
        if not pid.startswith("PB"):
            continue
        year = _parse_date(row["Date"]).year
        week = int(row["Week"])
        month = month_of.get((year, week))
        if month is None:
            unresolved.add((year, week))
            continue
        expected = EVENT_MONTH.get(pid[2:4], {}).get(year)
        if expected is not None and month != expected:
            off_month[(row["Channel_Id"].strip(), year)].add((pid, week, month, expected))

    total_off = sum(len(v) for v in off_month.values())
    detail = "\n".join(
        f"{ch} {yr}: " + ", ".join(f"{p} W{w:02d}->M{got} (expected M{exp})" for p, w, got, exp in sorted(v))
        for (ch, yr), v in sorted(off_month.items())
    )
    check("A. seasonal promotions fall in their event month", total_off == 0,
          detail if total_off else "")

    check("G. every (Year, Week) resolves through dim_date", not unresolved,
          f"unresolved: {sorted(unresolved)[:8]}" if unresolved else "")

    # --- B. monthly channels: one treatment per product x channel x year x month
    treatments: dict[tuple[str, str, int, int], set[str]] = collections.defaultdict(set)
    for row in fact:
        pid = row["Promotion_Id"].strip()
        if pid == NO_PROMOTION:
            continue
        channel = row["Channel_Id"].strip()
        if channel not in MONTHLY_CHANNELS:
            continue
        year = _parse_date(row["Date"]).year
        month = month_of.get((year, int(row["Week"])))
        if month is None:
            continue
        treatments[(row["Product_id"].strip(), channel, year, month)].add(pid)

    # October 2025 legitimately carries Dussehra + Diwali together — the
    # approved multi-event month. Everything else with two treatments on one
    # product in one month is a violation.
    def approved(key, pids) -> bool:
        return key[2] == 2025 and key[3] == 10 and pids <= {"PBDU25", "PBDI25"}

    real = {k for k, pids in treatments.items() if len(pids) > 1 and not approved(k, pids)}
    # Split by cause: a seasonal event sitting on top of another treatment is a
    # different defect from two regular discounts colliding, and the two need
    # different fixes. Counting the approved October pairs as violations, as an
    # earlier version did, overstated CH003 and CH005.
    by_cause = collections.defaultdict(lambda: [0, 0])
    for key in real:
        pids = treatments[key]
        by_cause[(key[1], key[2])][0 if all(x.startswith("PR") for x in pids) else 1] += 1
    check("B. monthly channels carry one treatment per product-month",
          not real,
          "\n".join(
              f"{ch} {yr}: {reg + sea} violations "
              f"({reg} regular-vs-regular, {sea} involving a seasonal event)"
              for (ch, yr), (reg, sea) in sorted(by_cause.items())
          ) if real else "")

    # --- C. weekly channels keep Dussehra and Diwali separate in Oct 2025 ----
    weeks_of: dict[tuple[str, str], set[int]] = collections.defaultdict(set)
    for row in fact:
        pid = row["Promotion_Id"].strip()
        if pid in ("PBDU25", "PBDI25"):
            weeks_of[(row["Channel_Id"].strip(), pid)].add(int(row["Week"]))
    separate = all(
        weeks_of.get((ch, "PBDU25"), set()).isdisjoint(weeks_of.get((ch, "PBDI25"), set()))
        for ch in WEEKLY_CHANNELS
    )
    check("C. weekly channels keep Dussehra and Diwali in separate weeks", separate,
          "\n".join(f"{ch}: PBDU25 {sorted(weeks_of.get((ch,'PBDU25'), ()))} / "
                    f"PBDI25 {sorted(weeks_of.get((ch,'PBDI25'), ()))}" for ch in sorted(WEEKLY_CHANNELS)))

    # --- E. P1 is never promoted --------------------------------------------
    # Rank comes from pack SIZE within the Brand Form, exactly as
    # app/tpo/loader.py derives it. dim_product carries no Rank column, and
    # ordering by Product_id instead would rank "P11-100ml" above "P11-50ml"
    # and report a false violation.
    ranked = _ranks(products)
    promoted_p1 = {
        row["Product_id"].strip() for row in fact
        if row["Promotion_Id"].strip() != NO_PROMOTION
        and ranked.get(row["Product_id"].strip()) == 1
    }
    check("E. P1 (smallest SKU) is never promoted", not promoted_p1,
          f"promoted P1 ids: {sorted(promoted_p1)[:10]}" if promoted_p1 else "")

    # --- F. no conflicting promotion at the assignment grain ----------------
    grain: dict[tuple[str, str, int, int], set[str]] = collections.defaultdict(set)
    for row in fact:
        pid = row["Promotion_Id"].strip()
        if pid == NO_PROMOTION:
            continue
        year = _parse_date(row["Date"]).year
        grain[(row["Product_id"].strip(), row["Channel_Id"].strip(), year, int(row["Week"]))].add(pid)
    conflicting = {k: v for k, v in grain.items() if len(v) > 1}
    check("F. one Promotion_Id per Product x Channel x Year x Week", not conflicting,
          f"{len(conflicting)} conflicting keys, e.g. {list(conflicting.items())[:3]}" if conflicting else "")

    # --- integrity: every Promotion_Id has metadata -------------------------
    unknown = {row["Promotion_Id"].strip() for row in fact} - set(promotions)
    check("promotion ids all resolve in dim_promotion_final.csv", not unknown,
          f"unknown: {sorted(unknown)}" if unknown else "")

    print()
    if _failures:
        print(f"{_failures} check(s) FAILED — promotion assignments do not match the strategy.")
        print("This script does not modify data. Correct the assignment generator and re-run.")
    else:
        print("All checks passed.")
    return 1 if _failures else 0


if __name__ == "__main__":
    sys.exit(main())
