// ValidadorComandos.js — Validador universal de instrucciones de código Velneo
// Compatible con Node.js (CommonJS), entornos QML y CLI.
// Consume de forma dinámica y canónica 'catalogo_comandos_velneo.json'.

var CATALOGO_INFO = {
    titulo: "Catálogo Oficial de Comandos de Instrucción de Velneo",
    total_comandos: 177,
    versiones: {
        v7_0: { id: "v7_0", nombre: "Velneo V7.0 Inicial / v7.x", total: 112, descripcion: "Núcleo inicial del lenguaje MTI (procesos, listas, fichas, cestas, transacciones y UI básica)" },
        v16_v22: { id: "v16_v22", nombre: "Velneo v16 - v22", total: 32, descripcion: "JSON nativo, HTTP/URL, estilos CSS, docks, acciones UI, ODBC/BD externa y configuración de sistema" },
        v23_v27: { id: "v23_v27", nombre: "Velneo v23 - v27", total: 17, descripcion: "Arrays nativos, geolocalización GPS, animaciones y vistas de datos" },
        v28_v32: { id: "v28_v32", nombre: "Velneo v28 - v32", total: 14, descripcion: "Sockets TCP/Red, buffers binarios, modo reconexión e informes personalizables" },
        v33_v36: { id: "v33_v36", nombre: "Velneo v33 - v36+", total: 2, descripcion: "Overlays de interfaz, estilos avanzados de calendario y extensiones modernas" }
    }
};

var CATALOGO_COMANDOS = {};
var COMANDOS_POR_VERSION = {};
var INDICE_NORMALIZADO = {};

