import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const DEFAULT_PRESETS = [
    { label: '1 min', seconds: 60 },
    { label: '5 min', seconds: 300 },
    { label: '10 min', seconds: 600 },
    { label: '15 min', seconds: 900 },
];

function getConfigPath() {
    const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'tary-timer']);
    return {
        dir: configDir,
        file: GLib.build_filenamev([configDir, 'presets.json']),
    };
}

export function loadPresets() {
    const { file } = getConfigPath();
    const gfile = Gio.File.new_for_path(file);

    if (!gfile.query_exists(null)) {
        savePresets(DEFAULT_PRESETS);
        return [...DEFAULT_PRESETS];
    }

    try {
        const [success, contents] = gfile.load_contents(null);
        if (success) {
            const decoder = new TextDecoder('utf-8');
            const jsonText = decoder.decode(contents);
            const data = JSON.parse(jsonText);
            if (Array.isArray(data) && data.length > 0) {
                return data;
            }
        }
    } catch (e) {
        console.error(`Tary Timer: Failed to load presets.json: ${e}`);
    }

    return [...DEFAULT_PRESETS];
}

export function savePresets(presets) {
    const { dir, file } = getConfigPath();
    try {
        GLib.mkdir_with_parents(dir, 0o755);
        const gfile = Gio.File.new_for_path(file);
        const jsonText = JSON.stringify(presets, null, 2);
        gfile.replace_contents(
            jsonText,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
        return true;
    } catch (e) {
        console.error(`Tary Timer: Failed to save presets.json: ${e}`);
        return false;
    }
}

