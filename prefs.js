/**
 * prefs.js — Preferences window for the Tary Timer GNOME Shell extension.
 *
 * Builds the Adwaita settings UI for panel position, preset configuration,
 * alarm sound selection (including custom audio file browsing), and reset.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { loadConfig, saveConfig, DEFAULT_CONFIG, SOUND_OPTIONS } from './presetsConfig.js';

/** Available panel positions mapped to user-facing labels. */
const POSITIONS = [
    { id: 'left', label: 'Left' },
    { id: 'middle-left', label: 'Middle-Left' },
    { id: 'middle-right', label: 'Middle-Right' },
    { id: 'right', label: 'Right' },
];

/**
 * Plays a preview of the given sound configuration so the user
 * can hear the selected alarm before committing.
 *
 * @param {object|null} soundConfig - The sound configuration to preview.
 */
function playSoundPreview(soundConfig) {
    if (!soundConfig || soundConfig.type === 'none') return;

    if (soundConfig.type === 'custom' && soundConfig.customPath) {
        GLib.spawn_command_line_async(`pw-play "${soundConfig.customPath}"`);
        return;
    }

    const soundOpt = SOUND_OPTIONS.find(s => s.id === soundConfig.id || s.id === soundConfig.themeName);
    if (soundOpt) {
        if (soundOpt.type === 'file' && soundOpt.path) {
            GLib.spawn_command_line_async(`pw-play "${soundOpt.path}"`);
        } else if (soundOpt.type === 'theme') {
            GLib.spawn_command_line_async(`canberra-gtk-play -i "${soundOpt.id}"`);
        }
    } else {
        GLib.spawn_command_line_async(`canberra-gtk-play -i complete`);
    }
}

/**
 * TaryTimerPreferences — Adwaita-based preferences window.
 *
 * Sections:
 *   1. Panel Position — combo row to pick left / center / right placement.
 *   2. Quick Presets  — four expandable rows to customise label & duration.
 *   3. Alarm Sound    — sound selector with preview and custom file picker.
 *   4. Reset          — destructive button to restore DEFAULT_CONFIG.
 */