function _normalizar(s) {
    if (!s) return "";
    var str = String(s);
    if (typeof str.normalize === "function") {
        str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    return str.toLowerCase().trim().replace(/\s+/g, " ");
}

function inicializarCatalogo(cat) {
    if (!cat) return;
    CATALOGO_INFO = cat.info || CATALOGO_INFO;
    CATALOGO_COMANDOS = cat.comandos || {};
    COMANDOS_POR_VERSION = cat.comandos_por_version || {};
    INDICE_NORMALIZADO = {};

    for (var nombre in CATALOGO_COMANDOS) {
        if (CATALOGO_COMANDOS.hasOwnProperty(nombre)) {
            var norm = _normalizar(nombre);
            INDICE_NORMALIZADO[norm] = CATALOGO_COMANDOS[nombre];
        }
    }
}

// Carga automática del catálogo JSON si estamos en Node.js
if (typeof require === "function") {
    try {
        var path = require("path");
        var fs = require("fs");
        var catPath = path.join(__dirname, "catalogo_comandos_velneo.json");
        if (fs.existsSync(catPath)) {
            var raw = fs.readFileSync(catPath, "utf8");
            inicializarCatalogo(JSON.parse(raw));
        }
    } catch (e) {}
}

// ─────────────────────────────────────────────────────────────
// Algoritmo de Distancia Levenshtein y Búsqueda Difusa
// ─────────────────────────────────────────────────────────────

function distanciaLevenshtein(a, b) {
    var s1 = _normalizar(a);
    var s2 = _normalizar(b);
    if (s1 === s2) return 0;
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;

    var matrix = [];
    for (var i = 0; i <= s1.length; i++) matrix[i] = [i];
    for (var j = 0; j <= s2.length; j++) matrix[0][j] = j;

    for (var i = 1; i <= s1.length; i++) {
        for (var j = 1; j <= s2.length; j++) {
            var cost = s1.charAt(i - 1) === s2.charAt(j - 1) ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[s1.length][s2.length];
}

function sugerirComandos(nombre, limite) {
    limite = limite || 3;
    var normInput = _normalizar(nombre);
    if (!normInput) return [];

    var candidatos = [];
    var tokensInput = normInput.split(/[:\s]+/);

    for (var cmdNombre in CATALOGO_COMANDOS) {
        if (!CATALOGO_COMANDOS.hasOwnProperty(cmdNombre)) continue;
        var info = CATALOGO_COMANDOS[cmdNombre];
        var normCmd = _normalizar(cmdNombre);

        var dist = distanciaLevenshtein(normInput, normCmd);

        // Bonificación por compartir prefijo de categoría (e.g. "interfaz:", "cesta:")
        var bonus = 0;
        if (normInput.indexOf(":") !== -1 && normCmd.indexOf(":") !== -1) {
            var prefInput = normInput.split(":")[0];
            var prefCmd = normCmd.split(":")[0];
            if (prefInput === prefCmd) bonus += 3;
        }

        // Bonificación por coincidencia de tokens
        var tokensCmd = normCmd.split(/[:\s]+/);
        for (var t = 0; t < tokensInput.length; t++) {
            var tok = tokensInput[t];
            if (tok.length > 2 && normCmd.indexOf(tok) !== -1) {
                bonus += 2;
            }
        }

        var score = dist - bonus;
        candidatos.push({
            nombre: info.nombre,
            version: info.version,
            categoria: info.categoria,
            esContenedor: info.esContenedor,
            descripcion: info.descripcion,
            distancia: dist,
            score: score
        });
    }

    candidatos.sort(function(a, b) {
        return a.score - b.score;
    });

    return candidatos.slice(0, limite);
}

// ─────────────────────────────────────────────────────────────
// Consultas de Catálogo y Versiones
// ─────────────────────────────────────────────────────────────

function buscarComando(nombre) {
    if (!nombre) return null;
    var directo = CATALOGO_COMANDOS[nombre];
    if (directo) return directo;
    var norm = _normalizar(nombre);
    return INDICE_NORMALIZADO[norm] || null;
}

function obtenerCatalogo() {
    return CATALOGO_COMANDOS;
}

function obtenerVersiones() {
    return CATALOGO_INFO.versiones;
}

function obtenerComandosPorVersion(version) {
    return COMANDOS_POR_VERSION[version] || [];
}

function esContenedor(nombre) {
    var cmd = buscarComando(nombre);
    return cmd ? cmd.esContenedor === true : false;
}

// ─────────────────────────────────────────────────────────────
// Verificación Sintáctica de Fórmulas y Expresiones
// ─────────────────────────────────────────────────────────────

function verificarSintaxisFormula(expr, contexto) {
    var advertencias = [];
    if (!expr || typeof expr !== "string") return advertencias;

    // 1. Desigualdad inválida (!= o <>)
    if (expr.indexOf("!=") !== -1) {
        advertencias.push(contexto + ": La fórmula usa '!=' ('" + expr + "'). En Velneo la desigualdad es estrictamente un único símbolo '!' (ej: (A ! B) o (#EST ! \"A\")). Nunca uses '!='.");
    }
    if (expr.indexOf("<>") !== -1) {
        advertencias.push(contexto + ": La fórmula usa '<>' ('" + expr + "'). En Velneo la desigualdad es estrictamente un único símbolo '!' (ej: (A ! B)).");
    }

    // 2. Igualdad inválida (==) excluyendo literales entre comillas
    var sinComillas = expr.replace(/"[^"]*"/g, '""');
    if (sinComillas.indexOf("==") !== -1) {
        advertencias.push(contexto + ": La fórmula usa '==' ('" + expr + "'). En Velneo la igualdad es un único símbolo '=' (ej: (A = B)). Nunca uses '=='.");
    }

    // 2b. Operadores relacionales combinados inválidos (<= o >=)
    if (sinComillas.indexOf("<=") !== -1) {
        advertencias.push(contexto + ": La fórmula usa '<=' ('" + expr + "'). En Velneo NO existe el operador '<='; debe expresarse como '((A < B) | (A = B))' o '!(A > B)'.");
    }
    if (sinComillas.indexOf(">=") !== -1) {
        advertencias.push(contexto + ": La fórmula usa '>=' ('" + expr + "'). En Velneo NO existe el operador '>='; debe expresarse como '((A > B) | (A = B))' o '!(A < B)'.");
    }

    // 3. Balance de paréntesis
    var abiertos = (sinComillas.match(/\(/g) || []).length;
    var cerrados = (sinComillas.match(/\)/g) || []).length;
    if (abiertos !== cerrados) {
        advertencias.push(contexto + ": Paréntesis desbalanceados en fórmula ('" + expr + "'): " + abiertos + " '(' vs " + cerrados + " ')'.");
    }

    // 4. Advertencia de evaluación estricta de izquierda a derecha (condiciones compuestas sin paréntesis)
    if (sinComillas.indexOf("&") !== -1 || sinComillas.indexOf("|") !== -1) {
        if ((sinComillas.indexOf("=") !== -1 || sinComillas.indexOf("!") !== -1) && sinComillas.indexOf("(") === -1) {
            advertencias.push(contexto + ": Condición compuesta sin paréntesis ('" + expr + "'). Velneo evalúa estrictamente de izquierda a derecha sin precedencia de operadores: parentiza siempre subcondiciones (ej: (A = 1) & (B = 2)).");
        }
    }

    return advertencias;
}

function verificarSelectorTabla(val, contexto) {
    var advertencias = [];
    if (!val || typeof val !== "string") return advertencias;
    var s = val.trim();
    if (!s) return advertencias;

    var sLower = s.toLowerCase();
    if (sLower.indexOf(".vcd@") !== -1 || sLower.indexOf(".vca@") !== -1) {
        advertencias.push(contexto + ": Selector de tabla invertido '" + s + "'. En Velneo el formato canónico es 'TABLA@ALIAS' (ej: 'ENT_M_COS_TRJ@vERP_2_dat'), nunca 'proyecto.vcd@TABLA'.");
    } else if (s.indexOf("@") !== -1) {
        var parts = s.split("@");
        var tabla = (parts[0] || "").trim();
        var alias = (parts[1] || "").trim();
        var aliasLower = alias.toLowerCase();
        if (!tabla || !alias) {
            advertencias.push(contexto + ": Selector de tabla mal formado '" + s + "'. Debe ser 'TABLA@ALIAS' (ej: 'ENT_M_COS_TRJ@vERP_2_dat').");
        } else if (aliasLower.indexOf(".vcd") !== -1 || aliasLower.indexOf(".vca") !== -1 || alias.indexOf(".") !== -1) {
            advertencias.push(contexto + ": El selector de tabla '" + s + "' incluye extensión o punto en el alias '" + alias + "'. Usa el alias limpio del proyecto (ej: '" + tabla + "@vERP_2_dat' o '" + tabla + "@velneo_verp_2_dat').");
        }
    } else if (s.indexOf("fun:") === 0 || s.indexOf("$") === 0 || s.indexOf("#") === 0 || s.indexOf("~") === 0) {
        advertencias.push(contexto + ": El selector de tabla '" + s + "' no es un identificador válido; debe ser 'TABLA@ALIAS'.");
    }
    return advertencias;
}

// ─────────────────────────────────────────────────────────────
// Validador Principal de Instrucciones
// ─────────────────────────────────────────────────────────────

function validarInstrucciones(instrs, opciones) {
    opciones = opciones || {};
    var errores = [];
    var advertencias = [];
    var sugerencias = [];
    var detalles = [];

    if (!Array.isArray(instrs)) {
        return {
            valido: false,
            total: 0,
            errores: ["El conjunto de instrucciones no es un array válido."],
            advertencias: [],
            sugerencias: [],
            detalles: []
        };
    }

    // Permitir inyección de catálogo en opciones si no estaba cargado
    if (opciones.catalogo && Object.keys(CATALOGO_COMANDOS).length === 0) {
        inicializarCatalogo(opciones.catalogo);
    }

    var stack = [];
    var ultimoEnNivel = {};
    var ultimoItemEnNivel = {};

    for (var i = 0; i < instrs.length; i++) {
        var linea = i + 1;
        var item = instrs[i];
        var pref = "Línea " + linea;

        if (!item || typeof item !== "object") {
            errores.push(pref + ": La instrucción debe ser un objeto JSON.");
            continue;
        }

        var comando = String(item.comando || "").trim();
        var nivel = typeof item.nivel === "number" ? item.nivel : (parseInt(item.nivel, 10) || 0);
        var params = Array.isArray(item.params) ? item.params : (Array.isArray(item.parametros) ? item.parametros : []);
        var disabled = item.disabled === true;

        if (!comando) {
            errores.push(pref + ": Falta el nombre del comando ('comando' vacío o no definido).");
            continue;
        }

        // 1. Verificación del comando en el Catálogo Oficial Velneo
        var cmdInfo = buscarComando(comando);
        if (!cmdInfo) {
            var sugeridos = sugerirComandos(comando, 2);
            var txtSugerencia = "";
            if (sugeridos.length > 0) {
                var nombresSugeridos = sugeridos.map(function(s) {
                    return "'" + s.nombre + "' (" + s.version + ", " + s.categoria + ")";
                }).join(" o ");
                txtSugerencia = " ¿Quisiste decir " + nombresSugeridos + "?";
                sugerencias.push(pref + ": Para '" + comando + "', se sugiere " + nombresSugeridos);
            }
            errores.push(pref + ": Comando no reconocido en la documentación de Velneo: '" + comando + "'." + txtSugerencia);
        } else {
            if (opciones.versionMin && cmdInfo.version !== opciones.versionMin) {
                advertencias.push(pref + ": El comando '" + cmdInfo.nombre + "' requiere " + cmdInfo.version + " (filtro activo: " + opciones.versionMin + ").");
            }
        }

        // 2. Verificación de jerarquía y anidación (nivel)
        if (nivel < 0) {
            errores.push(pref + ": El nivel no puede ser negativo (" + nivel + ").");
            nivel = 0;
        }

        if (nivel > stack.length) {
            errores.push(pref + ": Salto de nivel imposible a " + nivel + "; la profundidad máxima permitida aquí es " + stack.length + ".");
        }

        if (nivel > 0) {
            var padreNombre = stack[nivel - 1] || "";
            var padreInfo = buscarComando(padreNombre);
            if (padreInfo && !padreInfo.esContenedor) {
                errores.push(pref + ": Nivel " + nivel + " tiene como padre a '" + padreNombre + "' en nivel " + (nivel - 1) + ", pero '" + padreNombre + "' NO admite subinstrucciones hijas.");
            }
        }

        // 3. Reglas de Else / Else if
        var normCmd = _normalizar(comando);
        if (normCmd === "else" || normCmd === "else if") {
            var previoEnNivel = ultimoEnNivel[nivel];
            if (previoEnNivel === "rem") {
                advertencias.push(pref + ": Hay un comentario 'Rem' entre el If previo y este '" + comando + "'. En el motor Velneo, sólo las líneas desactivadas se toleran entre If y Else.");
            } else if (previoEnNivel !== "if" && previoEnNivel !== "else if") {
                errores.push(pref + ": '" + comando + "' en nivel " + nivel + " debe seguir inmediatamente a un 'If' o 'Else if' en su mismo nivel (encontrado: '" + (previoEnNivel || "<ninguno>") + "').");
            }
        }

        // 4. Regla de subproceso de Cargar lista / Cargar plurales
        var itemPrevioEnNivel = ultimoItemEnNivel[nivel];
        if (itemPrevioEnNivel && (itemPrevioEnNivel.norm === "cargar lista" || itemPrevioEnNivel.norm === "cargar plurales")) {
            var esConsumidorLista = false;
            if (normCmd === "if" && params.length > 0) {
                var p1 = _normalizar(params[0]);
                if (p1.indexOf("syslistsize") !== -1) esConsumidorLista = true;
            } else if (normCmd.indexOf("recorrer lista") !== -1 || normCmd === "seleccionar ficha de la lista") {
                esConsumidorLista = true;
            }
            if (esConsumidorLista) {
                errores.push(pref + ": '" + comando + "' debe ser hijo de '" + itemPrevioEnNivel.comando + "' en nivel " + (nivel + 1) + "; las operaciones sobre la lista cargada no pueden ser hermanas del comando de carga.");
            }
        }

        // 5. Verificación de sintaxis de parámetros y fórmulas
        for (var p = 0; p < params.length; p++) {
            var valParam = params[p];
            if (typeof valParam !== "string") {
                advertencias.push(pref + " (param " + (p + 1) + "): Se esperaba string, recibido " + typeof valParam);
                continue;
            }

            if ((normCmd === "if" || normCmd === "else if") && p === 0) {
                advertencias = advertencias.concat(verificarSintaxisFormula(valParam, pref + " (condición)"));
            } else if ((normCmd === "set" || normCmd === "modificar campo" || normCmd === "modificar campo solamente") && p === 1) {
                advertencias = advertencias.concat(verificarSintaxisFormula(valParam, pref + " (fórmula)"));
            } else if (normCmd === "set dato de retorno" && p === 0) {
                advertencias = advertencias.concat(verificarSintaxisFormula(valParam, pref + " (retorno)"));
            } else if (((normCmd === "cargar lista" || normCmd === "cesta: crear cesta local" || normCmd === "vaciar tabla") && p === 0) ||
                       (normCmd === "crear nueva ficha en memoria" && p === 1) ||
                       ((normCmd === "crear o modificar ficha desde json" || normCmd === "crear o modificar lista desde json") && p === 2)) {
                advertencias = advertencias.concat(verificarSelectorTabla(valParam, pref + " (tabla)"));
            }
        }

        // 6. Regla estricta de Modificar campo: solo admite campos directos de la tabla en curso (sin '.' ni prefijos)
        if ((normCmd === "modificar campo" || normCmd === "modificar campo solamente") && params.length > 0) {
            var campoDestino = String(params[0] || "").trim();
            if (campoDestino.indexOf(".") !== -1) {
                var partesCampo = campoDestino.replace(/^#/, "").split(".");
                var maestroOExt = partesCampo[0];
                var campoReal = partesCampo.slice(1).join(".");
                errores.push(pref + ": 'Modificar campo' no admite campos de extensiones ni maestros ('" + campoDestino + "'). En Velneo, para actualizar fichas de extensión o maestro debes usar 'Modificar ficha de maestro ( " + maestroOExt + " )' y anidar dentro 'Modificar campo ( " + campoReal + ", ... )'.");
                sugerencias.push("Sustituir 'Modificar campo (" + campoDestino + ", ...)' por 'Modificar ficha de maestro (" + maestroOExt + ")' anidado.");
            }
        }

        // 7. Verificación de conteo de parámetros según el catálogo oficial
        if (cmdInfo) {
            var pMax = typeof cmdInfo.paramsMax === "number" ? cmdInfo.paramsMax : 6;
            var pMin = typeof cmdInfo.paramsMin === "number" ? cmdInfo.paramsMin : 0;
            if (pMax === 0 && params.length > 0) {
                errores.push(pref + ": '" + cmdInfo.nombre + "' no espera parámetros ([]); se recibieron " + params.length + ".");
            } else if (params.length > pMax) {
                errores.push(pref + ": '" + cmdInfo.nombre + "' tiene " + params.length + " parámetros; el catálogo define un máximo estricto de " + pMax + ".");
            } else if (pMin > 0 && params.length < pMin) {
                errores.push(pref + ": '" + cmdInfo.nombre + "' requiere al menos " + pMin + " parámetro(s); se pasaron " + params.length + ".");
            }
        }

        // Actualizar pila de niveles
        stack = stack.slice(0, nivel);
        stack.push(comando);

        for (var l in ultimoEnNivel) {
            if (ultimoEnNivel.hasOwnProperty(l) && parseInt(l, 10) > nivel) {
                delete ultimoEnNivel[l];
                delete ultimoItemEnNivel[l];
            }
        }

        if (!disabled) {
            ultimoEnNivel[nivel] = normCmd;
            ultimoItemEnNivel[nivel] = {
                comando: comando,
                norm: normCmd,
                params: params
            };
        }

        detalles.push({
            linea: linea,
            comando: comando,
            nivel: nivel,
            canonical: cmdInfo ? cmdInfo.nombre : null,
            version: cmdInfo ? cmdInfo.version : null,
            categoria: cmdInfo ? cmdInfo.categoria : null,
            esContenedor: cmdInfo ? cmdInfo.esContenedor : false
        });
    }

    var esValido = errores.length === 0;

    return {
        valido: esValido,
        total: instrs.length,
        errores: errores,
        advertencias: advertencias,
        sugerencias: sugerencias,
        detalles: detalles
    };
}

function validarCodeTarget(codeTarget, opciones) {
    if (!codeTarget || typeof codeTarget !== "object") {
        return {
            valido: false,
            total: 0,
            errores: ["codeTarget no es un objeto."],
            advertencias: [],
            sugerencias: [],
            detalles: []
        };
    }
    var instrs = codeTarget.instrucciones || [];
    return validarInstrucciones(instrs, opciones);
}

// ─────────────────────────────────────────────────────────────
// Exportación
// ─────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        CATALOGO_INFO: CATALOGO_INFO,
        CATALOGO_COMANDOS: CATALOGO_COMANDOS,
        COMANDOS_POR_VERSION: COMANDOS_POR_VERSION,
        inicializarCatalogo: inicializarCatalogo,
        buscarComando: buscarComando,
        sugerirComandos: sugerirComandos,
        obtenerCatalogo: obtenerCatalogo,
        obtenerVersiones: obtenerVersiones,
        obtenerComandosPorVersion: obtenerComandosPorVersion,
        esContenedor: esContenedor,
        verificarSintaxisFormula: verificarSintaxisFormula,
        validarInstrucciones: validarInstrucciones,
        validarCodeTarget: validarCodeTarget
    };
}
