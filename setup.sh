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
    # Update and upgrade apt packages
    sudo apt update && sudo apt upgrade -y
    echo -e "\e[32mPackages updated and upgraded successfully!!\e[0m"
else
    echo -e "\e[33mSkipping update and upgrade...\e[0m"
fi


# Install curl if not already installed
if ! command_exists curl; then
    sudo apt install -y curl
fi

# Install Git if not already installed
if ! command_exists git; then
    sudo apt install -y git
fi

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




######################################################
######################################################
# FONT INSTALL SECTION
######################################################
######################################################
echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mFONT INSTALLATION SECTION\e[0m"
echo -e "\e[33m$border1$border1\e[0m"

FontsFolder="$scriptRootDir/CascadiaCode"

# Get all font files in the directory
allFonts=$(find "$FontsFolder" -name "*.ttf")

# Print all font files to install, and get user confirmation to install
echo ">>> Following fonts will be installed:"
for font in $allFonts; do
    echo "- $(basename "$font")"
done
echo -e "$border3$border3"

read -p "Do you want to install these fonts? ([y]es/[N]o): " installFonts
if [[ $installFonts == "y" ]]; then
    # Create a directory to store the fonts
    mkdir -p "$HOME/.local/share/fonts"

    # Copy all font files to the fonts directory
    for font in $allFonts; do
        cp "$font" "$HOME/.local/share/fonts"
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
    # Install apt packages
    sudo apt install -y "${aptPackages[@]}"
    echo -e "\e[32mApt packages installed successfully!!\e[0m"
else
    echo -e "\e[33mSkipping package installation...\e[0m"
fi

# Ask user to set zsh as default shell
read -p "Do you want to set zsh as default shell? ([y]es/[N]o): " setZsh
if [[ $setZsh == "y" ]]; then
    # Set zsh as default shell
    chsh -s "$(which zsh)"
    echo -e "\e[32mZsh set as default shell successfully!!\e[0m"
else
    echo -e "\e[33mSkipping setting zsh as default shell...\e[0m"
fi

# Ask user to install oh-my-posh
read -p "Do you want to install oh-my-posh? ([y]es/[N]o): " installOhMyPosh
if [[ $installOhMyPosh == "y" ]]; then
    # Install oh-my-posh
    curl -s https://ohmyposh.dev/install.sh | bash -s
    echo -e "\e[32mOh-my-posh installed successfully!!\e[0m"
else
    echo -e "\e[33mSkipping oh-my-posh installation...\e[0m"
fi