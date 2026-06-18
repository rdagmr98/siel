"""Esporta ogni tabella di siel.sqlite in un file JSON (uno per tabella).

Output: cartella siel-data (repo dati privato). I valori vengono dumpati cosi'
come sono memorizzati (stringhe 'True'/'False', ore centesimali, None) per
mantenere fedelta' assoluta con la logica Access/desktop.

Uso:
    python export_from_sqlite.py <siel.sqlite> <cartella_output>
"""
import json
import sqlite3
import sys
from pathlib import Path


def export(db_path: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    tables = [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    manifest = {}
    for t in tables:
        rows = [dict(r) for r in con.execute(f'SELECT * FROM "{t}"')]
        (out_dir / f"{t}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
        manifest[t] = len(rows)
        print(f"{t:28s} {len(rows):6d} righe")
    (out_dir / "_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    con.close()
    print(f"\nEsportate {len(tables)} tabelle in {out_dir}")


if __name__ == "__main__":
    db = Path(sys.argv[1] if len(sys.argv) > 1
              else r"C:\Users\Gianmarco\Documents\SIEL_Portable\siel.sqlite")
    out = Path(sys.argv[2] if len(sys.argv) > 2
               else r"C:\Users\Gianmarco\siel-data")
    export(db, out)
