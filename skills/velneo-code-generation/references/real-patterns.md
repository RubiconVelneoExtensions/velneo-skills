# Reusable Velneo process and handler patterns

These patterns are distilled from >5,600 real objects in SemiDynamics (`vERP_2_app` / `vERP_2_dat`). They provide tested, production-grade templates for processes, form event handlers, table triggers, and functions.

> [!NOTE]
> Always replace idRefs, fields, variables, and constants with values matching your target project.

---

## 1. Conditional lookup with error branch (Process)

The canonical pattern for reading a record by indexed key with validation and error return:

```json
[
  {"comando":"Cargar lista","params":["PRV_NDA_G@vERP_2_dat","ID","NDA_ID","","",""],"nivel":0},
  {"comando":"If","params":["sysListSize"],"nivel":1},
  {"comando":"Seleccionar ficha por posición","params":["1"],"nivel":2},
  {"comando":"Leer ficha seleccionada","params":[],"nivel":2},
  {"comando":"Set","params":["ESTADO","#APR_EST"],"nivel":3},
  {"comando":"Modificar ficha seleccionada","params":[],"nivel":2},
  {"comando":"Modificar campo","params":["APR_EST","\"A\""],"nivel":3},
  {"comando":"Else","params":[],"nivel":1},
  {"comando":"Set","params":["ERROR_GEN","\"NDA_MASTER_NOT_FOUND\""],"nivel":2},
  {"comando":"Set retorno proceso = NO","params":[],"nivel":2},
  {"comando":"Finalizar proceso","params":[],"nivel":2}
]
```

- `If (sysListSize)` and its `Else` are children of `Cargar lista` at `nivel: 1`.
- `Else` is immediately adjacent to that `If` at the same child level.
- `Leer ficha seleccionada` and `Modificar ficha seleccionada` are containers at `nivel: 2`.
- `#APR_EST` is read/written inside their respective subprocesos at `nivel: 3`.

---

## 2. Memory record creation and persistence (Process / Handler)

Creating a new record in memory, populating fields, committing it to the database with `Alta de ficha` (as a sibling), and capturing its generated `#ID`:

```json
[
  {"comando":"Rem","params":["Crear registro en memoria y asignar campos"],"nivel":0},
  {"comando":"Crear nueva ficha en memoria","params":["ficha_doc","PRV_NDA_DOC_G@vERP_2_dat",""],"nivel":0},
  {"comando":"Modificar campo","params":["PRV_NDA","PRV_NDA_ID"],"nivel":1},
  {"comando":"Modificar campo","params":["FIR_MAN","FIR_MAN_IN"],"nivel":1},
  {"comando":"Modificar campo","params":["FCH_EJE","currentDate()"],"nivel":1},
  {"comando":"Rem","params":["Grabar en base de datos; Alta de ficha es contenedor de la nueva ficha"],"nivel":0},
  {"comando":"Alta de ficha","params":["ficha_doc"],"nivel":0},
  {"comando":"Set","params":["DOC_ID_CREADO","#ID"],"nivel":1},
  {"comando":"Añadir ficha a la salida","params":[],"nivel":1}
]
```

- Field assignments belong under `Crear nueva ficha en memoria` at `nivel: 1`.
- `Alta de ficha` is at `nivel: 0` (sibling). Inside `Alta de ficha` (`nivel: 1`), the origen is the persisted database record, so `#ID` contains the newly assigned primary key.

---

## 3. Form Event Handler: Search and Grid Population (eventSlot)

The standard vERP filter/search handler (`BUS`) executed from a search button or filter form:

```json
[
  {"comando":"Rem","params":["Crear cesta local temporal para recoger resultados"],"nivel":0},
  {"comando":"Cesta: Crear cesta local","params":["ALM_M@vERP_2_dat",".cesta"],"nivel":0},
  {"comando":"Crear manejador de objeto","params":["bus","Búsqueda ALM_M@vERP_2_app","",""],"nivel":0},
  {"comando":"Set variable local de objeto","params":["bus","TXT_BUS","TXT_BUS"],"nivel":0},
  {"comando":"Set variable local de objeto","params":["bus","BUS_TIP","BUS_TIP"],"nivel":0},
  {"comando":"Set variable local de objeto","params":["bus","OFF","OFF"],"nivel":0},
  {"comando":"Disparar objeto","params":["bus","3º plano: Búsqueda servidor (síncrono)","",""],"nivel":0},
  {"comando":"Cesta: Agregar lista a la cesta","params":[".cesta"],"nivel":1},
  {"comando":"Rem","params":["Volcar registros de la cesta al control de rejilla"],"nivel":0},
  {"comando":"Interfaz: Procesar","params":["LST","Todas"],"nivel":0},
  {"comando":"Cortar lista","params":["0",""],"nivel":1},
  {"comando":"Cesta: Agregar a la lista en curso","params":[".cesta"],"nivel":1},
  {"comando":"Rem","params":["Marcar estado del filtro"],"nivel":0},
  {"comando":"Set","params":["FLT_ON","((BUS_TIP ! \"T\") | (OFF = 1))"],"nivel":0}
]
```

