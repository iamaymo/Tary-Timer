import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from './presetsConfig.js';

const POSITIONS = [
    { id: 'left', label: 'Left' },
    { id: 'middle-left', label: 'Middle-Left' },
    { id: 'middle-right', label: 'Middle-Right' },
    { id: 'right', label: 'Right' },
];

export default class TaryTimerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(560, 640);

        let config = loadConfig();

        // 1. Main Preferences Page
        const page = new Adw.PreferencesPage({
            title: _('Settings'),
            icon_name: 'alarm-symbolic',
        });
        window.add(page);

        // ======================================================================
        // 2. Panel Position Group
        // ======================================================================
        const positionGroup = new Adw.PreferencesGroup({
            title: _('Panel Position'),
            description: _('Choose the exact location of Tary Timer in the top panel.'),
        });
        page.add(positionGroup);

        const stringList = new Gtk.StringList();
        POSITIONS.forEach(pos => stringList.append(_(pos.label)));

        let currentIndex = POSITIONS.findIndex(p => p.id === config.position);
        if (currentIndex < 0) currentIndex = 0;

        const positionCombo = new Adw.ComboRow({
            title: _('Position in Top Panel'),
            subtitle: _('Select panel placement'),
            model: stringList,
            selected: currentIndex,
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
        // 3. Quick Presets Group
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
                expanded: i === 0,
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
        // 4. Reset to Defaults Group
        // ======================================================================
        const actionGroup = new Adw.PreferencesGroup();
        page.add(actionGroup);

        const resetRow = new Adw.ActionRow({
            title: _('Reset to Defaults'),
            subtitle: _('Restore default panel position and 1m, 5m, 10m, 15m presets'),
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
