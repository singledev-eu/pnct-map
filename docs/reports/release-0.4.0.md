# Release 0.4.0: protected areas

2026-10-17. Protected-areas overlays (RNAP from ICNF, Natura 2000 from the EEA end-2024 release) and the share of each parish and concelho under protection. Details: [protected-areas](protected-areas.md), [protected-areas-delta](protected-areas-delta.md).

| Step | Result |
|---|---|
| `main` | Fast-forwarded to `e6fb58d`, pushed. Release commit `30a0233` (CHANGELOG date 2026-10-17, roadmap). |
| Preview | https://preview.pnct-map.pages.dev (deployment https://36f20ebf.pnct-map.pages.dev). Suite green before upload; e2e against the preview 63/63, 0 flaky. Phone check OK. |
| Production | `npm run deploy`: pytest 72, Vitest 83, e2e 63 before upload, all green. Deployment https://c44a84be.pnct-map.pages.dev, live at https://pnct.singledev.eu |
| Production check | `E2E_BASE_URL=https://pnct.singledev.eu/ npm run test:e2e:remote`: **63/63 passed, 0 flaky**. |
| Tag | `v0.4.0` (annotated) on `30a0233`, pushed. |
| GitHub release | https://github.com/singledev-eu/pnct-map/releases/tag/v0.4.0, notes from the CHANGELOG 0.4.0 entry, marked **Latest**. |

## Still open

- **ICNF reuse terms:** RNAP is credited as "reuse terms not confirmed"; the user is emailing ICNF. To drop RNAP, set `CATEGORIES["rnap"] = None` in `scripts/protected_config.py` and run `make protected`.
- **Possible 0.4.1:** fade the Natura 2000 hatch at country zoom. The user will decide after seeing 0.4.0 on the phone.
