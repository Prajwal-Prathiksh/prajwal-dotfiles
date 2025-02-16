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
# UPDATE AND UPGRADE SECTION
######################################################
######################################################
echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mUPDATE AND UPGRADE SECTION\e[0m"
echo -e "\e[33m$border1$border1\e[0m"

read -p "Do you want to update and upgrade all packages? ([y]es/[N]o): " updateUpgrade
if [ "$updateUpgrade" == "y" ]; then
    sudo pacman -Syu
else
    echo -e "\e[33mSkipping update and upgrade\e[0m"
fi

read -p "Do you want to install paru? ([y]es/[N]o): " installParu
if [ "$installParu" == "y" ]; then
    sudo pacman -S --needed base-devel git --noconfirm
    if [ ! -d "$fossDir/paru" ]; then
        git clone https://aur.archlinux.org/paru.git "$fossDir/paru"
    else
        echo -e "\e[33mParu is already cloned\e[0m"
    fi
    cd "$fossDir/paru"
    makepkg -si
else
    echo -e "\e[33mSkipping paru installation\e[0m"
fi


######################################################
######################################################
# FONT INSTALL SECTION
######################################################
######################################################
echo -e "\e[33m$border1$border1\e[0m"
echo -e "\e[33mFONT INSTALLATION SECTION\e[0m"
echo -e "\e[33m$border1$border1\e[0m"

FontsFolder="$scriptRootDir/CascadiaCode"
allFonts=$(find "$FontsFolder" -name "*.ttf")

echo ">>> Following fonts will be installed:"
for font in $allFonts; do
    echo "- $(basename "$font")"
done
echo -e "$border3$border3"

read -p "Do you want to install these fonts? ([y]es/[N]o): " installFonts
if [ "$installFonts" == "y" ]; then
    sudo cp -r "$FontsFolder"/* /usr/share/fonts/
    sudo fc-cache -f -v
else
    echo -e "\e[33mSkipping font installation\e[0m"
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


