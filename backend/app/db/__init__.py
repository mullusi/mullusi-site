"""
Purpose: mark PostgreSQL persistence modules for Mullusi Govern Cloud.
Governance scope: append-only evaluation, trace, violation, and proof-stamp storage.
Dependencies: repository modules import drivers lazily so core evaluation remains dependency-free.
Invariants: package import must not open database connections or read secrets.
"""
