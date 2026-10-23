# Source of `hcmc-legacy-districts.json`

- **Dataset:** geoBoundaries `gbOpen` Viet Nam ADM2, boundaryID `VNM-ADM2-81297802`
- **Version:** repository `wmgeolab/geoBoundaries`, commit `9469f09`
- **Year represented:** 2020 (before the 2021 Thủ Đức merge and the 2025 admin reform)
- **Source:** OCHA ROAP / Government of Viet Nam
- **Licence:** [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/) — attribution required (README and web footer)
- **Changes:** selected the 24 HCMC districts by `shapeID`, coordinates rounded to 5 decimals, `bbox` added. Nothing else.
- **Why not GADM:** its licence forbids redistribution, see [ADR-0018](../../../../docs/adr/0018-district-polygons-from-geoboundaries.md).

## Regenerate

```bash
curl -L -o "$TMP/vnm-adm2.geojson" https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/VNM/ADM2/geoBoundaries-VNM-ADM2.geojson
node packages/shared/scripts/build-hcmc-districts.mjs "$TMP/vnm-adm2.geojson"
```
