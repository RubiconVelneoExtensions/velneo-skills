# Velneo Skills

Repositorio maestro de **Skills de Inteligencia Artificial para Velneo**.

Este repositorio alberga especificaciones, catálogos canónicos, reglas sintácticas y motores de validación para permitir a modelos de lenguaje (LLMs / Agentes como Antigravity, Claude Code, Cursor, Copilot o Gemini) generar, auditar y validar código estructurado y metadatos de Velneo con precisión absoluta.

> [!NOTE]
> Este proyecto **no es una extensión de interfaz gráfica para vDevelop** (no contiene `manifest.json`), sino un paquete autónomo de skills y herramientas sintácticas.

---

## Skills Disponibles

### 1. `velneo-code-generation` (Generación y Validación de Código Velneo)
- **Ruta:** `skills/velneo-code-generation/`
- **Catálogo Oficial:** 177 comandos canónicos clasificados en versiones (`v7_0` a `v36`) con tipado y límites estrictos de parámetros.
- **Reglas Sintácticas:** Jerarquía y anidamiento estricto de niveles, scoping de variables en fichas en memoria (`#CAMPO` vs variable local), y sintaxis de fórmulas (`=`, `!`).
- **Motores:**
  - `scripts/ValidadorComandos.js`: Motor canónico único en JavaScript (compatible con QML en vDevelop, Node.js y navegadores).
  - `scripts/validador.js`: CLI oficial y módulo Node.js (`node validador.js <fichero.json>`).
  - `scripts/validate_velneo_json.py`: Puente ligero de compatibilidad hacia atrás para entornos Python (delega 100% en el motor JavaScript).

---

## Instalación y Sincronización en Entornos IA

Para instalar o sincronizar las skills en los entornos de IA de tu máquina (`~/.gemini/config/skills/`, plugins y `~/.claude/skills/`):

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar_skills.ps1
```

O para verificar el estado sin realizar cambios:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar_skills.ps1 -Verificar
```

---

## Tests de Verificación

Para ejecutar la suite oficial de pruebas sintácticas:

```powershell
node tests/test_validador.js
```

O mediante el puente en Python:

```powershell
python tests/test_validador.py
```
