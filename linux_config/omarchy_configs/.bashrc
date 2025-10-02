# All the default Omarchy aliases and functions
# (don't mess with these directly, just overwrite them here!)
source ~/.local/share/omarchy/default/bash/rc


# Alias vi, vim to nvim
alias vi='nvim'
alias vim='nvim'
alias ll='ls -la'

# Add your own exports, aliases, and functions here.
# Add this function to your .bashrc for switching Git branches interactively with fzf

function gswitch() {
    # Find the top-level directory of the Git repository
    repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
    if [[ -z "$repo_root" ]]; then
        echo "Not a Git repository." >&2
        return 1
    fi

    # Save current directory and change to repo root
    current_dir=$(pwd)
    cd "$repo_root" || return 1

    # Get the list of local branches only, select with fzf, and process
    selected_branch=$(git branch --list | fzf | sed 's/^[[:space:]]*//' | sed 's/^\* //')
    if [[ -z "$selected_branch" ]]; then
        cd "$current_dir"
        return 0
    fi

    # Switch to the branch (no remote handling needed since we filtered them out)
    git switch "$selected_branch"

    # Return to original directory
    cd "$current_dir"
}

#
# Make an alias for invoking commands you use constantly
# alias p='python'
#
# Use VSCode instead of neovim as your default editor
# export EDITOR="code"
#
# Set a custom prompt with the directory revealed (alternatively use https://starship.rs)
# PS1="\W \[\e]0;\w\a\]$PS1"

. "$HOME/.local/share/../bin/env"
