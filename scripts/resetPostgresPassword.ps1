# Run this ONCE in an elevated (Administrator) PowerShell window.
# Sets the postgres superuser password to match the value already written
# into ..\.env (PGPASSWORD), then restores normal scram-sha-256 auth.

$ErrorActionPreference = 'Stop'
$hba = 'C:\Program Files\PostgreSQL\18\data\pg_hba.conf'
$backup = "$hba.bak_$(Get-Date -Format yyyyMMdd_HHmmss)"
$newPassword = 'drscreening_dev_2026'

Write-Output "Backing up pg_hba.conf to $backup"
Copy-Item $hba $backup

Write-Output "Temporarily switching local/host auth to trust..."
(Get-Content $hba) -replace '\bscram-sha-256\b', 'trust' | Set-Content $hba

Write-Output "Restarting postgresql-x64-18..."
Restart-Service postgresql-x64-18
Start-Sleep -Seconds 3

Write-Output "Setting postgres password..."
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -c "ALTER USER postgres PASSWORD '$newPassword';"

Write-Output "Restoring scram-sha-256 auth..."
Copy-Item $backup $hba -Force

Write-Output "Restarting postgresql-x64-18 again..."
Restart-Service postgresql-x64-18
Start-Sleep -Seconds 3

Write-Output "Done. postgres password is now set; pg_hba.conf restored to its original auth method."
