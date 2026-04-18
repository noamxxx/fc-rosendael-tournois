$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "=== CLUB ROSENDAEL - Demarrage local ==="
Write-Host ""

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "ERREUR: npm introuvable. Installe Node.js puis relance." -ForegroundColor Red
  exit 1
}

# Lance le serveur et le client dans 2 fenetres separées (robuste: WorkingDirectory)
$serverDir = Join-Path $PSScriptRoot "server"
$clientDir = Join-Path $PSScriptRoot "client"

if (-not (Test-Path $serverDir)) { throw "Dossier introuvable: $serverDir" }
if (-not (Test-Path $clientDir)) { throw "Dossier introuvable: $clientDir" }

Write-Host "Server dir: $serverDir"
Write-Host "Client dir: $clientDir"
Write-Host ""

function Stop-Port([int]$Port) {
  $lines = netstat -ano | Select-String -Pattern (":$Port") 
  foreach ($l in $lines) {
    $parts = ($l -split "\s+") | Where-Object { $_ -ne "" }
    $procId = $parts[-1]
    if ($procId -and $procId -match "^\d+$" -and [int]$procId -ne 0) {
      try { taskkill /PID $procId /F 2>$null | Out-Null } catch {}
    }
  }
}

# Libere les ports par defaut si deja utilisés
Stop-Port 5173
Stop-Port 5174

Start-Process -FilePath "cmd.exe" -WorkingDirectory $serverDir -ArgumentList "/k", "set PORT=5174 && set ORIGIN=* && npm run dev"
Start-Process -FilePath "cmd.exe" -WorkingDirectory $clientDir -ArgumentList "/k", "npm run dev -- --host 0.0.0.0 --port 5173 --strictPort"

Write-Host "Serveur : http://localhost:5174"
Write-Host "Client  : http://localhost:5173"
Write-Host ""
Write-Host "Ferme les 2 fenetres pour arreter."
Write-Host ""

