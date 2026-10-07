#!/usr/bin/env node
/**
 * validador.js — Puente Node.js y CLI para ValidadorComandos.js
 * 
 * Permite usar el validador y catálogo de comandos Velneo desde:
 * 1. CLI directo: node validador.js target.json
 * 2. Node.js require: const validador = require('./validador.js');
 * 3. Puente MCP: mcp-server/server.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargarValidador() {
    const validadorPath = path.join(__dirname, 'ValidadorComandos.js');
    let code = fs.readFileSync(validadorPath, 'utf8');
    // Eliminar directivas exclusivas de QML (.pragma y .import)
    code = code.replace(/^\.pragma[^\r\n]*[\r\n]+/m, '');
    code = code.replace(/^\.import[^\r\n]*[\r\n]+/gm, '');

    const mod = { exports: {} };
    const ctx = vm.createContext({
        module: mod,
        exports: mod.exports,
        console: console,
        process: process,
        require: require,
        __dirname: __dirname,
        __filename: validadorPath
    });

    vm.runInContext(code, ctx);
    return mod.exports;
}

const api = cargarValidador();

api.ejecutarCli = function(args) {
    if (!args || args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log('Validador Oficial de Código Velneo (Puente Guía / Antigravity)');
        console.log('Catálogo exhaustivo de 177 comandos clasificados por versiones de Velneo.');
        console.log('\nUso:');
        console.log('  node validador.js <archivo.json>        Valida un archivo JSON de instrucciones.');
        console.log('  node validador.js --versiones           Muestra el resumen de comandos por versión.');
        console.log('  node validador.js --buscar <comando>    Busca o sugiere comandos similares.');
        console.log('  node validador.js --info                Muestra información detallada del catálogo.');
        process.exit(0);
    }

    if (args[0] === '--versiones') {
        const info = api.CATALOGO_INFO;
        console.log('=== Versiones de Velneo en el Catálogo (' + info.total_comandos + ' comandos en total) ===\n');
        for (const vId in info.versiones) {
            const v = info.versiones[vId];
            console.log(`[${v.id}] ${v.nombre}`);
            console.log(`  Comandos: ${v.total}`);
            console.log(`  Alcance:  ${v.descripcion}\n`);
        }
        process.exit(0);
    }

    if (args[0] === '--buscar') {
        const query = args.slice(1).join(' ');
        if (!query) {
            console.error('Error: Debe especificar un término de búsqueda.');
            process.exit(1);
        }
        const exacto = api.buscarComando(query);
        if (exacto) {
            console.log(`✓ Comando oficial encontrado: "${exacto.nombre}"`);
            console.log(`  Versión:      ${exacto.version}`);
            console.log(`  Categoría:    ${exacto.categoria}`);
            console.log(`  Contenedor:   ${exacto.esContenedor ? 'SÍ (admite subinstrucciones)' : 'NO'}`);
            console.log(`  Parámetros:   ${exacto.paramsMin} a ${exacto.paramsMax}`);
            console.log(`  Descripción:  ${exacto.descripcion}`);
        } else {
            console.log(`✗ No existe el comando exacto "${query}".`);
            const sugeridos = api.sugerirComandos(query, 5);
            if (sugeridos.length > 0) {
                console.log('\nSugerencias más cercanas en la documentación de Velneo:');
                sugeridos.forEach(s => {
                    console.log(`  • "${s.nombre}" [${s.version}, ${s.categoria}] (distancia: ${s.distancia})`);
                    console.log(`    ${s.descripcion}`);
                });
            }
        }
        process.exit(0);
    }

    if (args[0] === '--info') {
        console.log(JSON.stringify(api.CATALOGO_INFO, null, 2));
        process.exit(0);
    }

    const filePath = args[0];
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);

        // Si es una sesión asistida con pasos
        if (parsed && Array.isArray(parsed.pasos)) {
            console.log('=================================================');
            console.log('Validación de Sesión Asistida: ' + filePath);
            console.log('Pasos en la sesión: ' + parsed.pasos.length);
            console.log('=================================================');

            let totalPasosConCodigo = 0;
            let totalInstrs = 0;
            let totalErrores = 0;

            parsed.pasos.forEach((p, idx) => {
                if (p.codeTarget && Array.isArray(p.codeTarget.instrucciones)) {
                    totalPasosConCodigo++;
                    const instrs = p.codeTarget.instrucciones;
                    totalInstrs += instrs.length;
                    const res = api.validarInstrucciones(instrs);
                    console.log(`\n[${p.id || 'P' + (idx + 1)}] ${p.titulo} (${instrs.length} instrs) -> ${res.valido ? '✓ OK' : '✗ ERRORES'}`);
                    if (!res.valido) {
                        totalErrores += res.errores.length;
                        res.errores.forEach(e => console.log('    [X] ' + e));
                    }
                    if (res.advertencias.length > 0) {
                        res.advertencias.forEach(a => console.log('    [!] ' + a));
                    }
                    if (res.sugerencias.length > 0) {
                        res.sugerencias.forEach(s => console.log('    [?] ' + s));
                    }
                }
            });

            console.log('\n-------------------------------------------------');
            console.log(`Resumen sesión: ${totalPasosConCodigo} pasos con código, ${totalInstrs} instrucciones.`);
            console.log(`Resultado: ${totalErrores === 0 ? 'VALIDO [OK]' : 'INVALIDO (' + totalErrores + ' errores)'}`);
            console.log('-------------------------------------------------');
            process.exit(totalErrores === 0 ? 0 : 1);
        }

        const instrs = Array.isArray(parsed) ? parsed : (parsed.instrucciones || parsed.instructions || []);
        const res = api.validarInstrucciones(instrs);

        console.log('=================================================');
        console.log('Validación de Código Velneo: ' + filePath);
        console.log('Instrucciones analizadas: ' + res.total);
        console.log('Estado: ' + (res.valido ? 'VALIDO [OK]' : 'INVALIDO [ERRORES DETECTADOS]'));
        console.log('=================================================');

        if (res.errores.length > 0) {
            console.log('\nERRORES (' + res.errores.length + '):');
            res.errores.forEach(e => console.log('  [X] ' + e));
        }
        if (res.advertencias.length > 0) {
            console.log('\nADVERTENCIAS (' + res.advertencias.length + '):');
            res.advertencias.forEach(a => console.log('  [!] ' + a));
        }
        if (res.sugerencias.length > 0) {
            console.log('\nSUGERENCIAS:');
            res.sugerencias.forEach(s => console.log('  [?] ' + s));
        }

        process.exit(res.valido ? 0 : 1);
    } catch (err) {
        console.error('Error al procesar archivo:', err.message);
        process.exit(2);
    }
};

module.exports = api;

if (require.main === module) {
    api.ejecutarCli(process.argv.slice(2));
}
