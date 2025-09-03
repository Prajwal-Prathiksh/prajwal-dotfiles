# Zsh Configuration
- `.zshrc`: [.zshrc](.zshrc)

# Vim
- `.vimrc`: [.vimrc](../windows_config/.vimrc)

# `iwlwifi.sh`
- `/usr/lib/systemd/system-sleep/`
```bash
#!/bin/sh

case $1/$2 in
    pre/*)
        echo "[*] Stopping network services..."
        systemctl stop NetworkManager
        systemctl stop wpa_supplicant

        echo "[*] Unloading iwlwifi modules..."
        modprobe -r iwlmld iwlmvm iwlwifi
        ;;
    post/*)
        echo "[*] Reloading iwlwifi modules..."
        modprobe iwlmld iwlmvm iwlwifi

        echo "[*] Starting network services..."
        systemctl start wpa_supplicant
        systemctl start NetworkManager
        ;;
esac
```