# Bangla Voice Typing — Windows desktop app

Desktop version of the Chrome extension. Same Gemini prompt, same audio pipeline, same look.
Instead of working only inside Chrome, it works in **any** Windows app.

**Use it:** click into any text box (Word, Notepad, Chrome, WhatsApp, VS Code…), **hold Ctrl + Alt + B**, speak Bangla, release. Punctuated Bangla text is typed in.

## Run without installing anything
Unzip `Bangla-Voice-Typing-2.2.0-win-x64.zip` and double-click `Bangla Voice Typing.exe`.
The app lives in the system tray (bottom-right, near the clock).

## First-time setup
1. Get a free API key at https://aistudio.google.com/apikey
2. Paste it in the app, click **Save & load models**.
3. Click **Test microphone access**. If Windows blocks it: Settings → Privacy & security → Microphone → turn on *Let desktop apps access your microphone*.

## Build the installer yourself (Windows 11)
Needs Node.js 20+ (https://nodejs.org). In this folder:

    npm install
    npm start          # run in development
    npm run dist       # builds dist\Bangla-Voice-Typing-Setup-2.2.0.exe (installer)
    npm run dist:zip   # builds a portable zip instead

No Visual Studio / C++ build tools are needed (both native modules ship prebuilt).

## What changed vs. the extension
| Extension                          | Desktop app                                                         |
|------------------------------------|---------------------------------------------------------------------|
| Hold Alt+C in a page               | System-wide hold-to-talk (default Ctrl+Alt+B, changeable in the app)|
| content.js floating button         | Floating always-on-top mic button (`overlay`)                       |
| offscreen.js (record + WAV)        | Hidden recorder window (`renderer/recorder.js`, code unchanged)      |
| Gemini calls from the page context | Gemini calls from the main process (`src/gemini.js`, same prompt)    |
| execCommand('insertText')          | Paste via Ctrl+V (clipboard restored after) or simulated keystrokes  |
| popup.html                         | Settings window + tray icon                                          |
| chrome.storage                     | `%APPDATA%\Bangla Voice Typing\config.json`, API key encrypted (DPAPI)|

New: start with Windows, choose paste vs. type mode, hotkey picker.

## Notes & limitations
- **The hotkey is not swallowed.** A system-wide hook can see keys but (as built here) doesn't block them, so the combo also reaches the focused app. Ctrl+Alt+B is rarely bound; pick another in the app if it clashes.
- **Elevated (Run as administrator) windows:** Windows blocks normal apps from typing into them. Run Bangla Voice Typing as administrator to dictate into those.
- **Antivirus / SmartScreen:** the build is unsigned, so SmartScreen may warn ("More info → Run anyway"). A global keyboard hook can also trigger some antivirus heuristics. The app only compares key codes against your hotkey; it stores and sends nothing from the keyboard. Code signing would remove the warning.
- Only audio recorded while you hold the hotkey is sent to Google Gemini.
