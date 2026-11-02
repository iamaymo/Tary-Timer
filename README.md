# Tary Timer - Modern GNOME Shell Extension

A sleek, modern timer extension for GNOME Shell (45 to 51+) utilizing ESM (ECMAScript Modules) architecture. It places an indicator in the top panel status area with a GNOME Clocks style time picker, presets, and preferences support.

---

## Features

- **Top Panel Indicator**: Real-time countdown display with state icons (Running, Paused, Finished).
- **GNOME Clocks Style Time Picker**: Sleek 3-column picker (Hours : Minutes : Seconds) with `+` and `−` controls.
- **Quick Presets**: 4 quick preset buttons in the popup menu.
- **Preferences (Settings Window)**: Click the pen icon next to "Presets" to customize labels, minutes, and seconds for all 4 presets.
- **Native Notifications & Audio**: Displays a desktop notification and plays a chime when time expires.
- **No Text Truncation**: Fully formatted display with tabular numerals ensuring seconds are always clearly visible.

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
  - **Option A (Test in nested window without logging out)**:
    ```bash
    dbus-run-session -- gnome-shell --nested --wayland
    ```
  - **Option B (Logout and login)**:
    ```bash
    gnome-session-quit --logout
    ```
- **On X11**:
  Press <kbd>Alt</kbd> + <kbd>F2</kbd>, type `r`, and press <kbd>Enter</kbd>.

---

### 3. Open Preferences (Presets Editor)

You can open the Presets settings tab directly by clicking the ✏️ pen icon in the popup menu, or via terminal:

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

