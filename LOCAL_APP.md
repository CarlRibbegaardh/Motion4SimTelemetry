# Local Windows App

The Windows wrapper serves the dashboard from `http://127.0.0.1:5188` and opens
it in the user's default browser. The page can then connect directly to the
controller at `ws://192.168.50.88/ws`.

## Build a distributable package

From the repository root:

```powershell
.\build-windows.cmd
```

The finished download is created at:

```text
artifacts/Motion4SimTelemetry-win-x64.zip
```

The build machine needs Node.js with Corepack and the .NET 9 SDK. End users do
not need Node.js or .NET because the package is self-contained.

## Use the app

1. Extract the zip.
2. Join the controller's Wi-Fi network.
3. Run `Motion4SimTelemetry.exe`.
4. Allow local-network access if the browser asks.
5. Connect to the controller IP from the dashboard.

Keep the console window open while using the dashboard. Closing it stops the
local web server.

## Publish for non-developers

Push a version tag to publish the Windows zip on the repository's GitHub
Releases page:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

GitHub builds `Motion4SimTelemetry-win-x64.zip` and attaches it to the release.
Users only need to download the zip, extract it, and run
`Motion4SimTelemetry.exe`.

The workflow can also be started manually from **Actions > Publish Windows
release** by entering a version tag.
