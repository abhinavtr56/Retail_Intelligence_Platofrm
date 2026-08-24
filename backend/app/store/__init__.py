"""Durable storage for scenarios and decisions -- B10.

Four modules, one job each:

    fingerprint.py  which data a computation was made against
    db.py           the SQLite connection and the append-only schema
    repository.py   the only place that reads or writes scenarios and decisions
    reports.py      the Report Center's library of generated artifacts

EVERY WRITE IN THIS PROJECT LIVES IN THIS PACKAGE, and
tests/test_store_persistence.py enforces it -- no module outside app/store/ may
contain sqlite3 or an INSERT. That is why reports.py is here rather than beside
the report writers that use it.

repository.py AND reports.py ARE SEPARATE ON PURPOSE. Scenario and decision
history is append-only and guarded as such; a generated report is a derived
artifact that can be deleted and regenerated. Keeping them in one file would
have meant weakening that guard.

Nothing here computes a KPI, an uplift, a comparison, a recommendation, a risk
finding or a weekly value. The frozen contracts in app/tpo/ produce those; this
package records what they produced, and says what it was computed from.
"""
