# =============================================================================
#
# PowerShell Profile Setup
#


# Run Fastfetch with custom configuration
fastfetch --config custom

# Run Oh My Posh with custom configuration
oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH/custom.omp.json" | Invoke-Expression

# Predictive IntelliSense Options
Set-PSReadLineOption -PredictionViewStyle ListView

# Set Tab Completion to MenuComplete
# Set-PSReadlineKeyHandler -Key Tab -Function MenuComplete

# # Import Custom Modules
Import-Module Terminal-Icons
Import-Module PowerColorLS
Set-Alias -Name ls -Value PowerColorLS -Option AllScope
# Import-VisualStudioEnvironment


# =============================================================================
#
# Custom Aliases
#

## Custom Functions
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
Lists files only in long format with color highlighting.

.DESCRIPTION
The ll function lists files in the current directory in long format with color highlighting, using the PowerColorLS module.

.PARAMETER name
The name parameter specifies the directory to list. If not provided, the current directory is used.
#>
    # if name is not provided, use the current directory
    if (-not $name) {
        $name = Get-Location
    }
    PowerColorLS --files --long --all "$name"
}

function yy {
<#
.SYNOPSIS
Open the current directory in yazi, and changes the directory upon exit, to the directory where yazi was last closed.

.DESCRIPTION
The yy function opens the current directory in yazi, a file manager, and changes the directory upon exit to the directory where yazi was last closed.

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

function _fzf_get_path_using_fd {
    $input_path = fd --type file --follow --hidden --exclude .git |
        fzf --prompt 'Files> ' `
        --header 'Files' `
        --preview 'if ((Get-Item {}).Extension -eq ".jpg" -or (Get-Item {}).Extension -eq ".png") { chafa --symbols vhalf -w 1 --color-extractor median {} } else { bat --color=always {} --style=numbers }'

    # Prepend the current directory if the path is relative
    if ($input_path -notmatch "^([a-zA-Z]:|\\\\)" -and $input_path -ne "")
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
# Setup Keybindings for Cheatsheets
#

# SET KEYBOARD SHORTCUTS TO CALL CHEAT
Set-PSReadLineKeyHandler -Key "Ctrl+t" -ScriptBlock {
  [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
  [Microsoft.PowerShell.PSConsoleReadLine]::Insert("cht.exe -TA")
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
    Write-Host "Custom Keybindings & Help" -ForegroundColor Green
    Write-Host "<F1> - Show Custom Keybindings & Help" -ForegroundColor Green
    Write-Host "Press <Enter> to view more content." -ForegroundColor Green
    Write-Host "Press <Esc> or <q> to exit." -ForegroundColor Green
    Write-Host ""

    $helpContent = @(
        $border1,
        "Keybindings for PowerShell",
        $border1,
        "<Ctrl+z> - zi : Jump to a directory using interactive search.",
        "<Ctrl+e> - explorer.exe . : Open the current directory in File Explorer.",
        "<Ctrl+f> - fdg : Find files interactively using fd and fzf.",
        "<Ctrl+g> - rgg : Find patterns in files interactively using rg and fzf.",
        "<Ctrl+t> - cht.exe -TA : Insert the cheatsheet for the current command.",
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
        "ll : Lists files only in long format with color highlighting.",
        "yy : Open the current directory in yazi, and changes the directory upon exit, to the directory where yazi was last closed.",
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

    $pageSize = 15
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
        if ($keyInfo.VirtualKeyCode -eq 13) { 
            # 13 is the virtual key code for Enter
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
