/**
 * extension.js — Main entry point for the Tary Timer GNOME Shell extension.
 *
 * Provides a panel-bar countdown timer with start/pause/reset controls,
 * a GNOME-Clocks-style time picker, configurable presets, and alarm sounds.
 */

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

/** Default timer duration in seconds (5 minutes). */
const DEFAULT_SECONDS = 300;

/**
 * Enum-like object representing the possible states of the timer.
 *
 * IDLE     → timer is stopped and ready to start.
 * RUNNING  → countdown is actively ticking.
 * PAUSED   → countdown is temporarily halted.
 * FINISHED → countdown reached zero; alarm has fired.
 */
const TimerState = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    FINISHED: 'finished',
};

/**
 * Zero-pads a number to two digits.
 *
 * @param {number} n - The number to pad.
 * @returns {string} The zero-padded string (e.g. "05").
 */
const pad = (n) => n.toString().padStart(2, '0');

/**
 * Decomposes a total number of seconds into hours, minutes, and seconds.
 *
 * @param {number} totalSeconds - The total seconds to decompose (clamped to ≥ 0).
 * @returns {{ hours: number, minutes: number, seconds: number }}
 */
function decomposeTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    return {
        hours: Math.floor(s / 3600),
        minutes: Math.floor((s % 3600) / 60),
        seconds: s % 60,
    };
}

/**
 * Formats a total number of seconds into a human-readable time string.
 * Shows "MM:SS" when under one hour, or "HH:MM:SS" otherwise.
 *
 * @param {number} totalSeconds - The total seconds to format.
 * @returns {string} The formatted time string (e.g. "05:30" or "01:05:30").
 */
