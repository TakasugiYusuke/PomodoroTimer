(() => {
  'use strict';

  const STORAGE_KEYS = {
    settings: 'focus-flow-settings-v1',
    presets: 'focus-flow-presets-v1',
    theme: 'focus-flow-theme-v1',
  };

  const DEFAULT_SETTINGS = {
    intervals: [{ minutes: 25 }, { minutes: 5 }],
    repeatCount: 4,
    volume: 0.65,
  };

  const $ = (selector) => document.querySelector(selector);

  const elements = {
    intervalList: $('#intervalList'),
    quickOptions: $('#quickOptions'),
    selectedHint: $('#selectedHint'),
    repeatCount: $('#repeatCount'),
    volumeControl: $('#volumeControl'),
    volumeValue: $('#volumeValue'),
    presetSelect: $('#presetSelect'),
    presetCount: $('#presetCount'),
    activePreset: $('#activePreset'),
    presetName: $('#presetName'),
    presetFeedback: $('#presetFeedback'),
    loadPreset: $('#loadPreset'),
    savePreset: $('#savePreset'),
    addInterval: $('#addInterval'),
    restoreDefaults: $('#restoreDefaults'),
    settingsFieldset: $('#settingsFieldset'),
    savedState: $('#savedState'),
    themeToggle: $('#themeToggle'),
    themeIcon: $('#themeIcon'),
    statusMessage: $('#statusMessage'),
    statusPill: $('#statusPill'),
    timerOrb: $('#timerOrb'),
    timerAnnouncement: $('#timerAnnouncement'),
    timeDisplay: $('#timeDisplay'),
    timeDisplayVisual: $('#timeDisplayVisual'),
    timeCaption: $('#timeCaption'),
    intervalName: $('#intervalName'),
    stepCounter: $('#stepCounter'),
    setCounter: $('#setCounter'),
    overallRemaining: $('#overallRemaining'),
    mainAction: $('#mainAction'),
    mainActionIcon: $('#mainActionIcon'),
    mainActionLabel: $('#mainActionLabel'),
    resetAction: $('#resetAction'),
    stopAction: $('#stopAction'),
    notificationButton: $('#notificationButton'),
    notificationDot: $('#notificationDot'),
    notificationText: $('#notificationText'),
    toast: $('#toast'),
  };

  let settings = loadSettings();
  let presets = loadPresets();
  let selectedIntervalId = settings.intervals[0].id;
  let saveToastTimer;
  let feedbackTimer;
  let audioContext;
  let lastAnnouncedTimerState = 'idle:0:0';

  const timer = {
    status: 'idle',
    setIndex: 0,
    intervalIndex: 0,
    remainingMs: durationFor(0),
    endAt: null,
    tickId: null,
  };

  function makeId(prefix = 'interval') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function currentTheme() {
    const theme = document.documentElement.dataset.theme;
    if (theme === 'dark' || theme === 'light') return theme;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    const isDark = nextTheme === 'dark';
    document.documentElement.dataset.theme = nextTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#00231c' : '#00a089');
    elements.themeIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
    elements.themeToggle.setAttribute('aria-label', isDark ? 'ライトモードに切り替える' : 'ダークモードに切り替える');
    elements.themeToggle.setAttribute('aria-pressed', String(isDark));
    elements.themeToggle.setAttribute('title', isDark ? 'ライトモードに切り替える' : 'ダークモードに切り替える');
  }

  function toggleTheme() {
    const nextTheme = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
    } catch {
      // テーマの保存に失敗しても、現在の表示は切り替えます。
    }
    showToast(nextTheme === 'dark' ? 'ダークモードに切り替えました。' : 'ライトモードに戻しました。');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeMinutes(value, fallback = 5) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? clamp(Math.round(numeric), 1, 999) : fallback;
  }

  function normalizeSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const sourceIntervals = Array.isArray(source.intervals) ? source.intervals : DEFAULT_SETTINGS.intervals;
    const intervals = sourceIntervals
      .map((interval) => ({
        id: typeof interval?.id === 'string' ? interval.id : makeId(),
        minutes: normalizeMinutes(interval?.minutes, 5),
      }))
      .slice(0, 24);

    return {
      intervals: intervals.length ? intervals : DEFAULT_SETTINGS.intervals.map((item) => ({ ...item, id: makeId() })),
      repeatCount: clamp(Math.round(Number(source.repeatCount) || DEFAULT_SETTINGS.repeatCount), 1, 99),
      volume: clamp(Number.isFinite(Number(source.volume)) ? Number(source.volume) : DEFAULT_SETTINGS.volume, 0, 1),
    };
  }

  function loadSettings() {
    try {
      return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)));
    } catch {
      return normalizeSettings(DEFAULT_SETTINGS);
    }
  }

  function loadPresets() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.presets));
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((preset) => preset && typeof preset.name === 'string' && Array.isArray(preset.intervals))
        .map((preset) => ({
          id: typeof preset.id === 'string' ? preset.id : makeId('preset'),
          name: preset.name.trim().slice(0, 32) || '名前なしのプリセット',
          intervals: normalizeSettings({ intervals: preset.intervals }).intervals.map(({ minutes }) => ({ minutes })),
          repeatCount: clamp(Math.round(Number(preset.repeatCount) || 1), 1, 99),
        }))
        .slice(0, 30);
    } catch {
      return [];
    }
  }

  function persistSettings(message = '保存しました') {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
      if (elements.savedState) elements.savedState.innerHTML = '<span class="saved-dot" aria-hidden="true"></span> 保存しました';
      elements.statusMessage.textContent = message;
      window.clearTimeout(saveToastTimer);
      saveToastTimer = window.setTimeout(() => {
        if (elements.savedState) elements.savedState.innerHTML = '<span class="saved-dot" aria-hidden="true"></span> ローカル保存';
        elements.statusMessage.textContent = '設定は自動的に保存されます。';
      }, 2200);
    } catch {
      elements.statusMessage.textContent = '保存できませんでした。ブラウザの設定を確認してください。';
    }
  }

  function persistPresets() {
    try {
      localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(presets));
    } catch {
      showToast('プリセットを保存できませんでした。');
    }
  }

  function durationFor(index = timer.intervalIndex) {
    return (settings.intervals[index]?.minutes || 1) * 60 * 1000;
  }

  function currentInterval() {
    return settings.intervals[timer.intervalIndex] || settings.intervals[0];
  }

  function totalSetDuration() {
    return settings.intervals.reduce((total, interval) => total + interval.minutes * 60 * 1000, 0);
  }

  function currentRemainingMs() {
    if (timer.status === 'running' && timer.endAt !== null) {
      return Math.max(0, timer.endAt - Date.now());
    }
    if (timer.status === 'complete') return 0;
    return Math.max(0, timer.remainingMs);
  }

  function overallRemainingMs() {
    if (timer.status === 'complete') return 0;
    if (timer.status === 'idle') return totalSetDuration() * settings.repeatCount;

    const current = currentRemainingMs();
    const afterCurrent = settings.intervals
      .slice(timer.intervalIndex + 1)
      .reduce((total, interval) => total + interval.minutes * 60 * 1000, 0);
    const remainingSets = Math.max(0, settings.repeatCount - timer.setIndex - 1);
    return current + afterCurrent + remainingSets * totalSetDuration();
  }

  function formatClock(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  function formatLong(milliseconds) {
    const totalMinutes = Math.ceil(Math.max(0, milliseconds) / 60000);
    if (totalMinutes <= 0) return '0分';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours && minutes) return `${hours}時間${minutes}分`;
    if (hours) return `${hours}時間`;
    return `${minutes}分`;
  }

  function formatAccessibleTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0 && seconds > 0) return `${minutes}分${seconds}秒`;
    if (minutes > 0) return `${minutes}分`;
    return `${seconds}秒`;
  }

  function renderIntervalList() {
    elements.intervalList.replaceChildren();
    settings.intervals.forEach((interval, index) => {
      const row = document.createElement('li');
      row.className = `interval-row mdc-list-item${interval.id === selectedIntervalId ? ' is-selected' : ''}`;
      row.dataset.id = interval.id;
      row.setAttribute('aria-label', `${index + 1}番目の時間区間、${interval.minutes}分${interval.id === selectedIntervalId ? '、選択中' : ''}`);
      row.innerHTML = `
        <span class="interval-index">${String(index + 1).padStart(2, '0')}</span>
        <div class="interval-input-wrap">
          <input class="interval-input" type="number" min="1" max="999" step="1" inputmode="numeric" value="${interval.minutes}" aria-label="${index + 1}番目の時間（分）" />
          <span class="unit-label">分</span>
        </div>
        <div class="interval-tools">
          <button class="icon-button mdc-icon-button move-up" type="button" title="上へ移動" aria-label="${index + 1}番目を上へ移動"${index === 0 ? ' disabled' : ''}><span class="mdc-icon-button__ripple"></span><span class="material-icons mdc-icon-button__icon" aria-hidden="true">arrow_upward</span></button>
          <button class="icon-button mdc-icon-button move-down" type="button" title="下へ移動" aria-label="${index + 1}番目を下へ移動"${index === settings.intervals.length - 1 ? ' disabled' : ''}><span class="mdc-icon-button__ripple"></span><span class="material-icons mdc-icon-button__icon" aria-hidden="true">arrow_downward</span></button>
          <button class="icon-button mdc-icon-button delete" type="button" title="削除" aria-label="${index + 1}番目を削除"${settings.intervals.length <= 1 ? ' disabled' : ''}><span class="mdc-icon-button__ripple"></span><span class="material-icons mdc-icon-button__icon" aria-hidden="true">delete_outline</span></button>
        </div>`;
      elements.intervalList.append(row);
    });
    initializeMdcComponents();
    elements.selectedHint.textContent = `区間 ${String(Math.max(1, settings.intervals.findIndex((item) => item.id === selectedIntervalId) + 1)).padStart(2, '0')}を選択中`;
  }

  function settingsMatchPreset(preset) {
    return preset.repeatCount === settings.repeatCount
      && preset.intervals.length === settings.intervals.length
      && preset.intervals.every((interval, index) => interval.minutes === settings.intervals[index].minutes);
  }

  function updateAppliedPreset() {
    const appliedPreset = presets.find(settingsMatchPreset);
    if (elements.activePreset) {
      elements.activePreset.textContent = appliedPreset ? `適用中: ${appliedPreset.name}` : '適用中: カスタム設定';
    }
    if (presets.length && !elements.presetSelect.disabled) {
      elements.presetSelect.value = appliedPreset?.id || '';
    }
  }

  function renderPresets() {
    elements.presetSelect.replaceChildren();
    if (!presets.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '保存済みプリセットはありません';
      elements.presetSelect.append(option);
      elements.presetSelect.disabled = true;
      elements.loadPreset.disabled = true;
    } else {
      const customOption = document.createElement('option');
      customOption.value = '';
      customOption.textContent = 'カスタム設定（プリセット未適用）';
      elements.presetSelect.append(customOption);
      presets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = `${preset.name} · ${preset.intervals.map((item) => `${item.minutes}分`).join(' / ')}`;
        elements.presetSelect.append(option);
      });
      elements.presetSelect.disabled = false;
      elements.loadPreset.disabled = false;
    }
    elements.presetCount.textContent = `${presets.length}件保存`;
    updateAppliedPreset();
  }

  function renderTimer() {
    const remaining = currentRemainingMs();
    const duration = durationFor();
    const progress = timer.status === 'complete' ? 1 : clamp(1 - (remaining / duration), 0, 1);
    const progressPercent = Math.round(progress * 100);
    const accessibleRemaining = formatAccessibleTime(remaining);
    const statusText = { idle: '待機中', running: '実行中', paused: '一時停止', complete: '完了' }[timer.status];
    const currentIntervalNumber = timer.status === 'complete' ? settings.intervals.length : timer.intervalIndex + 1;
    const clockText = formatClock(remaining);
    elements.timeDisplay.textContent = clockText;
    elements.timeDisplayVisual.textContent = clockText;
    elements.timeDisplay.setAttribute('aria-label', timer.status === 'complete' ? 'セッション完了' : `残り${accessibleRemaining}`);
    elements.timeCaption.textContent = timer.status === 'complete' ? 'セッション完了' : '分 : 秒';
    elements.timerOrb.setAttribute('aria-valuenow', String(progressPercent));
    elements.timerOrb.setAttribute('aria-valuetext', timer.status === 'complete'
      ? 'セッション完了、進捗100パーセント'
      : `${statusText}、区間${currentIntervalNumber}、残り${accessibleRemaining}、進捗${progressPercent}パーセント`);
    elements.timerOrb.style.setProperty('--progress', `${progress * 360}deg`);
    ['running', 'paused', 'complete'].forEach((state) => {
      elements.timerOrb.classList.toggle(`is-${state}`, timer.status === state);
    });
    elements.intervalName.textContent = timer.status === 'complete' ? '次の流れを始めましょう' : `区間 ${String(timer.intervalIndex + 1).padStart(2, '0')}`;
    elements.stepCounter.textContent = `区間 ${timer.status === 'complete' ? settings.intervals.length : timer.intervalIndex + 1} / ${settings.intervals.length}`;
    elements.setCounter.textContent = timer.status === 'complete' ? `${settings.repeatCount} / ${settings.repeatCount}` : `${timer.setIndex + 1} / ${settings.repeatCount}`;
    elements.overallRemaining.textContent = formatLong(overallRemainingMs());

    if (elements.statusPill) {
      elements.statusPill.textContent = statusText;
      elements.statusPill.className = `status-pill${timer.status === 'running' ? ' is-running' : timer.status === 'paused' ? ' is-paused' : timer.status === 'complete' ? ' is-complete' : ''}`;
      elements.statusPill.setAttribute('aria-label', `タイマー状態: ${statusText}`);
    }
    elements.mainActionLabel.textContent = { idle: '開始する', running: '一時停止', paused: '再開する', complete: 'もう一度開始' }[timer.status];
    elements.mainActionIcon.textContent = timer.status === 'running' ? 'pause' : 'play_arrow';
    elements.resetAction.disabled = timer.status === 'idle' || timer.status === 'complete';
    elements.stopAction.disabled = timer.status !== 'running' && timer.status !== 'paused';
    elements.mainAction.classList.toggle('is-resume', timer.status === 'paused');

    const timerStateKey = `${timer.status}:${timer.setIndex}:${timer.intervalIndex}`;
    if (timerStateKey !== lastAnnouncedTimerState) {
      const previousStatus = lastAnnouncedTimerState.split(':')[0];
      const intervalText = `区間${currentIntervalNumber}、残り${accessibleRemaining}`;
      const announcement = timer.status === 'complete'
        ? 'セッションが完了しました。'
        : timer.status === 'paused'
          ? `タイマーを一時停止しました。${intervalText}。`
          : timer.status === 'running' && previousStatus === 'paused'
            ? `タイマーを再開しました。${intervalText}。`
            : timer.status === 'running' && previousStatus === 'running'
              ? `次の区間へ移りました。${intervalText}。`
              : timer.status === 'running'
                ? `タイマーを開始しました。${intervalText}。`
                : `タイマーは待機中です。${intervalText}。`;
      elements.timerAnnouncement.textContent = announcement;
      lastAnnouncedTimerState = timerStateKey;
    }
  }

  function renderAll() {
    elements.repeatCount.value = settings.repeatCount;
    elements.volumeControl.value = Math.round(settings.volume * 100);
    elements.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
    elements.volumeControl.style.setProperty('--range-progress', `${Math.round(settings.volume * 100)}%`);
    renderIntervalList();
    renderPresets();
    renderTimer();
    updateNotificationButton();
    setConfigDisabled(timer.status === 'running' || timer.status === 'paused');
  }

  function setConfigDisabled(locked) {
    elements.settingsFieldset.disabled = locked;
    elements.restoreDefaults.disabled = locked;
    elements.statusMessage.textContent = locked
      ? '時間区間とセット数は実行中に変更できません。通知音は変更できます。'
      : '設定は自動的に保存されます。';
  }

  function updateSettingsFromInputs() {
    const rows = [...elements.intervalList.querySelectorAll('.interval-row')];
    settings.intervals = rows.map((row, index) => ({
      id: row.dataset.id || makeId(),
      minutes: normalizeMinutes(row.querySelector('.interval-input').value, settings.intervals[index]?.minutes || 5),
    }));
    settings.repeatCount = clamp(Math.round(Number(elements.repeatCount.value) || 1), 1, 99);
    elements.repeatCount.value = settings.repeatCount;
    if (timer.status === 'idle') timer.remainingMs = durationFor();
    persistSettings();
    renderIntervalList();
    renderPresets();
    renderTimer();
  }

  function selectInterval(id) {
    if (settings.intervals.some((interval) => interval.id === id)) {
      selectedIntervalId = id;
      elements.intervalList.querySelectorAll('.interval-row').forEach((row) => {
        row.classList.toggle('is-selected', row.dataset.id === selectedIntervalId);
      });
      const index = settings.intervals.findIndex((interval) => interval.id === selectedIntervalId);
      elements.selectedHint.textContent = `区間 ${String(Math.max(1, index + 1)).padStart(2, '0')}を選択中`;
    }
  }

  function addInterval() {
    const interval = { id: makeId(), minutes: 5 };
    const selectedIndex = settings.intervals.findIndex((item) => item.id === selectedIntervalId);
    const insertionIndex = selectedIndex < 0 ? settings.intervals.length : selectedIndex + 1;
    settings.intervals.splice(insertionIndex, 0, interval);
    selectedIntervalId = interval.id;
    persistSettings();
    renderAll();
    window.setTimeout(() => elements.intervalList.querySelector(`[data-id="${interval.id}"] .interval-input`)?.focus(), 0);
  }

  function moveInterval(id, direction) {
    const index = settings.intervals.findIndex((interval) => interval.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= settings.intervals.length) return;
    [settings.intervals[index], settings.intervals[target]] = [settings.intervals[target], settings.intervals[index]];
    if (timer.status === 'idle') timer.remainingMs = durationFor();
    persistSettings();
    renderAll();
  }

  function deleteInterval(id) {
    if (settings.intervals.length <= 1) return;
    const index = settings.intervals.findIndex((interval) => interval.id === id);
    settings.intervals = settings.intervals.filter((interval) => interval.id !== id);
    if (selectedIntervalId === id) selectedIntervalId = settings.intervals[Math.max(0, index - 1)].id;
    if (timer.status === 'idle') timer.remainingMs = durationFor();
    persistSettings();
    renderAll();
  }

  function applyQuickMinutes(minutes) {
    const index = settings.intervals.findIndex((interval) => interval.id === selectedIntervalId);
    if (index < 0) return;
    settings.intervals[index].minutes = minutes;
    if (timer.status === 'idle') timer.remainingMs = durationFor();
    persistSettings();
    renderAll();
  }

  function restoreDefaults() {
    settings = normalizeSettings(DEFAULT_SETTINGS);
    selectedIntervalId = settings.intervals[0].id;
    resetTimerState();
    persistSettings('初期設定に戻しました');
    renderAll();
    showToast('初期設定に戻しました。');
  }

  function savePreset() {
    const name = elements.presetName.value.trim() || `フロー ${presets.length + 1}`;
    const preset = {
      id: makeId('preset'),
      name: name.slice(0, 32),
      intervals: settings.intervals.map(({ minutes }) => ({ minutes })),
      repeatCount: settings.repeatCount,
    };
    presets = [preset, ...presets.filter((item) => item.name !== preset.name)].slice(0, 30);
    persistPresets();
    renderPresets();
    elements.presetSelect.value = preset.id;
    elements.presetName.value = '';
    showFeedback(`「${preset.name}」を保存しました。`);
  }

  function loadPreset() {
    const preset = presets.find((item) => item.id === elements.presetSelect.value);
    if (!preset) return;
    settings = normalizeSettings({ ...preset, volume: settings.volume });
    selectedIntervalId = settings.intervals[0].id;
    resetTimerState();
    persistSettings('プリセットを読み込みました');
    renderAll();
    showFeedback(`「${preset.name}」を読み込みました。`);
  }

  function resetTimerState() {
    stopTicking();
    timer.status = 'idle';
    timer.setIndex = 0;
    timer.intervalIndex = 0;
    timer.remainingMs = durationFor(0);
    timer.endAt = null;
  }

  function stopTicking() {
    if (timer.tickId !== null) {
      window.clearInterval(timer.tickId);
      timer.tickId = null;
    }
  }

  function startTicking() {
    stopTicking();
    timer.tickId = window.setInterval(tick, 200);
  }

  function ensureAudio() {
    if (!audioContext && (window.AudioContext || window.webkitAudioContext)) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
    }
    if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
  }

  function playNotificationTone() {
    if (!audioContext || settings.volume <= 0) return;
    const now = audioContext.currentTime;
    const pattern = [880, 880, 880];
    pattern.forEach((frequency, index) => {
      const startAt = now + index * 0.3;
      const stopAt = startAt + 0.18;
      const gain = audioContext.createGain();
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, settings.volume * 0.5), startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      gain.connect(audioContext.destination);
      oscillator.connect(gain);
      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.01);
    });
  }

  function browserNotificationStatus() {
    if (!('Notification' in window)) return 'unsupported';
    if (window.isSecureContext === false) return 'insecure';
    return window.Notification.permission;
  }

  function sendBrowserNotification(title, body) {
    if (browserNotificationStatus() !== 'granted') return false;
    try {
      const notification = new window.Notification(title, {
        body,
        tag: 'focus-flow-timer',
        renotify: true,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      window.setTimeout(() => notification.close(), 7000);
      return true;
    } catch {
      // ローカルファイル環境などではブラウザ通知が利用できない場合があります。
      return false;
    }
  }

  async function requestNotificationPermission() {
    const status = browserNotificationStatus();
    if (status === 'unsupported') {
      updateNotificationButton();
      showFeedback('このブラウザは通知に対応していません。音で通知します。');
      return false;
    }
    if (status === 'insecure') {
      updateNotificationButton();
      showFeedback('ブラウザ通知にはHTTPS環境が必要です。音で通知します。');
      return false;
    }
    if (status === 'denied') {
      updateNotificationButton();
      showFeedback('ブラウザ通知がブロックされています。ブラウザのサイト設定から許可してください。');
      return false;
    }
    if (status === 'default') {
      try {
        await window.Notification.requestPermission();
      } catch {
        // Permission requests can be rejected by browser policy.
        showFeedback('通知の許可を取得できませんでした。音で通知します。');
      }
    }
    updateNotificationButton();
    if (browserNotificationStatus() === 'granted') {
      showFeedback('ブラウザ通知を有効にしました。');
      return true;
    }
    return false;
  }

  function updateNotificationButton() {
    const permission = browserNotificationStatus();
    const enabled = permission === 'granted';
    const unavailable = permission === 'unsupported' || permission === 'insecure';
    elements.notificationButton.classList.toggle('is-enabled', permission === 'granted');
    elements.notificationButton.classList.toggle('is-denied', permission === 'denied');
    elements.notificationButton.classList.toggle('is-unavailable', unavailable);
    elements.notificationButton.setAttribute('aria-pressed', String(enabled));
    elements.notificationDot.className = `notification-dot${enabled ? ' is-enabled' : ''}`;
    elements.notificationText.textContent = enabled
      ? 'ブラウザ通知が有効です'
      : permission === 'denied'
        ? 'ブラウザ通知がブロックされています'
        : permission === 'insecure'
          ? 'HTTPSでブラウザ通知を利用できます'
          : permission === 'unsupported'
            ? 'ブラウザ通知には対応していません'
            : 'ブラウザ通知を有効にする';
    elements.notificationButton.setAttribute('aria-label', elements.notificationText.textContent);
    elements.notificationButton.setAttribute('title', elements.notificationText.textContent);
  }

  function initializeMdcComponents() {
    const material = window.mdc;
    if (!material) return;

    const attach = (selector, component) => {
      if (!component) return;
      document.querySelectorAll(selector).forEach((element) => {
        if (element.__mdcInstance) return;
        try {
          element.__mdcInstance = component.attachTo(element);
        } catch {
          // MDC enhancement is optional; the timer remains usable without it.
        }
      });
    };

    attach('.mdc-text-field', material.textField?.MDCTextField);
    attach('.mdc-slider', material.slider?.MDCSlider);
    attach('.mdc-icon-button', material.iconButton?.MDCIconButton);

    const ripple = material.ripple?.MDCRipple;
    if (ripple) {
      document.querySelectorAll('.mdc-button, .mdc-icon-button').forEach((element) => {
        if (element.__mdcRipple) return;
        try {
          element.__mdcRipple = ripple.attachTo(element);
        } catch {
          // Keep the component usable even when ripple enhancement is unavailable.
        }
      });
    }
  }

  function notifyIntervalFinished(completedSet, completedStep, nextLabel) {
    playNotificationTone();
    const body = nextLabel ? `次の区間: ${nextLabel}` : 'すべてのセットが完了しました。';
    sendBrowserNotification(`区間 ${completedStep} が終了`, body);
    if (document.hidden) showToast(nextLabel ? `区間終了 · 次は ${nextLabel}` : 'セッションが完了しました。');
  }

  function beginFromIdle() {
    ensureAudio();
    requestNotificationPermission();
    timer.status = 'running';
    timer.setIndex = 0;
    timer.intervalIndex = 0;
    selectedIntervalId = settings.intervals[0].id;
    timer.remainingMs = durationFor(0);
    timer.endAt = Date.now() + timer.remainingMs;
    startTicking();
    renderAll();
  }

  function pauseTimer() {
    timer.remainingMs = currentRemainingMs();
    timer.endAt = null;
    timer.status = 'paused';
    stopTicking();
    renderAll();
  }

  function resumeTimer() {
    ensureAudio();
    timer.endAt = Date.now() + timer.remainingMs;
    timer.status = 'running';
    startTicking();
    renderAll();
  }

  function completeSession() {
    stopTicking();
    timer.status = 'complete';
    timer.remainingMs = 0;
    timer.endAt = null;
    renderAll();
  }

  function advanceInterval(now = Date.now()) {
    let guard = 0;
    while (timer.status === 'running' && timer.endAt !== null && now >= timer.endAt && guard < 100) {
      const completedStep = timer.intervalIndex + 1;
      const completedSet = timer.setIndex + 1;
      const previousEnd = timer.endAt;
      const isLastInterval = timer.intervalIndex >= settings.intervals.length - 1;
      const isLastSet = timer.setIndex >= settings.repeatCount - 1;

      if (isLastInterval && isLastSet) {
        timer.endAt = null;
        timer.remainingMs = 0;
        notifyIntervalFinished(completedSet, completedStep, null);
        completeSession();
        return;
      }

      if (isLastInterval) {
        timer.setIndex += 1;
        timer.intervalIndex = 0;
      } else {
        timer.intervalIndex += 1;
      }
      timer.remainingMs = durationFor();
      timer.endAt = previousEnd + timer.remainingMs;
      selectInterval(settings.intervals[timer.intervalIndex].id);
      notifyIntervalFinished(completedSet, completedStep, `${settings.intervals[timer.intervalIndex].minutes}分`);
      guard += 1;
    }
    renderTimer();
  }

  function tick() {
    if (timer.status !== 'running') return;
    if (timer.endAt !== null && Date.now() >= timer.endAt) {
      advanceInterval();
      return;
    }
    renderTimer();
  }

  function toggleTimer() {
    if (timer.status === 'running') pauseTimer();
    else if (timer.status === 'paused') resumeTimer();
    else beginFromIdle();
  }

  function resetCurrentInterval() {
    if (timer.status !== 'running' && timer.status !== 'paused') return;
    timer.remainingMs = durationFor();
    if (timer.status === 'running') timer.endAt = Date.now() + timer.remainingMs;
    renderAll();
    showToast('現在の区間をリセットしました。');
  }

  function stopTimer() {
    if (timer.status !== 'running' && timer.status !== 'paused') return;
    resetTimerState();
    selectedIntervalId = settings.intervals[0].id;
    renderAll();
    showToast('タイマーを完全停止しました。最初の区間に戻りました。');
  }

  function showFeedback(message) {
    elements.presetFeedback.textContent = message;
    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => { elements.presetFeedback.textContent = ''; }, 3500);
  }

  let toastTimer;
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    elements.toast.setAttribute('tabindex', '0');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove('is-visible');
      elements.toast.setAttribute('tabindex', '-1');
    }, 3200);
  }

  elements.intervalList.addEventListener('click', (event) => {
    const row = event.target.closest('.interval-row');
    if (!row || timer.status === 'running' || timer.status === 'paused') return;
    selectInterval(row.dataset.id);
    if (event.target.closest('.move-up')) moveInterval(row.dataset.id, -1);
    if (event.target.closest('.move-down')) moveInterval(row.dataset.id, 1);
    if (event.target.closest('.delete')) deleteInterval(row.dataset.id);
  });

  elements.intervalList.addEventListener('input', (event) => {
    if (!event.target.classList.contains('interval-input')) return;
    const row = event.target.closest('.interval-row');
    selectInterval(row.dataset.id);
    const interval = settings.intervals.find((item) => item.id === row.dataset.id);
    if (interval) interval.minutes = normalizeMinutes(event.target.value, interval.minutes);
    if (timer.status === 'idle') timer.remainingMs = durationFor();
    persistSettings();
    updateAppliedPreset();
    renderTimer();
  });

  elements.intervalList.addEventListener('change', (event) => {
    if (!event.target.classList.contains('interval-input')) return;
    const row = event.target.closest('.interval-row');
    const interval = settings.intervals.find((item) => item.id === row.dataset.id);
    event.target.value = interval?.minutes || 5;
    renderIntervalList();
  });

  elements.quickOptions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-minutes]');
    if (button) applyQuickMinutes(Number(button.dataset.minutes));
  });
  elements.addInterval.addEventListener('click', addInterval);
  elements.repeatCount.addEventListener('change', updateSettingsFromInputs);
  elements.volumeControl.addEventListener('input', () => {
    settings.volume = Number(elements.volumeControl.value) / 100;
    elements.volumeValue.textContent = `${elements.volumeControl.value}%`;
    elements.volumeControl.style.setProperty('--range-progress', `${elements.volumeControl.value}%`);
    persistSettings();
  });
  elements.mainAction.addEventListener('click', toggleTimer);
  elements.resetAction.addEventListener('click', resetCurrentInterval);
  elements.stopAction.addEventListener('click', stopTimer);
  elements.savePreset.addEventListener('click', savePreset);
  elements.presetName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') savePreset();
  });
  elements.loadPreset.addEventListener('click', loadPreset);
  elements.restoreDefaults.addEventListener('click', restoreDefaults);
  elements.notificationButton.addEventListener('click', requestNotificationPermission);
  elements.themeToggle.addEventListener('click', toggleTheme);
  document.addEventListener('visibilitychange', tick);
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    if (event.code === 'Space' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') {
      event.preventDefault();
      toggleTimer();
    }
  });
  window.addEventListener('beforeunload', () => persistSettings());

  applyTheme(currentTheme());
  renderAll();
  initializeMdcComponents();
})();
