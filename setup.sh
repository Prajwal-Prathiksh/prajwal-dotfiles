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
    sudo apt update && sudo apt upgrade -y
    echo -e "\e[32mPackages updated and upgraded successfully!!\e[0m"
else
    echo -e "\e[33mSkipping update and upgrade...\e[0m"
fi


if ! command_exists curl; then
    sudo apt install -y curl
    echo -e "\e[32mCurl installed successfully!!\e[0m"
fi

if ! command_exists git; then
    sudo apt install -y git
    echo -e "\e[32mGit installed successfully!!\e[0m"
fi

if ! command_exists fc-cache; then
    sudo apt install -y fontconfig
    echo -e "\e[32mFont-config installed successfully!!\e[0m"
fi

read -p "Do you want to add repositories for some packages? ([y]es/[N]o): " addRepos
if [[ $addRepos == "y" ]]; then
    if ! grep -q "zhangsongcui3371/fastfetch" /etc/apt/sources.list /etc/apt/sources.list.d/* >/dev/null 2>&1; then
        sudo add-apt-repository ppa:zhangsongcui3371/fastfetch -y
    else
        echo -e "\e[33mRepository already added. Skipping...\e[0m"
    fi
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
    mkdir -p "$HOME/.local/share/fonts"

    for font in $allFonts; do
        if [ ! -f "$HOME/.local/share/fonts/$(basename "$font")" ]; then
            cp "$font" "$HOME/.local/share/fonts"
        else
            echo -e "\e[33mFont $(basename "$font") is already installed. Skipping...\e[0m"
        fi
    done

    # Update the font cache
    fc-cache -f -v

    echo -e "\e[32mFonts installed successfully!!\e[0m"
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
    sudo apt install -y "${aptPackages[@]}"
    echo -e "\e[32mApt packages installed successfully!!\e[0m"
else
    echo -e "\e[33mSkipping package installation...\e[0m"
fi

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
    cp "$windowsConfigDir/.vimrc" "$HOME/.vimrc"
    echo -e "\e[32m.zshrc and .vimrc files copied successfully!!\e[0m"
else
    echo -e "\e[33mSkipping copying .zshrc and .vimrc files...\e[0m"
fi



# Rust Build
# - yazi
# - tokei

# Install cht
# PATH_DIR="$HOME/bin"  # or another directory on your $PATH
# mkdir -p "$PATH_DIR"
# curl https://cht.sh/:cht.sh > "$PATH_DIR/cht.sh"
# chmod +x "$PATH_DIR/cht.sh"

# Speedtest cli
# curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | sudo bash
# sudo apt-get install speedtest