# Prajwal's OS Customizations
Repository of all the customizations I have made to my Windows and Linux systems.


## Table of Contents
- [Prajwal's OS Customizations](#prajwals-os-customizations)
  - [Table of Contents](#table-of-contents)
  - [Windows](#windows)
    - [Automated Setup](#automated-setup)
  - [Linux (Ubuntu only)](#linux-ubuntu-only)
    - [Automated Setup](#automated-setup-1)


## Windows
- All of the `dotfiles`  can be found in the `./windows_config` directory.
- Refer to the [`windows_config/README.md`](windows_config/README.md) file for more details.
> The `Setup.ps1` script is more or less stable. Run it to setup the configurations on a Windows system 🚀.

### Automated Setup
To run the setup script:
1. Clone this repository, or download the zip file and extract it to a directory.
2. Open PowerShell (preferably as an `Administrator`, but not necessary).
3. Navigate to the root directory of the repository.
4. Run the following `pwd` command, to ensure that you are in the correct directory:
```powershell
> Get-Location

# Output should be similar to:
# Path
# ----
# C:\...\prajwal-dotfiles
```
5. Run the following command to execute the setup script:
```powershell
> .\Setup.ps1
```
6. Follow the on-screen instructions to complete the setup.


## Linux (Ubuntu only)
- All of the `dotfiles`  can be found in the `./linux_config` directory.
- Refer to the [`linux_config/README.md`](linux_config/README.md) file for more details.
> The `setup.sh` script is still a work in progress. Run it at your own risk for now 😲.

### Automated Setup
To run the setup script:
1. Clone this repository, or download the zip file and extract it to a directory.
2. Open a terminal.
3. Navigate to the root directory of the repository.
4. Run the following `pwd` command, to ensure that you are in the correct directory:
```bash
$ pwd

# Output should be similar to:
# /path/to/prajwal-dotfiles
```
5. You might need to make the `setup.sh` script executable. Run the following command:
```bash
$ chmod +x setup.sh
```
6. Run the following command to execute the setup script:
```bash
$ ./setup.sh
```
7. Follow the on-screen instructions to complete the setup.
