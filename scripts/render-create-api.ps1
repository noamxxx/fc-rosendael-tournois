# Crée le Web Service sur Render (une fois GitHub lié au compte Render).
# Obligatoire avant : https://dashboard.render.com → ton profil / GitHub → connecter le compte
# et autoriser l’app Render sur le repo `fc-rosendael-tournois` (lecture + webhook).
#
# Usage : depuis la racine du repo
#   pwsh -File scripts/render-create-api.ps1
#
# Puis : copie l’URL onrender.com dans VITE_API_URL (Cloudflare Pages) et redeploie le front.

$ErrorActionPreference = "Stop"
$render = Join-Path $env:USERPROFILE ".local\bin\render.exe"
if (-not (Test-Path $render)) {
  Write-Error "CLI Render introuvable à $render — installe-la : https://render.com/docs/cli"
}

$secret = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

& $render services create `
  --name fc-rosendael-api `
  --type web_service `
  --repo https://github.com/noamxxx/fc-rosendael-tournois `
  --branch main `
  --root-directory server `
  --runtime node `
  --region frankfurt `
  --plan free `
  --build-command "npm ci" `
  --start-command "npm start" `
  --health-check-path /health `
  --build-filter-path "server/**" `
  --build-filter-path "render.yaml" `
  --env-var "NODE_VERSION=22.12.0" `
  --env-var "NODE_ENV=production" `
  --env-var "ORIGIN=*" `
  --env-var "ADMIN_TOKEN_SECRET=$secret" `
  --env-var "ADMIN_PASSWORD=change-me-apres-premiere-connexion" `
  --confirm `
  -o json

Write-Host "`nSi erreur « unfetchable » : lie GitHub à Render et autorise le repo, puis relance ce script."
Write-Host "Ensuite : Render → service → Manual Deploy, ou git push sur main."