- `Disparar objeto` has `Cesta: Agregar lista a la cesta` as its child at `nivel: 1`.
- `Disparar objeto` plano (param 2): use an explicit plano literal for process/búsqueda targets (`"1º plano: Local (síncrono)"`, `"3º plano: Búsqueda servidor (síncrono)"`, …). `"No aplicable"` only exports that way for **form** targets; on a process target it matches no combo item and the apply aborts in verification.
- `Interfaz: Procesar` targets the grid control `LST`, with `Cortar lista` and `Cesta: Agregar a la lista en curso` as children at `nivel: 1`.
- Note the inequality operator `!` in `(BUS_TIP ! "T")`.

---

## 4. Form Event Handler: Initialization and Permission Control (`PRE_INI`)

Permission verification before opening a form, canceling display if unauthorized:

```json
[
  {"comando":"Rem","params":["Obtener identificador de permiso del registro en curso"],"nivel":0},
  {"comando":"Set","params":["ETQ_PRM","/*JAVASCRIPT*/\"\" + theRegister.tableInfo().idRef() + \".editarNo\""],"nivel":0},
  {"comando":"If","params":["fun:PRM_USR@vERP_2_dat.dat(ETQ_PRM) = \"1\""],"nivel":0},
  {"comando":"Mensaje","params":["~MSG_FRM_NO_AUT@vERP_2_dat.dat","Información","",""],"nivel":1},
  {"comando":"Set retorno proceso = NO","params":[],"nivel":1},
  {"comando":"Finalizar proceso","params":[],"nivel":1}
]
```

- In `POS_INI`, use `If ( registerExist() = 0 )` -> `{"comando":"Interfaz: Ocultar","params":["BTN_SUP"],"nivel":1}` to hide delete buttons on new records.

---

## 5. Table Trigger: Audit fields and Field Change Detection (`trigger`)

Standard trigger for update (`M1`) or insert (`A1`):

```json
[
  {"comando":"Rem","params":["Actualizar traza de modificación en el registro en curso"],"nivel":0},
  {"comando":"Modificar campo","params":["MOD_TIM","currentDateTime()"],"nivel":0},
  {"comando":"Modificar campo","params":["MOD_USR","fun:USR_ID@vERP_2_dat.dat(sysUserName)"],"nivel":0},
  {"comando":"Rem","params":["Comprobar si cambió el campo clave"],"nivel":0},
  {"comando":"¿Ha cambiado el campo?","params":["EST","CAMBIO_EST"],"nivel":0},
  {"comando":"If","params":["CAMBIO_EST = 1"],"nivel":0},
  {"comando":"If","params":["(#EST ! \"A\") & (#EST ! \"R\") & (#EST ! \"P\")"],"nivel":1},
  {"comando":"Set retorno proceso = NO","params":[],"nivel":2},
  {"comando":"Finalizar proceso","params":[],"nivel":2}
]
```

- In triggers, `#FIELD` is directly accessible at `nivel: 0`.
- `¿Ha cambiado el campo?` is a step command storing the boolean in a local variable.
- Transaction cancellation is achieved with `Set retorno proceso = NO` and `Finalizar proceso`.

---

## 6. Function with Return Value (`function`)

A helper function taking input parameters (received as local variables) and returning a calculated result:

```json
[
  {"comando":"Rem","params":["Validar parámetro de entrada"],"nivel":0},
  {"comando":"If","params":["(isEmpty(ID_ENT)) | (ID_ENT = 0)"],"nivel":0},
  {"comando":"Set dato de retorno","params":["\"\""],"nivel":1},
  {"comando":"Finalizar proceso","params":[],"nivel":1},
  {"comando":"Cargar lista","params":["ENT_M@vERP_2_dat","ID","ID_ENT","","",""],"nivel":0},
  {"comando":"If","params":["sysListSize"],"nivel":1},
  {"comando":"Seleccionar ficha por posición","params":["1"],"nivel":2},
  {"comando":"Leer ficha seleccionada","params":[],"nivel":2},
  {"comando":"Set dato de retorno","params":["#NOM_COM"],"nivel":3},
  {"comando":"Else","params":[],"nivel":1},
  {"comando":"Set dato de retorno","params":["\"\""],"nivel":2}
]
```

- `Set dato de retorno` takes 1 formula string parameter.
- Return value is set before `Finalizar proceso` or inside the branch.

---

## 7. Plural Traversal and Batch Update (Process)

Loading related child records and updating them in a batch:

```json
[
  {"comando":"Rem","params":["Cargar las líneas del documento de compra"],"nivel":0},
  {"comando":"Cargar plurales","params":["COM_PED_LIN_G_COM_PED","","","",""],"nivel":0},
  {"comando":"Recorrer lista lectura/escritura","params":[],"nivel":1},
  {"comando":"Modificar campo","params":["ALM","#COM_PED.ALM"],"nivel":2},
  {"comando":"Modificar campo","params":["COM_FAC","FAC_ID"],"nivel":2}
]
```

- `Cargar plurales` has 5 parameter slots `["ID_PLURAL", "", "", "", ""]`.
- `Recorrer lista lectura/escritura` is a child at `nivel: 1`.
- `Modificar campo` is inside the loop at `nivel: 2`.
