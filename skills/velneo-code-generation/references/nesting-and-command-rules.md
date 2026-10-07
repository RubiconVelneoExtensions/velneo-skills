# Velneo Code IDE: nesting and command rules

This reference condenses the rules found in `vdevelop-code-ide/FORMATO_JSON.md`, `main.qml`, the V2/V3 motor, the Code Sync catalogue, and the real JSON batches in Code Sync. The authoritative result for an existing object is still the native export from the live vDevelop object.

## JSON schema

The target is an array in execution order. Each item has:

```json
{
  "comando": "If",
  "params": ["#EST = \"S\""],
  "nivel": 0,
  "disabled": false
}
```

`comando` is the exact Velneo command label. `params` is always an array of strings. `nivel` is a non-negative integer. `disabled` is optional and defaults to `false`.

The engine does not interpret tabs or spaces in this format. `nivel` is the only source of nesting. Its incremental planner rejects impossible jumps such as a first line at level 2 or a child below a leaf.

## Nesting

At a line with level `n > 0`, the nearest preceding line at level `n - 1` is its parent. The parent must be a command that has a child block. A line at a lower level closes the previous branch implicitly. Velneo has no `End If` command.

`Else` and `Else if` are siblings of their corresponding `If`, not children:

```json
[
  {"comando":"If","params":["X = 0"],"nivel":0},
  {"comando":"Set","params":["Y","1"],"nivel":1},
  {"comando":"Else","params":[],"nivel":0},
  {"comando":"Set","params":["Y","2"],"nivel":1}
]
```

An `Else` must follow an `If` or `Else if` at the same level. An `Else if` must follow an `If` or another `Else if` at the same level. Do not use an `Else` after an unrelated command.

Official rule (doc.velneo.com, Controles de flujo): `Else`/`Else if` must be **immediately preceded** by `If`/`Else if` at the same level, with no other executable line at that level between them; a commented-out line is the only exception ("será como si no existiese"). In this JSON format a commented line is one with `disabled: true`, so those lines are ignored for adjacency but any other intervening line at the same level breaks the chain.

## Commands observed as containers

The following commands create a child block (`subproceso`) and can have child instructions at `nivel + 1`. Verified against >5,600 objects in SemiDynamics:

```text
If
Else
Else if
For
Recorrer buffer
Cargar lista
Cargar plurales
Cargar maestros
Recorrer lista solo lectura
Recorrer lista lectura/escritura
Recorrer lista eliminando fichas
Recorrer lista eliminando fichas sin desactualizar
Recorrer directorio
BD: Recorrer lista
Multipartir lista
Multipartir lista por nº de registros
Disparar objeto
Ejecutar proceso
Leer ficha seleccionada
Leer ficha de maestro
Seleccionar ficha de la lista
Crear nueva ficha en memoria
Alta de ficha
Modificar ficha seleccionada
Modificar ficha de maestro
Modificar ficha seleccionada con formulario
Procesar ficha en memoria
Cesta: Procesar
Fichero: Abrir
Leer registro
Crear o modificar ficha desde JSON
Crear o modificar lista desde JSON
Tubo de ficha
Tubo de lista
Eliminar la ficha seleccionada
Localizador
Interfaz: Procesar
Interfaz: Obtener la multi-selección
Interfaz: Obtener la ficha en edición de la rejilla
```

### Container Semantics and Children

- **`Disparar objeto`** (1,626 usages): Container for handling the output of the triggered object.
  - When the object returns a list, children are: `Añadir lista a la salida`, `Cesta: Agregar lista a la cesta`, `Recorrer lista solo lectura`, `Ordenar lista`, `Invertir lista`, or `If ( sysListSize )`.
  - In native exports a `Libre` placeholder may exist; in target JSON omit `Libre` unless explicitly preserving it.
  - **Plano (second parameter, `f4` combo) must be an explicit plano literal when the target is a process or búsqueda**: `"1º plano: Local (síncrono)"`, `"3º plano: Servidor (síncrono)"`, `"3º plano: Búsqueda servidor (síncrono)"` (búsquedas), etc. `"No aplicable"` is valid **only for form targets**: vDevelop exports an untouched plano (internal 0) as `No aplicable` when the manejador is a form, but the plano combo of a process/búsqueda target has no such item — typing `"No aplicable"` matches nothing, the combo keeps its default (`5º plano: Agente (síncrono)` in v37), closed-loop verification detects the mismatch and the apply aborts after 3 retries (observed 2026-09-21, Chubb `PTO_OF_ENVIO_MAIL` → `EMAIL_ADD`).
- **`Ejecutar proceso`** (386 usages): Container for handling execution of child processes, with children such as `Añadir lista a la salida`, `Cesta: Agregar lista a la cesta`, or error handling.
- **`Cargar plurales`** (905 usages): Container for plural lists. Children operate on the plural list: `Recorrer lista...`, `Cargar maestros`, `Filtrar lista`, `Añadir lista a la salida`, `If ( sysListSize )`.
- **`Crear nueva ficha en memoria`** (654 usages): Container where field assignments happen: `Modificar campo ( CAMPO, VALOR )` at `nivel: parent + 1`.
- **`Alta de ficha`** (650 usages): Sibling of `Crear nueva ficha en memoria` at the parent level (`nivel: parent`), and itself a **container**:
  - Its children (`nivel: parent + 1`) run on the newly created record: `Set ( ID_NUEVO, #ID )`, `Añadir ficha a la salida`, `Cesta: Agregar ficha a la cesta`.
