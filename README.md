# Prajwal's OS Customizations
Repository of all the customizations I have made to my Windows and Linux systems.

## Windows
- All of the `dotfiles`  can be found in the `./windows_config` directory.
- Refer to the [`windows_config/README.md`](windows_config/README.md) file for more details.

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
    