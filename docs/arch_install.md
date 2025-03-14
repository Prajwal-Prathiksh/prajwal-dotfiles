# Install Arch Linux
# Increase Font Size
```bash
> setfont ter-132n
```

# Connect to WiFi
```bash
> iwctl
[iwd]# device list
[iwd]# station wlan0 get-networks
[iwd]# station wlan0 connect SSID
[iwd]# exit
> ping google.com
```

# Setup SSH
```bash
> pacman -Sy openssh
> passwd
> systemctl enable sshd.service
> systemctl start sshd.service
> ip a
> pacman -S archlinux-keyring
> pacman -S archinstall
```

# Dual-Boot Specific
```bash
> lsblk
> cfdisk /dev/nvme0n1
# Create a 1GB EFI partition, and rest linux filesystem partition
> mkfs.fat -F32 /dev/nvme0n1p5 # This is the EFI partition
> mkfs.ext4 /dev/nvme0n1p6 # This is the linux filesystem partition
> mount /dev/nvme0n1p6 /mnt
> mkdir /mnt/boot
> mount /dev/nvme0n1p5 /mnt/boot
> lsblk # Verify mounts
```

# Archinstall 
```bash
> archinstall
```
- `Disk Configuration`:
  - Select `Partitioning` -> `Pre-mounted configuration` -> Type `/mnt` -> Enter
- `Bootloader`:
  - Select `Bootloader` -> `Grub` -> Enter
- `Audio`:
  - Select `Audio` -> `PipeWire` -> Enter
- `Network Configuration`:
  - Select `Use NetworkManager` -> Enter

## Post-Install (Grub)
```bash
> pacman -S grub efibootmgr dosfstools os-prober mtools # Install grub and other tools
> grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=GRUB # Install grub
> grub-mkconfig -o /boot/grub/grub.cfg # Generate grub config
> sudo vim /etc/default/grub # Edit grub config
# Change GRUB_TIMEOUT=5 to GRUB_TIMEOUT=20
# Uncomment GRUB_DISABLE_OS_PROBER=false
> sudo grub-mkconfig -o /boot/grub/grub.cfg # Re-generate grub config
```