 = ) { Remove-Item -Recurse -Force  -Force | Out-Null

# Copy bin/
mkdir ( + '\bin\*') -Destination ( + '\resources\uv-tools') -Force | Out-Null
Copy-Item -Recurse -Path ( + '\resources\uv-tools')
Write-Host 'OK uv-tools/'

# Copy data
mkdir ( + '\data\*') -Destination ( =  =  -Force | Out-Null
Get-ChildItem -Path /c/Users/ZXKJ/.claude/shell-snapshots/snapshot-bash-1779106532690-99eq4y.sh.FullName -Destination (/c/Users/ZXKJ/.claude/shell-snapshots/snapshot-bash-1779106532690-99eq4y.sh.Name) -Force
}
if (Test-Path ( + '\dist\*') -Destination ( + '\node_modules')) { Copy-Item -Recurse -Path ( + '\node_modules') }
'scripts','skills','docs' | ForEach-Object {
     + '\' + ) { Copy-Item -Recurse -Path ( + '\' +  + '\resources\data\.openclaw') -Force | Out-Null
Copy-Item -Path ( + '\resources\data\.openclaw\clawpanel.json')
Write-Host 'OK .openclaw/'

# superclaw.exe
Copy-Item -Path ( + '\superclaw.exe')
Write-Host 'OK superclaw.exe'

Write-Host 'Copy complete'
