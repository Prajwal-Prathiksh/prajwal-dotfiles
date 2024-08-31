# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load.
ZSH_THEME="robbyrussell"

# Set update of oh-my-zsh to remind you to update
zstyle ':omz:update' mode reminder

# Command execution time stamp shown in the history command output
HIST_STAMPS="yyyy-mm-dd"

plugins=(
    git
    zsh-syntax-highlighting
    zsh-autocomplete
    zsh-autosuggestions
    shrink-path

)
source $ZSH/oh-my-zsh.sh

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
    export EDITOR='vim'
else
    export EDITOR='vim'
fi

# Alias definitions
alias bat='batcat'

# Add zoxide
eval "$(zoxide init zsh)"

# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$('~/miniconda3/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "~/miniconda3/etc/profile.d/conda.sh" ]; then
        . "~/miniconda3/etc/profile.d/conda.sh"
    else
        export PATH="~/miniconda3/bin:$PATH"
    fi
fi
unset __conda_setup

fastfetch -c custom

# TODO: Feature parity with powershell aliases