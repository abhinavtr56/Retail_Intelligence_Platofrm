"""The data layer: the five finalized TPO CSVs -> one cached, in-memory store.

Loaded ONCE at first use and reused by every endpoint. The spec is explicit
that four endpoints must not each re-read the CSVs, so nothing here runs per
request except `filter_rows`, which walks already-parsed columns.

Layout is columnar: one array per field, dimensions held as integer codes into
a lookup table. 205,920 rows of Python objects would be tens of MB and slow to
scan; as `array('d')`/`array('i')` columns it is a few MB and a filter pass is
a tight loop over ints. Nothing here computes a KPI — this module only loads,
joins and indexes. See app/tpo/aggregate.py for the arithmetic.
"""

from __future__ import annotations

import csv
import re
from array import array
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Iterator

from app.tpo import config

#: Promotion_Id on a non-promoted row. The baseline every uplift is measured
#: against is built from exactly these rows, so this constant is load-bearing.
NO_PROMOTION = "-1"


# --- dimension records -----------------------------------------------------


@dataclass(frozen=True)
class Product:
    product_id: str
    name: str
    brand: str  # the Brand Form — 4 pack sizes share one
    category: str
    size: str
    cost: float
    rank: int  # 1-4 by pack size within the Brand Form; 1 is never promoted


@dataclass(frozen=True)
class Store:
    store_id: str
    channel_id: str
    retailer: str
    distributor: str
    region: str
    state: str
    city: str
    tier: str


@dataclass(frozen=True)
class Promotion:
    promotion_id: str
    name: str
    type: str  # Normal | Regular | Seasonal
    description: str

    @property
    def is_promotional(self) -> bool:
        return self.promotion_id != NO_PROMOTION

    @property
    def label(self) -> str:
        """THE display name for an offer — one source, used everywhere.

        `Promotion_Name` is NOT unique: seven promotions are called
        "20% Discount" and seven "Buy3Get1", because the seasonal calendar
        reuses the mechanic as the name. Rendering that put six identical
        entries in the Offer dropdown.

        `Promotion_Description` is unique across all 18 rows ("New Year
        Savings 24", "Diwali Special 25"), so it is the label. Both the filter
        options and the promotion-mix legend read this property, so the two can
        no longer disagree about what an offer is called.
        """
        return self.description.strip() or self.name.strip() or self.promotion_id


@dataclass(frozen=True)
class Channel:
    channel_id: str
    name: str
    type: str


# --- parsing helpers -------------------------------------------------------


def _clean(value: str | None) -> str:
    """Trim a dimension value. Several dim_product / dim_promotion cells carry
    stray leading spaces (" Liquid Laundry Detergent 50 mL"), which would
    otherwise split one brand into two filter options."""
    return (value or "").strip()


def _float(value: str | None) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


_SIZE_NUMBER = re.compile(r"([\d.]+)")


def _pack_size(size: str) -> float:
    """Leading number of a pack size ("250 mL" -> 250.0), for ranking within a
    Brand Form. Units are consistent inside a Brand Form — every Laundry
    Detergent is mL, every Dryer Sheet is ct — so the number alone orders them.
    """
    match = _SIZE_NUMBER.match(_clean(size))
    return float(match.group(1)) if match else 0.0


