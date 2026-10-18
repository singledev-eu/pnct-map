CAOP_URL := https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip
CAOP_SHA256 := 87cd67f4b1fbadf23d9324e6fb231ff05531e4db347af36ccc7c6cbabe3ecd1d
CAOP_ZIP := data/external/CAOP_Continente_2025-gpkg.zip
CAOP_GPKG := data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg
PNCT_URL := https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf
PNCT_SHA256 := c286ef77c16321e8c5124eeb92f8d3f0565dbe302787817a91fe526653e7cffc
PNCT_PDF := data/raw/territorios-pnct-2026-02-04.pdf
PY := uv run python

.PHONY: all download parse match geo web-data shapes outline protected-fetch protected concelhos-fetch concelhos test web e2e clean

all: web-data shapes outline protected concelhos test

download: $(CAOP_GPKG) $(PNCT_PDF)

$(PNCT_PDF):
	mkdir -p data/raw
	curl -sSfL -o $@.part "$(PNCT_URL)"
	echo "$(PNCT_SHA256)  $@.part" | shasum -a 256 -c -
	mv $@.part $@

$(CAOP_ZIP):
	mkdir -p data/external
	curl -sSfL -o $@.part $(CAOP_URL)
	echo "$(CAOP_SHA256)  $@.part" | shasum -a 256 -c -
	mv $@.part $@

$(CAOP_GPKG): $(CAOP_ZIP)
	unzip -oq $< -d $(dir $@)
	touch $@

parse: data/interim/pnct_raw.csv
data/interim/pnct_raw.csv: scripts/parse_pdf.py $(PNCT_PDF)
	$(PY) scripts/parse_pdf.py

match: data/processed/pnct_parishes.csv
data/processed/pnct_parishes.csv: scripts/build_parishes.py data/interim/pnct_raw.csv data/overrides.csv $(CAOP_GPKG)
	$(PY) scripts/build_parishes.py

geo: data/processed/parishes_all.geojson
data/processed/parishes_all.geojson: scripts/build_geo.py data/processed/pnct_parishes.csv $(CAOP_GPKG)
	$(PY) scripts/build_geo.py

web-data: web/data/pnct.topo.json
web/data/pnct.topo.json: scripts/build_topo.py data/processed/parishes_all.geojson
	$(PY) scripts/build_topo.py

shapes: web/data/shapes.json
web/data/shapes.json: scripts/build_shapes.py scripts/polyline.py data/processed/pnct_parishes.csv $(CAOP_GPKG)
	$(PY) scripts/build_shapes.py

outline: web/data/outline.json
web/data/outline.json: scripts/build_outline.py $(CAOP_GPKG)
	$(PY) scripts/build_outline.py

# Protected areas (RNAP, Natura 2000): sources in scripts/protected_config.py. The fetch caches
# the downloads in data/external/protected/ and is re-run explicitly (`make protected-fetch`,
# REFRESH=1 to download file sources again); `make protected` fetches only what is missing.
PROTECTED_FETCHED := data/external/protected/.fetched
protected-fetch:
	$(PY) scripts/fetch_protected.py $(if $(REFRESH),--refresh)
	touch $(PROTECTED_FETCHED)

$(PROTECTED_FETCHED): scripts/protected_config.py scripts/fetch_protected.py
	$(PY) scripts/fetch_protected.py
	touch $@

protected: web/data/protection.json
web/data/protection.json: scripts/build_protected.py scripts/protected_config.py $(PROTECTED_FETCHED) data/processed/parishes_all.geojson $(CAOP_GPKG)
	$(PY) scripts/build_protected.py

# Concelho card: INE population indicators (scripts/concelhos_config.py) and the curated câmara
# contacts (data/contacts/camaras.csv). `make concelhos-fetch` re-downloads (REFRESH=1 to replace the
# cache, e.g. for next year's estimates); `make concelhos` fetches only what is missing.
INE_FETCHED := data/external/ine/fetch.json
concelhos-fetch:
	$(PY) scripts/fetch_ine.py $(if $(REFRESH),--refresh)

$(INE_FETCHED): scripts/concelhos_config.py scripts/fetch_ine.py
	$(PY) scripts/fetch_ine.py

concelhos: web/data/concelhos.json
web/data/concelhos.json: scripts/build_concelhos.py scripts/concelhos_config.py scripts/validate_contacts.py $(INE_FETCHED) data/contacts/camaras.csv $(CAOP_GPKG)
	$(PY) scripts/build_concelhos.py

test:
	uv run pytest -q

web: web-data shapes outline protected concelhos
	cd web && npm ci && npm test && npm run build

e2e: web-data shapes outline protected concelhos
	cd web && npm ci && npm run test:e2e

clean:
	rm -rf data/interim data/processed web/data
