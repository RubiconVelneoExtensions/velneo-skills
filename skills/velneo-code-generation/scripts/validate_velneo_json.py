#!/usr/bin/env python3
"""Compatibilidad hacia atrás: Envoltorio del Validador Oficial en JavaScript (Node.js).

El motor único canónico de validación de Velneo reside en JavaScript:
  - ValidadorComandos.js (motor universal para vDevelop QML y Node.js)
  - validador.js (CLI oficial y módulo Node.js)

Este archivo se mantiene exclusivamente como puente de compatibilidad para pipelines
o herramientas que invoquen Python en su entorno. Toda la validación delega
directamente en el motor JavaScript.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATOR_JS = SCRIPT_DIR / "validador.js"
CORE_JS = SCRIPT_DIR / "ValidadorComandos.js"
CATALOGO_JSON = SCRIPT_DIR / "catalogo_comandos_velneo.json"


def norm(value: str) -> str:
    """Normalize text: NFKD decomposition, strip diacritics, lowercase and strip."""
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return " ".join(value.casefold().strip().split())


def find_default_catalog() -> Path | None:
    """Dynamically resolve catalog file without hardcoded paths."""
    if CATALOGO_JSON.is_file():
        return CATALOGO_JSON
    env_cat = os.environ.get("VELNEO_CATALOG_PATH") or os.environ.get("VELNEO_CATALOG")
    if env_cat and Path(env_cat).is_file():
        return Path(env_cat).resolve()
    return None


def load_catalog(path: Path | None = None) -> tuple[dict[str, dict[str, Any]], set[str]]:
    """Load command catalog from JSON for backward-compatible metadata inspection."""
    target = path or find_default_catalog()
    if not target or not target.is_file():
        return {}, set()

    with target.open(encoding="utf-8") as fh:
        raw = json.load(fh)

    catalog_dict: dict[str, dict[str, Any]] = {}
    extra_containers: set[str] = set()

    cmds = raw.get("comandos", {}) if isinstance(raw, dict) else {}
    for k, item in cmds.items():
        if not isinstance(item, dict):
            continue
        name = item.get("nombre", k)
        n_name = norm(name)
        is_container = bool(item.get("esContenedor", False))
        if is_container:
            extra_containers.add(n_name)
        catalog_dict[n_name] = {
            "nombre": name,
            "esContenedor": is_container,
            "paramsMin": item.get("paramsMin", 0),
            "paramsMax": item.get("paramsMax", 6),
            "version": item.get("version", ""),
            "categoria": item.get("categoria", "")
        }

    return catalog_dict, extra_containers


def get_items(raw: Any) -> list[dict[str, Any]]:
    """Extract flat instruction items from common container formats."""
    if isinstance(raw, list):
        return [i for i in raw if isinstance(i, dict)]
    if isinstance(raw, dict):
        if "instrucciones" in raw and isinstance(raw["instrucciones"], list):
            return [i for i in raw["instrucciones"] if isinstance(i, dict)]
        if "instructions" in raw and isinstance(raw["instructions"], list):
            return [i for i in raw["instructions"] if isinstance(i, dict)]
    return []


def validate(
    items: list[dict[str, Any]],
    catalog: dict[str, Any] | None = None,
    extra_containers: set[str] | None = None
) -> tuple[list[str], list[str], list[str]]:
    """Delegate validation directly to the canonical JavaScript engine (ValidadorComandos.js)."""
    core_path = CORE_JS.resolve().as_posix()
    payload = json.dumps(items, ensure_ascii=False)
    
    node_code = (
        f'const api = require("{core_path}");\n'
        f'const instrs = JSON.parse(process.argv[1]);\n'
        f'const res = api.validarInstrucciones(instrs);\n'
        f'process.stdout.write(JSON.stringify({{\n'
        f'    errores: res.errores,\n'
        f'    advertencias: res.advertencias,\n'
        f'    sugerencias: res.sugerencias\n'
        f'}}));'
    )

    try:
        proc = subprocess.run(
            ["node", "-e", node_code, payload],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False
        )
        if proc.returncode == 0 and proc.stdout:
            data = json.loads(proc.stdout)
            return data.get("errores", []), data.get("advertencias", []), data.get("sugerencias", [])
        return [f"Error ejecutando validador JavaScript: {proc.stderr.strip()}"], [], []
    except FileNotFoundError:
        return ["Node.js no está disponible en PATH para ejecutar la validación."], [], []


def main() -> int:
    """CLI entry point delegating to validador.js."""
    if not VALIDATOR_JS.is_file():
        print(f"ERROR: No se encontró validador.js en {VALIDATOR_JS}", file=sys.stderr)
        return 1

    try:
        proc = subprocess.run(["node", str(VALIDATOR_JS)] + sys.argv[1:])
        return proc.returncode
    except FileNotFoundError:
        print("ERROR: Node.js no está instalado o no se encuentra en el PATH.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
