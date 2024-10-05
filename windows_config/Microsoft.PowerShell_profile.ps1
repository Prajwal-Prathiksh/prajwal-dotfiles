# =============================================================================
#
# PowerShell Profile Setup
#

# Run Fastfetch with custom configuration
# fastfetch --config custom

# Run Oh My Posh with custom configuration
oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH/custom.omp.json" | Invoke-Expression

# Predictive IntelliSense Options
Set-PSReadLineOption -PredictionViewStyle ListView

# Set Tab Completion to MenuComplete
# Set-PSReadlineKeyHandler -Key Tab -Function MenuComplete

# Import Custom Modules
Import-Module Terminal-Icons
Import-Module PowerColorLS
Set-Alias -Name ls -Value PowerColorLS -Option AllScope


# =============================================================================
#
# Custom Aliases
#

## Custom Functions
function Activate-Conda ($envName) {
<#
.SYNOPSIS
Imports the conda environment and activates it.

.DESCRIPTION
The Activate-Conda function imports the conda environment and activates it. It also initializes Oh My Posh with a custom configuration file, and activates the conda environment if the environment name is provided.

.PARAMETER envName
The envName parameter specifies the name of the conda environment to activate.
#>
    
    # Run conda hook
    $possibleCondaPaths = @(
        "$env:LOCALAPPDATA\miniconda3\shell\condabin\conda-hook.ps1",
        "$env:USERPROFILE\miniconda3\shell\condabin\conda-hook.ps1"
    )
    $condaPath = $possibleCondaPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $condaPath) {
        Write-Host "Conda not found. Please install Conda or update possibleCondaPaths array, and try again." -ForegroundColor Red
        return
    }

    & $condaPath
    Write-Host "Conda environment activated." -ForegroundColor Green

    # Re-run Oh My Posh with custom configuration to update the prompt
    oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH/custom.omp.json" | Invoke-Expression
    
    # Activate the conda environment if the environment name is provided
    if ($envName) {
        conda activate $envName
        Write-Host "Conda environment '$envName' activated." -ForegroundColor Green
    }
}

function Activate-Node {
<#
.SYNOPSIS
Imports the Node.js environment and activates it.

.DESCRIPTION
The Activate-Node function activates the Node.js environment by adding the Node.js environment variables to the PATH environment variable.

.PARAMETER None
This function does not accept any parameters.

#>
    fnm env --use-on-cd | Out-String | Invoke-Expression
    Write-Host "Node.js environment activated." -ForegroundColor Green
}

