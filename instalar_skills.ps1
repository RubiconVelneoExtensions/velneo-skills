<#
.SYNOPSIS
    Instalador y sincronizador universal de Skills de Velneo en Clientes de IA.
.DESCRIPTION
    Instala y sincroniza las skills contenidas en este repositorio (como 'velneo-code-generation')
    hacia los entornos de IA compatibles:
    1. Gemini / Antigravity ($HOME/.gemini/config/skills/)
    2. Antigravity Plugins ($HOME/.gemini/config/plugins/)
    3. Claude Code ($HOME/.claude/skills/ si existe)
.PARAMETER Verificar
    Si se especifica, solo comprueba el estado de sincronización sin realizar cambios.
.PARAMETER Force
    Sobrescribe archivos sin confirmación (por defecto $true).
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\instalar_skills.ps1
    powershell -ExecutionPolicy Bypass -File .\instalar_skills.ps1 -Verificar
#>

[CmdletBinding()]
param(
    [switch]$Verificar,
    [switch]$Force = $true
)

$ErrorActionPreference = "Stop"

$RepoDir = $PSScriptRoot
$SkillsDir = Join-Path $RepoDir "skills"
$SkillCodeGenSource = Join-Path $SkillsDir "velneo-code-generation"

if (-not (Test-Path $SkillCodeGenSource)) {
    Write-Error "No se encontro el directorio de origen de la skill: $SkillCodeGenSource"
    return
}

$UserProfile = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile)

# Destinos
$AntigravityPluginBase = Join-Path $UserProfile ".gemini\config\plugins"
$AntigravityCodeGenDir = Join-Path $AntigravityPluginBase "velneo-code-generation\skills\velneo-code-generation"

$GeminiSkillsBase = Join-Path $UserProfile ".gemini\config\skills"
$GeminiCodeGenDir = Join-Path $GeminiSkillsBase "velneo-code-generation"

$ClaudeBase = Join-Path $UserProfile ".claude"
$ClaudeSkillsBase = Join-Path $ClaudeBase "skills"
$ClaudeCodeGenDir = Join-Path $ClaudeSkillsBase "velneo-code-generation"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Velneo Skills - Instalador Global en Clientes de IA" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Origen canonico: $SkillCodeGenSource" -ForegroundColor Gray
Write-Host "Modo: $(if ($Verificar) { 'SOLO COMPROBACION' } else { 'INSTALACION / SINCRONIZACION' })" -ForegroundColor Yellow
Write-Host ""

function Copiar-DirectorioRecursivo($Origen, $Destino, $SoloComprobar) {
    $archivosOrigen = Get-ChildItem -Path $Origen -Recurse -File | Where-Object { $_.FullName -notmatch '__pycache__' }
    $cambios = 0

    foreach ($archivo in $archivosOrigen) {
        $relativo = $archivo.FullName.Substring($Origen.Length).TrimStart("\", "/")
        $rutaDestino = Join-Path $Destino $relativo

        $necesitaCopia = $false
        if (-not (Test-Path $rutaDestino)) {
            $necesitaCopia = $true
        } else {
            $hashOrigen = (Get-FileHash $archivo.FullName).Hash
            $hashDestino = (Get-FileHash $rutaDestino).Hash
            if ($hashOrigen -ne $hashDestino) {
                $necesitaCopia = $true
            }
        }

        if ($necesitaCopia) {
            $cambios++
            if (-not $SoloComprobar) {
                $dirDestinoPadre = Split-Path $rutaDestino -Parent
                if (-not (Test-Path $dirDestinoPadre)) {
                    New-Item -ItemType Directory -Path $dirDestinoPadre -Force | Out-Null
                }
                Copy-Item -Path $archivo.FullName -Destination $rutaDestino -Force
            }
        }
    }
    return $cambios
}

$resultados = @()

# 1. Antigravity Plugins (velneo-code-generation)
if (Test-Path (Join-Path $AntigravityPluginBase "velneo-code-generation")) {
    $cambios = Copiar-DirectorioRecursivo -Origen $SkillCodeGenSource -Destino $AntigravityCodeGenDir -SoloComprobar $Verificar
    $estado = if ($Verificar) {
        if ($cambios -eq 0) { "[OK] Sincronizado" } else { "[REQ] Requiere actualizar ($cambios archivos)" }
    } else {
        if ($cambios -eq 0) { "[OK] Ya estaba actualizado" } else { "[SYNC] Actualizado ($cambios archivos)" }
    }
    $resultados += [PSCustomObject]@{
        Destino = "Antigravity Plugin (velneo-code-generation)"
        Tipo = "IA Plugin"
        Estado = $estado
        Archivos = $cambios
    }
}

# 2. Gemini Global Skills (velneo-code-generation)
if (Test-Path (Join-Path $UserProfile ".gemini\config")) {
    $cambios = Copiar-DirectorioRecursivo -Origen $SkillCodeGenSource -Destino $GeminiCodeGenDir -SoloComprobar $Verificar
    $estado = if ($Verificar) {
        if ($cambios -eq 0) { "[OK] Sincronizado" } else { "[REQ] Requiere actualizar ($cambios archivos)" }
    } else {
        if ($cambios -eq 0) { "[OK] Ya estaba actualizado" } else { "[SYNC] Actualizado ($cambios archivos)" }
    }
    $resultados += [PSCustomObject]@{
        Destino = "Gemini Global Skills (velneo-code-generation)"
        Tipo = "IA Global"
        Estado = $estado
        Archivos = $cambios
    }
}

# 3. Claude Code (velneo-code-generation)
if (Test-Path $ClaudeBase) {
    $cambiosClaude = Copiar-DirectorioRecursivo -Origen $SkillCodeGenSource -Destino $ClaudeCodeGenDir -SoloComprobar $Verificar
    $estadoClaude = if ($Verificar) {
        if ($cambiosClaude -eq 0) { "[OK] Sincronizado" } else { "[REQ] Requiere actualizar ($cambiosClaude archivos)" }
    } else {
        if ($cambiosClaude -eq 0) { "[OK] Ya estaba actualizado" } else { "[SYNC] Actualizado ($cambiosClaude archivos)" }
    }
    $resultados += [PSCustomObject]@{
        Destino = "Claude Code (velneo-code-generation)"
        Tipo = "IA Global"
        Estado = $estadoClaude
        Archivos = $cambiosClaude
    }
}

Write-Host "Resultado de sincronizacion:" -ForegroundColor White
$resultados | Format-Table -AutoSize

Write-Host ""
if ($Verificar) {
    Write-Host "Comprobacion completada." -ForegroundColor Green
} else {
    Write-Host "Skills de Velneo sincronizadas correctamente con las IAs." -ForegroundColor Green
}
