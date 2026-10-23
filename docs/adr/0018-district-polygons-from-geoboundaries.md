# ADR-0018: District polygons from geoBoundaries instead of GADM

- **Status:** Accepted
- **Date:** 2026-10-23
- **Partially supersedes:** [ADR-0013](0013-area-legacy-district-from-polygons.md) (its data source, and the `q2`/`q9` → `thu_duc` alias line)

## Context

ADR-0013 planned to commit a GADM-derived JSON of the pre-2025 HCMC districts. GADM's licence says "Redistribution or commercial use is not allowed without prior permission", and this repository is public (it is a portfolio project). Committing GADM-derived geometry would be redistribution.

## Options

1. **GADM, downloaded at build time and never committed.** Keeps the repo clean, but adds a build step, and the data is still bundled into a deployed artefact (the worker Lambda), which is again redistribution of a kind.
2. **geoBoundaries `gbOpen` VNM ADM2** (boundaryID `VNM-ADM2-81297802`, year represented 2020, source OCHA ROAP / Government of Viet Nam, licence CC BY 3.0 IGO). Can be committed and deployed with attribution.
3. **OpenStreetMap admin boundaries (ODbL).** After the 2025 reform OSM no longer reliably maps the old districts, and ODbL's share-alike adds obligations for the derived database.

## Decision

Option 2, pinned to geoBoundaries commit `9469f09`.

- The 24 HCMC districts are selected by `shapeID`, never by name (`Binh Tan` and `Tan Phu` also exist in other provinces).
- No simplification: at 5 decimals (~1 m) the 24 polygons are ~180 KB, so `mapshaper` buys nothing.
- Keys keep the 2020 split: `q2`, `q9` and `thu_duc` are three separate values (the open data predates the 2021 merge into Thủ Đức city). Nothing is lost by this; S4's alias table maps "thủ đức" / "tp thủ đức" to all three.
- The JSON is imported only through the subpath `@angiday/shared/legacy-district`, to keep it out of any client bundle.

## Consequences

- Attribution is required: `packages/shared/src/area/SOURCE.md`, the README and the web footer.
- Districts are as of 2020; places in areas outside the 24 polygons (old Bà Rịa–Vũng Tàu / Bình Dương, now part of HCMC) get `legacyDistrict = null` and fall back to ward · city.
- Verified at plan time that 12 known landmarks land in the right district (these become the tests in S2 Task 3).
- The rest of ADR-0013 (the area model, the alias-table approach at query time) is unchanged.