function Activate-VisualStudioEnvironment {
<#
.SYNOPSIS
Imports the Visual Studio environment and activates it.

.DESCRIPTION
The Activate-VisualStudioEnvironment function imports the Visual Studio environment by adding the Visual Studio environment variables to the PATH, INCLUDE, and LIB environment variables.

.PARAMETER None
This function does not accept any parameters.
#>

    $envPaths = @(
        'C:\\Program Files (x86)\\Microsoft SDKs\\Windows\\v10.0A\\bin\\NETFX 4.8 Tools\\x64\\',
        'C:\\Program Files (x86)\\Windows Kits\\10\\Windows Performance Toolkit\\',
        'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22621.0\\x64',
        'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\Ninja',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\FSharp\\Tools',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\TestWindow',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\VC\\Linux\\bin\\ConnectionManagerExe',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\VC\\VCPackages',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\Tools\\',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\bin\\Roslyn',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Team Tools\\DiagnosticsHub\\Collector',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.39.33519\\bin\\HostX64\\x64',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\vcpkg',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\amd64',
        'C:\\Program Files\\dotnet\\',
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319',
        # Additional Paths
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.41.34120\\bin\\HostX64\\x64'
    )
    $joinedPaths = $envPaths -join ';'
    $ENV:PATH += ";$joinedPaths"
    
    $includePaths = @(
        'C:\\Program Files (x86)\\Windows Kits\\10\\include\\10.0.22621.0\\cppwinrt',
        'C:\\Program Files (x86)\\Windows Kits\\10\\include\\10.0.22621.0\\shared',
        'C:\\Program Files (x86)\\Windows Kits\\10\\include\\10.0.22621.0\\um',
        'C:\\Program Files (x86)\\Windows Kits\\10\\include\\10.0.22621.0\\winrt',
        'C:\\Program Files (x86)\\Windows Kits\\10\\include\\10.0.22621.0\\ucrt',
        'C:\\Program Files (x86)\\Windows Kits\\NETFXSDK\\4.8\\include\\um',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\VS\\include',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\VS\\include',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.39.33519\\ATLMFC\\include',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.39.33519\\include',
        # Additional Paths
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.41.34120\\ATLMFC\\include',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.41.34120\\include'
    )
    $joinedIncludePaths = $includePaths -join ';'
    $ENV:INCLUDE = $joinedIncludePaths

    $libsPaths = @(
        'C:\\Program Files (x86)\\Windows Kits\\10\\lib\\10.0.22621.0\\um\\x64',
        'C:\\Program Files (x86)\\Windows Kits\\10\\lib\\10.0.22621.0\\ucrt\\x64',
        'C:\\Program Files (x86)\\Windows Kits\\NETFXSDK\\4.8\\lib\\um\\x64',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.39.33519\\ATLMFC\\lib\\x64',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.39.33519\\lib\\x64',
        # Additional Paths
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.41.34120\\ATLMFC\\lib\\x64',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.41.34120\\lib\\x64'
    )
    $joinedLibsPaths = $libsPaths -join ';'
    $ENV:LIB = $joinedLibsPaths
    
    Write-Host "Visual Studio environment activated." -ForegroundColor Green
}

function Activate-DevEnv ($envName) {
<#
.SYNOPSIS
Activates the development environment (Conda, Node.js, and Visual Studio).

.DESCRIPTION
The Activate-DevEnv function activates the development environment by importing the Conda, Node.js, and Visual Studio environments. An optional environment name can be provided to activate a specific Conda environment.

.PARAMETER envName
The envName parameter specifies the name of the conda environment to activate.
#>
    if ($envName) {
        Activate-Conda $envName
    } else {
        Activate-Conda
    }
    Activate-Node
    Activate-VisualStudioEnvironment
}

function Edit-Profile {
<#
.SYNOPSIS
Opens the Microsoft.PowerShell_profile.ps1 file for editing.

.DESCRIPTION
The Edit-Profile function opens the Microsoft.PowerShell_profile.ps1 file in the default code editor for editing.

.PARAMETER None
This function does not accept any parameters.

#>
    code $PROFILE
}

function Reload-Profile {
<#
.SYNOPSIS
Reloads the Microsoft.PowerShell_profile.ps1 file.

.DESCRIPTION
The Reload-Profile function reloads the Microsoft.PowerShell_profile.ps1 file to apply any changes made to the profile.

.PARAMETER None
This function does not accept any parameters.

#>
    & $profile
}

