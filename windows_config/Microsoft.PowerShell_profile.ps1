# Oh My Posh
oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH/custom.omp.json" | Invoke-Expression

# Utility functions for zoxide
# Call zoxide binary, returning the output as UTF-8
function global:__zoxide_bin {
    $encoding = [Console]::OutputEncoding
    try {
        [Console]::OutputEncoding = [System.Text.Utf8Encoding]::new()
        $result = zoxide @args
        return $result
    } finally {
        [Console]::OutputEncoding = $encoding
    }
}

# pwd based on zoxide's format.
function global:__zoxide_pwd {
    $cwd = Get-Location
    if ($cwd.Provider.Name -eq "FileSystem") {
        $cwd.ProviderPath
    }
}

# cd + custom logic based on the value of _ZO_ECHO.
function global:__zoxide_cd($dir, $literal) {
    $dir = if ($literal) {
        Set-Location -LiteralPath $dir -Passthru -ErrorAction Stop
    } else {
        if ($dir -eq '-' -and ($PSVersionTable.PSVersion -lt 6.1)) {
            Write-Error "cd - is not supported below PowerShell 6.1. Please upgrade your version of PowerShell."
        }
        elseif ($dir -eq '+' -and ($PSVersionTable.PSVersion -lt 6.2)) {
            Write-Error "cd + is not supported below PowerShell 6.2. Please upgrade your version of PowerShell."
        }
        else {
            Set-Location -Path $dir -Passthru -ErrorAction Stop
        }
    }
}

# Hook configuration for zoxide.
# Hook to add new entries to the database.
$global:__zoxide_oldpwd = __zoxide_pwd
function global:__zoxide_hook {
    $result = __zoxide_pwd
    if ($result -ne $global:__zoxide_oldpwd) {
        if ($null -ne $result) {
            zoxide add -- $result
        }
        $global:__zoxide_oldpwd = $result
    }
}

# Initialize hook.
$global:__zoxide_hooked = (Get-Variable __zoxide_hooked -ErrorAction SilentlyContinue -ValueOnly)
if ($global:__zoxide_hooked -ne 1) {
    $global:__zoxide_hooked = 1
    $global:__zoxide_prompt_old = $function:prompt

    function global:prompt {
        if ($null -ne $__zoxide_prompt_old) {
            & $__zoxide_prompt_old
        }
        $null = __zoxide_hook
    }
}

# When using zoxide with --no-cmd, alias these internal functions as desired.
# Jump to a directory using only keywords.
function global:__zoxide_z {
    if ($args.Length -eq 0) {
        __zoxide_cd ~ $true
    }
    elseif ($args.Length -eq 1 -and ($args[0] -eq '-' -or $args[0] -eq '+')) {
        __zoxide_cd $args[0] $false
    }
    elseif ($args.Length -eq 1 -and (Test-Path $args[0] -PathType Container)) {
        __zoxide_cd $args[0] $true
    }
    else {
        $result = __zoxide_pwd
        if ($null -ne $result) {
            $result = __zoxide_bin query --exclude $result -- @args
        }
        else {
            $result = __zoxide_bin query -- @args
        }
        if ($LASTEXITCODE -eq 0) {
            __zoxide_cd $result $true
        }
    }
}

# Jump to a directory using interactive search.
function global:__zoxide_zi {
    $result = __zoxide_bin query -i -- @args
    if ($LASTEXITCODE -eq 0) {
        __zoxide_cd $result $true
    }
}

# Commands for zoxide
Set-Alias -Name z -Value __zoxide_z -Option AllScope -Scope Global -Force
Set-Alias -Name zi -Value __zoxide_zi -Option AllScope -Scope Global -Force


# Predictive IntelliSense Options
Set-PSReadLineOption -PredictionViewStyle ListView

# Set Tab Completion to MenuComplete
Set-PSReadlineKeyHandler -Key Tab -Function MenuComplete

# Import Custom Modules
if (-not (Get-Module -ListAvailable -Name Terminal-Icons)) {
    # https://github.com/devblackops/Terminal-Icons
    Install-Module -Name Terminal-Icons -Repository PSGallery -Scope CurrentUser
}
Import-Module Terminal-Icons

if (-not (Get-Module -ListAvailable -Name PowerColorLS)) {
    # https://github.com/gardebring/PowerColorLS
    Install-Module -Name PowerColorLS -Repository PSGallery -Scope CurrentUser
}
Import-Module PowerColorLS
Set-Alias -Name ls -Value PowerColorLS -Option AllScope

if (-not (Get-Module -ListAvailable -Name Import-VisualStudioEnvironment)) {
    # https://github.com/olegsych/posh-vs
    Install-Module posh-vs -Scope CurrentUser
}
Import-VisualStudioEnvironment

## Custom Aliases
Set-Alias -Name top -Value Get-Process -Option AllScope


## Custom Functions
### Editor Config
function Edit-Profile {
    code $PROFILE
}

function touch($file) { "" | Out-File $file -Encoding ASCII }

function ff($name) {
    Get-ChildItem -recurse -filter "*${name}*" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Output "$($_.FullName)"
    }
}

function ll($name) {
    # if name is not provided, use the current directory
    if (-not $name) {
        $name = Get-Location
    }
    PowerColorLS --long --all --show-directory-size "$name"
}

