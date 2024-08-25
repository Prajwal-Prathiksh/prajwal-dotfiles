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
    code $PROFILE
}

function Reload-Profile {
    & $profile
}

function Get-PubIP { (Invoke-WebRequest http://ifconfig.me/ip).Content }

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
    PowerColorLS --files --long --all "$name"
}

function yy {
    $tmp = [System.IO.Path]::GetTempFileName()
    yazi $args --cwd-file="$tmp"
    $cwd = Get-Content -Path $tmp
    if (-not [String]::IsNullOrEmpty($cwd) -and $cwd -ne $PWD.Path) {
        Set-Location -LiteralPath $cwd
    }
    Remove-Item -Path $tmp
}

### Linux-like Commands
function touch($file) { "" | Out-File $file -Encoding ASCII }

function unzip ($file) {
    Write-Output("Extracting", $file, "to", $pwd)
    $fullFile = Get-ChildItem -Path $pwd -Filter $file | ForEach-Object { $_.FullName }
    Expand-Archive -Path $fullFile -DestinationPath $pwd
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

# SET KEYBOARD SHORTCUTS TO CALL FUNCTION
Set-PSReadLineKeyHandler -Key "Ctrl+z" -ScriptBlock {
    [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
    [Microsoft.PowerShell.PSConsoleReadLine]::Insert("zi")
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
        --preview 'if ((Get-Item {}).Extension -eq ".jpg" -or (Get-Item {}).Extension -eq ".png") { chafa --symbols vhalf -w 1 --color-extractor median {} } else { bat --color=always {} --style=plain }'

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
    $input_path = _fzf_get_path_using_fd
    if (-not [string]::IsNullOrEmpty($input_path)) {
        _fzf_open_path $input_path
    }
}

function rgg {
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