function Get-PubIP {
<#
.SYNOPSIS
Retrieves the public IP address of the current machine.

.DESCRIPTION
The Get-PubIP function retrieves the public IP address of the current machine using the ifconfig.me service.

.PARAMETER None
This function does not accept any parameters.
#>
    (Invoke-WebRequest http://ifconfig.me/ip).Content
}

function ll($name) {
<#
.SYNOPSIS
Lists all files in long format with color highlighting.

.DESCRIPTION
The ll function lists all files in long format with color highlighting using the PowerColorLS module.

.PARAMETER name
The name parameter specifies the directory to list. If not provided, the current directory is used.
#>
    # if name is not provided, use the current directory
    if (-not $name) {
        $name = Get-Location
    }
    PowerColorLS --long --all "$name"
}

function lazyg ($commitMessage) {
<#
.SYNOPSIS
Lazy Git: Adds all files, commits with a message, and pushes to the current branch.

.DESCRIPTION
The lazyg function adds all files, commits with a message, and pushes to the current branch in Git.

.PARAMETER commitMessage
The commitMessage parameter specifies the message to use for the commit.

#>
    git add .
    git commit -m $commitMessage
    git push origin $(git rev-parse --abbrev-ref HEAD)
}

function gswitch {
<#
.SYNOPSIS
Switches to a different Git branch using fzf.

.DESCRIPTION
The gswitch function switches to a different Git branch using fzf.

.PARAMETER None
This function does not accept any parameters.
#>
    if (-not (Test-Path .git)) {
        Write-Host "Not a Git repository." -ForegroundColor Red
        return
    }

    $branch = git branch --list --all | fzf | ForEach-Object { $_.Trim() -replace '^\* ', '' }

    if ($branch -like "remotes/*") {
        $branch = $branch -replace '^remotes\/[^\/]+\/', ''
    }

    git switch $branch
}

function weather($cityName) {
<#
.SYNOPSIS
Displays the weather for a specific city. Uses the wttr.in service.

.DESCRIPTION
The weather function displays the weather for a specific city using the wttr.in service. If no city name is provided, wttr.in is called without any parameters to display the weather for the current location.

.PARAMETER cityName
The cityName parameter specifies the name of the city to display the weather for.
#>
    if ($cityName) {
        Invoke-RestMethod "https://wttr.in/$cityName"
    } else {
        Invoke-RestMethod "https://wttr.in"
    }
}

function y {
<#
.SYNOPSIS
Open the current directory in yazi, and changes the directory upon exit, to the directory where yazi was last closed.

.DESCRIPTION
The function opens the current directory in yazi, a file manager, and changes the directory upon exit to the directory where yazi was last closed.

.PARAMETER None
This function does not accept any parameters.
#>
    $tmp = [System.IO.Path]::GetTempFileName()
    yazi $args --cwd-file="$tmp"
    $cwd = Get-Content -Path $tmp
    if (-not [String]::IsNullOrEmpty($cwd) -and $cwd -ne $PWD.Path) {
        Set-Location -LiteralPath $cwd
    }
    Remove-Item -Path $tmp
}

function tk {
    $currentDir = (Get-Location).Path.Split('\')[-1]
    # Print only the current directory name
    Write-Host "Project Name: $currentDir" -ForegroundColor Green

    # Display tokei in bat
    tokei | bat --language ps1 --style plain
}

### Linux-like Commands
function touch($file) {
<#
.SYNOPSIS
Creates a new file.

.DESCRIPTION
The touch function creates a new file with the specified name.

.PARAMETER file
The file parameter specifies the name of the file to create.
#>
"" | Out-File $file -Encoding ASCII
}

function unzip ($file) {
    <#
    .SYNOPSIS
    Extracts files from a compressed archive.
    
    .DESCRIPTION
    The unzip function extracts files from a compressed archive.
    
    .PARAMETER file
    The file parameter specifies the name of the compressed archive to extract files from.
    #>
        Write-Output("Extracting", $file, "to", $pwd)
        $fullFile = Get-ChildItem -Path $pwd -Filter $file | ForEach-Object { $_.FullName }
        Expand-Archive -Path $fullFile -DestinationPath $pwd
    }
    

function df {
<#
.SYNOPSIS
Displays disk space usage. Alias for Get-Volume.

.DESCRIPTION
The df function displays disk space usage using the Get-Volume cmdlet.

.PARAMETER None
This function does not accept any parameters.
#>
    get-volume
}

function sed($file, $find, $replace) {
<#
.SYNOPSIS
Searches and replaces text in a file.

.DESCRIPTION
The sed function searches for a specific text in a file and replaces it with another text.

.PARAMETER file
The file parameter specifies the name of the file to search and replace text in.

.PARAMETER find
The find parameter specifies the text to search for in the file.

.PARAMETER replace
The replace parameter specifies the text to replace the found text with.
#>
    (Get-Content $file).replace("$find", $replace) | Set-Content $file
}

function which($name) {
<#
.SYNOPSIS
Locates the executable of a command.

.DESCRIPTION
The which function locates the executable of a command in the system's PATH.

.PARAMETER name
The name parameter specifies the name of the command to locate.
#>
    Get-Command $name | Select-Object -ExpandProperty Definition
}


# =============================================================================
#
# Utility functions for zoxide
#

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

# pwd based on zoxide's format
function global:__zoxide_pwd {
    $cwd = Get-Location
    if ($cwd.Provider.Name -eq "FileSystem") {
        $cwd.ProviderPath
    }
}

# cd + custom logic based on the value of _ZO_ECHO
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

# =============================================================================
#
# Hook configuration for zoxide
#

# Hook to add new entries to the database
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

# Initialize hook
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

# =============================================================================
#
# When using zoxide with --no-cmd, alias these internal functions as desired
#

# Jump to a directory using only keywords
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

# =============================================================================
#
# Commands for zoxide. Disable these using --no-cmd
#

Set-Alias -Name z -Value __zoxide_z -Option AllScope -Scope Global -Force
Set-Alias -Name zi -Value __zoxide_zi -Option AllScope -Scope Global -Force

# SET CUSTOM KEYBOARD SHORTCUTS
Set-PSReadLineKeyHandler -Key "Ctrl+z" -ScriptBlock {
    [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
    [Microsoft.PowerShell.PSConsoleReadLine]::Insert("zi")
    [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
}

Set-PSReadLineKeyHandler -Key "Ctrl+e" -ScriptBlock {
    [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
    [Microsoft.PowerShell.PSConsoleReadLine]::Insert("explorer.exe .")
    [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
}


# =============================================================================
#
# Setup Keybindings for FZF & Ripgrep
#
# The below functionality was inspired by the following article:
# https://dev.to/kevinnitro/fzf-advanced-integration-in-powershell-53p0
#

$env:FZF_DEFAULT_OPTS=@"
--layout=reverse
--cycle
--scroll-off=5
--border
--preview-window=right,60%,border-left
--bind ctrl-u:preview-half-page-up
--bind ctrl-d:preview-half-page-down
--bind ctrl-f:preview-page-down
--bind ctrl-b:preview-page-up
--bind ctrl-g:preview-top
--bind ctrl-h:preview-bottom
--bind alt-z:toggle-preview-wrap
--bind ctrl-e:toggle-preview
"@

function _fzf_open_path {
    param (
        [Parameter(Mandatory=$true)]
        [string]$input_path
    )
    if ($input_path -match "^.*:\d+:.*$")
    {
        $input_path = ($input_path -split ":")[0]
    }
    if (-not (Test-Path $input_path))
    {
        return
    }
    $cmds = @{
    'bat' = { bat $input_path }
    'vim' = { vim $input_path }
    'code' = { code $input_path }
    'cd' = {
        if (Test-Path $input_path -PathType Leaf)
        {
        $input_path = Split-Path $input_path -Parent
        }
        Set-Location $input_path
    }
    'remove' = { Remove-Item -Recurse -Force $input_path }
    }
    $cmd = $cmds.Keys | Sort-Object | fzf --prompt 'Select command> '

    # If no command is selected, return
    if (-not $cmd)
    {
        return
    }
    & $cmds[$cmd]
}

function file-is-image {
    param (
        [Parameter(Mandatory=$true)]
        [string]$path
    )
    $imageExtensions = @(".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff")
    # Check if file extension is in the list of image extensions
    # If it is, return true, otherwise return false
    return $imageExtensions -contains (Get-Item $path).Extension
}

function _fzf_get_path_using_fd {
    $input_path = fd --type file --follow --hidden --exclude .git |
        fzf --prompt 'Files> ' `
        --header 'Files' `
        --preview 'if (file-is-image {}) { chafa -f sixel {} } else { bat --color=always {} --style=numbers }'
        #--preview 'if ((Get-Item {}).Extension -eq ".jpg" -or (Get-Item {}).Extension -eq ".png") { chafa --symbols vhalf -w 1 --color-extractor median {} } else { bat --color=always {} --style=numbers }'

    # Prepend the current directory if the path is relative
    if ($input_path -notmatch "^([a-zA-Z]:|\\)" -and $input_path -ne "")
    {
        $input_path = Join-Path $PWD $input_path
    }
    return $input_path
}

function _fzf_get_path_using_rg {
    $INITIAL_QUERY = "${*:-}"
    $RG_PREFIX = "rg --column --line-number --no-heading --color=always --smart-case"
    $input_path = $null |
        fzf --ansi --disabled --query "$INITIAL_QUERY" `
            --bind "start:reload:($RG_PREFIX {q} || Write-Host NoResultsFound)" `
            --bind "change:reload:($RG_PREFIX {q} || Write-Host NoResultsFound)" `
            --color "hl:-1:underline,hl+:-1:underline:reverse" `
            --delimiter ':' `
            --prompt "1. ripgrep> " `
            --preview-label "Preview" `
            --header-first `
            --preview "bat --color=always {1} --highlight-line {2} --style=numbers" `
            --preview-window "up,60%,border-bottom,+{2}+3/3"
    return $input_path
}

function fdg {
<#
.SYNOPSIS
Find files interactively using fd and fzf.

.DESCRIPTION
The fdg function uses the fd command to find files and fzf to interactively select a file.

.PARAMETER None
This function does not accept any parameters.
#>
    $input_path = _fzf_get_path_using_fd
    if (-not [string]::IsNullOrEmpty($input_path)) {
        _fzf_open_path $input_path
    }
}

function rgg {
<#
.SYNOPSIS
Find patterns in files interactively using rg and fzf.

.DESCRIPTION
The rgg function uses the rg command to find patterns in files and fzf to interactively select a file.

.PARAMETER None
This function does not accept any parameters.
#>
    $input_path = _fzf_get_path_using_rg
    if (-not [string]::IsNullOrEmpty($input_path))
    {
        _fzf_open_path $input_path
    }
}

# SET KEYBOARD SHORTCUTS TO CALL FUNCTION
Set-PSReadLineKeyHandler -Key "Ctrl+f" -ScriptBlock {
  [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
  [Microsoft.PowerShell.PSConsoleReadLine]::Insert("fdg")
  [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
}

Set-PSReadLineKeyHandler -Key "Ctrl+g" -ScriptBlock {
  [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
  [Microsoft.PowerShell.PSConsoleReadLine]::Insert("rgg")
  [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
}


# =============================================================================
#
# Setup Keybindings for Cheatsheets & Neovim
#

# SET KEYBOARD SHORTCUT TO CALL CHEAT
Set-PSReadLineKeyHandler -Key "Ctrl+t" -ScriptBlock {
  [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
  [Microsoft.PowerShell.PSConsoleReadLine]::Insert("cht.exe -TA ")
}

# SET KEYBOARD SHORTCUT TO OPEN NEOVIM IN THE CURRENT DIRECTORY
Set-PSReadLineKeyHandler -Key "Ctrl+n" -ScriptBlock {
  [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
  [Microsoft.PowerShell.PSConsoleReadLine]::Insert("nvim .")
  [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
}


# =============================================================================
#
# Setup Keybindings for Help
#

## Required Variables
$border1 = "========================================"

function Show-Help {
<#
.SYNOPSIS
Displays custom keybindings and help information.

.DESCRIPTION
The Show-Help function displays custom keybindings and help information for PowerShell and fzf.

.PARAMETER None
This function does not accept any parameters.
#>
    Write-Host "<F1> - Show Custom Keybindings & Help" -ForegroundColor Green
    Write-Host "Press <Enter> or <Down Arrow> to view more content. Press <Esc> or <q> to exit." -ForegroundColor Green
    Write-Host ""

    $helpContent = @(
        $border1,
        "Developer Profiles",
        $border1,
        "Activate-Conda : Imports the conda environment and activates it.",
        "Activate-Node : Imports the Node.js environment and activates it.",
        "Activate-VisualStudioEnvironment : Imports the Visual Studio environment and activates it.",
        "Activate-DevEnv : Activates the development environment (Conda, Node.js, and Visual Studio).",
        "",
        $border1,
        "Keybindings for PowerShell",
        $border1,
        "<Ctrl+z> - zi : Jump to a directory using interactive search.",
        "<Ctrl+e> - explorer.exe . : Open the current directory in File Explorer.",
        "<Ctrl+f> - fdg : Find files interactively using fd and fzf.",
        "<Ctrl+g> - rgg : Find patterns in files interactively using rg and fzf.",
        "<Ctrl+t> - cht.exe -TA : Insert the cheatsheet for the current command.",
        "<Ctrl+n> - nvim . : Open Neovim in the current directory.",
        "",
        $border1,
        "Keybindings for fzf",
        $border1,
        "<Ctrl-u> - Preview half page up.",
        "<Ctrl-d> - Preview half page down.",
        "<Ctrl-f> - Preview page down.",
        "<Ctrl-b> - Preview page up.",
        "<Ctrl-g> - Preview top.",
        "<Ctrl-h> - Preview bottom.",
        "<Alt-z> - Toggle preview wrap.",
        "<Ctrl-e> - Toggle preview.",
        "",
        $border1,
        "Custom Functions/Aliases",
        $border1,
        "Edit-Profile : Opens the Microsoft.PowerShell_profile.ps1 file for editing.",
        "Reload-Profile : Reloads the Microsoft.PowerShell_profile.ps1 file.",
        "Get-PubIP : Retrieves the public IP address of the current machine.",
        "ll : Lists all files in long format with color highlighting.",
        "lazyg : Adds all files, commits with a message, and pushes to the current branch.",
        "weather : Displays the weather for a specific city. Uses the wttr.in service.",
        "y : Open the current directory in yazi, and changes the directory upon exit, to the directory where yazi was last closed.",
        "tk : Display tokei in bat.",
        "touch : Creates a new file.",
        "unzip : Extracts files from a compressed archive.",
        "df : Displays disk space usage. Alias for Get-Volume.",
        "sed : Searches and replaces text in a file.",
        "which : Locates the executable of a command.",
        "z : Jump to a directory using only keywords (zoxide).",
        "zi : Jump to a directory using interactive search (zoxide).",
        "fdg : Find files interactively using fd and fzf.",
        "rgg : Find patterns in files interactively using rg and fzf.",
        "Show-Help : Displays custom keybindings and help information."
    )

    $pageSize = 20
    $lineIndex = $pageSize

    # Print initial page
    $helpContent[0..($pageSize - 1)] | ForEach-Object { Write-Host $_ }

    while ($lineIndex -lt $helpContent.Count) {
        $keyInfo = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        if ($keyInfo.VirtualKeyCode -eq 27 -or $keyInfo.VirtualKeyCode -eq 81 -or $keyInfo.Character -eq "q" ) {
            # 27 is the virtual key code for 'Esc'
            # 81 is the virtual key code for 'q'
            return
        } 
        if ($keyInfo.VirtualKeyCode -eq 13 -or $keyInfo.VirtualKeyCode -eq 40) { 
            # 13 is the virtual key code for Enter
            # 40 is the virtual key code for Down Arrow
            Write-Host $helpContent[$lineIndex]
            $lineIndex++
        }
    }

    # Clear any remaining input and return to the prompt immediately
    while ($host.UI.RawUI.KeyAvailable) {
        $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}

Set-PSReadLineKeyHandler -Key "F1" -ScriptBlock {
    [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
    [Microsoft.PowerShell.PSConsoleReadLine]::Insert("Show-Help")
    [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
}



# =============================================================================
# START UP FUNCTIONS
#
Activate-DevEnv "py311"
