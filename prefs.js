import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { loadPresets, savePresets, DEFAULT_PRESETS } from './presetsConfig.js';

export default class TaryTimerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(540, 580);

        // 1. Preferences Page titled "Presets"
        const page = new Adw.PreferencesPage({
            title: _('Presets'),
            icon_name: 'alarm-symbolic',
        });
        window.add(page);

        // 2. Preferences Group
        const group = new Adw.PreferencesGroup({
            title: _('Quick Presets'),
            description: _('Configure the 4 quick preset buttons shown in the top panel timer menu.'),
        });
        page.add(group);

        let presets = loadPresets();
        if (!Array.isArray(presets) || presets.length === 0) {
            presets = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
        }

        // Configure the 4 presets
        for (let i = 0; i < 4; i++) {
            const preset = presets[i] || {
                label: `${(i + 1) * 5} min`,
                seconds: (i + 1) * 300,
            };

            const expRow = new Adw.ExpanderRow({
                title: preset.label || `Preset ${i + 1}`,
                subtitle: `${Math.floor(preset.seconds / 60)} min ${preset.seconds % 60} sec`,
                expanded: i === 0, // expand first preset by default
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
                savePresets(presets);
            };

            nameRow.connect('changed', updatePreset);
            minRow.connect('notify::value', updatePreset);
            secRow.connect('notify::value', updatePreset);

            expRow.add_row(nameRow);
            expRow.add_row(minRow);
            expRow.add_row(secRow);

            group.add(expRow);
        }

        // Reset to Defaults Group
        const actionGroup = new Adw.PreferencesGroup();
        page.add(actionGroup);

        const resetRow = new Adw.ActionRow({
            title: _('Reset to Defaults'),
            subtitle: _('Restore default 1m, 5m, 10m, and 15m presets'),
        });

        const resetBtn = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });

        resetBtn.connect('clicked', () => {
            savePresets(DEFAULT_PRESETS);
            window.close();
        });

        resetRow.add_suffix(resetBtn);
        actionGroup.add(resetRow);
    }
}

