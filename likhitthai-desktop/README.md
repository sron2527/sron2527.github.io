# LikhitThai Studio Desktop (Windows)

This project packages LikhitThai Studio as a Windows installer.

## What it does

- Installs as **LikhitThai Studio** with Start Menu and Desktop shortcuts.
- Opens the hosted app at https://sron2527.github.io/likhitthai/.
- Does not embed or distribute anyone's Gemini API key.
- Requires an internet connection because the app and Gemini API are online services.

## Build

On Windows with Node.js installed:

```powershell
npm install
npm run dist:win
```

The installer will be written to `dist/LikhitThai-Studio-Setup-1.0.0-x64.exe`.

## GitHub Actions

The repository workflow **Build LikhitThai Studio Windows Installer** builds the Windows installer after changes to this folder, and uploads the installer as an Actions artifact.
