######################################################
######################################################
# PREAMBLE
######################################################
######################################################

## Custom Functions
function Test-CommandExists {
    param($command)
    $exists = $null -ne (Get-Command $command -ErrorAction SilentlyContinue)
    return $exists
}

# Install Scoop if not already installed
if (-not (Test-CommandExists "scoop")) {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
}

# Install Git if not already installed
if (-not (Test-CommandExists "git")) {
    winget install --id=Git.Git -e
}


## Required Variables
$border1 = "========================================"
$border2 = "-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-"
$border3 = "----------------------------------------"

$scriptRootDir = $PSScriptRoot
$scriptDir = "$scriptRootDir\windows_config"
$programFiles = (Get-Item "C:\Program Files").FullName
$appDataRoamingDir = $env:APPDATA
$gitDir = (Get-Command "git").Source.Replace("\cmd\git.exe", "")
$fileOnePath = "$gitDir\usr\bin\file.exe"
$setupTempDir = "$scriptRootDir\_setup_temp"
New-Item -ItemType Directory -Path $setupTempDir -ErrorAction SilentlyContinue

$scoopPackages = @(
    "7zip",
    "main/btop",
    "chafa"
    "fd",
    "ghostscript",
	"hyperfine",
    "gsudo",
    "imagemagick",
    "jid",
    "jq",
    "ripgrep",
    "yazi",
    "tokei",
    "cht",
    "fzf",
    "zoxide",
    "bat",
    "fastfetch",
    "vim",
    "oh-my-posh",
    "speedtest-cli",
    "lua",
    "fnm",
    "neovim"
)
$wingetRegularPackages = @(
    "LocalSend.LocalSend",
    "VideoLAN.VLC",
    "Spotify.Spotify",
    "Alex313031.Thorium.AVX2",
    "Google.GoogleDrive"
    "Microsoft.PowerToys",
    "Flow-Launcher.Flow-Launcher",
    "voidtools.Everything",
    "File-New-Project.EarTrumpet"
)
$wingetBuildPackages = @(
    "Anaconda.Miniconda3",
    "Rustlang.Rustup"
)
$wingetEditorPackages = @(
    "SublimeHQ.SublimeText.4",
    "Microsoft.VisualStudioCode"
)

# Ask user to launch in admin mode if not already in admin mode
$inAdminMode = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $inAdminMode) {
    Write-Host "$border1$border1" -ForegroundColor Red -BackgroundColor Black
    Write-Host "Script is not running in admin mode!!" -ForegroundColor Red -BackgroundColor Black
    Write-Host "Installing packages may require admin privileges!!" -ForegroundColor Red -BackgroundColor Black
    Write-Host "$border1$border1" -ForegroundColor Red -BackgroundColor Black    
}


######################################################
######################################################
# FONT INSTALL SECTION
######################################################
######################################################
Write-Host "$border1$border1" -ForegroundColor Yellow
Write-Host "FONT INSTALLATION SECTION" -ForegroundColor Yellow
Write-Host "$border1$border1" -ForegroundColor Yellow

$FontsFolder = "$scriptRootDir\CascadiaCode"
$FONTS = 0x14

$CopyOptions = 4 + 16
$objShell = New-Object -ComObject Shell.Application
$objFolder = $objShell.Namespace($FONTS)

# Get all font files in the directory
$allFonts = Get-ChildItem -Path $FontsFolder -File | Where-Object { $_.Extension -eq ".ttf" }

# Print all font files to install, and get user confirmation to install
Write-Host ">>> Following fonts will be installed:"
foreach ($font in $allFonts) {
    Write-Host "- $($font.Name)"
}
Write-Host "$border3$border3"

