#!/usr/bin/env python3
"""Validate the flat target JSON used by the Velneo Code IDE and Puente MCP.

The validator checks the invariants that are easy for an LLM to get wrong:
explicit levels, valid parent/child relationships, Else placement, string
parameters, memory record scoping, and formula operators (!=, ==).

100% portable: dynamic catalog discovery, no hardcoded paths or usernames.
Supports both catalogo_comandos_velneo.json (PuenteGuia) and catalogo_params.json.
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def norm(value: str) -> str:
    """Normalize text: NFKD decomposition, strip diacritics, lowercase and strip."""
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return " ".join(value.casefold().strip().split())


# Default official container commands in Velneo MTI
CONTAINERS = {
    "if",
    "else",
    "else if",
    "for",
    "recorrer buffer",
    "cargar lista",
    "cargar plurales",
    "cargar maestros",
    "recorrer lista solo lectura",
    "recorrer lista lectura/escritura",
    "recorrer lista eliminando fichas",
    "recorrer lista eliminando fichas sin desactualizar",
    "recorrer directorio",
    "bd: recorrer lista",
    "multipartir lista",
    "multipartir lista por nº de registros",
    "disparar objeto",
    "ejecutar proceso",
    "leer ficha seleccionada",
    "leer ficha de maestro",
    "seleccionar ficha de la lista",
    "crear nueva ficha en memoria",
    "alta de ficha",
    "modificar ficha seleccionada",
    "modificar ficha de maestro",
    "modificar ficha seleccionada con formulario",
    "procesar ficha en memoria",
    "cesta: procesar",
    "fichero: abrir",
    "leer registro",
    "crear o modificar ficha desde json",
    "crear o modificar lista desde json",
    "tubo de ficha",
    "tubo de lista",
    "eliminar la ficha seleccionada",
    "localizador",
    "interfaz: procesar",
    "interfaz: obtener la multi-seleccion",
    "interfaz: obtener la ficha en edicion de la rejilla",
}

# Commands that take strictly 0 parameters in Velneo ([])
KNOWN_ZERO_PARAM_COMMANDS = {
    "else",
    "finalizar proceso",
    "set retorno proceso = no",
    "set retorno proceso = si",
    "anadir lista a la salida",
    "anadir ficha a la salida",
    "leer ficha seleccionada",
    "modificar ficha seleccionada",
    "recorrer lista solo lectura",
    "recorrer lista lectura/escritura",
    "recorrer lista eliminando fichas",
    "recorrer lista eliminando fichas sin desactualizar",
    "interfaz: aceptar",
    "interfaz: cancelar",
    "interfaz: recalcular",
    "interfaz: guardar la ficha en alta o modificacion",
    "cesta: limpiar cesta local",
    "libre",
}


def find_default_catalog() -> Path | None:
    """Dynamically resolve catalog file without hardcoded paths."""
    # 1. Explicit environment variable if defined
    env_cat = os.environ.get("VELNEO_CATALOG_PATH") or os.environ.get("VELNEO_CATALOG")
    if env_cat:
        p = Path(env_cat).resolve()
        if p.is_file():
            return p

    script_dir = Path(__file__).resolve().parent

    # 2. Relative candidates inside skill or parent extension (prioritizing rich 177 catalog)
    candidates = [
        # Rich 177-command official catalog from PuenteGuia
        script_dir.parent / "catalogo_comandos_velneo.json",
        script_dir.parent.parent / "catalogo_comandos_velneo.json",
        script_dir.parent.parent.parent / "catalogo_comandos_velneo.json",
        script_dir / "catalogo_comandos_velneo.json",
        # Parameter injection catalogs (Code Sync)
        script_dir / "catalogo_params.json",
        script_dir.parent.parent / "motor" / "catalogo_params.json",
        script_dir.parent.parent.parent / "motor" / "catalogo_params.json",
        script_dir.parent.parent / "cobertura" / "catalogo-comandos-detalle.json",
    ]

    for c in candidates:
        if c.is_file():
            return c

    # 3. Dynamic search in sibling extensions (vdevelop/extensions/*)
    current = script_dir
    for _ in range(5):
        if current.name.lower() == "extensions":
            pg = current / "PuenteGuia" / "catalogo_comandos_velneo.json"
            if pg.is_file():
                return pg
            sync = current / "vdevelop-code-sync" / "motor" / "catalogo_params.json"
            if sync.is_file():
                return sync
            sync_sec = current / "vdevelop-code-sync-escritorio-secundario" / "motor" / "catalogo_params.json"
            if sync_sec.is_file():
                return sync_sec
            break
        if current.parent == current:
            break
        current = current.parent

    # 4. Standard cross-platform user profile fallbacks (dynamic, no fixed username)
    home = Path.home()
    user_candidates = [
        home / "Velneo" / "vdevelop" / "extensions" / "PuenteGuia" / "catalogo_comandos_velneo.json",
        home / "Velneo" / "vdevelop" / "extensions" / "vdevelop-code-sync" / "motor" / "catalogo_params.json",
        home / "Velneo" / "vdevelop" / "extensions" / "vdevelop-code-sync-escritorio-secundario" / "motor" / "catalogo_params.json",
        home / ".gemini" / "config" / "skills" / "velneo-code-generation" / "scripts" / "catalogo_params.json",
    ]
    for uc in user_candidates:
        if uc.is_file():
            return uc

    return None


def load_catalog(path: Path | None) -> tuple[dict[str, dict[str, Any]], set[str]]:
    """Load command catalog from JSON. Supports PuenteGuia and Code Sync schemas.
    
    Returns:
        catalog_dict: mapping normalized command name to metadata dict
        extra_containers: set of normalized commands marked as containers
    """
    if path is None:
        path = find_default_catalog()
    if path is None or not path.is_file():
        return {}, set()

    with path.open(encoding="utf-8") as fh:
        raw = json.load(fh)

    if not isinstance(raw, dict):
        raise ValueError("El catálogo de comandos debe ser un objeto JSON")

    catalog_dict: dict[str, dict[str, Any]] = {}
    extra_containers: set[str] = set()

    # Formato A: PuenteGuia (catalogo_comandos_velneo.json con {"comandos": {...}})
    if "comandos" in raw and isinstance(raw["comandos"], dict):
        for k, item in raw["comandos"].items():
            if not isinstance(item, dict):
                continue
            name = item.get("nombre", k)
            n_name = norm(name)
            is_container = item.get("esContenedor", False)
            if is_container:
                extra_containers.add(n_name)

            params_list = item.get("params", [])
            p_max = item.get("paramsMax", len(params_list) if isinstance(params_list, list) else 6)
            p_min = item.get("paramsMin", 0)

            meta = {
                "nombre": name,
                "esContenedor": is_container,
                "paramsMin": p_min,
                "paramsMax": p_max,
                "version": item.get("version", ""),
                "categoria": item.get("categoria", ""),
                "descripcion": item.get("descripcion", "")
            }
            catalog_dict[n_name] = meta
            # También almacenar versión normalizada directa
            catalog_dict[norm(k)] = meta

    # Formato B: Code Sync (catalogo_params.json con {command: [pegar, f4, ...]})
    else:
        for k, v in raw.items():
            if str(k).startswith("_"):
                continue
            n_name = norm(str(k))
            p_len = len(v) if isinstance(v, list) else 6
            meta = {
                "nombre": str(k),
                "esContenedor": n_name in CONTAINERS,
                "paramsMin": 0,
                "paramsMax": p_len,
                "version": "",
                "categoria": "",
                "descripcion": ""
            }
            catalog_dict[n_name] = meta

    return catalog_dict, extra_containers


def get_items(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("instructions", "instrucciones", "lineas", "lines", "target"):
            if isinstance(raw.get(key), list):
                return raw[key]
    raise ValueError("Se esperaba un array JSON de instrucciones o un objeto con campo 'instrucciones'")


def check_formula_syntax(expr: str, prefix: str) -> list[str]:
    """Check common Velneo formula syntax errors in a formula or condition string."""
    warnings: list[str] = []

    # 1. Invalid inequality operator (!= or <>)
    if "!=" in expr:
        warnings.append(
            f"{prefix}: La fórmula usa '!=' ({expr!r}). En Velneo la desigualdad "
            f"es estrictamente un único símbolo '!' (ej: '(A ! B)' o '(#EST ! \"A\")')."
        )
    if "<>" in expr:
        warnings.append(
            f"{prefix}: La fórmula usa '<>' ({expr!r}). En Velneo la desigualdad "
            f"es estrictamente un único símbolo '!' (ej: '(A ! B)')."
        )

    # 2. Invalid equality operator (==)
    clean_expr = re.sub(r'".*?"', '""', expr)
    if "==" in clean_expr:
        warnings.append(
            f"{prefix}: La fórmula usa '==' ({expr!r}). En Velneo la igualdad "
            f"es estrictamente un único símbolo '=' (ej: '(A = B)')."
        )

    # 3. Invalid combined comparison operators (<= and >=)
    if "<=" in clean_expr:
        warnings.append(
            f"{prefix}: La fórmula usa '<=' ({expr!r}). En Velneo NO existe el operador '<='; "
            f"debe expresarse como '((A < B) | (A = B))' o '!(A > B)'."
        )
    if ">=" in clean_expr:
        warnings.append(
            f"{prefix}: La fórmula usa '>=' ({expr!r}). En Velneo NO existe el operador '>='; "
            f"debe expresarse como '((A > B) | (A = B))' o '!(A < B)'."
        )

    # 3. Parentheses balance
    open_p = clean_expr.count("(")
    close_p = clean_expr.count(")")
    if open_p != close_p:
        warnings.append(
            f"{prefix}: Paréntesis desbalanceados en fórmula ({expr!r}): "
            f"{open_p} '(' vs {close_p} ')'"
        )

    # 4. Strict left-to-right evaluation warning for unparenthesized logical operators
    if re.search(r'[^()]+[&|][^()]+', clean_expr):
        if ("=" in clean_expr or "!" in clean_expr or ">" in clean_expr or "<" in clean_expr) and ("&" in clean_expr or "|" in clean_expr):
            if "(" not in clean_expr:
                warnings.append(
                    f"{prefix}: Condición compuesta sin paréntesis ({expr!r}). "
                    f"Velneo evalúa estrictamente de izquierda a derecha sin precedencia: "
                    f"parentiza siempre subcondiciones (ej: '((A = 1) & (B = 2))')."
                )

    return warnings


def check_table_selector(val: str, prefix: str) -> list[str]:
    """Check table selector format: must be TABLA@ALIAS (e.g. ENT_M_COS_TRJ@vERP_2_dat),
    never PROYECTO.vcd@TABLA nor TABLA@PROYECTO.vcd."""
    warnings: list[str] = []
    s = str(val or "").strip()
    if not s:
        return warnings

    if ".vcd@" in s.lower() or ".vca@" in s.lower():
        warnings.append(
            f"{prefix}: Selector de tabla invertido '{s}'. En Velneo el formato canónico "
            f"es 'TABLA@ALIAS' (ej: 'ENT_M_COS_TRJ@vERP_2_dat'), nunca 'proyecto.vcd@TABLA'."
        )
    elif "@" in s:
        tabla, _, alias = s.partition("@")
        tabla = tabla.strip()
        alias = alias.strip()
        if not tabla or not alias:
            warnings.append(
                f"{prefix}: Selector de tabla mal formado '{s}'. Debe ser 'TABLA@ALIAS' (ej: 'ENT_M_COS_TRJ@vERP_2_dat')."
            )
        elif ".vcd" in alias.lower() or ".vca" in alias.lower() or "." in alias:
            warnings.append(
                f"{prefix}: El selector de tabla '{s}' incluye extensión o punto en el alias '{alias}'. "
                f"Usa el alias limpio del proyecto (ej: '{tabla}@vERP_2_dat' o '{tabla}@velneo_verp_2_dat')."
            )
    elif s.startswith(("fun:", "$", "#", "~", "\"", "'")):
        warnings.append(
            f"{prefix}: El selector de tabla '{s}' no es un identificador válido; debe ser 'TABLA@ALIAS'."
        )
    return warnings


def validate(
    items: list[Any],
    catalog: dict[str, dict[str, Any]],
    extra_containers: set[str] = set()
) -> tuple[list[str], list[str], list[str]]:
    """Validate Velneo instruction tree."""
    errors: list[str] = []
    warnings: list[str] = []
    suggestions: list[str] = []
    stack: list[str] = []
    last_at_level: dict[int, str] = {}
    last_item_at_level: dict[int, dict[str, Any]] = {}

    all_containers = CONTAINERS | extra_containers
    all_cmd_names = [v["nombre"] for v in catalog.values()] if catalog else list(CONTAINERS)

    for index, item in enumerate(items, start=1):
        prefix = f"Línea {index}"
        if not isinstance(item, dict):
            errors.append(f"{prefix}: La instrucción debe ser un objeto JSON")
            continue

        command = item.get("comando")
        if not isinstance(command, str) or not command.strip():
            errors.append(f"{prefix}: El nombre de 'comando' no puede estar vacío")
            command_n = ""
        else:
            command_n = norm(command)

        # Prohibición de comando inexistente
        if command_n == "set retorno proceso = si":
            errors.append(
                f"{prefix}: 'Set retorno proceso = SI' NO EXISTE en Velneo. "
                "Asigna una variable de salida (ej: OK = 1) y deja terminar el proceso."
            )

        params = item.get("params")
        if not isinstance(params, list):
            errors.append(f"{prefix}: 'params' debe ser un array de strings")
            params = []
        else:
            for pidx, value in enumerate(params, start=1):
                if not isinstance(value, str):
                    errors.append(f"{prefix}: params[{pidx}] debe ser string; se recibió {type(value).__name__}")
                else:
                    # Validar fórmulas en condiciones, sets o retornos
                    if command_n in {"if", "else if"} and pidx == 1:
                        warnings.extend(check_formula_syntax(value, f"{prefix} (condición)"))
                    elif command_n in {"set", "modificar campo", "modificar campo solamente"} and pidx == 2:
                        warnings.extend(check_formula_syntax(value, f"{prefix} (fórmula)"))
                    elif command_n in {"set dato de retorno"} and pidx == 1:
                        warnings.extend(check_formula_syntax(value, f"{prefix} (retorno)"))
                    # Validar selectores de tabla (formato canónico TABLA@ALIAS)
                    elif (command_n in {"cargar lista", "cesta: crear cesta local", "vaciar tabla"} and pidx == 1) or \
                         (command_n in {"crear nueva ficha en memoria"} and pidx == 2) or \
                         (command_n in {"crear o modificar ficha desde json", "crear o modificar lista desde json"} and pidx == 3):
                        warnings.extend(check_table_selector(value, f"{prefix} (tabla)"))

        level = item.get("nivel")
        if isinstance(level, bool) or not isinstance(level, int) or level < 0:
            errors.append(f"{prefix}: 'nivel' debe ser un entero >= 0")
            level = 0

        # Control de saltos de nivel
        if level > len(stack):
            errors.append(
                f"{prefix}: Salto de nivel imposible a {level}; "
                f"la profundidad máxima permitida anterior era {len(stack)}"
            )
        if level > 0:
            parent = stack[level - 1] if level - 1 < len(stack) else ""
            if parent not in all_containers:
                errors.append(
                    f"{prefix}: Nivel {level} tiene un padre no contenedor "
                    f"'{parent or '<desconocido>'}' en nivel {level - 1}"
                )

        # Adyacencia de Else / Else if
        if command_n in {"else", "else if"}:
            previous = last_at_level.get(level)
            if previous == "rem":
                warnings.append(
                    f"{prefix}: Hay una línea 'Rem' entre el If y este {command}. "
                    "El motor Velneo exige adyacencia directa sin comentarios intermedios."
                )
            elif previous not in {"if", "else if"}:
                errors.append(
                    f"{prefix}: '{command}' debe seguir inmediatamente a un 'If' o 'Else if' en su mismo nivel"
                )

        # Regla de Cargar lista y sus hijos dependientes
        previous_item = last_item_at_level.get(level)
        if previous_item and previous_item.get("comando_n") == "cargar lista":
            depends_on_loaded_list = False
            if command_n == "if" and params:
                first_param = params[0] if isinstance(params[0], str) else ""
                depends_on_loaded_list = "syslistsize" in norm(first_param)
            elif command_n in {
                "recorrer lista solo lectura",
                "recorrer lista lectura/escritura",
                "recorrer lista eliminando fichas",
                "recorrer lista eliminando fichas sin desactualizar",
            }:
                depends_on_loaded_list = True
            if depends_on_loaded_list:
                errors.append(
                    f"{prefix}: {command} debe ser hijo de 'Cargar lista' en nivel {level + 1}; "
                    "las instrucciones dependientes de la lista no pueden ser hermanas de la carga"
                )

        # Comandos con límites estrictos innegociables de parámetros en Velneo MTI
        STRICT_PARAM_BOUNDS = {
            "if": (1, 1),
            "else if": (1, 1),
            "set": (2, 2),
            "rem": (0, 1),
            "set dato de retorno": (1, 1),
            "seleccionar ficha por posicion": (1, 1),
            "leer ficha seleccionada": (0, 0),
            "filtrar lista": (1, 2),
            "modificar campo": (2, 2),
        }

        # Verificación contra el Catálogo de Comandos
        if command_n in KNOWN_ZERO_PARAM_COMMANDS:
            if len(params) > 0:
                errors.append(
                    f"{prefix}: '{command}' no admite parámetros ([]); se pasaron {len(params)}"
                )
        elif command_n in STRICT_PARAM_BOUNDS:
            p_min, p_max = STRICT_PARAM_BOUNDS[command_n]
            if len(params) > p_max:
                errors.append(
                    f"{prefix}: '{command}' tiene {len(params)} parámetros; el catálogo define un máximo estricto de {p_max}"
                )
            elif len(params) < p_min:
                errors.append(
                    f"{prefix}: '{command}' requiere al menos {p_min} parámetro(s); se pasaron {len(params)}"
                )
        elif command_n and command_n not in all_containers and command_n not in catalog:
            close_matches = difflib.get_close_matches(command, all_cmd_names, n=2, cutoff=0.6)
            err_msg = f"{prefix}: El comando no existe en el catálogo canónico de Velneo: '{command}'"
            if close_matches:
                err_msg += f" (¿Quisiste decir '{close_matches[0]}' ?)"
                suggestions.append(f"{prefix}: Sustituir '{command}' por '{close_matches[0]}'")
            errors.append(err_msg)
        elif command_n in catalog:
            meta = catalog[command_n]
            p_max = meta.get("paramsMax", 6)
            p_min = meta.get("paramsMin", 0)
            if p_min > 0 and len(params) < p_min:
                errors.append(
                    f"{prefix}: '{command}' requiere al menos {p_min} parámetro(s); se pasaron {len(params)}"
                )
            elif p_max > 0 and len(params) == 0 and command_n not in KNOWN_ZERO_PARAM_COMMANDS:
                errors.append(
                    f"{prefix}: '{command}' espera parámetros pero se pasaron 0"
                )
            elif len(params) > p_max:
                errors.append(
                    f"{prefix}: '{command}' tiene {len(params)} parámetros; el catálogo define un máximo estricto de {p_max}"
                )

        # Validación de parámetros enumerados de comandos estándar
        if command_n == "mensaje" and len(params) > 1:
            icon_val = str(params[1]).strip()
            # En Velneo los iconos oficiales son "0"=info, "1"=pregunta, "2"=aviso, "3"=error
            # o sus cadenas "Información", "Exclamación", "Stop"
            valid_icons = {"0", "1", "2", "3", "informacion", "exclamacion", "stop", "pregunta"}
            if icon_val and norm(icon_val) not in valid_icons:
                warnings.append(
                    f"{prefix}: Mensaje param 1 (Icono) debe ser uno de los estados oficiales ('0', '1', '2', '3' o 'Información', 'Exclamación', 'Stop'); se recibió {params[1]!r}"
                )

        # Mantener la pila de contenedores activos
        stack = stack[:level]
        stack.append(command_n)
        for sibling_level in list(last_at_level):
            if sibling_level > level:
                del last_at_level[sibling_level]
        if not item.get("disabled"):
            last_at_level[level] = command_n
            last_item_at_level[level] = {
                "comando_n": command_n,
                "params": params,
            }

    return errors, warnings, suggestions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_file", type=Path, help="Fichero JSON de instrucciones a validar")
    parser.add_argument("--catalog", type=Path, help="Ruta opcional a catalogo_comandos_velneo.json o catalogo_params.json")
    args = parser.parse_args()

    try:
        with args.json_file.open(encoding="utf-8") as fh:
            raw = json.load(fh)
        items = get_items(raw)
        catalog, extra_containers = load_catalog(args.catalog)
        errors, warnings, suggestions = validate(items, catalog, extra_containers)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}")
        return 2

    for warning in warnings:
        print(f"ADVERTENCIA: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    for sug in suggestions:
        print(f"SUGERENCIA: {sug}")

    if errors:
        print(f"INVÁLIDO: {len(errors)} error(es), {len(warnings)} advertencia(s)")
        return 2
    print(f"VÁLIDO: {len(items)} instrucción(es), {len(warnings)} advertencia(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
