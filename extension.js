import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const TimerState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    FINISHED: 'finished',
};

const PRESETS = [
    { label: '1 min', seconds: 60 },
    { label: '5 min', seconds: 300 },
    { label: '10 min', seconds: 600 },
    { label: '15 min', seconds: 900 },
    { label: '25 min (Pomodoro)', seconds: 1500 },
    { label: '30 min', seconds: 1800 },
    { label: '45 min', seconds: 2700 },
    { label: '60 min', seconds: 3600 },
];

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

        this._buildPanelWidget();
        this._buildPopupMenu();
        this._updateUI();
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

        this._panelBox.add_child(this._panelIcon);
        this._panelBox.add_child(this._panelLabel);
        this.add_child(this._panelBox);
    }

    _buildPopupMenu() {
        // 1. Digital Display Header
        const headerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'tary-timer-header-item',
        });

        const headerBox = new St.BoxLayout({
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

        this._menuStatusLabel = new St.Label({
            text: _('Ready to start'),
            style_class: 'tary-timer-status-text',
            x_align: Clutter.ActorAlign.CENTER,
        });

        headerBox.add_child(this._menuTimeLabel);
        headerBox.add_child(this._menuStatusLabel);
        headerItem.add_child(headerBox);
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

        // 3. Quick Adjustments (+ / -)
        const adjustItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const adjustBox = new St.BoxLayout({
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'tary-timer-adjust-box',
        });

        const adjustments = [
            { label: '-5m', seconds: -300 },
            { label: '-1m', seconds: -60 },
            { label: '+1m', seconds: 60 },
            { label: '+5m', seconds: 300 },
            { label: '+10m', seconds: 600 },
        ];

        adjustments.forEach(adj => {
            const btn = new St.Button({
                label: adj.label,
                style_class: 'button tary-timer-btn-small',
                can_focus: true,
                reactive: true,
            });
            btn.connect('clicked', () => this._adjustTime(adj.seconds));
            adjustBox.add_child(btn);
        });

        adjustItem.add_child(adjustBox);
        this.menu.addMenuItem(adjustItem);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Presets')));

        // 4. Preset Buttons in a 2-column grid
        for (let i = 0; i < PRESETS.length; i += 2) {
            const rowItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });

            const rowBox = new St.BoxLayout({
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                style_class: 'tary-timer-preset-row',
            });

            for (let j = 0; j < 2; j++) {
                const presetIndex = i + j;
                if (presetIndex < PRESETS.length) {
                    const preset = PRESETS[presetIndex];
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

            rowItem.add_child(rowBox);
            this.menu.addMenuItem(rowItem);
        }
    }

    _onStartPauseClicked() {
        if (this._state === TimerState.RUNNING) {
            this._pauseTimer();
        } else {
            this._startTimer();
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

    _adjustTime(seconds) {
        if (this._state === TimerState.FINISHED) {
            this._state = TimerState.IDLE;
        }

        let newSeconds = this._remainingSeconds + seconds;
        if (newSeconds < 5) newSeconds = 5;
        if (newSeconds > 86400) newSeconds = 86400;

        this._remainingSeconds = newSeconds;
        this._totalSeconds = newSeconds;

        if (this._state === TimerState.RUNNING) {
            this._endTime = Date.now() + (this._remainingSeconds * 1000);
        }

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

        try {
            const player = global.display.get_sound_player();
            if (player) {
                player.play_from_theme('alarm-clock-elapsed', _('Timer Finished'), null);
            }
        } catch (e) {
            try {
                global.beep();
            } catch (_) {}
        }
    }

    _updateUI() {
        const timeStr = formatTime(this._remainingSeconds);

        // 1. Update panel
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

        // 2. Update popup menu elements
        this._menuTimeLabel.set_text(timeStr);

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
        this._indicator = new TimerIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}

