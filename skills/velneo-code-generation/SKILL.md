---
name: velneo-code-generation
description: Generate, repair, and validate Velneo vDevelop code (processes, form event handlers, functions, and table triggers) using the Code IDE JSON format, audited parameter rules, and explicit nesting levels. Use for Velneo/vERP process logic, form handlers, trigger validations, list loops, memory records, object callers, or when generated code is incorrectly indented or uses invalid syntax.
metadata:
  short-description: Generate validated Velneo code with correct syntax and nesting
---

# Velneo Code Generation (Processes, Handlers, Functions, Triggers)

Use this skill when the deliverable is Velneo vDevelop executable logic, whether it will be applied via **Puente MCP** (`codeTarget` in `vdevelop_compose_plan`), or via **vDevelop Code Sync** (1D Escritorio Principal o 2D Escritorio Secundario).

In the flat JSON representation, the hierarchy is encoded entirely by `nivel` (0-indexed integer); visual spaces, tabs, or formatting do not define the execution tree.

---

## 🚀 Workflows de Aplicación

Existen dos vías compatibles para aplicar el código generado:

### Vía A: Modo Asistido / Puente MCP (Recomendada)
1. Inspeccionar el objeto en memoria viva con `vdevelop_get_object` (leer variables, propiedades, controles o campos).
2. Generar el array de instrucciones en el campo `codeTarget.instrucciones` dentro del payload de `vdevelop_compose_plan` (o `vdevelop_push_session`).
3. El Puente MCP valida automáticamente el código mediante `ValidadorComandos.js` antes de aceptar el plan.
4. Al sincronizar en la pestaña `🎯 Asistente`, `CodeBridge.js` distribuye simultáneamente `target-instr.json` a `vdevelop-code-sync` y `vdevelop-code-sync-escritorio-secundario`.
5. Supervisar la sesión con `vdevelop_get_session` y verificar los pasos con `vdevelop_verify_step`.

### Vía B: Modo Directo / Code Sync CLI
1. Escribir el array JSON directamente en `target-instr.json` dentro de la carpeta de la extensión Code Sync elegida (`vdevelop-code-sync` o `vdevelop-code-sync-escritorio-secundario`).
2. Validar el fichero ejecutando:
   ```bash
   python scripts/validate_velneo_json.py target-instr.json
   ```
   o bien:
   ```bash
   node validador.js target-instr.json
   ```
3. Ejecutar el motor de inyección de pulsaciones (SendKeys) en vDevelop.

---

## 📋 Reglas Obligatorias de Generación

### 1. Consultar el Catálogo Oficial de Comandos (OBLIGATORIO)
- **NUNCA INVENTAR FIRMAS NI PARÁMETROS.** Velneo es un lenguaje estructurado con firmas posicionales estrictas.
- Consultar `catalogo_comandos_velneo.json` (177 comandos clasificados en 5 versiones: `v7_0` a `v36`) o `motor/catalogo_params.json`.
- [references/nesting-and-command-rules.md](references/nesting-and-command-rules.md) para el catálogo completo de contenedores y firmas.
- [references/real-patterns.md](references/real-patterns.md) para plantillas auditadas (bucles, altas en memoria, triggers, manejadores de evento).
- [references/official-docs-syntax.md](references/official-docs-syntax.md) para semántica oficial del motor Velneo (modelo origen/destino).

### 2. Estructura y Niveles (`nivel`)
- Cada instrucción requiere:
  - `comando`: String con el nombre canónico exacto.
  - `params`: Array de strings con los parámetros posicionales.
  - `nivel`: Entero >= 0 indicando la profundidad en el árbol AST.
- `nivel: 0` para instrucciones raíz.
- Para toda instrucción en `nivel > 0`, el ancestro inmediato en `nivel - 1` **DEBE ser un comando contenedor oficial** (ej. `If`, `Else`, `Cargar lista`, `Recorrer lista...`, `Crear nueva ficha en memoria`, `Alta de ficha`, `Modificar ficha...`).
- Saltos de nivel superiores a 1 (ej: pasar de 0 a 2 directamente) son estrictamente inválidos.
- `Else` y `Else if` deben situarse al **mismo nivel** que su `If` correspondiente, sin líneas `Rem` intermedias entre ellos.

### 3. Scoping Crítico en Fichas en Memoria y Modificaciones (REGLA DE ORO)
- Dentro de un bloque hijo de `Crear nueva ficha en memoria` o `Modificar ficha...`, el prefijo `#` referencia **estrictamente el registro activo de ese subámbito** (la nueva ficha en memoria o la ficha en modificación), **NUNCA** el registro o bucle exterior.
- **PROHIBIDO** escribir `Modificar campo ( CAMPO, #CAMPO )` o usar `#CAMPO_PADRE` dentro de `Crear nueva ficha en memoria`, ya que `#` resolverá contra la ficha nueva (que está vacía).
- **PATRÓN OBLIGATORIO**: Antes de entrar en `Crear nueva ficha en memoria` (o antes de crear líneas de detalle dentro de un bucle), debes guardar todos los valores requeridos del registro exterior en variables locales (ej: `Set ( PED_CLT, #CLT )`, `Set ( LIN_ART, #ART )`). Dentro de `Modificar campo ( CAMPO, VAR )`, se pasa la variable local (nombre limpio sin `#`).

