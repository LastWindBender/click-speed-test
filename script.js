// script.js (güncellenmiş)
// Temel mantık aynı, ama bip oynatılırken zaman damgası için
// önce getOutputTimestamp() (varsa) denenir, yoksa direct DOM updates kullanılır.
/**
 * @type {AudioContext | null}
 */
let audioCtx = null;
let nextPlayTs = 0;
let playPerfTs = 0;
let currentRound = 0;
let totalRounds = 10;
/**
 * @type {{ reaction: any; fault: boolean; }[]}
 */
let results = [];
let waitingForClick = false;
/**
 * @type {number | null | undefined}
 */
let scheduledTimeout = null;
let safetyTimeout = null;
const initBtn = document.getElementById('initBtn');
const startTest = document.getElementById('startTest');
const resetBtn = document.getElementById('resetBtn');
const reactBtn = document.getElementById('reactBtn');
const statusDiv = document.getElementById('status');
const list = document.getElementById('list');
const summary = document.getElementById('summary');
const roundsInput = document.getElementById('rounds');
const minDelayInput = document.getElementById('minDelay');
const maxDelayInput = document.getElementById('maxDelay');
initBtn.addEventListener('click', async () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    statusDiv.textContent = 'Audio initialized. Hazır.';
    startTest.disabled = false;
    initBtn.disabled = true;
  }
});
startTest.addEventListener('click', () => {
  if (!audioCtx) {
    alert('Önce "Init Audio" butonuna tıklayın.');
    return;
  }
  totalRounds = Math.max(1, parseInt(roundsInput.value, 10) || 10);
  results = [];
  currentRound = 0;
  list.innerHTML = '';
  summary.textContent = 'Test başladı...';
  startTest.disabled = true;
  roundsInput.disabled = true;
  minDelayInput.disabled = true;
  maxDelayInput.disabled = true;
  scheduleNext();
});
resetBtn.addEventListener('click', () => {
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }
  if (audioCtx) {
    audioCtx.suspend();
    audioCtx = null;
  }
  waitingForClick = false;
  reactBtn.disabled = true;
  startTest.disabled = true;
  initBtn.disabled = false;
  roundsInput.disabled = false;
  minDelayInput.disabled = false;
  maxDelayInput.disabled = false;
  statusDiv.textContent = 'Sıfırlandı.';
  list.innerHTML = '';
  summary.textContent = 'Henüz sonuç yok.';
  results = [];
});
reactBtn.addEventListener('click', () => {
  if (!waitingForClick) {
    // clicked too early
    statusDiv.textContent = 'Çok erken tıkladınız! Bu tur iptal edildi.';
    addResult(null, true);
    scheduleNext();
    return;
  }
  const clickTs = performance.now();
  const reaction = clickTs - playPerfTs;
  waitingForClick = false;
  reactBtn.disabled = true;
  statusDiv.textContent = `Tepki: ${reaction.toFixed(1)} ms`;
  addResult(reaction, false);
  scheduleNext();
});
function scheduleNext() {
  if (currentRound >= totalRounds) {
    finishTest();
    return;
  }
  if (safetyTimeout) {
    clearInterval(safetyTimeout);
    safetyTimeout = null;
  }
  currentRound++;
  const minD = Math.max(0, parseInt(minDelayInput.value, 10) || 1000);
  const maxD = Math.max(minD, parseInt(maxDelayInput.value, 10) || 3000);
  const delay = Math.random() * (maxD - minD) + minD;
  statusDiv.textContent = `Tur ${currentRound}/${totalRounds}: bekleniyor...`;
  reactBtn.disabled = true;
  waitingForClick = false;
  scheduledTimeout = setTimeout(() => {
    scheduledTimeout = null;
    playBeep();
  }, delay);
}
function playBeep() {
  if (!audioCtx) return;
  // create short beep via oscillator + gain
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 1000;
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  // fast attack
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.001);
  gain.gain.linearRampToValueAtTime(0, now + 0.08);
  osc.start(now);
  osc.stop(now + 0.09);
  playPerfTs = performance.now();
  waitingForClick = true;
  reactBtn.disabled = false;
  statusDiv.textContent = 'Sesi duyduğunuzda tıklayın!';
  // safety: if user doesn't click in 3s, mark fault
  safetyTimeout = setTimeout(() => {
    if (waitingForClick) {
      waitingForClick = false;
      reactBtn.disabled = true;
      statusDiv.textContent = 'Cevap yok — tur atlandı.';
      addResult(null, true);
      scheduleNext();
    }
  }, 3000);
}
/**
 * @param {number | null} reaction
 * @param {boolean} fault
 */
function addResult(reaction, fault) {
  results.push({ reaction: reaction, fault: !!fault });
  const li = document.createElement('li');
  const idx = results.length;
  li.textContent = `Tur ${idx}: ` + (fault ? 'Hatalı/Atlandı' : `${reaction.toFixed(1)} ms`);
  list.appendChild(li);
}
function finishTest() {
  statusDiv.textContent = 'Test tamamlandı.';
  startTest.disabled = false;
  roundsInput.disabled = false;
  minDelayInput.disabled = false;
  maxDelayInput.disabled = false;
  reactBtn.disabled = true;
  const valid = results.filter(r => r.reaction != null).map(r => r.reaction);
  if (valid.length === 0) {
    summary.textContent = 'Geçerli sonuç yok.';
    return;
  }
  const sum = valid.reduce((a, b) => a + b, 0);
  const mean = sum / valid.length;
  const best = Math.min(...valid);
  const worst = Math.max(...valid);
  const variance = valid.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / valid.length;
  const std = Math.sqrt(variance);
  summary.innerHTML = `
    Geçerli turlar: ${valid.length}/${results.length} &nbsp; 
    Ortalama: ${mean.toFixed(1)} ms &nbsp; 
    En iyi: ${best.toFixed(1)} ms &nbsp; 
    En kötü: ${worst.toFixed(1)} ms &nbsp; 
    StdDev: ${std.toFixed(1)} ms
  `;
}