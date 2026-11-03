# Tary Timer - Modern GNOME Shell Extension

A sleek, modern timer extension for GNOME Shell (45 to 51+) utilizing ESM (ECMAScript Modules) architecture. It places an indicator in the top panel status area with a GNOME Clocks style time picker, presets, custom alarm sounds, and preferences support.

---

## Features

- **Top Panel Indicator**: Real-time countdown display with state icons (pure white Adwaita styling).
- **Flexible Panel Placement**: Choose between `Left (after Spaces)`, `Middle-Left (left of Clock)`, `Middle-Right (right of Clock)`, or `Right (after system monitors)`.
- **GNOME Clocks Style Time Picker**: Sleek 3-column picker (Hours : Minutes : Seconds) with `+` and `−` controls and full direct keyboard input.
- **Quick Presets**: 4 quick preset buttons in the popup menu.
- **Customizable Alarm Sounds**:
  - Curated sound options (Alarm Clock, Complete, Bell, Glass Bell, School Bell, Digital Tone, Sonar, Message).
  - Ability to pick and add any custom sound file (`.mp3`, `.wav`, `.ogg`, `.oga`, `.flac`) from your computer.
  - Sound preview button (▶) directly inside the settings window.
  - Silent / None mode.
- **Settings & Preferences**:
  - Click the ⚙️ gear icon at the top of the popup menu to open extension settings.
  - Choose panel location.
  - Customize preset labels and timings (all collapsed by default).
  - Customize alarm sounds.
- **Auto-Close on Start**: Automatically closes the menu when starting the countdown.

---

## Extension Details

- **UUID**: `tary-timer@iamaymo.github.com`
- **Supported GNOME Versions**: `45`, `46`, `47`, `48`, `49`, `50`, `51`
- **Architecture**: Modern GNOME Shell ESM (`resource:///org/gnome/shell/extensions/extension.js`)

---

## Installation & Setup Instructions

### 1. Install or Update Extension Link

Run in your terminal:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions
ln -sfn ~/Desktop/tary_timer ~/.local/share/gnome-shell/extensions/tary-timer@iamaymo.github.com
```

*(Or copy files: `cp -r ~/Desktop/tary_timer/* ~/.local/share/gnome-shell/extensions/tary-timer@iamaymo.github.com/`)*

---

### 2. Test the Extension

- **On Wayland (Fedora default)**:
  - **Option A (Logout and login)**:
    ```bash
    gnome-session-quit --logout
    ```
  - **Option B (Test in nested window without logging out)**:
    ```bash
    dbus-run-session -- gnome-shell --nested --wayland
    ```
- **On X11**:
  Press <kbd>Alt</kbd> + <kbd>F2</kbd>, type `r`, and press <kbd>Enter</kbd>.

---

### 3. Open Preferences (Settings Window)

You can open the settings window directly by clicking the ⚙️ gear icon in the popup menu header, or via terminal:

```bash
gnome-extensions prefs tary-timer@iamaymo.github.com
```

---

### 4. Enable / Disable Commands

```bash
# Enable
gnome-extensions enable tary-timer@iamaymo.github.com

# Disable
gnome-extensions disable tary-timer@iamaymo.github.com

# Check Status
gnome-extensions info tary-timer@iamaymo.github.com
```
