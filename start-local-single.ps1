$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "=== CLUB ROSENDAEL - Demarrage local (1 fenetre) ==="
Write-Host ""

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "ERREUR: npm introuvable. Installe Node.js puis relance." -ForegroundColor Red
  exit 1
}

Write-Host "Serveur : http://localhost:5174"
Write-Host "Client  : http://localhost:5173"
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

Stop-Port 5173
Stop-Port 5174

# Demarre dans une seule fenetre (sans concurrently)
Start-Process -FilePath "cmd.exe" -WorkingDirectory (Join-Path $PSScriptRoot "server") -ArgumentList "/k", "set PORT=5174 && npm run dev"
Start-Process -FilePath "cmd.exe" -WorkingDirectory (Join-Path $PSScriptRoot "client") -ArgumentList "/k", "set VITE_API_URL=http://localhost:5174 && npm run dev -- --port 5173 --strictPort"

Write-Host ""
Write-Host "OK: 2 fenetres ouvertes."

