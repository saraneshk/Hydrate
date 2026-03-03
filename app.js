// ===== State =====
let isAwake = false;
let wakeTime = null;
let glasses = 0;
let timerInterval = null;
let awakeInterval = null;
let reminderTimeout = null;
let nextReminderTime = null;
const ML_PER_GLASS = 250;
const REMINDER_MS = 60 * 60 * 1000; // 1 hour
const log = [];

// ===== DOM Elements =====
const sleepState = document.getElementById('sleepState');
const awakeState = document.getElementById('awakeState');
const timerMinutes = document.getElementById('timerMinutes');
const timerProgress = document.getElementById('timerProgress');
const glassCount = document.getElementById('glassCount');
const mlCount = document.getElementById('mlCount');
const awakeTimeEl = document.getElementById('awakeTime');
const logSection = document.getElementById('logSection');
const logList = document.getElementById('logList');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');

// ===== Init =====
window.addEventListener('DOMContentLoaded', () => {
    createBubbles();
    injectSVGGradient();
    registerServiceWorker();
    checkInstallBanner();
    loadState();
});

// ===== Service Worker =====
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('./sw.js')
            .then((reg) => {
                console.log('SW registered:', reg.scope);
            })
            .catch((err) => {
                console.warn('SW registration failed:', err);
            });
    }
}

// ===== Install Banner (iOS Safari) =====
function checkInstallBanner() {
    const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
    const dismissed = localStorage.getItem('hydrate_install_dismissed');
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);

    const banner = document.getElementById('installBanner');
    if (banner && isIOS && !isStandalone && !dismissed) {
        banner.classList.remove('hidden');
    }
}

function dismissInstall() {
    const banner = document.getElementById('installBanner');
    if (banner) banner.classList.add('hidden');
    localStorage.setItem('hydrate_install_dismissed', '1');
}

// ===== SVG Gradient for Timer =====
function injectSVGGradient() {
    const svg = document.querySelector('.timer-svg');
    if (!svg) return;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
    <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4facfe" />
      <stop offset="100%" style="stop-color:#00f2fe" />
    </linearGradient>
  `;
    svg.prepend(defs);
    timerProgress.style.stroke = 'url(#timerGradient)';
}

// ===== Bubbles Background =====
function createBubbles() {
    const container = document.getElementById('bubblesBg');
    const count = 18;
    for (let i = 0; i < count; i++) {
        const bubble = document.createElement('div');
        bubble.classList.add('bubble');
        const size = Math.random() * 80 + 20;
        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;
        bubble.style.left = `${Math.random() * 100}%`;
        bubble.style.animationDuration = `${Math.random() * 12 + 8}s`;
        bubble.style.animationDelay = `${Math.random() * 10}s`;
        container.appendChild(bubble);
    }
}

// ===== Wake Up =====
function wakeUp() {
    isAwake = true;
    wakeTime = Date.now();
    glasses = 0;
    log.length = 0;

    sleepState.classList.add('hidden');
    awakeState.classList.remove('hidden');

    requestNotificationPermission();
    startTimerCycle();
    startAwakeTimer();
    updateStats();
    saveState();
    showToast('☀️ Good morning! Stay hydrated!');
}

// ===== Notifications =====
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendNotification() {
    // In-app alert
    showToast('💧 Time to drink water!');

    // Browser / PWA notification
    if ('Notification' in window && Notification.permission === 'granted') {
        // Use service worker for notifications on iOS (required for PWA)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification('💧 Hydrate!', {
                    body: `Time to drink water! You've had ${glasses} glass${glasses !== 1 ? 'es' : ''} so far.`,
                    icon: 'icon-192.png',
                    badge: 'icon-192.png',
                    tag: 'water-reminder',
                    renotify: true,
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                });
            });
        } else {
            // Fallback for desktop
            const n = new Notification('💧 Hydrate!', {
                body: `Time to drink water! You've had ${glasses} glass${glasses !== 1 ? 'es' : ''} so far.`,
                icon: 'icon-192.png',
                tag: 'water-reminder',
                requireInteraction: true,
            });
            n.onclick = () => {
                window.focus();
                n.close();
            };
        }
    }

    // Play a sound
    playDropSound();
}

// ===== Sound =====
function playDropSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) { /* Audio not supported */ }
}

// ===== Timer =====
function startTimerCycle() {
    clearInterval(timerInterval);
    clearTimeout(reminderTimeout);

    nextReminderTime = Date.now() + REMINDER_MS;

    // Update timer display every second
    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();

    // Set the actual reminder
    reminderTimeout = setTimeout(() => {
        sendNotification();
        addLogEntry('⏰', 'Reminder: Time to drink water!');
        startTimerCycle(); // restart for next hour
    }, REMINDER_MS);

    saveState();
}

