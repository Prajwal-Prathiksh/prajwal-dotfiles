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