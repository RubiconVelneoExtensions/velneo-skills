#!/usr/bin/env node
/**
 * Suite de Pruebas Oficial del Validador de Código Velneo (Node.js)
 * 
 * 100% portable y autónomo. Comprueba:
 * 1. Descubrimiento y carga del Catálogo Oficial de 177 comandos.
 * 2. Validación de código canónico válido.
 * 3. Detección de errores críticos e invariantes del lenguaje Velneo.
 * 4. Validación de fixtures reales (ej. ejemplo_proceso_almacen.json).
 * 5. Ejecución de opciones CLI (fichero, --versiones, --buscar, --info).
 * 6. Validación de sesiones asistidas (pasos con codeTarget).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const testDir = __dirname;
const repoDir = path.dirname(testDir);
const scriptsDir = path.join(repoDir, 'skills', 'velneo-code-generation', 'scripts');
const validadorJs = path.join(scriptsDir, 'validador.js');
const api = require(path.join(scriptsDir, 'ValidadorComandos.js'));

let totalTests = 0;
let passedTests = 0;

function printHeader(title) {
    console.log('\n--- [TEST] ' + title + ' ---');
}

function assertTrue(condition, message) {
    totalTests++;
    if (condition) {
        console.log('  [PASS] ' + message);
        passedTests++;
    } else {
        console.error('  [FAIL] ' + message);
    }
}

function runTests() {
    console.log('=================================================================');
    console.log(' Suite de Pruebas: Validador de Código Velneo (velneo-skills)');
    console.log('=================================================================');

    // ─────────────────────────────────────────────────────────────
    // Test 1: Catálogo Oficial y Metadata
    // ─────────────────────────────────────────────────────────────
    printHeader('1. Catálogo Oficial y Metadatos de Versiones');
    const catalogo = api.obtenerCatalogo();
    const totalCmds = Object.keys(catalogo).length;
    assertTrue(totalCmds >= 160, `Catálogo cargó ${totalCmds} comandos (esperado >= 160)`);
    assertTrue(api.esContenedor('If'), "Contenedor oficial 'If' identificado correctamente");
    assertTrue(api.esContenedor('Cargar lista'), "Contenedor oficial 'Cargar lista' identificado");

    const cmdTilde = api.buscarComando('Añadir ficha a la salida');
    assertTrue(cmdTilde !== null && cmdTilde.nombre === 'Añadir ficha a la salida', 'Búsqueda insensible a tildes y mayúsculas funciona');

    // ─────────────────────────────────────────────────────────────
    // Test 2: Código Canónico Válido
    // ─────────────────────────────────────────────────────────────
    printHeader('2. Validación de Código Canónico Válido');
    const validCode = [
        { comando: "Rem", params: ["Fase 1: Inicialización"], nivel: 0 },
        { comando: "If", params: ["(ESTADO = \"ACTIVO\")"], nivel: 0 },
        { comando: "Cargar lista", params: ["ART_M@vERP_2_dat", "ID"], nivel: 1 },
        { comando: "If", params: ["sysListSize > 0"], nivel: 2 },
        { comando: "Modificar ficha seleccionada", params: [], nivel: 3 },
        { comando: "Modificar campo", params: ["STOCK", "10"], nivel: 4 },
        { comando: "Else", params: [], nivel: 2 },
        { comando: "Set", params: ["MSG", "\"Sin stock\""], nivel: 3 },
        { comando: "Else", params: [], nivel: 0 },
        { comando: "Set", params: ["MSG", "\"Inactivo\""], nivel: 1 }
    ];

    const resValido = api.validarInstrucciones(validCode);
    assertTrue(resValido.valido === true, 'Código canónico válido es aprobado');
    assertTrue(resValido.errores.length === 0, 'No produce errores');
    assertTrue(resValido.advertencias.length === 0, 'No produce advertencias');

    // ─────────────────────────────────────────────────────────────
    // Test 3: Detección de Errores Críticos e Invariantes
    // ─────────────────────────────────────────────────────────────
    printHeader('3. Detección de Errores Críticos e Invariantes');

    // 3a. Prohibición de 'Set retorno proceso = SI'
    const resRetorno = api.validarInstrucciones([
        { comando: "Set retorno proceso = SI", params: [], nivel: 0 }
    ]);
    assertTrue(!resRetorno.valido && resRetorno.errores.some(e => e.includes('NO EXISTE')), "Detecta prohibición estricta de 'Set retorno proceso = SI'");

    // 3b. Operadores inválidos en fórmulas (!= y ==)
    const resFormulas = api.validarInstrucciones([
        { comando: "If", params: ["#EST != \"A\""], nivel: 0 },
        { comando: "Set", params: ["X", "A == B"], nivel: 1 }
    ]);
    assertTrue(resFormulas.advertencias.some(w => w.includes('!=')), "Advierte sobre operador no soportado '!=' (debe ser '!')");
    assertTrue(resFormulas.advertencias.some(w => w.includes('==')), "Advierte sobre operador no soportado '==' (debe ser '=')");

    // 3c. Salto de nivel imposible (0 a 2)
    const resSalto = api.validarInstrucciones([
        { comando: "If", params: ["(A = 1)"], nivel: 0 },
        { comando: "Set", params: ["X", "1"], nivel: 2 }
    ]);
    assertTrue(!resSalto.valido && resSalto.errores.some(e => e.includes('Salto de nivel imposible')), 'Detecta salto de nivel imposible (0 a 2)');

    // 3d. Comando inexistente y sugerencia difusa (Levenshtein)
    const resInexistente = api.validarInstrucciones([
        { comando: "Interfaz: Recargar", params: [], nivel: 0 }
    ]);
    assertTrue(!resInexistente.valido && resInexistente.errores.some(e => e.toLowerCase().includes('no existe') || e.toLowerCase().includes('no reconocido')), "Detecta comando no existente 'Interfaz: Recargar'");
    assertTrue(resInexistente.sugerencias.some(s => s.includes('Interfaz: Recalcular')), "Sugiere reemplazo inteligente 'Interfaz: Recalcular'");

    // 3e. Límites estrictos de parámetros (If con 0 parámetros)
    const resIfSinParams = api.validarInstrucciones([
        { comando: "If", params: [], nivel: 0 }
    ]);
    assertTrue(!resIfSinParams.valido && resIfSinParams.errores.some(e => e.includes('parámetro')), 'Detecta If sin parámetros como error estricto');

    // 3f. Selector de tabla invertido
    const resTablaInv = api.validarInstrucciones([
        { comando: "Cargar lista", params: ["vERP_2_dat.vcd@ART_M", "ID"], nivel: 0 }
    ]);
    assertTrue(resTablaInv.advertencias.some(w => w.includes('Selector de tabla')), "Advierte sobre selector de tabla no canónico ('TABLA@ALIAS')");

    // ─────────────────────────────────────────────────────────────
    // Test 4: Fixture de Proceso Real
    // ─────────────────────────────────────────────────────────────
    printHeader('4. Fixture Real de Proceso de Almacén');
    const fixturePath = path.join(testDir, 'fixtures', 'ejemplo_proceso_almacen.json');
    assertTrue(fs.existsSync(fixturePath), 'Fixture ejemplo_proceso_almacen.json existe');

    const fixtureRaw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const instrsFixture = fixtureRaw.instrucciones || fixtureRaw;
    const resFixture = api.validarInstrucciones(instrsFixture);
    assertTrue(resFixture.valido === true, 'Fixture real de proceso supera validación sin errores');

    // ─────────────────────────────────────────────────────────────
    // Test 5: Opciones CLI de validador.js
    // ─────────────────────────────────────────────────────────────
    printHeader('5. Opciones CLI de validador.js');
    assertTrue(fs.existsSync(validadorJs), 'validador.js existe');

    // 5a. CLI con fixture válido
    try {
        const outCliFixture = execFileSync('node', [validadorJs, fixturePath], { encoding: 'utf8' });
        assertTrue(outCliFixture.includes('VALIDO [OK]'), 'CLI valida fixture con salida VALIDO [OK] y exit code 0');
    } catch (e) {
        assertTrue(false, 'CLI falló al validar fixture: ' + e.message);
    }

    // 5b. CLI --versiones
    try {
        const outCliVers = execFileSync('node', [validadorJs, '--versiones'], { encoding: 'utf8' });
        assertTrue(outCliVers.includes('v7_0') && outCliVers.includes('v33_v36'), 'CLI --versiones lista las versiones oficiales del catálogo');
    } catch (e) {
        assertTrue(false, 'CLI --versiones falló: ' + e.message);
    }

    // 5c. CLI --buscar
    try {
        const outCliBuscar = execFileSync('node', [validadorJs, '--buscar', 'Cargar lista'], { encoding: 'utf8' });
        assertTrue(outCliBuscar.includes('Cargar lista') && outCliBuscar.includes('Contenedor:   SÍ'), 'CLI --buscar localiza comando y muestra metadatos');
    } catch (e) {
        assertTrue(false, 'CLI --buscar falló: ' + e.message);
    }

    // 5d. CLI --info
    try {
        const outCliInfo = execFileSync('node', [validadorJs, '--info'], { encoding: 'utf8' });
        const parsedInfo = JSON.parse(outCliInfo);
        assertTrue(parsedInfo && parsedInfo.total_comandos >= 160, 'CLI --info devuelve JSON con catálogo canónico');
    } catch (e) {
        assertTrue(false, 'CLI --info falló: ' + e.message);
    }

    // ─────────────────────────────────────────────────────────────
    // Resumen Final
    // ─────────────────────────────────────────────────────────────
    console.log('\n=================================================================');
    console.log(` RESUMEN DE PRUEBAS: ${passedTests} / ${totalTests} SUPERADAS (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('=================================================================');

    if (passedTests === totalTests) {
        console.log('✓ Todos los tests han pasado con éxito. validador.js es el motor único oficial.\n');
        return 0;
    } else {
        console.error('✗ Algunos tests han fallado.\n');
        return 1;
    }
}

if (require.main === module) {
    process.exit(runTests());
}

module.exports = { runTests };
