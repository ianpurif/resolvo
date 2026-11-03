param([string]$NodePath = (Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env.local'))) { throw 'Configure .env.local before starting the worker.' }
$logDirectory = Join-Path $projectRoot '.local\worker'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$workerProcess = Start-Process -FilePath $NodePath -ArgumentList '--env-file=.env.local --conditions=react-server --import tsx scripts/integration-worker.ts' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $logDirectory 'stdout.log') -RedirectStandardError (Join-Path $logDirectory 'stderr.log')
exit $workerProcess.ExitCode
