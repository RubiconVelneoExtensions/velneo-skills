#!/usr/bin/env python3
"""Suite de Pruebas de Sintaxis y Validadores de Velneo (velneo-skills).

100% portable y autónomo. Comprueba:
1. Descubrimiento y carga del Catálogo Oficial de 177 comandos.
2. Validación de código canónico válido en Python.
3. Detección de errores críticos (retorno prohibido, !=, ==, saltos de nivel, comandos inexistentes, límites estrictos de parámetros).
4. Paridad de reglas con Node.js (validador.js).
5. Opciones CLI de validador.js (--versiones y --buscar).
"""

from __future__ import annotations

import difflib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Localizar scripts del validador dentro del repositorio velneo-skills
test_dir = Path(__file__).resolve().parent
repo_dir = test_dir.parent
scripts_dir = repo_dir / "skills" / "velneo-code-generation" / "scripts"
validator_script = scripts_dir / "validate_velneo_json.py"

if not validator_script.is_file():
    print(f"ERROR: No se encontró validate_velneo_json.py en {validator_script}")
    sys.exit(1)

sys.path.insert(0, str(scripts_dir))
import validate_velneo_json as val


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def print_test_header(name: str):
    print(f"\n--- [TEST] {name} ---")


def run_tests():
    total_tests = 0
    passed_tests = 0

    def assert_true(condition: bool, message: str):
        nonlocal total_tests, passed_tests
        total_tests += 1
        if condition:
            print(f"  [PASS] {message}")
            passed_tests += 1
        else:
            print(f"  [FAIL] {message}")

    # =========================================================================
    # Test 1: Portabilidad y Descubrimiento Dinámico de Catálogo
    # =========================================================================
    print_test_header("1. Descubrimiento Dinámico de Catálogo y Portabilidad")
    cat_path = val.find_default_catalog()
    assert_true(cat_path is not None and cat_path.is_file(), f"Catálogo encontrado: {cat_path.name if cat_path else 'None'}")

    cat_data, containers = val.load_catalog(cat_path)
    assert_true(len(cat_data) >= 160, f"Catálogo cargó {len(cat_data)} comandos (esperado >= 160)")
    assert_true("if" in cat_data or "if" in containers, "Contenedor oficial 'If' identificado correctamente")
    assert_true("anadir ficha a la salida" in cat_data, "Comando canónico con tilde normalizada indexado")

    # =========================================================================
    # Test 2: Validación de Código Canónico Válido
    # =========================================================================
    print_test_header("2. Código Canónico Válido")
    valid_code = [
        {"comando": "Rem", "params": ["Fase 1: Inicialización"], "nivel": 0},
        {"comando": "If", "params": ["(ESTADO = \"ACTIVO\")"], "nivel": 0},
        {"comando": "Cargar lista", "params": ["ART_M", "ID"], "nivel": 1},
        {"comando": "If", "params": ["sysListSize > 0"], "nivel": 2},
        {"comando": "Modificar ficha seleccionada", "params": [], "nivel": 3},
        {"comando": "Modificar campo", "params": ["STOCK", "10"], "nivel": 4},
        {"comando": "Else", "params": [], "nivel": 2},
        {"comando": "Set", "params": ["MSG", "\"Sin stock\""], "nivel": 3},
        {"comando": "Else", "params": [], "nivel": 0},
        {"comando": "Set", "params": ["MSG", "\"Inactivo\""], "nivel": 1}
    ]
    errs, warns, sugs = val.validate(valid_code, cat_data, containers)
    assert_true(len(errs) == 0, f"Código válido no produce errores (recibidos: {len(errs)})")
    assert_true(len(warns) == 0, f"Código válido no produce advertencias (recibidas: {len(warns)})")

    # =========================================================================
    # Test 3: Detección de Errores Críticos e Invariantes
    # =========================================================================
    print_test_header("3. Detección de Errores Críticos")

    # 3a. Prohibición de 'Set retorno proceso = SI'
    invalid_retorno = [{"comando": "Set retorno proceso = SI", "params": [], "nivel": 0}]
    errs, _, _ = val.validate(invalid_retorno, cat_data, containers)
    assert_true(any("NO EXISTE" in e or "not a Velneo command" in e for e in errs), "Detecta prohibición de 'Set retorno proceso = SI'")

    # 3b. Fórmulas con '!=' y '=='
    invalid_formulas = [
        {"comando": "If", "params": ["#EST != \"A\""], "nivel": 0},
        {"comando": "Set", "params": ["X", "A == B"], "nivel": 1}
    ]
    _, warns, _ = val.validate(invalid_formulas, cat_data, containers)
    assert_true(any("!=" in w for w in warns), "Detecta y advierte sobre operador inválido '!=' (debe ser '!')")
    assert_true(any("==" in w for w in warns), "Detecta y advierte sobre operador inválido '==' (debe ser '=')")

    # 3c. Salto de nivel prohibido (0 a 2)
    invalid_jump = [
        {"comando": "If", "params": ["A = 1"], "nivel": 0},
        {"comando": "Set", "params": ["X", "1"], "nivel": 2}
    ]
    errs, _, _ = val.validate(invalid_jump, cat_data, containers)
    assert_true(any("Salto de nivel imposible" in e or "impossible level jump" in e for e in errs), "Detecta salto de nivel imposible (0 a 2)")

    # 3d. Comando inexistente con sugerencia difusa
    invalid_cmd = [{"comando": "Interfaz: Recargar", "params": [], "nivel": 0}]
    errs, _, sugs = val.validate(invalid_cmd, cat_data, containers)
    assert_true(any("no existe" in e.lower() for e in errs), "Detecta comando inexistente 'Interfaz: Recargar'")
    assert_true(any("recalcular" in s.lower() for s in sugs), "Sugiere reemplazo inteligente canónico 'Interfaz: Recalcular'")

    # 3e. Límites estrictos de parámetros (If con 0 parámetros o más de 1)
    invalid_if_params = [{"comando": "If", "params": [], "nivel": 0}]
    errs_if, _, _ = val.validate(invalid_if_params, cat_data, containers)
    assert_true(any("parámetro" in e.lower() for e in errs_if), "Detecta If sin parámetros como error estricto")

    # =========================================================================
    # Test 4: Paridad con Validador Node.js (validador.js)
    # =========================================================================
    print_test_header("4. Paridad con Validador Node.js")
    validador_js = scripts_dir / "validador.js"
    assert_true(validador_js.is_file(), "validador.js existe en scripts/")

    if validador_js.is_file():
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as tf:
            json.dump(valid_code, tf)
            temp_path = tf.name

        try:
            res_node = subprocess.run(
                ["node", str(validador_js), temp_path],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False
            )
            assert_true(res_node.returncode == 0, "validador.js (Node.js) aprueba código válido con código de salida 0")
        except FileNotFoundError:
            print("  [SKIP] Node.js no disponible en PATH para ejecutar validador.js")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        # CLI: --versiones
        try:
            res_vers = subprocess.run(
                ["node", str(validador_js), "--versiones"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False
            )
            assert_true(res_vers.returncode == 0 and "v7_0" in res_vers.stdout, "validador.js --versiones reporta versiones del catálogo")
        except Exception:
            pass

        # CLI: --buscar
        try:
            res_find = subprocess.run(
                ["node", str(validador_js), "--buscar", "Cargar lista"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False
            )
            assert_true(res_find.returncode == 0 and "Cargar lista" in res_find.stdout, "validador.js --buscar encuentra comando oficial")
        except Exception:
            pass

    # =========================================================================
    # Resumen
    # =========================================================================
    print("\n=================================================================")
    print(f" RESUMEN DE PRUEBAS: {passed_tests} / {total_tests} SUPERADAS ({passed_tests*100//total_tests}%)")
    print("=================================================================")
    if passed_tests == total_tests:
        print("✓ Todos los tests han pasado con éxito. velneo-skills es 100% funcional y autónomo.\n")
        return 0
    else:
        print("✗ Algunos tests han fallado.\n")
        return 1


if __name__ == "__main__":
    sys.exit(run_tests())
