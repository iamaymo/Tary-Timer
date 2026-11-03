/**
 * presetsConfig.js — Configuration management for Tary Timer.
 *
 * Handles loading, saving, and migrating the user's config file
 * (position, presets, sound settings) stored in ~/.config/tary-timer/.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/**
 * Default configuration used when no user config file exists
 * or when the user resets to defaults.
 */
export const DEFAULT_CONFIG = {
    position: 'middle-left', // 'middle-left' | 'middle-right' | 'left' | 'right'
    presets: [
        { label: '1 min', seconds: 60 },
        { label: '5 min', seconds: 300 },
        { label: '10 min', seconds: 600 },
        { label: '15 min', seconds: 900 },
    ],
    sound: {
        type: 'theme', // 'theme' | 'custom' | 'none'
        themeName: 'complete',
        customPath: '',
        customName: '',
    },
};

/**
 * Available sound options shown in the preferences dropdown.
 * Each entry describes a sound by its type ('theme', 'file', 'custom', or 'none')
 * and an optional file path for 'file'-type sounds.
 */
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

/**
 * Returns the filesystem paths used for config storage.
 *
 * @returns {{ dir: string, file: string, legacyFile: string }}
 */
function getConfigPath() {
    const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'tary-timer']);
    return {
        dir: configDir,
        file: GLib.build_filenamev([configDir, 'config.json']),
        legacyFile: GLib.build_filenamev([configDir, 'presets.json']),
    };
}

/**
 * Loads the user configuration from disk.
 *
 * Resolution order:
 *   1. ~/.config/tary-timer/config.json  (current format)
 *   2. ~/.config/tary-timer/presets.json  (legacy format — auto-migrated)
 *   3. DEFAULT_CONFIG (written to disk as a new config.json)
 *
 * @returns {object} The merged configuration object.
 */
export function loadConfig() {
    const { dir, file, legacyFile } = getConfigPath();
    const configFile = Gio.File.new_for_path(file);

    if (configFile.query_exists(null)) {
        try {
            const [success, contents] = configFile.load_contents(null);
            if (success) {
                const decoder = new TextDecoder('utf-8');
                const data = JSON.parse(decoder.decode(contents));
                return {
                    position: data.position || DEFAULT_CONFIG.position,
                    presets: Array.isArray(data.presets) && data.presets.length > 0
                        ? data.presets
                        : [...DEFAULT_CONFIG.presets],
                    sound: data.sound || { ...DEFAULT_CONFIG.sound },
                };
            }
        } catch (e) {
            console.error(`Tary Timer: Failed to read config.json: ${e}`);
        }
    }

    // Check legacy presets.json and auto-migrate if found
    const legacyConfigFile = Gio.File.new_for_path(legacyFile);
    if (legacyConfigFile.query_exists(null)) {
        try {
            const [success, contents] = legacyConfigFile.load_contents(null);
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

    // No existing config found — create default
    saveConfig(DEFAULT_CONFIG);
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/**
 * Persists the given configuration object to ~/.config/tary-timer/config.json.
 *
 * @param {object} config - The configuration to save.
 * @returns {boolean} `true` on success, `false` on failure.
 */
export function saveConfig(config) {
    const { dir, file } = getConfigPath();
    try {
        // rwxr-xr-x — ensures the config directory is accessible
        GLib.mkdir_with_parents(dir, 0o755);
        const configFile = Gio.File.new_for_path(file);
        const jsonText = JSON.stringify(config, null, 2);
        configFile.replace_contents(
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
