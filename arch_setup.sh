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
read -p "Do you want to copy the .zshrc & .vimrc files? ([Y]es/[n]o): " copyConfigFiles
if [[ $copyConfigFiles == "n" ]]; then
    echo -e "\e[33mSkipping copying .zshrc and .vimrc files...\e[0m"
else
    cp "$linuxConfigDir/arch.zshrc" "$HOME/.zshrc"
    dos2unix "$HOME/.zshrc"

    cp "$windowsConfigDir/.vimrc" "$HOME/.vimrc"
    dos2unix "$HOME/.vimrc"
    echo -e "\e[32m.zshrc and .vimrc files copied successfully!!\e[0m"
fi


######################################################
######################################################
# CUSTOM CONFIG SECTION
######################################################
######################################################
read -p "Do you want to setup custom neovim config? ([Y]es/[n]o): " setupNeovim
if [[ $setupNeovim == "n" ]]; then
    echo -e "\e[33mSkipping Neovim config setup...\e[0m"
else
    neovimConfigDir="$HOME/.config/nvim"
    if [ ! -d "$neovimConfigDir" ]; then
        git clone https://github.com/Prajwal-Prathiksh/prajwal-neovim.git "$neovimConfigDir"
        echo -e "\e[32mNeovim config setup successfully!!\e[0m"
    else
        echo -e "\e[33mNeovim config is already setup. Skipping setup...\e[0m"
    fi
fi

read -p "Do you want to setup custom kitty config? ([Y]es/[n]o): " setupKitty
if [[ $setupKitty == "n" ]]; then
    echo -e "\e[33mSkipping Kitty config setup...\e[0m"
else
    kittyConfigDir="$HOME/.config/kitty"
    if [ ! -d "$kittyConfigDir" ]; then
        mkdir -p "$kittyConfigDir"
    else
        # Remove existing kitty config
        rm -rf "$kittyConfigDir"
        mkdir -p "$kittyConfigDir"
    fi
    customKittyConfig="$scriptRootDir/kitty_config"
    # copy everything from kitty_config to ~/.config/kitty recursively while maintaining the directory structure
    cp -r "$customKittyConfig/." "$kittyConfigDir"
    echo -e "\e[32mKitty config setup successfully!!\e[0m"
fi


read -p "Do you want to setup custom Yazi config? ([Y]es/[n]o): " setupYazi
if [[ $setupYazi == "n" ]]; then
    echo -e "\e[33mSkipping Yazi config setup...\e[0m"
else
    yaziConfigDir="$HOME/.config/yazi"
    if [ ! -d "$yaziConfigDir" ]; then
        mkdir -p "$yaziConfigDir"
    fi
    customYaziConfig="$scriptRootDir/yazi_config"
    # copy everything from yazi_config to ~/.config/yazi recursively while maintaining the directory structure
    cp -r "$customYaziConfig/." "$yaziConfigDir"
    echo -e "\e[32mYazi config setup successfully!!\e[0m"
fi

read -p "Do you want to setup custom fastfetch config? ([Y]es/[n]o): " setupFastfetch
if [[ $setupFastfetch == "n" ]]; then
    echo -e "\e[33mSkipping Fastfetch config setup...\e[0m"
else
    fromFastfetch="$scriptRootDir/windows_config/fastfetch_custom.jsonc"
    toFastfetch="/usr/share/fastfetch/presets/custom.jsonc"
    sudo cp "$fromFastfetch" "$toFastfetch"
    echo -e "\e[32mFastfetch config setup successfully!!\e[0m"
fi

read -p "Do you want to setup custom bat config? ([Y]es/[n]o): " setupBat
if [[ $setupBat == "n" ]]; then
    echo -e "\e[33mSkipping Bat config setup...\e[0m"
else
    fromBat="$scriptRootDir/windows_config/.bat_config"
    toBat="$HOME/.config/bat/config"
    mkdir -p "$HOME/.config/bat" && cp "$fromBat" "$toBat"
    echo -e "\e[32mBat config setup successfully!!\e[0m"
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


