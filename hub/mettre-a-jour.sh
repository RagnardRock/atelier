#!/bin/sh
# Met Atelier à jour (version Linux / macOS de mettre-a-jour.bat) :
# récupère la dernière version sur GitHub, installe les librairies, relance Atelier.

cd "$(dirname "$0")/.." || exit 1

echo "=== Mise à jour d'Atelier ==="
# Laisse à Atelier le temps de se fermer s'il vient de lancer ce script.
sleep 2

git checkout -- hub/package-lock.json 2>/dev/null

echo "[1/2] Récupération de la dernière version..."
git pull --ff-only || { echo "La mise à jour a échoué (git pull)."; exit 1; }

echo "[2/2] Installation des librairies..."
cd hub && npm install || { echo "La mise à jour a échoué (npm install)."; exit 1; }

echo "Mise à jour terminée. Relance d'Atelier..."
nohup npm start >/dev/null 2>&1 &
