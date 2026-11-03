# ⏱️ Tary Timer

A modern, sleek countdown timer that lives in your GNOME Shell top panel. Set a duration with the intuitive time picker or one-click presets, and get notified with a customizable alarm sound when your time is up.

> **Note:** Tary Timer is currently available **only on GitHub**. It has not yet been published to the [GNOME Extensions website](https://extensions.gnome.org).

---

## ✨ Features

- **Panel Countdown** — Always-visible timer in the top bar with live HH:MM:SS display.
- **GNOME Clocks-Style Picker** — Adjust hours, minutes, and seconds with +/− buttons or type values directly.
- **Quick Presets** — Four configurable one-click presets (default: 1, 5, 10, 15 min).
- **Flexible Panel Placement** — Position the timer on the left, center-left, center-right, or right of the top panel.
- **Alarm Sounds** — Choose from built-in GNOME theme sounds, system alarm files, or browse for your own custom audio.
- **Desktop Notification** — Receive a GNOME notification when the timer finishes.
- **Live Settings Reload** — Config changes apply instantly — no need to restart the extension or log out.
- **Full Preferences UI** — Native Adwaita settings window for presets, position, sound, and reset.

---

## 📋 Requirements

- GNOME Shell **45 – 51**
- GLib, Gio, St, Clutter, Pango (bundled with GNOME)

---

## 🚀 Installation (Manual)

Since Tary Timer is not yet on the GNOME Extensions website, install it manually from GitHub:

```bash
# 1. Clone the repository
git clone https://github.com/iamaymo/tary_timer.git

# 2. Copy it to the GNOME Shell extensions directory
cp -r tary_timer ~/.local/share/gnome-shell/extensions/tary-timer@iamaymo.github.com

# 3. Restart GNOME Shell
#    • On Xorg:  press Alt+F2, type 'r', press Enter
#    • On Wayland: log out and log back in

# 4. Enable the extension
gnome-extensions enable tary-timer@iamaymo.github.com
```

### Updating

To update to the latest version:

```bash
cd tary_timer
git pull origin main
cp -r . ~/.local/share/gnome-shell/extensions/tary-timer@iamaymo.github.com
```

Then restart GNOME Shell as described above.

---

## 🎯 Usage

1. **Click** the timer icon in the top panel to open the popup menu.
2. **Set a time** using the +/− picker buttons, or type a value directly into the digit fields.
3. Press **Start** to begin the countdown. The panel label updates every second.
4. Press **Pause** to temporarily stop, or **Reset** to return to the original duration.
5. Use a **Preset** button (e.g. *5 min*) to quickly load a saved duration.
6. When the timer reaches **00:00**, you'll receive a notification and an alarm sound.

### ⚙️ Settings

Open the preferences window from the **gear icon** (⚙) in the popup menu, or run:

```bash
gnome-extensions prefs tary-timer@iamaymo.github.com
```

From there you can:

| Setting | Description |
|---------|-------------|
| **Panel Position** | Move the timer to left, center-left, center-right, or right. |
| **Quick Presets** | Rename and change the duration of each of the 4 presets. |
| **Alarm Sound** | Pick a theme sound, a system alarm file, a custom audio file, or silence. |
| **Reset to Defaults** | Restore all settings to their original values. |

---

## 📁 Project Structure

```
tary_timer/
├── extension.js       # Main extension logic (panel indicator, timer, popup menu)
├── prefs.js           # Adwaita preferences window
├── presetsConfig.js   # Config loading, saving, and migration
├── stylesheet.css     # Custom CSS for the popup menu and panel widget
├── metadata.json      # Extension metadata (UUID, supported shell versions)
├── LICENSE            # Project license
└── README.md          # This file
```

---

## 📄 License

This project is licensed under the terms of the license included in the [LICENSE](LICENSE) file.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an [issue](https://github.com/iamaymo/tary_timer/issues) or submit a pull request.
