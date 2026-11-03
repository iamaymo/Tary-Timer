import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const DEFAULT_CONFIG = {
    position: 'left', // 'middle-left' | 'middle-right' | 'left' | 'right'
    presets: [
        { label: '1 min', seconds: 60 },
        { label: '5 min', seconds: 300 },
        { label: '10 min', seconds: 600 },
        { label: '15 min', seconds: 900 },
    ],
    sound: {
        type: 'theme', // 'theme' | 'custom' | 'none'
        themeName: 'alarm-clock-elapsed',
        customPath: '',
        customName: '',
    },
};

export const DEFAULT_PRESETS = DEFAULT_CONFIG.presets;

export const SOUND_OPTIONS = [
    { id: 'alarm-clock-elapsed', type: 'theme', label: 'Alarm Clock' },
    { id: 'complete', type: 'theme', label: 'Complete' },
    { id: 'bell', type: 'theme', label: 'Bell' },
    { id: 'glass-bell', type: 'file', path: '/usr/share/sounds/gnome/default/alarms/glass-bell.oga', label: 'Glass Bell' },
    { id: 'school-bell', type: 'file', path: '/usr/share/sounds/gnome/default/alarms/school-bell.oga', label: 'School Bell' },
    { id: 'digitone', type: 'file', path: '/usr/share/sounds/gnome/default/alarms/digitone.oga', label: 'Digital Chime' },
    { id: 'sonar', type: 'file', path: '/usr/share/sounds/gnome/default/alarms/sonar.oga', label: 'Sonar' },
    { id: 'message-new-instant', type: 'theme', label: 'Message Notification' },
    { id: 'custom', type: 'custom', label: 'Custom Sound...' },
    { id: 'none', type: 'none', label: 'Silent / None' },
];

function getConfigPath() {
    const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'tary-timer']);
    return {
        dir: configDir,
        file: GLib.build_filenamev([configDir, 'config.json']),
        legacyFile: GLib.build_filenamev([configDir, 'presets.json']),
    };
}

export function loadConfig() {
    const { dir, file, legacyFile } = getConfigPath();
    const gfile = Gio.File.new_for_path(file);

    if (gfile.query_exists(null)) {
        try {
            const [success, contents] = gfile.load_contents(null);
            if (success) {
                const decoder = new TextDecoder('utf-8');
                const data = JSON.parse(decoder.decode(contents));
                return {
                    position: data.position || DEFAULT_CONFIG.position,
                    presets: Array.isArray(data.presets) && data.presets.length > 0
                        ? data.presets
                        : [...DEFAULT_PRESETS],
                    sound: data.sound || { ...DEFAULT_CONFIG.sound },
                };
            }
        } catch (e) {
            console.error(`Tary Timer: Failed to read config.json: ${e}`);
        }
    }

    // Check legacy presets.json
    const gLegacy = Gio.File.new_for_path(legacyFile);
    if (gLegacy.query_exists(null)) {
        try {
            const [success, contents] = gLegacy.load_contents(null);
            if (success) {
                const decoder = new TextDecoder('utf-8');
                const data = JSON.parse(decoder.decode(contents));
                if (Array.isArray(data)) {
                    const cfg = {
                        position: DEFAULT_CONFIG.position,
                        presets: data,
                        sound: { ...DEFAULT_CONFIG.sound },
                    };
                    saveConfig(cfg);
                    return cfg;
                }
            }
        } catch (e) {
            console.error(`Tary Timer: Failed to migrate presets.json: ${e}`);
        }
    }

    // Create default config
    saveConfig(DEFAULT_CONFIG);
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function saveConfig(config) {
    const { dir, file } = getConfigPath();
    try {
        GLib.mkdir_with_parents(dir, 0o755);
        const gfile = Gio.File.new_for_path(file);
        const jsonText = JSON.stringify(config, null, 2);
        gfile.replace_contents(
            jsonText,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
        return true;
    } catch (e) {
        console.error(`Tary Timer: Failed to save config.json: ${e}`);
        return false;
    }
}

export function loadPresets() {
    const config = loadConfig();
    return config.presets;
}

export function savePresets(presets) {
    const config = loadConfig();
    config.presets = presets;
    return saveConfig(config);
}