- **`Leer ficha seleccionada` / `Leer ficha de maestro`**: Container where current record fields are read: `Set ( VAR, #CAMPO )`, `Set variable local de objeto`, etc.
- **`Modificar ficha seleccionada` / `Modificar ficha de maestro`**: Container whose children are field modifications: `Modificar campo ( CAMPO, VALOR )`.
- **`Interfaz: Procesar`** (658 usages in forms): Container for UI control lists (e.g. grid control `LST`). Children at `nivel + 1`: `Cortar lista ( 0, )`, `Cesta: Agregar a la lista en curso ( .cesta )`.
- **List transformers do NOT create a subproceso**: `Cortar lista`, `Filtrar lista`, `Ordenar lista`, and `Invertir lista` transform the list in place. The next line stays at the **same level**. Never nest under them.

### `Cargar lista` and `Cargar plurales` result blocks

`Cargar lista` and `Cargar plurales` do create a subproceso. Instructions that consume the resulting list must be children of the load command. This includes `If (sysListSize)`, its `Else`, `Recorrer lista...`, `Seleccionar ficha...`, and `Set` instructions that read values from the loaded list. A subsequent independent instruction is a sibling at the load command's level.

Correct:

```text
Cargar lista ( PRV_NDA_G@vERP_2_dat, ID, NDA_ID, , ,  )       nivel 0
    If ( sysListSize )                                         nivel 1
        Seleccionar ficha por posición ( 1 )                  nivel 2
        Modificar ficha seleccionada                            nivel 2
            Modificar campo ( APR_EST, "B" )                   nivel 3
    Else                                                       nivel 1
        Set ( ERROR_GEN, "NDA_MASTER_NOT_FOUND" )             nivel 2
Set ( OK, 1 )                                                  nivel 0
```

Incorrect:

```text
Cargar lista ( PRV_NDA_G@vERP_2_dat, ID, NDA_ID, , ,  )       nivel 0
If ( sysListSize )                                             nivel 0
```

The second form closes the load subproceso before handling `sysListSize` and gives the list-dependent branch the wrong origen.

## Parameters and input routing

The Code Sync `catalogo_params.json` maps each parameter position to one of:

- `f4`: choose a Velneo field, table/index, enum, or other catalogue value with the vDevelop selector.
- `pegar`: paste a formula, literal, variable, text, or empty parameter.
- `objeto`: select an object idRef using the dedicated object selector.

Exact parameter lengths and types for common commands:

```text
Set                         pegar, pegar                                (2 params)
Set dato de retorno         pegar                                       (1 param)
If                          pegar                                       (1 param)
Else                        no parameters                               (0 params)
Else if                     pegar                                       (1 param)
Cargar lista                f4, f4, pegar, pegar, pegar, pegar          (6 params)
Cargar maestros             f4                                          (1 param)
Cargar plurales             f4, pegar, pegar, pegar, pegar              (5 params)
Modificar campo             f4, pegar                                   (2 params)
Modificar campo solamente   f4, pegar                                   (2 params)
Crear nueva ficha en memoria pegar, f4, pegar                           (3 params)
Alta de ficha               f4                                          (1 param)
Crear manejador de objeto   pegar, objeto, f4, f4                       (4 params)
Set variable local de objeto f4, f4, pegar                              (3 params)
Get variable local de objeto f4, f4, pegar                              (3 params)
Disparar objeto             f4, f4, pegar, pegar                        (4 params)
Ejecutar proceso            f4, pegar, pegar, pegar, pegar              (5 params)
Mensaje                     pegar, f4, pegar, pegar                     (4 params)
Pregunta                    pegar, pegar, pegar                         (3 params)
¿Ha cambiado el campo?      f4, pegar                                   (2 params)
Interfaz: Procesar          pegar, f4                                   (2 params)
Interfaz: Ejecutar manejador de evento f4, f4                           (2 params)
Interfaz: Establecer foco   f4                                          (1 param)
Interfaz: Ocultar           f4                                          (1 param)
Interfaz: Mostrar           f4                                          (1 param)
Cesta: Crear cesta local    f4, pegar                                   (2 params)
Cesta: Agregar lista a la cesta f4                                      (1 param)
Cesta: Agregar a la lista en curso f4                                   (1 param)
Cesta: Agregar ficha a la cesta f4                                      (1 param)
Finalizar proceso           no parameters                               (0 params)
Set retorno proceso = NO    no parameters                               (0 params)
Añadir lista a la salida    no parameters                               (0 params)
Añadir ficha a la salida    no parameters                               (0 params)
Seleccionar ficha por posición pegar                                    (1 param)
Leer ficha seleccionada     no parameters                               (0 params)
Modificar ficha seleccionada no parameters                              (0 params)
Recorrer lista solo lectura no parameters                               (0 params)
Recorrer lista lectura/escritura no parameters                          (0 params)
Recorrer lista eliminando fichas no parameters                          (0 params)
```

