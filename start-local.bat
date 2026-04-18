@echo off
setlocal

REM Démarrage local (Windows) : serveur + client
REM Prérequis : Node.js + npm install déjà fait à la racine

cd /d "%~dp0"

echo.
echo === CLUB ROSENDAEL - Demarrage local ===
echo.

if not exist "%~dp0server\" (
  echo ERREUR: Dossier introuvable: "%~dp0server\"
  pause
  exit /b 1
)
if not exist "%~dp0client\" (
  echo ERREUR: Dossier introuvable: "%~dp0client\"
  pause
  exit /b 1
)

REM Ouvre 2 fenêtres séparées (plus simple à fermer/redémarrer)
REM Utilise pushd/popd + call npm.cmd pour éviter les soucis de quoting/cmd.
start "CLUB - SERVER" cmd /v:on /k "pushd ""%~dp0server"" ^&^& set PORT=5174 ^&^& call npm.cmd run dev"
start "CLUB - SERVER" cmd /v:on /k "pushd ""%~dp0server"" ^&^& set PORT=5174 ^&^& set ORIGIN=* ^&^& call npm.cmd run dev"
start "CLUB - CLIENT" cmd /v:on /k "pushd ""%~dp0client"" ^&^& call npm.cmd run dev -- --host 0.0.0.0 --port 5173 --strictPort"

echo.
echo Serveur : http://localhost:5174
echo Client  : http://localhost:5173
echo.
echo (Tu peux fermer les 2 fenetres pour arreter.)
echo.

endlocal