export default class TaryTimerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(560, 680);

        let config = loadConfig();

        // ======================================================================
        // Section 1: Main Preferences Page
        // ======================================================================
        const page = new Adw.PreferencesPage({
            title: _('Settings'),
            icon_name: 'alarm-symbolic',
        });
        window.add(page);

        // ======================================================================
        // Section 2: Panel Position
        // ======================================================================
        const positionGroup = new Adw.PreferencesGroup({
            title: _('Panel Position'),
            description: _('Choose the exact location of Tary Timer in the top panel.'),
        });
        page.add(positionGroup);

        const positionStrings = new Gtk.StringList();
        POSITIONS.forEach(pos => positionStrings.append(_(pos.label)));

        let currentPosIndex = POSITIONS.findIndex(p => p.id === config.position);
        if (currentPosIndex < 0) currentPosIndex = 0;

        const positionCombo = new Adw.ComboRow({
            title: _('Position in Top Panel'),
            subtitle: _('Select panel placement'),
            model: positionStrings,
            selected: currentPosIndex,
        });

        positionCombo.connect('notify::selected', () => {
            const selectedItem = POSITIONS[positionCombo.selected];
            if (selectedItem) {
                config.position = selectedItem.id;
                saveConfig(config);
            }
        });

        positionGroup.add(positionCombo);

        // ======================================================================
        // Section 3: Quick Presets (all collapsed by default)
        // ======================================================================
        const presetsGroup = new Adw.PreferencesGroup({
            title: _('Quick Presets'),
            description: _('Configure the 4 preset buttons in the popup menu.'),
        });
        page.add(presetsGroup);

        let presets = config.presets || [...DEFAULT_CONFIG.presets];

        for (let i = 0; i < 4; i++) {
            const preset = presets[i] || {
                label: `${(i + 1) * 5} min`,
                seconds: (i + 1) * 300,
            };

            const expRow = new Adw.ExpanderRow({
                title: preset.label || `Preset ${i + 1}`,
                subtitle: `${Math.floor(preset.seconds / 60)} min ${preset.seconds % 60} sec`,
                expanded: false,
            });

            // Name / Label Row
            const nameRow = new Adw.EntryRow({
                title: _('Label'),
                text: preset.label || '',
            });

            // Minutes Spin Row
            const minRow = new Adw.SpinRow({
                title: _('Minutes'),
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 1440,
                    step_increment: 1,
                    page_increment: 5,
                    value: Math.floor(preset.seconds / 60),
                }),
            });

            // Seconds Spin Row
            const secRow = new Adw.SpinRow({
                title: _('Seconds'),
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 59,
                    step_increment: 1,
                    page_increment: 5,
                    value: preset.seconds % 60,
                }),
            });

            const updatePreset = () => {
                const newLabel = nameRow.get_text() || `Preset ${i + 1}`;
                const newMin = Math.round(minRow.get_value());
                const newSec = Math.round(secRow.get_value());
                let totalSec = (newMin * 60) + newSec;
                if (totalSec < 1) totalSec = 1;

                preset.label = newLabel;
                preset.seconds = totalSec;

                expRow.set_title(newLabel);
                expRow.set_subtitle(`${newMin} min ${newSec} sec`);

                presets[i] = preset;
                config.presets = presets;
                saveConfig(config);
            };

            nameRow.connect('changed', updatePreset);
            minRow.connect('notify::value', updatePreset);
            secRow.connect('notify::value', updatePreset);

            expRow.add_row(nameRow);
            expRow.add_row(minRow);
            expRow.add_row(secRow);

            presetsGroup.add(expRow);
        }

        // ======================================================================
        // Section 4: Alarm Sound
        // ======================================================================
        const soundGroup = new Adw.PreferencesGroup({
            title: _('Alarm Sound'),
            description: _('Choose or add a sound when the timer finishes.'),
        });
        page.add(soundGroup);

        const soundStrings = new Gtk.StringList();
        SOUND_OPTIONS.forEach(s => soundStrings.append(_(s.label)));

        // Determine currently selected sound index
        let curSoundId = config.sound?.customPath ? 'custom' : (config.sound?.themeName || 'complete');
        if (config.sound?.type === 'none') curSoundId = 'none';

        let curSoundIdx = SOUND_OPTIONS.findIndex(s => s.id === curSoundId);
        if (curSoundIdx < 0) curSoundIdx = 0;

        const soundCombo = new Adw.ComboRow({
            title: _('Sound Effect'),
            subtitle: _('Select audio alert'),
            model: soundStrings,
            selected: curSoundIdx,
        });

        // Test/Preview Play Button
        const playBtn = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Preview Sound'),
        });
        playBtn.connect('clicked', () => {
            playSoundPreview(config.sound);
        });
        soundCombo.add_suffix(playBtn);

        // Index of the "Custom Sound..." entry in SOUND_OPTIONS
        const customIndex = SOUND_OPTIONS.findIndex(s => s.id === 'custom');

        const customRow = new Adw.ActionRow({
            title: _('Custom Audio File'),
            subtitle: config.sound?.customName || config.sound?.customPath || _('No custom file selected'),
        });

        const browseBtn = new Gtk.Button({
            label: _('Browse...'),
            valign: Gtk.Align.CENTER,
        });

        const fileDialog = new Gtk.FileDialog({
            title: _('Select Custom Sound File'),
        });
        const filter = new Gtk.FileFilter();
        filter.set_name(_('Audio Files (*.mp3, *.ogg, *.oga, *.wav, *.flac)'));
        filter.add_mime_type('audio/*');
        filter.add_pattern('*.mp3');
        filter.add_pattern('*.ogg');
        filter.add_pattern('*.oga');
        filter.add_pattern('*.wav');
        filter.add_pattern('*.flac');

        const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });
        filters.append(filter);
        fileDialog.set_filters(filters);

        browseBtn.connect('clicked', () => {
            fileDialog.open(window, null, (dlg, res) => {
                try {
                    const file = dlg.open_finish(res);
                    if (file) {
                        const path = file.get_path();
                        const name = file.get_basename();
                        config.sound = {
                            type: 'custom',
                            themeName: 'custom',
                            customPath: path,
                            customName: name,
                        };
                        saveConfig(config);

                        customRow.set_subtitle(name || path);
                        soundCombo.set_selected(customIndex);
                        playSoundPreview(config.sound);
                    }
                } catch (e) {
                    // Dialog cancelled by user
                }
            });
        });

        customRow.add_suffix(browseBtn);

        soundCombo.connect('notify::selected', () => {
            const selectedOpt = SOUND_OPTIONS[soundCombo.selected];
            if (!selectedOpt) return;

            if (selectedOpt.id === 'custom') {
                if (!config.sound?.customPath) {
                    // Prompt user to pick file if none chosen yet
                    browseBtn.emit('clicked');
                } else {
                    config.sound.type = 'custom';
                    saveConfig(config);
                    playSoundPreview(config.sound);
                }
            } else if (selectedOpt.id === 'none') {
                config.sound = {
                    type: 'none',
                    themeName: 'none',
                    customPath: '',
                    customName: '',
                };
                saveConfig(config);
            } else {
                config.sound = {
                    type: selectedOpt.type,
                    themeName: selectedOpt.id,
                    customPath: selectedOpt.path || '',
                    customName: '',
                };
                saveConfig(config);
                playSoundPreview(config.sound);
            }
        });

        soundGroup.add(soundCombo);
        soundGroup.add(customRow);

        // ======================================================================
        // Section 5: Reset to Defaults
        // ======================================================================
        const actionGroup = new Adw.PreferencesGroup();
        page.add(actionGroup);

        const resetRow = new Adw.ActionRow({
            title: _('Reset to Defaults'),
            subtitle: _('Restore default settings, panel placement, and presets'),
        });

        const resetBtn = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });

        resetBtn.connect('clicked', () => {
            saveConfig(DEFAULT_CONFIG);
            window.close();
        });

        resetRow.add_suffix(resetBtn);
        actionGroup.add(resetRow);
    }
}
