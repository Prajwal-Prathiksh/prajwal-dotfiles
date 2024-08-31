#!/bin/bash

######################################################
######################################################
# PREAMBLE
######################################################
######################################################
border1="========================================"
border2="-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-"
border3="----------------------------------------"

## Custom Functions
command_exists() {
    command -v "$1" >/dev/null 2>&1
}


######################################################
######################################################
# UPDATE AND UPGRADE SECTION
######################################################
######################################################
echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mUPDATE AND UPGRADE SECTION\e[0m"
echo -e "\e[33m$border1$border1\e[0m"

read -p "Do you want to update and upgrade all packages? ([y]es/[N]o): " updateUpgrade
if [[ $updateUpgrade == "y" ]]; then
    if command_exists nala; then
        sudo nala update && sudo nala upgrade -y
    else
        sudo apt update && sudo apt upgrade -y
    fi
    echo -e "\e[32mPackages updated and upgraded successfully!!\e[0m"
else
    echo -e "\e[33mSkipping update and upgrade...\e[0m"
fi


read -p "Do you want to install nala? ([y]es/[N]o): " installNala
if [[ $installNala == "y" ]]; then
    if ! command_exists nala; then
        sudo apt install -y nala
        sudo nala fetch
        echo -e "\e[32mNala installed successfully!!\e[0m"
    else
        echo -e "\e[33mNala is already installed. Skipping installation...\e[0m"
    fi
else
    echo -e "\e[33mSkipping nala installation...\e[0m"
fi

if ! command_exists curl; then
    sudo nala install -y curl
    echo -e "\e[32mCurl installed successfully!!\e[0m"
fi

if ! command_exists git; then
    sudo nala install -y git
    echo -e "\e[32mGit installed successfully!!\e[0m"
fi

if ! command_exists fc-cache; then
    sudo nala install -y fontconfig
    echo -e "\e[32mFont-config installed successfully!!\e[0m"
fi

read -p "Do you want to add repositories for some packages? ([y]es/[N]o): " addRepos
if [[ $addRepos == "y" ]]; then
    if ! grep -q "zhangsongcui3371/fastfetch" /etc/apt/sources.list /etc/apt/sources.list.d/* >/dev/null 2>&1; then
        sudo add-apt-repository ppa:zhangsongcui3371/fastfetch -y
    else
        echo -e "\e[33mRepository already added. Skipping...\e[0m"
    fi
    curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | sudo bash
    echo -e "\e[32mRepositories added successfully!!\e[0m"
else
    echo -e "\e[33mSkipping adding repositories...\e[0m"
fi

######################################################
######################################################
# FONT INSTALL SECTION
######################################################
######################################################
echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mFONT INSTALLATION SECTION\e[0m"
echo -e "\e[33m$border1$border1\e[0m"

scriptRootDir=$(dirname "$(readlink -f "$0")")
FontsFolder="$scriptRootDir/CascadiaCode"

allFonts=$(find "$FontsFolder" -name "*.ttf")

echo ">>> Following fonts will be installed:"
for font in $allFonts; do
    echo "- $(basename "$font")"
done
echo -e "$border3$border3"

read -p "Do you want to install these fonts? ([y]es/[N]o): " installFonts
if [[ $installFonts == "y" ]]; then
    if [ ! -d "$HOME/.local/share/fonts" ]; then
        mkdir -p "$HOME/.local/share/fonts"
        for font in $allFonts; do
            cp "$font" "$HOME/.local/share/fonts"
        done
        
        # Update the font cache
        fc-cache -f -v
        echo -e "\e[32mFonts installed successfully!!\e[0m"
    else
        echo -e "\e[33mFonts directory already exists. Skipping font installation...\e[0m"
    fi
else
    echo -e "\e[33mSkipping font installation...\e[0m"
fi

######################################################
######################################################
# PACKAGE INSTALL SECTION
######################################################
######################################################
aptPackages=(
    "build-essential"
    "zsh"
    "htop"
    "chafa"
    "fd-find"
    "ghostscript"
    "hyperfine"
    "imagemagick"
    "jq"
    "ripgrep"
    "fzf"
    "zoxide"
    "bat"
    "fastfetch"
    "vim"
    "unzip"
    "dos2unix"
    "btop"
    "cmatrix"
    "speedtest"
)

echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mPACKAGE INSTALLATION SECTION\e[0m"
echo -e "\e[33m$border1$border1\e[0m"

echo ""
echo -e "$border3$border3"
echo ">>> (1) Apt packages:"
for pkg in "${aptPackages[@]}"; do
    echo "- $pkg"
done
echo -e "$border2"

read -p "Do you want to install these packages? ([y]es/[N]o): " installPackages
if [[ $installPackages == "y" ]]; then
    sudo nala install -y "${aptPackages[@]}"
    echo -e "\e[32mApt packages installed successfully!!\e[0m"
else
    echo -e "\e[33mSkipping package installation...\e[0m"
fi

read -p "Do you want to install GitHub CLI? ([y]es/[N]o): " installGitHubCLI
if [[ $installGitHubCLI == "y" ]]; then
    if ! command_exists gh; then
    sudo mkdir -p -m 755 /etc/apt/keyrings \
    && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && sudo nala update \
    && sudo nala install gh -y
        echo -e "\e[32mGitHub CLI installed successfully!!\e[0m"
    else
        echo -e "\e[33mGitHub CLI is already installed. Skipping installation...\e[0m"
    fi
else
    echo -e "\e[33mSkipping GitHub CLI installation...\e[0m"
fi

read -p "Do you want to install Cheat.sh? ([y]es/[N]o): " installCheatSh
if [[ $installCheatSh == "y" ]]; then
    if ! command_exists cht.sh; then
        curl -s https://cht.sh/:cht.sh | sudo tee /usr/local/bin/cht.sh && sudo chmod +x /usr/local/bin/cht.sh
        echo -e "\e[32mCheat.sh installed successfully!!\e[0m"
    else
        echo -e "\e[33mCheat.sh is already installed. Skipping installation...\e[0m"
    fi
else
    echo -e "\e[33mSkipping Cheat.sh installation...\e[0m"
fi

read -p "Do you want to install Rust? ([y]es/[N]o): " installRust
if [[ $installRust == "y" ]]; then
    if ! command_exists rustup; then
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
        source "$HOME/.cargo/env"
        rustup update
        echo -e "\e[32mRust installed successfully!!\e[0m"
    else
        echo -e "\e[33mRust is already installed. Skipping installation...\e[0m"
    fi
else
    echo -e "\e[33mSkipping Rust installation...\e[0m"
fi

read -p "Do you want to install Miniconda? ([y]es/[N]o): " installMiniconda
if [[ $installMiniconda == "y" ]]; then
    if ! command_exists conda; then
        mkdir -p ~/miniconda3
        wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/miniconda3/miniconda.sh
        bash ~/miniconda3/miniconda.sh -b -u -p ~/miniconda3
        rm ~/miniconda3/miniconda.sh
        ~/miniconda3/bin/conda init zsh
        source "$HOME/.zshrc"
        echo -e "\e[32mMiniconda installed successfully!!\e[0m"
    else
        echo -e "\e[33mMiniconda is already installed. Skipping installation...\e[0m"
    fi
else
    echo -e "\e[33mSkipping Miniconda installation...\e[0m"
fi

read -p "Do you want to install Tokei & Yazi? ([y]es/[N]o): " installTokeiYazi
if [[ $installTokeiYazi == "y" ]]; then
    if ! command_exists tokei; then
        cargo install tokei
        echo -e "\e[32mTokei installed successfully!!\e[0m"
    else
        echo -e "\e[33mTokei are already installed. Skipping installation...\e[0m"
    fi

    if ! command_exists yazi; then
        cargo install --locked yazi-fm yazi-cli
        echo -e "\e[32mYazi installed successfully!!\e[0m"
    else
        echo -e "\e[33mYazi is already installed. Skipping installation...\e[0m"
    fi
else
    echo -e "\e[33mSkipping Tokei & Yazi installation...\e[0m"
fi


######################################################
######################################################
# ZSH CONFIG SECTION
######################################################
######################################################
read -p "Do you want to set zsh as default shell? ([y]es/[N]o): " setZsh
if [[ $setZsh == "y" ]]; then
    chsh -s "$(which zsh)"
    echo -e "\e[32mZsh set as default shell successfully!!\e[0m"
else
    echo -e "\e[33mSkipping setting zsh as default shell...\e[0m"
fi

read -p "Do you want to install oh-my-zsh? ([y]es/[N]o): " installOhMyZsh
if [[ $installOhMyZsh == "y" ]]; then
    if [ ! -d "$HOME/.oh-my-zsh" ]; then
        sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
        echo -e "\e[32mOh-my-zsh installed successfully!!\e[0m"
    else
        echo -e "\e[33mOh-my-zsh is already installed. Skipping installation...\e[0m"
    fi
else
    echo -e "\e[33mSkipping oh-my-zsh installation...\e[0m"
fi

declare -A zshPlugins=(
    ["zsh-syntax-highlighting"]="https://github.com/zsh-users/zsh-syntax-highlighting.git"
    ["zsh-autocomplete"]="https://github.com/marlonrichert/zsh-autocomplete"
    ["zsh-autosuggestions"]="https://github.com/zsh-users/zsh-autosuggestions"
)

echo -e "$border3$border3"
echo ">>> (2) Zsh plugins:"
for plugin in "${!zshPlugins[@]}"; do
    echo "- $plugin"
done
echo -e "$border2"

read -p "Do you want to install these zsh plugins? ([y]es/[N]o): " installZshPlugins
if [[ $installZshPlugins == "y" ]]; then
    for plugin in "${!zshPlugins[@]}"; do
        pluginDir="$HOME/.oh-my-zsh/custom/plugins/$plugin"
        if [ ! -d "$pluginDir" ]; then
            git clone "${zshPlugins[$plugin]}" "$pluginDir"
        else
            echo "Skipping cloning $plugin as it already exists."
        fi
    done
    echo -e "\e[32mZsh plugins installed successfully!!\e[0m"
else
    echo -e "\e[33mSkipping zsh plugins installation...\e[0m"
fi

linuxConfigDir="$scriptRootDir/linux_config"
windowsConfigDir="$scriptRootDir/windows_config"
read -p "Do you want to copy the .zshrc & .vimrc files? ([y]es/[N]o): " copyConfigFiles
if [[ $copyConfigFiles == "y" ]]; then
    cp "$linuxConfigDir/.zshrc" "$HOME/.zshrc"
    dos2unix "$HOME/.zshrc"
    cp "$windowsConfigDir/.vimrc" "$HOME/.vimrc"
    dos2unix "$HOME/.vimrc"
    source "$HOME/.zshrc"
    echo -e "\e[32m.zshrc and .vimrc files copied successfully!!\e[0m"
else
    echo -e "\e[33mSkipping copying .zshrc and .vimrc files...\e[0m"
fi


######################################################
######################################################
# BYE BYE SECTION
######################################################
######################################################
echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mSETUP COMPLETED SUCCESSFULLY!!\e[0m"
echo -e "\e[33mBye Bye!!\e[0m"
echo -e "\e[33m$border1$border1\e[0m"