function formatTime(totalSeconds) {
    const { hours, minutes, seconds } = decomposeTime(totalSeconds);

    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * TimerIndicator — The panel button and popup menu for the timer.
 *
 * Manages the full timer lifecycle (idle → running → paused → finished),
 * the time-picker UI, preset buttons, and alarm notifications.
 */
const TimerIndicator = GObject.registerClass(
class TimerIndicator extends PanelMenu.Button {

    /**
     * Initializes the indicator, builds the UI, and loads user config.
     *
     * @param {Extension} extension - The parent extension instance.
     */
    _init(extension) {
        // 0.5 = center-aligned menu, 'Tary Timer' = accessible name, false = no auto menu
        super._init(0.5, 'Tary Timer', false);
        this._extension = extension;

        this._totalSeconds = DEFAULT_SECONDS;
        this._remainingSeconds = DEFAULT_SECONDS;
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

    /** Builds the top-panel icon + label widget. */
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

    /** Constructs the full popup menu: header, controls, time picker, and presets. */
    _buildPopupMenu() {
        // --- Section 1: Digital Display Header with Gear Icon ---
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

        // --- Section 2: Play / Pause & Reset Controls ---
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

        // --- Section 3: GNOME Clocks Style Time Picker with Direct Keyboard Input ---
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

        // Colon separator
        const colon1 = new St.Label({
            text: ':',
            style_class: 'tary-picker-colon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        colon1.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        // Minutes Column
        const minutesCol = this._createPickerColumn('minutes');
        this._minutesEntry = minutesCol.digitEntry;

        // Colon separator
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

        // --- Section 4: Presets Section Header with Edit Icon ---
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

        // --- Section 5: Presets Container (first 4 presets only) ---
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

    /**
     * Creates a single time-picker column (hours, minutes, or seconds)
     * with +/− buttons and an editable digit entry.
     *
     * @param {'hours'|'minutes'|'seconds'} unit - Which time unit this column controls.
     * @returns {{ box: St.BoxLayout, digitEntry: St.Entry }}
     */
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

    /**
     * Handles live user input in a picker entry field.
     * Parses all three digit entries, clamps values, and updates the timer.
     *
     * @param {'hours'|'minutes'|'seconds'} unit - The unit being edited (passed through for API symmetry with _commitUserInput).
     */
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

    /**
     * Finalizes user input: re-parses the entry values and
     * writes back the normalized (zero-padded) text into the digit entries.
     *
     * @param {'hours'|'minutes'|'seconds'} unit - The unit whose entry to commit.
     */
    _commitUserInput(unit) {
        this._onUserInput(unit);

        const { hours, minutes, seconds } = decomposeTime(this._remainingSeconds);

        this._isSyncingUI = true;
        if (this._hoursEntry) this._hoursEntry.set_text(pad(hours));
        if (this._minutesEntry) this._minutesEntry.set_text(pad(minutes));
        if (this._secondsEntry) this._secondsEntry.set_text(pad(seconds));
        this._isSyncingUI = false;
    }

    /**
     * Adjusts a specific time unit in the picker by the given delta,
     * wrapping at boundaries (e.g. 59 → 0 for minutes/seconds).
     *
     * @param {'hours'|'minutes'|'seconds'} unit - The time unit to adjust.
     * @param {number} delta - The amount to add (typically +1 or −1).
     */
    _onPickerAdjust(unit, delta) {
        let { hours: h, minutes: m, seconds: s } = decomposeTime(this._remainingSeconds);

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

    /** Reloads presets from the config file and rebuilds the preset buttons. */
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

    /** Toggles between starting and pausing the timer. */
    _onStartPauseClicked() {
        if (this._state === TimerState.RUNNING) {
            this._pauseTimer();
        } else {
            this._startTimer();
            this.menu.close();
        }
    }

    /** Resets the timer to its initial duration. */
    _onResetClicked() {
        this._resetTimer();
    }

    /** Starts (or resumes) the countdown timer. */
    _startTimer() {
        if (this._remainingSeconds <= 0) {
            this._remainingSeconds = this._totalSeconds > 0 ? this._totalSeconds : DEFAULT_SECONDS;
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

    /** Pauses the running timer, preserving the remaining time. */
    _pauseTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._state = TimerState.PAUSED;
        this._updateUI();
    }

    /** Resets the timer back to its total duration and returns to IDLE state. */
    _resetTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        this._remainingSeconds = this._totalSeconds > 0 ? this._totalSeconds : DEFAULT_SECONDS;
        this._state = TimerState.IDLE;
        this._updateUI();
    }

    /**
     * Applies a preset: stops any running timer and sets the new duration.
     *
     * @param {number} seconds - The preset duration in seconds.
     */
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

    /** Transitions the timer to the FINISHED state and triggers notifications. */
    _timerFinished() {
        this._state = TimerState.FINISHED;
        this._remainingSeconds = 0;
        this._updateUI();
        this._notifyUser();
    }

    /** Sends a desktop notification and plays the alarm sound. */
    _notifyUser() {
        try {
            Main.notify(_('Tary Timer'), _('Time is up! Your timer has ended.'));
        } catch (e) {
            console.error(`Tary Timer notification error: ${e}`);
        }

        this._playAlarmSound();
    }

    /**
     * Plays the configured alarm sound.
     * Supports theme sounds, file-based sounds, custom user files,
     * and falls back to a system beep on failure.
     */
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

            const themeName = sound.themeName || 'complete';
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
            } catch (_beepErr) { /* Ignore — last-resort fallback */ }
        }
    }

    /**
     * Synchronizes all visible UI elements with the current timer state:
     * panel label/icon, menu display, picker digits, status text, and buttons.
     */
    _updateUI() {
        const timeStr = formatTime(this._remainingSeconds);

        // Update top panel display
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

        // Update large digital display in popup
        this._menuTimeLabel.set_text(timeStr);

        // Update picker digits (skip if user is actively editing)
        if (!this._isEditing) {
            const { hours, minutes, seconds } = decomposeTime(this._remainingSeconds);

            this._isSyncingUI = true;
            if (this._hoursEntry) this._hoursEntry.set_text(pad(hours));
            if (this._minutesEntry) this._minutesEntry.set_text(pad(minutes));
            if (this._secondsEntry) this._secondsEntry.set_text(pad(seconds));
            this._isSyncingUI = false;
        }

        // Update status label & button styling
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

    /** Cleans up the timer timeout source before destruction. */
    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        super.destroy();
    }
});

/**
 * TaryTimerExtension — Top-level extension class.
 *
 * Manages the indicator lifecycle, panel placement, and
 * a file monitor for live config reloads.
 */
export default class TaryTimerExtension extends Extension {

    /** Enables the extension: creates the indicator, sets position, and starts the config monitor. */
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

    /**
     * Moves the indicator to the specified panel position.
     *
     * @param {'left'|'middle-left'|'middle-right'|'right'} position - Target panel area.
     */
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

    /** Handles config file changes: re-reads the config and applies updates. */
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

    /** Disables the extension: stops the file monitor and destroys the indicator. */
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
