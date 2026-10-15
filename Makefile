CAOP_URL := https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip
CAOP_SHA256 := 87cd67f4b1fbadf23d9324e6fb231ff05531e4db347af36ccc7c6cbabe3ecd1d
CAOP_ZIP := data/external/CAOP_Continente_2025-gpkg.zip
CAOP_GPKG := data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg
PNCT_URL := https://www.iefp.pt/documents/10181/4287418/Territorios+PNCT_04-02-2026.pdf
PNCT_SHA256 := c286ef77c16321e8c5124eeb92f8d3f0565dbe302787817a91fe526653e7cffc
PNCT_PDF := data/raw/territorios-pnct-2026-02-04.pdf
PY := uv run python

.PHONY: all download parse match geo web-data shapes outline test web e2e clean

all: web-data shapes outline test

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

test:
	uv run pytest -q

web: web-data shapes outline
	cd web && npm ci && npm test && npm run build

e2e: web-data shapes outline
	cd web && npm ci && npm run test:e2e

clean:
	rm -rf data/interim data/processed web/data
