# Utilisé par l'installeur Windows de Skald, Brokk et Tafl (commun/installeur.nsh), quand l'ancienne
# version ne peut pas être retirée : quels programmes gardent ouvert un fichier du dossier de l'outil ?
# On le demande au « Gestionnaire de redémarrage » de Windows (Restart Manager), celui qui permet aux
# installeurs de dire « Ces applications utilisent des fichiers qui doivent être mis à jour ».
#   -Dossier <chemin> : le dossier d'installation de l'outil.
#   -Fermer           : en plus, ferme ces programmes (seulement ceux de ta session Windows).
# Écrit un programme par ligne (« Nom (n° de processus) ») et sort avec le code 1 s'il en a trouvé, 0 sinon.
param([Parameter(Mandatory = $true)][string]$Dossier, [switch]$Fermer)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class Bloqueurs {
  [StructLayout(LayoutKind.Sequential)] struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
    public int ApplicationType; public uint AppStatus; public uint TSSessionId; [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint h, int f, string key);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint nFiles, string[] files, uint nApps, RM_UNIQUE_PROCESS[] apps, uint nServices, string[] services);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint needed, ref uint n, [In, Out] RM_PROCESS_INFO[] infos, ref uint reasons);
  public static int[] Trouver(string[] fichiers) {
    var pids = new List<int>();
    uint h; if (RmStartSession(out h, 0, Guid.NewGuid().ToString()) != 0) return pids.ToArray();
    try {
      if (RmRegisterResources(h, (uint)fichiers.Length, fichiers, 0, null, 0, null) != 0) return pids.ToArray();
      uint needed = 0, n = 0, reasons = 0;
      int r = RmGetList(h, out needed, ref n, null, ref reasons);
      if (r == 234 && needed > 0) { // ERROR_MORE_DATA : on sait maintenant combien il y en a
        var infos = new RM_PROCESS_INFO[needed]; n = needed;
        if (RmGetList(h, out needed, ref n, infos, ref reasons) == 0)
          for (int i = 0; i < n; i++) pids.Add(infos[i].Process.dwProcessId);
      }
    } finally { RmEndSession(h); }
    return pids.ToArray();
  }
}
'@

$fichiers = @(Get-ChildItem -LiteralPath $Dossier -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object FullName)
if (-not $fichiers.Count) { exit 0 }
$moi = $PID
$session = (Get-Process -Id $PID).SessionId
$trouves = @([Bloqueurs]::Trouver($fichiers) | Where-Object { $_ -ne $moi } | Sort-Object -Unique)
if (-not $trouves.Count) { exit 0 }
foreach ($id in $trouves) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if (-not $p) { continue }
  Write-Output "$($p.ProcessName) ($id)"
  if ($Fermer -and $p.SessionId -eq $session) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
}
exit 1