$installFonts = Read-Host "Do you want to install these fonts? ([Y]es/[n]o)"
if ($installFonts -eq "n") {
    Write-Host "Skipping font installation..." -ForegroundColor White
}
else {
    # Install fonts
    foreach ($font in $allFonts) {
        $dest1 = "C:\Windows\Fonts\$($font.Name)"
        $dest2 = "$env:USERPROFILE\AppData\Local\Microsoft\Windows\Fonts\$($font.Name)"
        if (Test-Path -Path $dest1) {
            Write-Host "Font $($font.Name) already installed" -ForegroundColor White
        }
        elseif (Test-Path -Path $dest2) {
            Write-Host "Font $($font.Name) already installed" -ForegroundColor White
        }
        else {
            Write-Host "Installing $($font.Name)" -ForegroundColor Green
            $CopyFlag = [String]::Format("{0:x}", $CopyOptions)
            $objFolder.CopyHere($font.FullName, $CopyFlag)
        }
    }
}


######################################################
######################################################
# PACKAGE INSTALL SECTION
######################################################
######################################################
Write-Host "$border1$border1" -ForegroundColor Yellow
Write-Host "PACKAGE INSTALLATION SECTION" -ForegroundColor Yellow
Write-Host "$border1$border1" -ForegroundColor Yellow

Write-Host ""
Write-Host "$border3$border3"
# Show apps within each category
Write-Host ">>> (1) Scoop packages:"
$scoopPackages | ForEach-Object {
    Write-Host "- $_"
}
Write-Host "$border2"

Write-Host ">>> (2) Winget regular packages:"
$wingetRegularPackages | ForEach-Object {
    Write-Host "- $_"
}
Write-Host "$border2"

Write-Host ">>> (3) Winget build packages:"
$wingetBuildPackages | ForEach-Object {
    Write-Host "- $_"
}
Write-Host "$border2"

Write-Host ">>> (4) Winget editor packages:"
$wingetEditorPackages | ForEach-Object {
    Write-Host "- $_"
}
Write-Host "$border2"

# Menu-driven system for selecting package category
Write-Host ""
Write-Host "$border3$border3"

Write-Host "Select the category of packages to install:"
Write-Host "1. Scoop packages"
Write-Host "2. Winget regular packages"
Write-Host "3. Winget build packages"
Write-Host "4. Winget editor packages"
Write-Host "(Default: Continue to next section)"

$choice = Read-Host "Enter your choice (1-5):"


switch ($choice) {
    1 {
        # Ask User to Run Install or Update
        $installOrUpdate = Read-Host "Do you want to install or update Scoop packages? ([I]nstall/[u]pdate)"

        if ($installOrUpdate -eq "u") {
            scoop update *
        }
        else {
            # Install Scoop packages
            foreach ($package in $scoopPackages) {
                scoop install $package
            }
        }
    }
    2 {
        # Install Winget regular packages
        foreach ($package in $wingetRegularPackages) {
            winget install --id=$package -e
        }
    }
    3 {
        # Install Winget build packages
        foreach ($package in $wingetBuildPackages) {
            winget install --id=$package -e
        }
    }
    4 {
        # Install Winget editor packages
        foreach ($package in $wingetEditorPackages) {
            winget install --id=$package -e
        }
    }
    default {
        Write-Host "Continuing to next section..." -ForegroundColor White
    }
}

$installNode = Read-Host "Do you want to install Node.js? ([Y]es/[n]o)"
if ($installNode -eq "n") {
    Write-Host "Skipping Node.js installation..." -ForegroundColor White
}
else {
    if (-not (Test-CommandExists "fnm")) {
        scoop install fnm
    }
    if (-not (Test-CommandExists "node")) {
        fnm install --lts
        Write-Host "Node.js installed successfully." -ForegroundColor Green
    }
    else {
        Write-Host "Node.js already installed." -ForegroundColor White
    }
}


######################################################
######################################################
# PRE-CONFIG FILES SECTION
######################################################
######################################################
Write-Host ""
Write-Host "$border1$border1" -ForegroundColor Yellow
Write-Host "PRE-CONFIG FILES SECTION" -ForegroundColor Yellow
Write-Host "$border1$border1" -ForegroundColor Yellow

