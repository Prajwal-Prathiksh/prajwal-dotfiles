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

scriptRootDir=$(dirname "$(readlink -f "$0")")
fossDir="$HOME/FOSS"
mkdir -p "$fossDir"


######################################################
######################################################
# SYSTEM UPGRADE SECTION
######################################################
######################################################
echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mSYSTEM UPGRADE SECTION\e[0m"
echo -e "\e[33m$border1$border1\e[0m"

read -p "Do you want to do a full system upgrade? ([y]es/[N]o): " systemUpgrade
if [ "$systemUpgrade" == "y" ]; then
    sudo pacman -Syu
    echo -e "\e[32mFull system upgraded successfully\e[0m"
else
    echo -e "\e[33mSkipping full system upgrade\e[0m"
fi

read -p "Do you want to install paru? ([y]es/[N]o): " installParu
if [ "$installParu" == "y" ]; then
    sudo pacman -Sy --needed base-devel git --noconfirm
    if [ ! -d "$fossDir/paru" ]; then
        git clone https://aur.archlinux.org/paru.git "$fossDir/paru"
        echo -e "\e[32mParu cloned successfully\e[0m"
    else
        echo -e "\e[33mParu is already cloned\e[0m"
    fi
    cd "$fossDir/paru"
    git pull
    makepkg -si
    echo -e "\e[32mParu installed successfully\e[0m"
else
    echo -e "\e[33mSkipping paru installation\e[0m"
fi


######################################################
######################################################
# PACKAGE INSTALL SECTION
######################################################
######################################################
packagesToInstall=(
    "7zip"
    "asciiquarium"
    "bat"
    "btop"
    "chafa"
    "cmatrix"
    "dos2unix"
    "fastfetch"
    "fd"
    "ffmpeg"
    "fontconfig"
    "fzf"
    "ghostscript"
    "github-cli"
    "htop"
    "hyperfine"
    "imagemagick"
    "jq"
    "kitty"
    "lua"
    "neofetch"
    "neovim"
    "nvtop"
    "openssh"
    "poppler"
    "powertop"
    "ripgrep"
    "rlwrap"
    "speedtest-cli"
    "tokei"
    "tree"
    "ttf-cascadia-code-nerd"
    "unzip"
    "uv"
    "vim"
    "yazi"
    "zoxide"
    "zsh"
)

echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mPACKAGE INSTALLATION SECTION\e[0m"
echo -e "\e[33m$border1$border1\e[0m"

echo ""
echo -e "$border3$border3"
echo ">>> (1) Pacman Packages:"
for pkg in "${packagesToInstall[@]}"; do
    echo " - $pkg"
done
echo -e "$border2"

read -p "Do you want to install these packages? ([y]es/[N]o): " installPackages
if [[ $installPackages == "y" ]]; then
    sudo pacman -S "${packagesToInstall[@]}" --noconfirm
    echo -e "\e[32mPackages installed successfully\e[0m"
else
    echo -e "\e[33mSkipping package installation\e[0m"
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


######################################################
######################################################
# BYE BYE SECTION
######################################################
######################################################
echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mSETUP COMPLETED SUCCESSFULLY!!\e[0m"
echo -e "\e[33mBye Bye!!\e[0m"
echo -e "\e[33m$border1$border1\e[0m"


