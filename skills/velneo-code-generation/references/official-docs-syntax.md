# Official Velneo syntax (doc.velneo.com v24)

Condensed from the official Velneo documentation. Use it to resolve syntax doubts
when generating process code; the live export remains authoritative for a concrete
object.

## Looking up more syntax

Any page of `https://doc.velneo.com/24/...` is fetchable as Markdown by appending
`.md` to the page URL. Useful entry points:

```text
proyectos-objetos-y-editores/de-aplicacion-y-datos/proceso.md            editor + origen/destino
proyectos-objetos-y-editores/de-aplicacion-y-datos/proceso/basicos/controles-de-flujo.md   If/Else/For/Recorrer buffer
proyectos-objetos-y-editores/de-aplicacion-y-datos/proceso/base-de-datos/listas.md          Recorrer lista y compañía
proyectos-objetos-y-editores/editores/asistente-de-formulas/operadores.md                   operadores de fórmula
```

## Block structure (official wording)

- Every instruction is a sub-object of the process; some commands generate a
  sub-branch (`subproceso`) and the commands that hang from it run per iteration
  or per condition. Commands that do not generate a subproceso continue at the
  same level.
- There is no `End If`. The end of a block is the next line at a lower or equal level.
- `Else` and `Else if` must be **immediately preceded** by `If` or `Else if` at the
  same level, with **no other executable line at that level between them**. A
  commented-out line does not count ("será como si no existiese"); in the Code IDE
  JSON that is a line with `disabled: true`.
- Official examples indent 4 spaces per level and write commands as
  `Mensaje ( "texto", Información, ,  )`: space after the command name, parameters
  separated by `, `, empty parameters left as empty positions.

## Official subproceso commands (containers)

Flow control (grupo Básicos): `If`, `Else`, `Else if`, `For`, `Recorrer buffer`.
Listas: `Recorrer lista solo lectura`, `Recorrer lista lectura/escritura`,
`Recorrer lista eliminando fichas`, `Recorrer lista eliminando fichas sin
desactualizar`, `Multipartir lista` (one subproceso per sub-list).

The Code Sync exports and SemiDynamics projects also verified as containers: `Cargar lista`, `Cargar maestros`,
`Cargar plurales`, `Disparar objeto`, `Ejecutar proceso`, `Leer ficha seleccionada`, `Leer ficha de
maestro`, `Seleccionar ficha de la lista`, `Crear nueva ficha en memoria`,
`Alta de ficha`, `Modificar ficha seleccionada`, `Modificar ficha de maestro`,
`Procesar ficha en memoria`, `Cesta: Procesar`, `Fichero: Abrir`, `Leer registro`,
`Crear o modificar ficha desde JSON`, `Crear o modificar lista desde JSON`,
`Tubo de ficha`, `Tubo de lista`, `Eliminar la ficha seleccionada`,
`Localizador`, and the `Interfaz:` commands listed in
[nesting-and-command-rules.md](nesting-and-command-rules.md).

## List commands that do NOT create a subproceso

`Cortar lista`, `Filtrar lista`, `Ordenar lista`, `Invertir lista` (and the other
list transformers) are plain steps: they modify the current list and **the next line
at the same level** works on the resulting list. Do not nest commands under them.

## Origen/destino model

Each line has an origen (`ninguno`, `ficha`, or `lista` of a table) determined by the
process entry and modified by preceding commands. Available commands on a line depend
on its origen; a subproceso sets the origen for its children (for example
`Recorrer lista lectura/escritura` makes each iteration's origen `ficha`, so
`Modificar campo` must be its child). This is why correct `nivel` is not cosmetic:
a `Modificar campo` at the loop's level instead of inside it changes its origen.

## Formulas and operators

Operators (official table): `+ - * / %`, `=` (equal), `!` (not equal),
`>`, `<`, `&` (AND), `|` (OR).

- **CRITICAL**: Inequality is strictly `!` (e.g. `(#EST ! "A")` or `(ID ! 0)`). Never write `!=` or `<>`.
- **CRITICAL**: Equality is strictly `=` (e.g. `(APR = 1)`). Never write `==`.
- **Precedence is strictly left to right**: `A = 1 & B = 2` does not group as in
  other languages. Add parentheses in every non-trivial condition:
  `(A = 1) & (B = 2)`.
- String literals go in double quotes: `"A"`, `"NDA_MASTER_NOT_FOUND"`.
- Current-record field: `#FIELD`. Master pointer indirect field: `#POINTER.FIELD`.
- Local process/form variable: bare name (`NUM_DOC_W`, `ERROR_GEN`).
- Object/table idRef: `ID@proyecto`, e.g. `PRV_NDA_G@vERP_2_dat`.
- Global variable: `$VAR@PROYECTO.TIPO`, e.g. `$EMP_ID@vERP_2_dat.dat`.
- String table constant: `~ID@PROYECTO.TIPO`, e.g. `~MSG_FRM_NO_AUT@vERP_2_dat.dat`.
- Function call: `fun:ID@PROYECTO.TIPO(args...)`, e.g. `fun:USR_ID@vERP_2_dat.dat(sysUserName)`.
- Core built-ins: `choose(cond, if_true, if_false)`, `isEmpty(str_or_field)`, `registerExist()`, `currentDateTime()`, `currentDate()`, `toUpper(str)`, `toLower(str)`, `trimmedString(str)`.
- A `Rem` comment parameter is plain text, never quoted.

## Command syntax examples (official)

```text
Set ( CAD_EVAL, "25,100,2600,300,1000,2375" )
For ( BUCLE, 0, BUCLE < (VECES + 1), 1 )
    Set ( NUM_CAD_LEIDO, stringSection(CAD_EVAL, ",", BUCLE, 0, 0) )
    If ( stringToNumber(NUM_CAD_LEIDO) > NUM_MAYOR )
        Set ( NUM_MAYOR, stringToNumber(NUM_CAD_LEIDO) )
```

```text
Cargar lista ( TMP_LST@ejemplo_dat, ID, , , ,  )
    If ( sysListSize < 101 )
        Finalizar proceso
    Else
        Recorrer lista eliminando fichas
            Libre
```

```text
Recorrer buffer ( CADENA, CARACTER )     ← loop per character, official container
    Set ( VALOR_ASCII, stringToAscii(CARACTER, "ISO-8859-1") )
```

`Libre` lines are never executed; `Rem` lines are not processed at execution time.
Both may exist in a native export but are normally omitted from a target array
(keep `Rem` comments when they document the block being generated).