function Get-ShortcutTargetPath {
    param (
        [Parameter(Mandatory=$true)]
        [string]$ShortcutName
    )

    $possibleAppPaths = @(
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
        "$env:USERPROFILE\Desktop",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages",
        "$env:USERPROFILE\scoop\apps"
    )

    $shortcutPath = Get-ChildItem -Path $possibleAppPaths -Recurse -Filter "*$ShortcutName*.lnk" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName

    $executablePath = Get-ChildItem -Path $possibleAppPaths -Recurse -Filter "*$ShortcutName*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName

    if ($executablePath) {
        return $executablePath
    }
    if ($shortcutPath) {
        $shortcut = New-Object -ComObject WScript.Shell
        $shortcutTarget = $shortcut.CreateShortcut($shortcutPath).TargetPath
        return $shortcutTarget
    } else {
        Write-Host "Warning: No $ShortcutName shortcut found." -ForegroundColor Red
        return $null
    }
}

function Get-ParsedPath {
    param (
        [Parameter(Mandatory=$true)]
        [string]$ShortcutName
    )

    $shortcutTarget = Get-ShortcutTargetPath -ShortcutName $ShortcutName
    if (-not $shortcutTarget) {
        return $null
    }
    $parsedPath = $shortcutTarget -replace "\\", "\\"
    return "'$parsedPath'"
}

$spotifyParsedPath = Get-ParsedPath -ShortcutName "Spotify"
$browserParsedPath = Get-ParsedPath -ShortcutName "Thorium"

$replaceKeys = @{
    "{SPOTIFY_PATH}" = $spotifyParsedPath
    "{BROWSER_PATH}" = $browserParsedPath
}

$glazeConfigPath = "$scriptDir\glaze_config.yaml"
# Read 'glaze_config.yaml' and replace keys with the parsed paths
(Get-Content $glazeConfigPath) | ForEach-Object {
    $line = $_
    foreach ($key in $replaceKeys.Keys) {
        $line = $line -replace $key, $replaceKeys[$key]
    }
    $line
} | Set-Content "$setupTempDir\glaze_config.yaml"
Write-Host "glaze config file has been prepared successfully." -ForegroundColor Green


######################################################
######################################################
# CONFIG FILES SECTION
######################################################
######################################################
Write-Host ""
Write-Host "$border1$border1" -ForegroundColor Yellow
Write-Host "CONFIG FILES SECTION" -ForegroundColor Yellow
Write-Host "$border1$border1" -ForegroundColor Yellow

