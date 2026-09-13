$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$workDir = 'C:\JJTY'
$logFile = Join-Path $workDir 'bootstrap.log'
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
Start-Transcript -Path $logFile -Append

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $chromeInstaller = Join-Path $workDir 'chrome-enterprise.msi'
    Invoke-WebRequest -Uri 'https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi' -OutFile $chromeInstaller
    Start-Process msiexec.exe -Wait -ArgumentList @('/i', $chromeInstaller, '/qn', '/norestart')

    $dcvInstaller = Join-Path $workDir 'amazon-dcv-server.msi'
    Invoke-WebRequest -Uri 'https://d1uj6qtbmh3dt5.cloudfront.net/nice-dcv-server-x64-Release.msi' -OutFile $dcvInstaller
    Start-Process msiexec.exe -Wait -ArgumentList @('/i', $dcvInstaller, 'ADDLOCAL=ALL', '/qn', '/norestart')

    reg.exe ADD 'HKEY_USERS\S-1-5-18\Software\GSettings\com\nicesoftware\dcv\session-management\automatic-console-session' /v owner /t REG_SZ /d Administrator /f | Out-Null
    reg.exe ADD 'HKEY_USERS\S-1-5-18\Software\GSettings\com\nicesoftware\dcv\smartcard' /v enable-cache /t REG_SZ /d always-on /f | Out-Null

    New-NetFirewallRule -DisplayName 'Amazon DCV 8443' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 -ErrorAction SilentlyContinue | Out-Null
    Set-Service -Name dcvserver -StartupType Automatic
    Restart-Service -Name dcvserver

    $publicDesktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $publicDesktop 'MahaTenders.lnk'))
    $shortcut.TargetPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
    $shortcut.Arguments = '--start-maximized https://mahatenders.gov.in/nicgep/app'
    $shortcut.WorkingDirectory = $workDir
    $shortcut.Save()

    @{
        ready = $true
        dcv = 'installed'
        chrome = 'installed'
        preparedAt = (Get-Date).ToUniversalTime().ToString('o')
        tender = '2026_PWR_1337988_1'
    } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $workDir 'ready.json')
}
finally {
    Stop-Transcript
}
