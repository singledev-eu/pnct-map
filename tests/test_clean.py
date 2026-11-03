"""`make clean` must never delete hand-maintained data (night task 03: the 0.7.1 clean removed the
untracked contact candidates, restored from a backup). Checked on the recipe (`make -n`), never by
running it."""

import shlex
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Hand-maintained: the curated contacts (tracked) and the local working files (gitignored).
KEEP = ["data/contacts", "data/contacts/camaras.csv", "data/manual", "data/manual/contacts"]


def clean_commands() -> list[str]:
    out = subprocess.run(["make", "-n", "clean"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    return [line for line in out.replace("\\\n", " ").splitlines() if line.strip()]


def removed_paths() -> list[str]:
    paths = []
    for line in clean_commands():
        words = shlex.split(line)
        if words[:1] == ["rm"]:
            paths += [w.rstrip("/") for w in words[1:] if not w.startswith("-")]
    return paths


def test_clean_removes_something():
    assert removed_paths(), "the clean recipe has no rm: check this test still parses it"


def test_clean_spares_hand_maintained_data():
    for removed in removed_paths():
        for keep in KEEP:
            assert keep != removed and not keep.startswith(removed + "/"), f"make clean would delete {keep} (rm {removed})"


def test_clean_refuses_while_candidates_sit_in_interim():
    assert any("data/interim/contacts" in line and "exit 1" in line for line in clean_commands())


def test_contact_candidates_are_written_outside_interim():
    src = (ROOT / "scripts/contacts_candidates.py").read_text(encoding="utf-8")
    assert 'OUT = ROOT / "data/manual/contacts"' in src