function uptime {
    if ($PSVersionTable.PSVersion.Major -eq 5) {
        $lastBoot = (Get-WmiObject win32_operatingsystem | Select-Object @{Name='LastBootUpTime'; Expression={$_.ConverttoDateTime($_.lastbootuptime)}}).LastBootUpTime
    } else {
        $uptimeString = (net statistics workstation | Select-String "since").ToString().Replace('Statistics since ', '').Trim()
        $lastBoot = [datetime]::ParseExact($uptimeString, 'dd-MM-yyyy, ddd HH:mm:ss', $null)
    }

    $elapsed = (Get-Date) - $lastBoot
    $days = [math]::Floor($elapsed.TotalDays)
    $hours = $elapsed.Hours
    $minutes = $elapsed.Minutes
    $seconds = $elapsed.Seconds

    $formattedLastBoot = $lastBoot.ToString("dd-MMM-yyyy, ddd HH:mm:ss")
    $formattedElapsed = "{0}d {1}h {2}m {3}s" -f $days, $hours, $minutes, $seconds

    Write-Output "Since: $formattedLastBoot"
    Write-Output "Elapsed: $formattedElapsed"
}

function reload-profile {
    & $profile
}

### Network Utilities
function Get-PubIP { (Invoke-WebRequest http://ifconfig.me/ip).Content }

function unzip ($file) {
    Write-Output("Extracting", $file, "to", $pwd)
    $fullFile = Get-ChildItem -Path $pwd -Filter $file | ForEach-Object { $_.FullName }
    Expand-Archive -Path $fullFile -DestinationPath $pwd
}

### Linux-like Commands
function grep()
{
    param(
        [Parameter(Mandatory=$true)][string]$regex,
        [Parameter(Mandatory=$true)][string]$dir,
        [Parameter(Mandatory=$false)][string]$recurse
    )
    if ($recurse) {
        if ($recurse -ne "--r") {
            Write-Error "Invalid argument for recurse. Use --r."
            return
        } else {
            Get-ChildItem $dir -Recurse -Attributes !Hidden | Select-String -Pattern $regex
        }
    } else {
        Get-ChildItem $dir | Select-String -Pattern $regex
    }
    $input | select-string $regex
}

function df {
    get-volume
}

function sed($file, $find, $replace) {
    (Get-Content $file).replace("$find", $replace) | Set-Content $file
}

function which($name) {
    Get-Command $name | Select-Object -ExpandProperty Definition
}

function export($name, $value) {
    set-item -force -path "env:$name" -value $value;
}

function pkill($name) {
    Get-Process $name -ErrorAction SilentlyContinue | Stop-Process
}

function pgrep($name) {
    Get-Process $name
}


function head {
    param($Path, $n = 10)
    Get-Content $Path -Head $n
}

function tail {
    param($Path, $n = 10, [switch]$f = $false)
    Get-Content $Path -Tail $n -Wait:$f
}
  
### Quick File Creation
function nf { param($name) New-Item -ItemType "file" -Path . -Name $name }

### Directory Management
function mkcd { param($dir) mkdir $dir -Force; Set-Location $dir }

### Quality of Life Aliases

# Navigation Shortcuts
function user { Set-Location -Path "D:\"}

function dtop { Set-Location -Path $HOME\Desktop }

# Quick Access to System Information
function sysinfo { Get-ComputerInfo }

# Networking Utilities
function flushdns {
	Clear-DnsClientCache
	Write-Host "DNS has been flushed"
}

# Clipboard Utilities
function cpy { Set-Clipboard $args[0] }

function pst { Get-Clipboard }

# Help Function
function Show-Help {
    @"
PowerShell Profile Help
=======================

Edit-Profile - Opens the current user's profile for editing using the configured editor.

touch <file> - Creates a new empty file.

ff <name> - Finds files recursively with the specified name.

ll [name] - Lists files and directories with additional information.

Get-PubIP - Retrieves the public IP address of the machine.

uptime - Displays the system uptime.

reload-profile - Reloads the current user's PowerShell profile.

unzip <file> - Extracts a zip file to the current directory.

grep <regex> [dir] [recurse] - Searches for a regex pattern in files within the specified directory or from the pipeline input, with an optional recursive flag.

df - Displays information about volumes.

sed <file> <find> <replace> - Replaces text in a file.

which <name> - Shows the path of the command.

export <name> <value> - Sets an environment variable.

pkill <name> - Kills processes by name.

pgrep <name> - Lists processes by name.

head <path> [n] - Displays the first n lines of a file (default 10).

tail <path> [n] - Displays the last n lines of a file (default 10).

nf <name> - Creates a new file with the specified name.

mkcd <dir> - Creates and changes to a new directory.

user - Changes the current directory to the user's specified directory.

dtop - Changes the current directory to the user's Desktop folder.

sysinfo - Displays detailed system information.

flushdns - Clears the DNS cache.

cpy <text> - Copies the specified text to the clipboard.

pst - Retrieves text from the clipboard.

explorer - Opens the current directory in File Explorer.

z - Uses zoxide to jump to a directory based on keywords.

zi - Uses zoxide to jump to a directory based on interactive search.

yazi - Opens yazi in the current directory.

vim - Opens vim in the current directory.

code - Opens Visual Studio Code in the current directory.

Use 'Show-Help' to display this help message.
"@
}
Write-Host "Use 'Show-Help' to display help"
fastfetch -c custom
