@echo off
rem Met Atelier a jour quand il est lance depuis le clone (npm start) : recupere la derniere version
rem sur GitHub, installe les librairies, relance Atelier.
rem Double-clique ce fichier, ou utilise le bouton "Mise a jour" d'Atelier (qui lance ce meme script).

chcp 65001 >nul
title Atelier - mise a jour
rem On se place a la racine du depot (le dossier au-dessus de ce script), d'ou qu'il soit lance.
cd /d "%~dp0.."

echo.
echo === Mise a jour d'Atelier ===
echo.

rem Laisse a Atelier le temps de se fermer s'il vient de lancer ce script.
timeout /t 2 /nobreak >nul

rem npm install reecrit parfois package-lock.json sous Windows, ce qui bloquerait git pull.
rem On annule ce changement local : il sera regenere juste apres.
git checkout -- hub/package-lock.json 2>nul

echo [1/2] Recuperation de la derniere version...
git pull --ff-only
if errorlevel 1 goto erreur

echo.
echo [2/2] Installation des librairies...
cd hub
call npm install
if errorlevel 1 goto erreur

echo.
echo Mise a jour terminee. Relance d'Atelier...
start "Atelier" /min cmd /c npm start
exit /b 0

:erreur
echo.
echo La mise a jour a echoue. Lis le message ci-dessus, puis appuie sur une touche pour fermer.
echo (Tu peux aussi me copier ce message.)
pause >nul
exit /b 1
