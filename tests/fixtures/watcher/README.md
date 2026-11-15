# Source watcher fixtures

Responses for `tests/test_source_watcher.py` (no network in tests).

- **Recorded on 2026-11-15** from the real sources, trimmed to what the watcher reads:
  - `hazard_head.json`: the HEAD of the ICNF zip;
  - `catalogo_tema5_excerpt.html`: the ICNF catalogue row that links it;
  - `dados_*.json`: the dados.gov.pt API, with only licence and resources;
  - `anacom_rede_fixa.json`: the ArcGIS service, whose capabilities are "Map";
  - `snig_ren.xml`: the SNIG record's two use constraints, in a minimal ISO 19139 wrapper;
  - `wfs_algarve_500.html`, `wms_pt1_500.html`: DGT's HTTP 500 error pages.
- **Synthetic**, for states that could not be recorded (the DGT WFS was down): `wfs_capabilities_ok.xml`, `wfs_getfeature_ok.xml`, `ows_exception.xml`. Each says so in a comment.

The tests derive the changed states (a new SHA, a licence change, a file resource) from these files.
