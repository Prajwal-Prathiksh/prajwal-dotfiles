# Prajwal's OS Customizations
Repository of all the customizations I have made to my Windows and Linux systems.


## Table of Contents
- [Prajwal's OS Customizations](#prajwals-os-customizations)
  - [Table of Contents](#table-of-contents)
  - [Windows](#windows)
    - [Automated Setup](#automated-setup)
    - [TODOs](#todos)
  - [Linux (Ubuntu only)](#linux-ubuntu-only)
    - [Automated Setup](#automated-setup-1)
    - [TODOs](#todos-1)


## Windows
- All of the `dotfiles`  can be found in the `./windows_config` directory.
- Refer to the [`windows_config/README.md`](windows_config/README.md) file for more details.
> The `Setup.ps1` script is still a work in progress. Run it only if you know what you are doing 🚧.

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
1. Run the following command to execute the setup script:
```powershell
> .\Setup.ps1
```
1. Follow the on-screen instructions to complete the setup.


### TODOs
- [ ] Add custom config for `bat`
- [ ] Add automated setup for `windows terminal` settings
- [ ] (Optional) Add battery full notification for laptops
- [ ] Add WSL installation and setup
- [ ] Use scoop aria2 for faster downloads
- [ ] Add option to install all packages at once as well
- [ ] Add Glaze installation option
- [ ] Add a prompt asking the user to restart the shell or to do it automatically at the end of certain sections
- [ ] Update `git config` to use `delta` for `diff`


## Linux (Ubuntu only)
- All of the `dotfiles`  can be found in the `./linux_config` directory.
- Refer to the [`linux_config/README.md`](linux_config/README.md) file for more details.
> The `setup.sh` script is more or less stable. Run it to setup the configurations on your WSL system 🚀.

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


### TODOs
- [ ] Add similar custom keybindings for `zsh` as those created for `PowerShell`
- [x] Add custom config for `bat`