$fastfetchParsedPath = Get-ParsedPath -ShortcutName "FastFetch"
$fastfetchPath = (($fastfetchParsedPath.Replace("'", "")).Replace("\fastfetch.exe", "")).Replace("\\", "\")

$fromPaths = @{
    "oh_my_posh" = "$scriptDir\custom.omp.json"
    "fastfetch" = "$scriptDir\fastfetch_custom.jsonc"
    "powershell" = "$scriptDir\Microsoft.PowerShell_profile.ps1"
    "vim" = "$scriptDir\.vimrc"
    "glaze" = "$setupTempDir\glaze_config.yaml"
}
$toPaths = @{
    "oh_my_posh" = "$env:POSH_THEMES_PATH\custom.omp.json"
    "fastfetch" = "$fastfetchPath" + "presets\custom.jsonc"
    "powershell" = "$profile"
    "vim" = "$env:USERPROFILE\_vimrc"
    "glaze" = "$env:USERPROFILE\.glaze-wm\config.yaml"
}
$keys = $fromPaths.Keys

Write-Host "Following files will be copied:"
foreach ($key in $keys) {
    Write-Host "> $($fromPaths[$key]) --> $($toPaths[$key])"
}

$runCopy = Read-Host "Do you want to copy these files? ([Y]es/[n]o)"
if ($runCopy -eq "n") {
    Write-Host "Skipping copying files..." -ForegroundColor White
}
else {
    # copy files
    foreach ($key in $keys) {
        $destinationDir = Split-Path -Path $toPaths[$key] -Parent
        if (-not (Test-Path -Path $destinationDir)) {
            New-Item -ItemType Directory -Path $destinationDir | Out-Null
        }
        Copy-Item -Path $fromPaths[$key] -Destination $toPaths[$key]
    }
    Write-Host "Files copied successfully." -ForegroundColor Green
}

######################################################
######################################################
# ENVIRONMENT VARIABLES SECTION
######################################################
######################################################
Write-Host ""
Write-Host "$border1$border1" -ForegroundColor Yellow
Write-Host "ENVIRONMENT VARIABLES SECTION" -ForegroundColor Yellow
Write-Host "$border1$border1" -ForegroundColor Yellow

# Iterate through possible vim directories and select the one which exists, without 
# throwing an error if it doesn't exist
$possibleVimDirs = @("$programFiles\Vim", "C:\Vim", "$env:USERPROFILE\scoop\apps\vim\current", "$env:USERPROFILE\scoop\apps\vim\current\vim")
foreach ($dir in $possibleVimDirs) {
    if (Test-Path $dir) {
        # Select the most recently modified directory - this is the latest version of Vim
        $vimDir = Get-ChildItem -Path $dir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        break
    }
}


# Define paths to be added to $env:PATH
$newPaths = @(
    $vimDir.FullName
)

# Define environment variables to update for installed packages
$newEnvironmentVariables = @{
    "EDITOR" = "nvim"
    "SHELL" = "pwsh"
    "YAZI_FILE_ONE" = $fileOnePath
    "YAZI_CONFIG_HOME" = "$appDataRoamingDir\yazi\config"
    "POWERSHELL_UPDATECHECK" = "Off"
}
# create yazi_config_home directory if it doesn't exist
if (-not (Test-Path $newEnvironmentVariables["YAZI_CONFIG_HOME"])) {
    New-Item -ItemType Directory -Path $newEnvironmentVariables["YAZI_CONFIG_HOME"]
}

# Print all paths to update
Write-Host "Paths to add to PATH:"
foreach ($path in $newPaths) {
    Write-Host "$path"
}

# Print all environment variables to update
Write-Host "Environment variables to update:"
foreach ($key in $newEnvironmentVariables.Keys) {
    Write-Host "$key = $($newEnvironmentVariables[$key])"
}


# Ask user if they want to update the environment variables
$envVarUpdate = Read-Host "Do you want to update the environment variables? ([Y]es/[n]o)"
if ($envVarUpdate -eq "n") {
    Write-Host "Skipping updating environment variables..." -ForegroundColor White
}
else {
    # Update environment variables
    foreach ($key in $newEnvironmentVariables.Keys) {
        $currentValue = [System.Environment]::GetEnvironmentVariable($key, "User")
        if ($currentValue -eq $newEnvironmentVariables[$key]) {
            Write-Host "No Change: $key" -ForegroundColor White
        }
        else {
            [System.Environment]::SetEnvironmentVariable($key, $newEnvironmentVariables[$key], "User")
            Write-Host "Updated: $key" -ForegroundColor Green
        }
    }
    Write-Host "Environment variables updated successfully." -ForegroundColor Green

    # Update PATH environment variable
    $currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    # check if new paths are already in PATH
    $newPathsToAdd = $newPaths | Where-Object { $currentPath -notcontains $_ }
    if ($newPathsToAdd.Count -eq 0) {
        Write-Host "No new paths to add to PATH." -ForegroundColor White
    }
    else {
        $newPath = $newPathsToAdd -join ";"
        $newPath = $currentPath + ";" + $newPath
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Host "PATH updated successfully." -ForegroundColor Green
    }
}



######################################################
######################################################
# CUSTOM PROFILES SECTION
######################################################
######################################################
Write-Host ""
Write-Host "$border1$border1" -ForegroundColor Yellow
Write-Host "CUSTOM PROFILES SECTION" -ForegroundColor Yellow
Write-Host "$border1$border1" -ForegroundColor Yellow

$setupYazi = Read-Host "Setup custom yazi profile? ([Y]es/[n]o)"
if ($setupYazi -eq "n") {
    Write-Host "Skipping setting up custom yazi profile..." -ForegroundColor White
}
else {
    $dirFrom = $scriptRootDir + "\yazi_config"
    $dirTo = $env:YAZI_CONFIG_HOME

    # Remove everything in dirTo if it exists
    if (Test-Path $dirTo) {
        Remove-Item -Path $dirTo -Recurse -Force
    }
    else {
        New-Item -ItemType Directory -Path $dirTo
    }

    # Find all files and subdirs inside dirFrom, and copy all of them into dirTo
    Copy-Item -Path $dirFrom -Destination $dirTo -Recurse

    $yaziDirTo = $dirTo + "\yazi_config"
    Get-ChildItem -Path $yaziDirTo -Recurse | Move-Item -Destination $dirTo -Force
    Write-Host "yazi config has been setup successfully." -ForegroundColor Green
}

$setupNeovim = Read-Host "Setup custom neovim profile? ([Y]es/[n]o)"
if ($setupNeovim -eq "n") {
    Write-Host "Skipping setting up custom neovim profile..." -ForegroundColor White
}
else {
    $dirToCopy = "${env:LOCALAPPDATA}\nvim"
    if (Test-Path $dirToCopy) {
        # run git pull
        git -C $dirToCopy pull
        Write-Host "neovim config has been updated successfully." -ForegroundColor Green
    }
    else {
        git clone https://github.com/Prajwal-Prathiksh/prajwal-neovim $dirToCopy
        Write-Host "neovim config has been setup successfully." -ForegroundColor Green
    }
}

$setupBat = Read-Host "Setup custom bat profile? ([Y]es/[n]o)"
if ($setupBat -eq "n") {
    Write-Host "Skipping setting up custom bat profile..." -ForegroundColor White
}
else {
    $batConfigFile = $(bat --config-file)
    $batConfigDir = Split-Path -Path $batConfigFile -Parent
    # create bat config directory if it doesn't exist
    if (-not (Test-Path $batConfigDir)) {
        New-Item -ItemType Directory -Path $batConfigDir
    }
    $fromBat = "$scriptDir\.bat_config"
    Copy-Item -Path $fromBat -Destination $batConfigFile
    Write-Host "bat config has been setup successfully." -ForegroundColor Green
}


######################################################
######################################################
# POWERSHELL MODULES INSTALLATION SECTION
######################################################
######################################################
Write-Host ""
Write-Host "$border1$border1" -ForegroundColor Yellow
Write-Host "POWERSHELL MODULES INSTALLATION SECTION" -ForegroundColor Yellow
Write-Host "$border1$border1" -ForegroundColor Yellow


# echo that Terminal-Icons, PSReadLine, and PSFzf are being installed
$modulesToInstall = @("Terminal-Icons", "PowerColorLS")
Write-Host "Following modules will be installed:"
foreach ($module in $modulesToInstall) {
    Write-Host "- $module"
}
$installModules = Read-Host "Do you want to install these modules? ([Y]es/[n]o)"

if ($installModules -eq "n") {
    Write-Host "Skipping module installation..." -ForegroundColor White
}
else {
    # Install modules
    if (-not (Get-Module -ListAvailable -Name Terminal-Icons)) {
        # https://github.com/devblackops/Terminal-Icons
        Install-Module -Name Terminal-Icons -Repository PSGallery -Scope CurrentUser
        Write-Host "Terminal-Icons installed successfully." -ForegroundColor Green
    }
    else {
        Write-Host "Terminal-Icons already installed." -ForegroundColor White
    }

    if (-not (Get-Module -ListAvailable -Name PowerColorLS)) {
        # https://github.com/gardebring/PowerColorLS
        Install-Module -Name PowerColorLS -Repository PSGallery -Scope CurrentUser
    }
    else {
        Write-Host "PowerColorLS already installed." -ForegroundColor White
    }

    Write-Host "Modules installed successfully." -ForegroundColor Green
}



######################################################
######################################################
# BYE BYE SECTION
######################################################
######################################################
Write-Host ""
Write-Host "$border1$border1" -ForegroundColor White
Write-Host "SETUP COMPLETED" -ForegroundColor Green
Write-Host "Bye Bye!!" -ForegroundColor Green
Write-Host "$border1$border1" -ForegroundColor White


