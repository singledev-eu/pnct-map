CAOP_URL := https://geo2.dgterritorio.gov.pt/caop/CAOP_Continente_2025-gpkg.zip
CAOP_SHA256 := 87cd67f4b1fbadf23d9324e6fb231ff05531e4db347af36ccc7c6cbabe3ecd1d
CAOP_ZIP := data/external/CAOP_Continente_2025-gpkg.zip
CAOP_GPKG := data/external/CAOP_Continente_2025-gpkg/Continente_CAOP2025.gpkg
PY := uv run python

.PHONY: all download parse match geo test clean

all: geo test

download: $(CAOP_GPKG)

$(CAOP_ZIP):
	mkdir -p data/external
	curl -sSfL -o $@.part $(CAOP_URL)
	echo "$(CAOP_SHA256)  $@.part" | shasum -a 256 -c -
	mv $@.part $@

$(CAOP_GPKG): $(CAOP_ZIP)
	unzip -oq $< -d $(dir $@)
	touch $@

parse: data/interim/pnct_raw.csv
data/interim/pnct_raw.csv: scripts/parse_pdf.py data/raw/territorios-pnct-2026-02-04.pdf
	$(PY) scripts/parse_pdf.py

match: data/processed/pnct_parishes.csv
data/processed/pnct_parishes.csv: scripts/build_parishes.py data/interim/pnct_raw.csv data/overrides.csv $(CAOP_GPKG)
	$(PY) scripts/build_parishes.py

geo: data/processed/parishes_all.geojson
data/processed/parishes_all.geojson: scripts/build_geo.py data/processed/pnct_parishes.csv $(CAOP_GPKG)
	$(PY) scripts/build_geo.py

test:
	uv run pytest -q

clean:
	rm -rf data/interim data/processed