### 4. Comentarios (`Rem`) como Ciudadanos de Primera Clase
- **MANDATORIO**: Preservar siempre los comentarios existentes y generar comentarios estructurados (`Rem`) para explicar fases de negocio, transacciones, validaciones y puntos de integración.
- **NUNCA** omitir, descartar o limpiar comentarios `Rem` al transformar o generar código.
- Formato: texto plano sin comillas en params (ej: `{"comando":"Rem","params":["Fase 1: Validaciones previas"],"nivel":0}`).
- Nota del motor: No colocar un `Rem` directamente entre un `If` y un `Else` en el mismo nivel.

### 5. Sintaxis Estricta de Fórmulas Velneo
- **Igualdad**: estrictamente un único `=` (ej: `(A = 1)`). **Nunca escribir `==`**.
- **Desigualdad**: estrictamente un único `!` (ej: `(A ! B)` o `(#EST ! "A")`). **Nunca escribir `!=` ni `<>`**.
- **Comparación combinada (<= y >=)**: los operadores `<=` y `>=` **NO EXISTEN** en el motor de fórmulas de Velneo. Deben escribirse siempre de forma desagregada: `((A < B) | (A = B))` y `((A > B) | (A = B))` o mediante expresiones enteras con `<` y `>`.
- **Operadores lógicos**: `&` (AND) y `|` (OR).
- **Precedencia de izquierda a derecha sin jerarquía**: Velneo evalúa estrictamente de izquierda a derecha. **Siempre parentizar** cada subcondición no trivial: `((#EST ! "A") & (#EST ! "R")) | (#OFF = 1)`.

### 6. Contrato de Parámetros y Nomenclatura
- **Campos de ficha**: `#CAMPO` para la ficha en curso; `#PUNTERO.CAMPO` para maestros por puntero (`#COM_FAC.MON_M.ISO`).
- **Variables locales**: nombre limpio sin `#` (`PRV_NDA_ID`, `ERROR_GEN`).
- **Controles de formulario**: nombre limpio sin `#` (`BTN_SUP`, `LST_PED`).
- **Variables globales**: `"$VAR@PROYECTO.TIPO"` (`$EMP_ID@vERP_2_dat.dat`).
- **Textos estáticos**: `"~ID_STRING@PROYECTO.TIPO"` (`~MSG_FRM_NO_AUT@vERP_2_dat.dat`).
- **Selectores de tabla**: estrictamente formato `TABLA@ALIAS` (ej: `ENT_M_COS_TRJ@vERP_2_dat`). **PROHIBIDO** invertir el orden (`proyecto.vcd@TABLA`) o incluir extensiones de archivo en el alias (`TABLA@proyecto.vcd`). El selector debe ser el identificador de la tabla seguido de `@` y el alias limpio del proyecto de datos.
- **Funciones**: `"fun:ID@PROYECTO.TIPO(arg1, arg2)"`.
- **Literales de texto en fórmulas**: entre comillas escapadas dentro del string JSON: `"\"A\""`, `"\"ACTIVO\""`.
- **Huecos opcionales intermedios**: rellenar con `""` (nunca omitir parámetros posicionales intermedios).
- **Finalización de procesos**: `Set retorno proceso = SI` **NO EXISTE** en Velneo. Para éxito, asignar variables de salida (ej. `OK = 1`) y dejar terminar el proceso. El comando `Set retorno proceso = NO` solo se usa para indicar fallo/aborto.

---

## 📐 Forma Típica Válida

```text
If (condition)                         nivel 0
    Cargar lista (...)                 nivel 1
        If (sysListSize)               nivel 2
            Seleccionar ficha (...)    nivel 3
            Modificar ficha seleccionada nivel 3
                Modificar campo (...)  nivel 4
        Else                           nivel 2
            Set (...)                  nivel 3
Else                                   nivel 0
    Set (...)                          nivel 1
```

Equivalente JSON:
```json
[
  {"comando":"If","params":["MODO_APR = \"A\""],"nivel":0},
  {"comando":"Cargar lista","params":["PLA_FAC_M","ID"],"nivel":1},
  {"comando":"If","params":["sysListSize > 0"],"nivel":2},
  {"comando":"Modificar ficha seleccionada","params":[],"nivel":3},
  {"comando":"Modificar campo","params":["ESTADO","\"PROCESADO\""],"nivel":4},
  {"comando":"Else","params":[],"nivel":2},
  {"comando":"Set","params":["ERROR_MSG","\"No hay registros\""],"nivel":3},
  {"comando":"Else","params":[],"nivel":0},
  {"comando":"Set","params":["ERROR_MSG","\"Modo no admitido\""],"nivel":1}
]
```

---

## 🔍 Validación Previa

Antes de confirmar cualquier código JSON, ejecutar la validación local:
- En Python:
  ```bash
  python scripts/validate_velneo_json.py <fichero.json>
  ```
- En Node.js:
  ```bash
  node validador.js <fichero.json>
  ```
Ambos validadores comparten el catálogo oficial canónico y comprueban contenedores, saltos de nivel, adyacencia de `Else` y sintaxis de fórmulas.
