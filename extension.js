import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { loadConfig, DEFAULT_CONFIG } from './presetsConfig.js';

const TimerState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    FINISHED: 'finished',
};

function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;

    const pad = (n) => n.toString().padStart(2, '0');

    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
}

const TimerIndicator = GObject.registerClass(
class TimerIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Tary Timer', false);
        this._extension = extension;

        this._totalSeconds = 300; // default 5 minutes
        this._remainingSeconds = 300;
        this._state = TimerState.IDLE;
        this._timeoutId = null;
        this._endTime = 0;
        this._presets = [];
        this._isEditing = false;
        this._isSyncingUI = false;

        this._buildPanelWidget();
        this._buildPopupMenu();
        this.reloadConfig();
        this._updateUI();

        // Reload presets dynamically whenever popup opens
        this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen) {
                this.reloadConfig();
                this._updateUI();
            }
        });
    }

    _buildPanelWidget() {
        this._panelBox = new St.BoxLayout({
            style_class: 'panel-status-indicators-box tary-timer-panel-box',
            reactive: true,
        });

        this._panelIcon = new St.Icon({
            icon_name: 'alarm-symbolic',
            style_class: 'system-status-icon tary-timer-panel-icon',
        });

        this._panelLabel = new St.Label({
            text: formatTime(this._remainingSeconds),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'tary-timer-panel-label',
        });
        this._panelLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this._panelBox.add_child(this._panelIcon);
        this._panelBox.add_child(this._panelLabel);
        this.add_child(this._panelBox);
    }

    _buildPopupMenu() {
        // 1. Digital Display Header with Gear Icon on top-right
        const headerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'tary-timer-header-item',
        });

        const headerRow = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'tary-timer-header-row',
        });

        // Left spacer for symmetric center balance
        const leftSpacer = new St.Widget({
            width: 28,
            reactive: false,
        });

        const centerBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'tary-timer-header-box',
        });

        this._menuTimeLabel = new St.Label({
            text: formatTime(this._remainingSeconds),
            style_class: 'tary-timer-large-display',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._menuTimeLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this._menuStatusLabel = new St.Label({
            text: _('Ready'),
            style_class: 'tary-timer-status-text',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._menuStatusLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        centerBox.add_child(this._menuTimeLabel);
        centerBox.add_child(this._menuStatusLabel);

        // Top-right Gear Button to open extension settings
        const gearBtn = new St.Button({
            style_class: 'button tary-timer-gear-btn',
            can_focus: true,
            reactive: true,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                icon_name: 'emblem-system-symbolic',
                icon_size: 16,
                style_class: 'tary-timer-gear-icon',
            }),
        });

        gearBtn.connect('clicked', () => {
            this.menu.close();
            this._extension.openPreferences();
        });

        headerRow.add_child(leftSpacer);
        headerRow.add_child(centerBox);
        headerRow.add_child(gearBtn);
        headerItem.add_child(headerRow);
        this.menu.addMenuItem(headerItem);

        // 2. Play / Pause & Reset Controls
        const controlItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const controlBox = new St.BoxLayout({
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            style_class: 'tary-timer-control-box',
        });

        this._startPauseBtn = new St.Button({
            label: _('Start'),
            style_class: 'button tary-timer-btn tary-timer-btn-primary',
            can_focus: true,
            reactive: true,
            x_expand: true,
        });
        this._startPauseBtn.connect('clicked', () => this._onStartPauseClicked());

        this._resetBtn = new St.Button({
            label: _('Reset'),
            style_class: 'button tary-timer-btn tary-timer-btn-secondary',
            can_focus: true,
            reactive: true,
            x_expand: true,
        });
        this._resetBtn.connect('clicked', () => this._onResetClicked());

        controlBox.add_child(this._startPauseBtn);
        controlBox.add_child(this._resetBtn);
        controlItem.add_child(controlBox);
        this.menu.addMenuItem(controlItem);

        // 3. GNOME Clocks Style Time Picker with Direct Keyboard Input
        const pickerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const pickerContainer = new St.BoxLayout({
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'tary-picker-container',
        });

        // Hours Column
        const hoursCol = this._createPickerColumn('hours');
        this._hoursEntry = hoursCol.digitEntry;

        // Colon 1
        const colon1 = new St.Label({
            text: ':',
            style_class: 'tary-picker-colon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        colon1.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        // Minutes Column
        const minutesCol = this._createPickerColumn('minutes');
        this._minutesEntry = minutesCol.digitEntry;

        // Colon 2
        const colon2 = new St.Label({
            text: ':',
            style_class: 'tary-picker-colon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        colon2.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        // Seconds Column
        const secondsCol = this._createPickerColumn('seconds');
        this._secondsEntry = secondsCol.digitEntry;

        pickerContainer.add_child(hoursCol.box);
        pickerContainer.add_child(colon1);
        pickerContainer.add_child(minutesCol.box);
        pickerContainer.add_child(colon2);
        pickerContainer.add_child(secondsCol.box);

        pickerItem.add_child(pickerContainer);
        this.menu.addMenuItem(pickerItem);

        // 4. Presets Section Header with Pen/Edit Icon
        const presetsHeaderItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'tary-timer-presets-header-item',
        });

        const presetsHeaderBox = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'tary-timer-presets-header-box',
        });

        const presetsTitle = new St.Label({
            text: _('Presets'),
            style_class: 'tary-timer-section-title',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const spacer = new St.Widget({ x_expand: true });

        const editPenBtn = new St.Button({
            style_class: 'button tary-timer-edit-btn',
            can_focus: true,
            reactive: true,
            child: new St.Icon({
                icon_name: 'document-edit-symbolic',
                icon_size: 15,
                style_class: 'tary-timer-edit-icon',
            }),
        });

        editPenBtn.connect('clicked', () => {
            this.menu.close();
            this._extension.openPreferences();
        });

        presetsHeaderBox.add_child(presetsTitle);
        presetsHeaderBox.add_child(spacer);
        presetsHeaderBox.add_child(editPenBtn);
        presetsHeaderItem.add_child(presetsHeaderBox);
        this.menu.addMenuItem(presetsHeaderItem);

        // 5. Presets Container (First 4 presets only)
        this._presetsContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });

        const presetsItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        presetsItem.add_child(this._presetsContainer);
        this.menu.addMenuItem(presetsItem);
    }

    _createPickerColumn(unit) {
        const box = new St.BoxLayout({
            vertical: true,
            style_class: 'tary-picker-column',
            x_align: Clutter.ActorAlign.CENTER,
        });

        const plusBtn = new St.Button({
            label: '+',
            style_class: 'button tary-picker-btn tary-picker-btn-plus',
            can_focus: true,
            reactive: true,
        });
        plusBtn.connect('clicked', () => this._onPickerAdjust(unit, 1));

        const digitCard = new St.BoxLayout({
            style_class: 'tary-picker-digit-card',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const digitEntry = new St.Entry({
            text: '00',
            style_class: 'tary-picker-digit-entry',
            can_focus: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        digitEntry.clutter_text.set_max_length(2);
        digitEntry.clutter_text.set_x_align(Clutter.ActorAlign.CENTER);
        digitEntry.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        digitEntry.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        digitEntry.clutter_text.connect('key-focus-in', () => {
            this._isEditing = true;
        });

        digitEntry.clutter_text.connect('text-changed', () => {
            if (this._isSyncingUI) return;
            this._isEditing = true;
            this._onUserInput(unit);
        });

        digitEntry.clutter_text.connect('key-focus-out', () => {
            this._commitUserInput(unit);
            this._isEditing = false;
        });

        digitEntry.clutter_text.connect('activate', () => {
            this._commitUserInput(unit);
            this._isEditing = false;

            if (unit === 'hours' && this._minutesEntry) {
                this._minutesEntry.clutter_text.grab_key_focus();
            } else if (unit === 'minutes' && this._secondsEntry) {
                this._secondsEntry.clutter_text.grab_key_focus();
            } else {
                this.menu.actor.grab_key_focus();
            }
        });

        digitCard.add_child(digitEntry);

        const minusBtn = new St.Button({
            label: '−',
            style_class: 'button tary-picker-btn tary-picker-btn-minus',
            can_focus: true,
            reactive: true,
        });
        minusBtn.connect('clicked', () => this._onPickerAdjust(unit, -1));

        box.add_child(plusBtn);
        box.add_child(digitCard);
        box.add_child(minusBtn);

        return { box, digitEntry };
    }

    _onUserInput(unit) {
        const hText = this._hoursEntry ? this._hoursEntry.get_text().replace(/\D/g, '') : '';
        const mText = this._minutesEntry ? this._minutesEntry.get_text().replace(/\D/g, '') : '';
        const sText = this._secondsEntry ? this._secondsEntry.get_text().replace(/\D/g, '') : '';

        let h = hText ? parseInt(hText, 10) : 0;
        let m = mText ? parseInt(mText, 10) : 0;
        let s = sText ? parseInt(sText, 10) : 0;

        h = Math.min(23, Math.max(0, h));
        m = Math.min(59, Math.max(0, m));
        s = Math.min(59, Math.max(0, s));

        const total = (h * 3600) + (m * 60) + s;
        this._remainingSeconds = total;
        this._totalSeconds = total;

        if (this._state === TimerState.FINISHED) {
            this._state = TimerState.IDLE;
        }

        const timeStr = formatTime(this._remainingSeconds);
        this._panelLabel.set_text(timeStr);
        this._menuTimeLabel.set_text(timeStr);
    }

    _commitUserInput(unit) {
        this._onUserInput(unit);

        const s = Math.max(0, Math.floor(this._remainingSeconds));
        const hours = Math.floor(s / 3600);
        const minutes = Math.floor((s % 3600) / 60);
        const seconds = s % 60;
        const pad = (n) => n.toString().padStart(2, '0');

        this._isSyncingUI = true;
        if (this._hoursEntry) this._hoursEntry.set_text(pad(hours));
        if (this._minutesEntry) this._minutesEntry.set_text(pad(minutes));
        if (this._secondsEntry) this._secondsEntry.set_text(pad(seconds));
        this._isSyncingUI = false;
    }

    _onPickerAdjust(unit, delta) {
        let h = Math.floor(this._remainingSeconds / 3600);
        let m = Math.floor((this._remainingSeconds % 3600) / 60);
        let s = this._remainingSeconds % 60;

        if (unit === 'hours') {
            h = (h + delta + 24) % 24;
        } else if (unit === 'minutes') {
            m = (m + delta + 60) % 60;
        } else if (unit === 'seconds') {
            s = (s + delta + 60) % 60;
        }

        const newTotal = (h * 3600) + (m * 60) + s;
        this._remainingSeconds = newTotal;
        this._totalSeconds = newTotal;

        if (this._state === TimerState.RUNNING) {
            this._endTime = Date.now() + (this._remainingSeconds * 1000);
        } else if (this._state === TimerState.FINISHED) {
            this._state = TimerState.IDLE;
        }

        this._updateUI();
    }

    reloadConfig() {
        this._presetsContainer.destroy_all_children();

        const config = loadConfig();
        const allPresets = config.presets || DEFAULT_CONFIG.presets;
        this._presets = allPresets.slice(0, 4);

        for (let i = 0; i < this._presets.length; i += 2) {
            const rowBox = new St.BoxLayout({
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                style_class: 'tary-timer-preset-row',
            });

            for (let j = 0; j < 2; j++) {
                const idx = i + j;
                if (idx < this._presets.length) {
                    const preset = this._presets[idx];
                    const pBtn = new St.Button({
                        label: preset.label,
                        style_class: 'button tary-timer-preset-btn',
                        can_focus: true,
                        reactive: true,
                        x_expand: true,
                    });
                    pBtn.connect('clicked', () => this._setPreset(preset.seconds));
                    rowBox.add_child(pBtn);
                }
            }

            this._presetsContainer.add_child(rowBox);
        }
    }

    _onStartPauseClicked() {
        if (this._state === TimerState.RUNNING) {
            this._pauseTimer();
        } else {
            this._startTimer();
            this.menu.close();
        }
    }

    _onResetClicked() {
        this._resetTimer();
    }

    _startTimer() {
        if (this._remainingSeconds <= 0) {
            this._remainingSeconds = this._totalSeconds > 0 ? this._totalSeconds : 300;
        }

        this._state = TimerState.RUNNING;
        this._endTime = Date.now() + (this._remainingSeconds * 1000);
        this._updateUI();

        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            const now = Date.now();
            const remaining = Math.max(0, Math.round((this._endTime - now) / 1000));
            this._remainingSeconds = remaining;
            this._updateUI();

            if (this._remainingSeconds <= 0) {
                this._timerFinished();
                this._timeoutId = null;
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    _pauseTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._state = TimerState.PAUSED;
        this._updateUI();
    }

    _resetTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._remainingSeconds = this._totalSeconds > 0 ? this._totalSeconds : 300;
        this._state = TimerState.IDLE;
        this._updateUI();
    }

    _setPreset(seconds) {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._totalSeconds = seconds;
        this._remainingSeconds = seconds;
        this._state = TimerState.IDLE;
        this._updateUI();
    }

    _timerFinished() {
        this._state = TimerState.FINISHED;
        this._remainingSeconds = 0;
        this._updateUI();
        this._notifyUser();
    }

    _notifyUser() {
        try {
            Main.notify(_('Tary Timer'), _('Time is up! Your timer has ended.'));
        } catch (e) {
            console.error(`Tary Timer notification error: ${e}`);
        }

        this._playAlarmSound();
    }

    _playAlarmSound() {
        const config = loadConfig();
        const sound = config.sound || DEFAULT_CONFIG.sound;

        if (!sound || sound.type === 'none') {
            return;
        }

        try {
            if ((sound.type === 'custom' || sound.type === 'file') && sound.customPath) {
                const file = Gio.File.new_for_path(sound.customPath);
                if (file.query_exists(null)) {
                    const player = global.display.get_sound_player();
                    if (player && typeof player.play_from_file === 'function') {
                        player.play_from_file(file, _('Timer Finished'), null);
                        return;
                    }
                    GLib.spawn_command_line_async(`pw-play "${sound.customPath}"`);
                    return;
                }
            }

            const themeName = sound.themeName || 'alarm-clock-elapsed';
            const player = global.display.get_sound_player();
            if (player) {
                player.play_from_theme(themeName, _('Timer Finished'), null);
            } else {
                GLib.spawn_command_line_async(`canberra-gtk-play -i "${themeName}"`);
            }
        } catch (e) {
            console.error(`Tary Timer sound playback error: ${e}`);
            try {
                global.beep();
            } catch (_) {}
        }
    }

    _updateUI() {
        const timeStr = formatTime(this._remainingSeconds);

        // 1. Update top panel display (Always white)
        this._panelLabel.set_text(timeStr);

        this._panelBox.remove_style_class_name('tary-timer-panel-running');
        this._panelBox.remove_style_class_name('tary-timer-panel-paused');
        this._panelBox.remove_style_class_name('tary-timer-panel-finished');

        if (this._state === TimerState.RUNNING) {
            this._panelBox.add_style_class_name('tary-timer-panel-running');
            this._panelIcon.set_icon_name('alarm-symbolic');
        } else if (this._state === TimerState.PAUSED) {
            this._panelBox.add_style_class_name('tary-timer-panel-paused');
            this._panelIcon.set_icon_name('media-playback-pause-symbolic');
        } else if (this._state === TimerState.FINISHED) {
            this._panelBox.add_style_class_name('tary-timer-panel-finished');
            this._panelIcon.set_icon_name('alarm-symbolic');
        } else {
            this._panelIcon.set_icon_name('alarm-symbolic');
        }

        // 2. Update large digital display
        this._menuTimeLabel.set_text(timeStr);

        // 3. Update Clocks picker digits only if not currently focused by user
        if (!this._isEditing) {
            const s = Math.max(0, Math.floor(this._remainingSeconds));
            const hours = Math.floor(s / 3600);
            const minutes = Math.floor((s % 3600) / 60);
            const seconds = s % 60;
            const pad = (n) => n.toString().padStart(2, '0');

            this._isSyncingUI = true;
            if (this._hoursEntry) this._hoursEntry.set_text(pad(hours));
            if (this._minutesEntry) this._minutesEntry.set_text(pad(minutes));
            if (this._secondsEntry) this._secondsEntry.set_text(pad(seconds));
            this._isSyncingUI = false;
        }

        // 4. Update status label & button styling
        switch (this._state) {
            case TimerState.RUNNING:
                this._menuStatusLabel.set_text(_('Timer running...'));
                this._startPauseBtn.set_label(_('Pause'));
                this._startPauseBtn.remove_style_class_name('tary-timer-btn-primary');
                this._startPauseBtn.add_style_class_name('tary-timer-btn-warning');
                break;
            case TimerState.PAUSED:
                this._menuStatusLabel.set_text(_('Timer paused'));
                this._startPauseBtn.set_label(_('Resume'));
                this._startPauseBtn.remove_style_class_name('tary-timer-btn-warning');
                this._startPauseBtn.add_style_class_name('tary-timer-btn-primary');
                break;
            case TimerState.FINISHED:
                this._menuStatusLabel.set_text(_('🔔 Timer completed!'));
                this._startPauseBtn.set_label(_('Start'));
                this._startPauseBtn.remove_style_class_name('tary-timer-btn-warning');
                this._startPauseBtn.add_style_class_name('tary-timer-btn-primary');
                break;
            case TimerState.IDLE:
            default:
                this._menuStatusLabel.set_text(_('Ready'));
                this._startPauseBtn.set_label(_('Start'));
                this._startPauseBtn.remove_style_class_name('tary-timer-btn-warning');
                this._startPauseBtn.add_style_class_name('tary-timer-btn-primary');
                break;
        }
    }

    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        super.destroy();
    }
});

export default class TaryTimerExtension extends Extension {
    enable() {
        this._config = loadConfig();
        this._indicator = new TimerIndicator(this);

        // Register initial status area indicator
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'left');
        // Apply user-configured placement
        this.applyPosition(this._config.position);

        // Dynamic config file monitor for real-time position and preset updates
        try {
            const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'tary-timer']);
            const configFile = Gio.File.new_for_path(GLib.build_filenamev([configDir, 'config.json']));
            this._monitor = configFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', (_mon, _file, _other, eventType) => {
                if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                    eventType === Gio.FileMonitorEvent.CHANGED) {
                    this._onConfigChanged();
                }
            });
        } catch (e) {
            console.error(`Tary Timer: config monitor error: ${e}`);
        }
    }

    applyPosition(position) {
        if (!this._indicator) return;

        const currentParent = this._indicator.get_parent();
        if (currentParent) {
            currentParent.remove_child(this._indicator);
        }

        let container;
        let pos = 1;

        switch (position) {
            case 'middle-left':
                // Center box, left of the clock/calendar
                container = Main.panel._centerBox;
                pos = 0;
                break;
            case 'middle-right':
                // Center box, right of the clock/calendar
                container = Main.panel._centerBox;
                pos = -1;
                break;
            case 'right':
                // Right box, to the right after GPU/CPU monitors
                container = Main.panel._rightBox;
                pos = -1;
                break;
            case 'left':
            default:
                // Left box, right after Spaces / workspace indicators
                container = Main.panel._leftBox;
                pos = 1;
                break;
        }

        container.insert_child_at_index(this._indicator, pos);
    }

    _onConfigChanged() {
        const newConfig = loadConfig();
        if (newConfig.position !== this._config.position) {
            this._config.position = newConfig.position;
            this.applyPosition(newConfig.position);
        }
        if (this._indicator) {
            this._indicator.reloadConfig();
        }
    }

    disable() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