function updateTimerDisplay() {
    if (!nextReminderTime) return;
    const remaining = Math.max(0, nextReminderTime - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    timerMinutes.textContent = mins > 0 ? mins : secs;
    const label = document.querySelector('.timer-label');
    label.textContent = mins > 0 ? 'minutes' : 'seconds';

    // Update progress ring
    const circumference = 2 * Math.PI * 90; // 565.48
    const progress = remaining / REMINDER_MS;
    const offset = circumference * (1 - progress);
    timerProgress.style.strokeDashoffset = offset;
}

// ===== Awake Timer =====
function startAwakeTimer() {
    clearInterval(awakeInterval);
    awakeInterval = setInterval(updateAwakeTime, 60000);
    updateAwakeTime();
}

function updateAwakeTime() {
    if (!wakeTime) return;
    const elapsed = Date.now() - wakeTime;
    const hours = Math.floor(elapsed / 3600000);
    const mins = Math.floor((elapsed % 3600000) / 60000);
    awakeTimeEl.textContent = `${hours}h ${mins}m`;
}

// ===== Drink Water =====
function drinkWater() {
    glasses++;
    updateStats();
    addLogEntry('💧', `Drank a glass of water (${glasses * ML_PER_GLASS}ml total)`);

    // Celebrate animation
    const btn = document.getElementById('drinkBtn');
    btn.classList.add('celebrate');
    setTimeout(() => btn.classList.remove('celebrate'), 500);

    // Reset timer for next hour
    startTimerCycle();
    saveState();
    showToast(`🎉 Glass #${glasses} — Great job!`);
}

// ===== Stats =====
function updateStats() {
    glassCount.textContent = glasses;
    mlCount.textContent = glasses * ML_PER_GLASS;
}

// ===== Log =====
function addLogEntry(icon, text) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    log.unshift({ icon, text, time: timeStr });

    renderLog();
    saveState();
}

function renderLog() {
    if (log.length === 0) {
        logSection.classList.remove('visible');
        return;
    }
    logSection.classList.add('visible');
    logList.innerHTML = log.map(entry => `
    <div class="log-item">
      <span class="log-item-icon">${entry.icon}</span>
      <span class="log-item-text">${entry.text}</span>
      <span class="log-item-time">${entry.time}</span>
    </div>
  `).join('');
}

// ===== Go to Sleep =====
function goToSleep() {
    isAwake = false;
    clearInterval(timerInterval);
    clearInterval(awakeInterval);
    clearTimeout(reminderTimeout);

    awakeState.classList.add('hidden');
    sleepState.classList.remove('hidden');

    // Reset
    wakeTime = null;
    glasses = 0;
    log.length = 0;
    nextReminderTime = null;

    clearState();
    showToast('🌙 Good night! Sleep well!');
}

// ===== Toast =====
function showToast(message) {
    toastText.textContent = message;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 400);
    }, 3000);
}

// ===== Persistence =====
function saveState() {
    const state = {
        isAwake,
        wakeTime,
        glasses,
        log: log.slice(),
        nextReminderTime,
    };
    localStorage.setItem('hydrate_state', JSON.stringify(state));
}

function loadState() {
    try {
        const raw = localStorage.getItem('hydrate_state');
        if (!raw) return;
        const state = JSON.parse(raw);

        // Check if the saved state is from today
        if (state.isAwake && state.wakeTime) {
            const savedDate = new Date(state.wakeTime).toDateString();
            const today = new Date().toDateString();
            if (savedDate !== today) {
                clearState();
                return;
            }

            isAwake = true;
            wakeTime = state.wakeTime;
            glasses = state.glasses || 0;
            log.push(...(state.log || []));

            sleepState.classList.add('hidden');
            awakeState.classList.remove('hidden');

            updateStats();
            renderLog();
            startAwakeTimer();

            // Recalculate next reminder
            if (state.nextReminderTime && state.nextReminderTime > Date.now()) {
                nextReminderTime = state.nextReminderTime;
            } else {
                nextReminderTime = Date.now() + REMINDER_MS;
            }
            startTimerCycleFromExisting();
        }
    } catch (e) {
        clearState();
    }
}

function startTimerCycleFromExisting() {
    clearInterval(timerInterval);
    clearTimeout(reminderTimeout);

    const remaining = Math.max(0, nextReminderTime - Date.now());

    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();

    reminderTimeout = setTimeout(() => {
        sendNotification();
        addLogEntry('⏰', 'Reminder: Time to drink water!');
        startTimerCycle();
    }, remaining);
}

function clearState() {
    localStorage.removeItem('hydrate_state');
}

// ===== Visibility Change (resume timer when app comes back to foreground) =====
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isAwake) {
        updateTimerDisplay();
        updateAwakeTime();

        // Check if a reminder was missed while in background
        if (nextReminderTime && Date.now() >= nextReminderTime) {
            sendNotification();
            addLogEntry('⏰', 'Reminder: Time to drink water!');
            startTimerCycle();
        }
    }
});