**Rule for empty parameters**: Never truncate parameter arrays. Empty intermediate or trailing optional parameters must remain `""` to preserve the slot position (e.g. `["COM_SOL_COT_LIN_G_COM_SOL_PRV", "", "", "", ""]` for `Cargar plurales`).

## Velneo formula and expression syntax

Velneo formulas have idiosyncratic rules that differ sharply from other languages:

### Operators
- **Equality**: strictly single `=` (e.g. `(A = 1)`). Never use `==`.
- **Inequality**: strictly single `!` (e.g. `(A ! B)` or `(#EST ! "A")`). Never use `!=` or `<>`.
- **Logical AND**: `&` (e.g. `(A = 1) & (B = 2)`).
- **Logical OR**: `|` (e.g. `(A = 1) | (B = 2)`).
- **Concatenation / Addition**: `+` (e.g. `"Code: " + #COD`).

### Strict Left-to-Right Precedence
Velneo evaluates expressions strictly from left to right with **no operator precedence**.
- `A = 1 & B = 2` will NOT group the comparisons before the AND.
- **MANDATORY**: Parenthesize every sub-expression and condition: `((#EST ! "A") & (#EST ! "R")) | (#OFF = 1)`.

### Symbol and Reference Syntax
- `#FIELD`: Field of the current record (e.g. `#ID`, `#IMP_TOT`).
- `#POINTER.FIELD`: Indirect master field via pointer (e.g. `#COM_FAC.MON_M.ISO`, `#USR_RES.ENT.EML`).
- `VARIABLE`: Local process or form variable (bare name, uppercase, no `#`).
- `.handle`: In-memory handle or local cesta name (e.g. `.cesta`, `.alta_eje`, `pro`, `bus`).
- `$VARIABLE@PROYECTO.TIPO`: Global variable reference (e.g. `$EMP_ID@vERP_2_dat.dat`, `$EMP_REA_ID@vERP_2_dat.dat`).
- `~ID_STRING@PROYECTO.TIPO`: Static string table constant (e.g. `~MSG_FRM_NO_AUT@vERP_2_dat.dat`, `~PRG_CAL_EXS_MOV@vERP_2_app.app`).
- `fun:ID@PROYECTO.TIPO(arg1, arg2)`: Function call (e.g. `fun:USR_ID@vERP_2_dat.dat(sysUserName)`).
- String literals: must have escaped double quotes in JSON: `"\"A\""`, `"\"CANCEL\""`.
- `Rem` comments: plain text string, never quoted.

## Context-specific rules (Processes, Handlers, Functions, Triggers)

The flat JSON format applies equally to processes, form event handlers, functions, and table triggers, but each context has specific conventions:

### 1. Form Event Handlers (`eventSlot`)
- Executed in UI thread on the current form record.
- Use `Interfaz:` commands to manipulate controls (`BTN_SUP`, `LST`, `ED_NOM`).
- Use `registerExist() = 0` to detect new record ("Alta") vs `registerExist() = 1` ("Modificación").
- Use `theRegister.tableInfo().idRef()` for dynamic table introspection in permission checks.
- Canceling form actions: `Set retorno proceso = NO` followed by `Finalizar proceso`.

### 2. Table Triggers (`trigger`)
- Always execute with the table record as origen (`ficha`) at level 0.
- All record fields `#FIELD` are directly readable and modifiable at `nivel: 0` without loading lists or selecting records (e.g. `Modificar campo ( MOD_TIM, currentDateTime() )`).
- Check if a field value changed: `¿Ha cambiado el campo? ( CAMPO, VAR_BOOL )` followed by `If ( VAR_BOOL )`.
- Abort transaction: `Set retorno proceso = NO` followed by `Finalizar proceso`.

### 3. Functions (`function`)
- Parameters declared in the function subobjects are read as local variables (bare name, no `#`).
- Return a calculated result using `Set dato de retorno ( EXPRESION )`.
- Exit with `Finalizar proceso` when branching early.

### 4. Processes (`process`)
- Origen determined by process properties (`ninguno`, `ficha`, or `lista`).
- Output returned via `Añadir ficha a la salida` or `Añadir lista a la salida`.

## Engine and verification

The V2 motor constructs a stack from `nivel` and anchors each new line to its parent/previous sibling. A level jump greater than one is rejected as impossible. The V3 wrapper routes parameters by the editable catalogue and verifies each line against the extension's export. After applying, the closed-loop verifier classifies mismatches as `COMANDO`, `NIVEL`, `PARAMS`, `FALTA`, or `SOBRA`.

For an existing process:

1. Export the live object.
2. Edit the complete target array or a deliberate append.
3. Apply with rebuild for a complete replacement, or `--no-clean`/Añadir only for an append.
4. Export and verify again.

If a process looks right in a screenshot but does not execute correctly, inspect the live export and the selected object's parent. The visible indentation is not sufficient evidence.
