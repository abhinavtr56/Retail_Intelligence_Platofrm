"""Durable storage for scenarios and decisions -- B10.

Three modules, one job each:

    fingerprint.py  which data a computation was made against
    db.py           the SQLite connection and the append-only schema
    repository.py   the only place that reads or writes the store

Nothing here computes a KPI, an uplift, a comparison, a recommendation, a risk
finding or a weekly value. The frozen contracts in app/tpo/ produce those; this
package records what they produced, and says what it was computed from.
"""