def _read_csv(path: Path) -> Iterator[dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(
            f"TPO dataset not found: {path}. "
            f"Set TPO_DATA_DIR to the folder holding the finalized CSVs."
        )
    # utf-8-sig: dim_promotion_final.csv carries a BOM, which would otherwise
    # turn its first header into a key no lookup matches.
    with path.open(newline="", encoding="utf-8-sig") as handle:
        yield from csv.DictReader(handle)


MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
_MONTH_NUMBER = {name: i for i, name in enumerate(MONTHS, start=1)}


def _parse_date(value: str) -> date:
    """The datasets write dates as DD-MM-YYYY throughout."""
    day, month, year = _clean(value).split("-")
    return date(int(year), int(month), int(day))


# --- dimensions ------------------------------------------------------------


@dataclass
class Dimensions:
    products: dict[str, Product]
    stores: dict[str, Store]
    promotions: dict[str, Promotion]
    channels: dict[str, Channel]
    #: (year, week) -> the calendar days that business week covers, from
    #: dim_date. Used to tell a whole week from one clipped by a month filter.
    week_dates: dict[tuple[int, int], list[date]]

    @property
    def week_start(self) -> dict[tuple[int, int], date]:
        """(year, week) -> the first calendar day of that business week.

        THE source of the analytical month. `fact_sales.Month` cannot be used:
        the CH002 and CH004 generators set `Date = Week_Start` but never
        re-derived Month from it (CH004 literally writes
        `fact_sales["Month"] = fact_sales["Month"]`), and CH002/CH004/CH005
        also carry a scrambled `Date` — 51.9% of their rows disagree with the
        Week_Start dim_date gives for their own (Year, Week). Together those
        put 46,440 of 205,920 rows (22.6%) in the wrong month.

        `Week` is intact in every row and dim_date is clean (Month is strictly
        calendar, 0 mismatches), so the month is recovered by joining on the
        week. This reproduces the two known-good channels exactly and gives all
        five the same monthly shape.
        """
        return {key: min(days) for key, days in self.week_dates.items()}


def _load_products(data_dir: Path) -> dict[str, Product]:
    """dim_product, with each SKU's rank inside its Brand Form derived here.

    The rank is what makes cannibalization possible: neighbours are the pack
    sizes immediately either side of a promoted one. It is computed from
    `Size`, never hardcoded, so a new pack slots in at the right position.
    """
    raw = [{k: _clean(v) for k, v in row.items()} for row in _read_csv(data_dir / config.DIM_FILES["product"])]

    by_brand: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in raw:
        by_brand[row["Brand"]].append(row)

    ranks: dict[str, int] = {}
    for rows in by_brand.values():
        ordered = sorted(rows, key=lambda r: (_pack_size(r["Size"]), r["Product_id"]))
        for position, row in enumerate(ordered, start=1):
            ranks[row["Product_id"]] = position

    return {
        row["Product_id"]: Product(
            product_id=row["Product_id"],
            name=row["Product_Name"],
            brand=row["Brand"],
            category=row["Category"],
            size=row["Size"],
            cost=_float(row["Cost"]),
            rank=ranks[row["Product_id"]],
        )
        for row in raw
    }


def _load_stores(data_dir: Path) -> dict[str, Store]:
    stores: dict[str, Store] = {}
    for raw in _read_csv(data_dir / config.DIM_FILES["geo_store"]):
        row = {k: _clean(v) for k, v in raw.items()}
        stores[row["Store_Id"]] = Store(
            store_id=row["Store_Id"],
            channel_id=row["Channel_Id"],
            retailer=row["Retailer"],
            distributor=row.get("Distributor_Name", ""),
            region=row["Region"],
            state=row["State"],
            city=row["City"],
            tier=row["Tier"],
        )
    return stores


def _load_promotions(data_dir: Path) -> dict[str, Promotion]:
    promotions: dict[str, Promotion] = {}
    for raw in _read_csv(data_dir / config.DIM_FILES["promotion"]):
        row = {k: _clean(v) for k, v in raw.items()}
        promotions[row["Promotion_Id"]] = Promotion(
            promotion_id=row["Promotion_Id"],
            name=row["Promotion_Name"],
            type=row["Promotion_Type"],
            description=row["Promotion_Description"],
        )
    return promotions


def _load_channels(data_dir: Path) -> dict[str, Channel]:
    channels: dict[str, Channel] = {}
    for raw in _read_csv(data_dir / config.DIM_FILES["channel"]):
        row = {k: _clean(v) for k, v in raw.items()}
        channels[row["Channel_Id"]] = Channel(
            channel_id=row["Channel_Id"],
            name=row["Channel_Name"],
            type=row["Channel_Type"],
        )
    return channels


def _load_week_dates(data_dir: Path) -> dict[tuple[int, int], list[date]]:
    """(year, week) -> its calendar days, straight from dim_date.

    The dataset numbers its own business weeks; this reads that numbering
    rather than re-deriving one. A week whose day count inside the selected
    period falls short of this is a fragment, and the week-average comparisons
    skip it.
    """
    weeks: dict[tuple[int, int], list[date]] = defaultdict(list)
    for row in _read_csv(data_dir / config.DIM_FILES["date"]):
        day = _parse_date(row["Date"])
        weeks[(int(row["Year"]), int(row["Week"]))].append(day)
    for days in weeks.values():
        days.sort()
    return dict(weeks)


# --- fact ------------------------------------------------------------------


@dataclass
class FactStore:
    """The fact table as parallel columns, dimensions as integer codes.

    `product_code`/`store_code`/`promo_code` index into `products`/`stores`/
    `promotions`, so a filter compares ints and never chases a dict lookup per
    row. `promoted` is precomputed for the same reason — it is read on every
    row of every pass.
    """

    dims: Dimensions

    products: list[Product] = field(default_factory=list)
    stores: list[Store] = field(default_factory=list)
    promotions: list[Promotion] = field(default_factory=list)

    # dimension codes, one entry per source row
    product_code: array = field(default_factory=lambda: array("i"))
    store_code: array = field(default_factory=lambda: array("i"))
    promo_code: array = field(default_factory=lambda: array("i"))
    year: array = field(default_factory=lambda: array("h"))
    month: array = field(default_factory=lambda: array("b"))
    week: array = field(default_factory=lambda: array("b"))
    promoted: array = field(default_factory=lambda: array("b"))

    # measures
    base_quantity: array = field(default_factory=lambda: array("d"))
    actual_quantity: array = field(default_factory=lambda: array("d"))
    base_revenue: array = field(default_factory=lambda: array("d"))
    actual_revenue: array = field(default_factory=lambda: array("d"))
    actual_price: array = field(default_factory=lambda: array("d"))
    total_cost: array = field(default_factory=lambda: array("d"))
    promotion_cost: array = field(default_factory=lambda: array("d"))

    @property
    def row_count(self) -> int:
        return len(self.product_code)

    def years(self) -> list[int]:
        return sorted(set(self.year))

    def week_span(self, year: int, week: int) -> int:
        """How many calendar days this business week has in dim_date. Normally
        7; the year-end stub is shorter."""
        return len(self.dims.week_dates.get((year, int(week)), ())) or 7


def _build_store(data_dir: Path) -> FactStore:
    dims = Dimensions(
        products=_load_products(data_dir),
        stores=_load_stores(data_dir),
        promotions=_load_promotions(data_dir),
        channels=_load_channels(data_dir),
        week_dates=_load_week_dates(data_dir),
    )
    store = FactStore(dims=dims)

    indexes: dict[str, dict[str, int]] = {"product": {}, "store": {}, "promotion": {}}
    tables: dict[str, list[Any]] = {
        "product": store.products, "store": store.stores, "promotion": store.promotions,
    }
    lookups: dict[str, dict[str, Any]] = {
        "product": dims.products, "store": dims.stores, "promotion": dims.promotions,
    }
    placeholders: dict[str, Callable[[str], Any]] = {
        "product": lambda k: Product(k, k, "", "", "", 0.0, 0),
        "store": lambda k: Store(k, "", "", "", "", "", "", ""),
        "promotion": lambda k: Promotion(k, k, "", ""),
    }
    unknown: dict[str, set[str]] = {"product": set(), "store": set(), "promotion": set()}
    # (Year, Week) pairs the fact carries that dim_date cannot resolve. The
    # analytical month depends on this join, so an unresolved pair must fail
    # loudly rather than silently fall back and misfile the row.
    unresolved: set[tuple[int, int]] = set()
    week_start = dims.week_start

    def code(kind: str, key: str) -> int:
        index = indexes[kind]
        existing = index.get(key)
        if existing is not None:
            return existing
        record = lookups[kind].get(key)
        if record is None:
            unknown[kind].add(key)
            record = placeholders[kind](key)
        tables[kind].append(record)
        index[key] = len(tables[kind]) - 1
        return index[key]

    for row in _read_csv(data_dir / config.FACT_FILE):
        promotion_id = _clean(row["Promotion_Id"])

        store.product_code.append(code("product", _clean(row["Product_id"])))
        store.store_code.append(code("store", _clean(row["Store_Id"])))
        store.promo_code.append(code("promotion", promotion_id))
        store.promoted.append(1 if promotion_id != NO_PROMOTION else 0)

        day = _parse_date(row["Date"])
        week = int(row["Week"])
        store.year.append(day.year)
        # The analytical month comes from (Year, Week) -> dim_date week start,
        # NOT from fact_sales.Month. See Dimensions.week_start for why.
        start = week_start.get((day.year, week))
        if start is None:
            unresolved.add((day.year, week))
            store.month.append(_MONTH_NUMBER.get(_clean(row["Month"]), day.month))
        else:
            store.month.append(start.month)
        store.week.append(week)

        store.base_quantity.append(_float(row["Base_Quantity"]))
        store.actual_quantity.append(_float(row["Actual_Quantity"]))
        store.base_revenue.append(_float(row["Base_Revenue"]))
        store.actual_revenue.append(_float(row["Actual_Revenue"]))
        store.actual_price.append(_float(row["Actual_Price"]))
        store.total_cost.append(_float(row["Total_Cost"]))
        store.promotion_cost.append(_float(row["Promotion_Cost"]))

    if unresolved:
        raise ValueError(
            f"{len(unresolved)} (Year, Week) pair(s) in {config.FACT_FILE} have no match in "
            f"{config.DIM_FILES['date']}, so their analytical month cannot be derived: "
            f"{sorted(unresolved)[:10]}. Either the fact carries a week the calendar does not "
            f"cover, or dim_date is truncated."
        )

    for kind, missing in unknown.items():
        if missing:
            # Loud, but not fatal: a fact row referencing an absent dimension
            # still carries real money, and is better counted under a blank
            # label than silently dropped out of Trade Spend.
            print(
                f"[tpo] warning: {len(missing)} {kind} id(s) in fact_sales are "
                f"missing from its dimension: {sorted(missing)[:5]}"
            )

    return store


@lru_cache(maxsize=1)
def get_store() -> FactStore:
    """The one loaded dataset, cached for the process lifetime."""
    return _build_store(config.DATA_DIR)
