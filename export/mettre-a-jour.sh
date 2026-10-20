#!/bin/sh
# Met Brokk à jour (version Linux / macOS de mettre-a-jour.bat) :
# récupère la dernière version sur GitHub, installe les librairies, relance Brokk.

cd "$(dirname "$0")/.." || exit 1

echo "=== Mise à jour de Brokk ==="
# Laisse à Brokk le temps de se fermer s'il vient de lancer ce script.
sleep 2

git checkout -- export/package-lock.json 2>/dev/null

echo "[1/2] Récupération de la dernière version..."
git pull --ff-only || { echo "La mise à jour a échoué (git pull)."; exit 1; }

echo "[2/2] Installation des librairies..."
cd export && npm install || { echo "La mise à jour a échoué (npm install)."; exit 1; }

echo "Mise à jour terminée. Relance de Brokk..."
nohup npm start >/dev/null 2>&1 &
