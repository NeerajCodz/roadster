import '@fontsource-variable/manrope';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './style.css';
import { Simulation, EMPTY_CONTROLS, type Controls } from './game/simulation';
import { GameRenderer } from './game/renderer';
import { GameAudio } from './game/audio';
import { CONTROL_CODES, keyAction } from './game/keyboard';

const icons: Record<string, string> = {
  arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-6 4H2v6h3l6 4zM16 9l6 6m0-6-6 6"/>',
  full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  settings: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
  left: '<path d="m14 5-7 7 7 7"/>',
  right: '<path d="m10 5 7 7-7 7"/>',
  up: '<path d="m5 14 7-7 7 7"/>',
  roll: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  shield: '<path d="m12 3 8 3v6c0 4-8 9-8 9s-8-5-8-9V6z"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.arrow}</svg>`;
const brand = `<span class="brand-symbol"><i></i><i></i></span><span class="brand-word">ROADSTER<span>RUSH</span></span>`;
type Preferences = {
  sound: boolean;
  quality: 'high' | 'performance';
  paint: number;
  car: 'roadster' | 'concept';
  bestScore: number;
  bestDistance: number;
  bolts: number;
  runs: number;
};
const defaults: Preferences = {
  sound: true,
  quality: 'high',
  paint: 0,
  car: 'roadster',
  bestScore: 0,
  bestDistance: 0,
  bolts: 0,
  runs: 0,
};
let prefs: Preferences = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem('roadster-rush-v1') ?? '{}');
  prefs = {
    ...defaults,
    sound: typeof saved.sound === 'boolean' ? saved.sound : true,
    quality: saved.quality === 'performance' ? 'performance' : 'high',
    paint: Number.isInteger(saved.paint) && saved.paint >= 0 && saved.paint <= 4 ? saved.paint : 0,
    car: saved.car === 'concept' ? 'concept' : 'roadster',
  };
  for (const key of ['bestScore', 'bestDistance', 'bolts', 'runs'] as const)
    if (Number.isFinite(saved[key]) && saved[key] >= 0) prefs[key] = saved[key];
} catch {
  /* Private browsing and corrupt saves use defaults. */
}
const save = () => {
  try {
    localStorage.setItem('roadster-rush-v1', JSON.stringify(prefs));
  } catch {
    /* Play remains available without storage. */
  }
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="scene" aria-label="3D Roadster Rush game" tabindex="-1"></canvas>
  <div class="film-grain" aria-hidden="true"></div>
  <div class="menu-shade" aria-hidden="true"></div>
  <header class="site-header">
    <button class="brand" id="brand" aria-label="Roadster Rush home">${brand}</button>
    <nav class="main-nav" aria-label="Main navigation">
      <button class="nav-link active" data-panel="drive">THE DRIVE<span>01</span></button>
      <button class="nav-link" data-panel="garage">GARAGE<span>02</span></button>
      <button class="nav-link" data-open="help">HOW TO PLAY<span>03</span></button>
    </nav>
    <div class="header-actions">
      <button class="icon-button" id="sound" aria-label="Mute sound" title="Sound (M)">${icon('sound')}</button>
      <button class="icon-button fullscreen" id="fullscreen" aria-label="Toggle fullscreen" title="Fullscreen">${icon('full')}</button>
      <button class="icon-button" id="settings" aria-label="Settings" title="Settings">${icon('settings')}</button>
      <button class="icon-button pause-button" id="pause" aria-label="Pause game" title="Pause (Esc)">${icon('pause')}</button>
    </div>
  </header>

  <main class="menu-content" id="menu-content">
    <section class="hero" id="drive-panel" aria-labelledby="hero-title">
      <div class="eyebrow"><span class="status-dot"></span> ALL ELECTRIC. ALL ADRENALINE.</div>
      <h1 id="hero-title">THE ROAD<br>IS <em>OPTIONAL.</em></h1>
      <p class="hero-copy">Gridlock ends where you take off.<br>Find your gap. Hit the thrusters. Own the sky.</p>
      <button class="primary-button start-button" id="start"><span>LET’S DRIVE</span>${icon('arrow')}</button>
      <div class="start-hint"><kbd>SPACE</kbd><span>TO IGNITE YOUR RUN</span><span class="hint-line"></span></div>
      <div class="record-strip">
        <div><span class="micro-label">PERSONAL BEST</span><strong id="menu-best">000000</strong><span class="stat-unit">PTS</span></div>
        <div><span class="micro-label">FURTHEST RUN</span><strong id="menu-distance">0.00</strong><span class="stat-unit">KM</span></div>
      </div>
    </section>

    <section class="garage-panel" id="garage-panel" hidden aria-labelledby="garage-title">
      <div class="eyebrow"><span class="status-dot"></span> YOUR MACHINE. YOUR SIGNATURE.</div>
      <h1 id="garage-title">PURE<br><em>POTENTIAL.</em></h1>
      <p class="hero-copy">Two machines. One open road.<br>Choose your ride and make it yours.</p>
      <div class="vehicle-selector" role="group" aria-label="Select vehicle">
        <button class="vehicle-card" data-car="roadster"><span>01 / ORIGINAL</span><strong>ROADSTER</strong><small>THE ONE THAT STARTED IT</small></button>
        <button class="vehicle-card" data-car="concept"><span>02 / CONCEPT</span><strong>AERO GT</strong><small>PRECISION IN EVERY DETAIL</small></button>
      </div>
      <div class="paint-control"><span class="micro-label">FINISH <b id="paint-name">VOLT</b></span><div class="paint-swatches" role="group" aria-label="Vehicle paint">
        ${['Volt', 'Ceramic', 'Titanium', 'Ember', 'Graphite'].map((name, i) => `<button class="paint-swatch" data-paint="${i}" style="--paint:${['#d7ed65', '#ece9df', '#9bacbb', '#e4633f', '#222b2b'][i]}" aria-label="${name} paint" title="${name}"></button>`).join('')}
      </div></div>
      <button class="primary-button" id="garage-start"><span>TAKE IT FOR A DRIVE</span>${icon('arrow')}</button>
    </section>
  </main>

  <aside class="vehicle-caption" id="vehicle-caption"><span class="caption-line"></span><div><span class="micro-label">MEET YOUR ESCAPE</span><strong id="car-caption">ROADSTER <span>/ 01</span></strong><p>ELECTRIC SOUL. UNTAMED SPIRIT.</p></div></aside>
  <div class="scene-coordinate"><span>36° 16′ N &nbsp; 121° 48′ W</span><strong>PACIFIC COAST HIGHWAY</strong></div>
  <div class="menu-bottom" id="menu-bottom"><div class="controls-preview"><span><kbd>A</kbd><kbd>D</kbd> STEER</span><span><kbd>SPACE</kbd> FLY</span><span><kbd>Q</kbd><kbd>E</kbd> ROLL</span><span><kbd>SHIFT</kbd> BOOST</span></div><span class="edition">A NEW PERSPECTIVE ON THE DAILY DRIVE</span></div>
  <footer class="site-footer" id="site-footer"><span><i class="tiny-dot"></i> <span id="systems">SYSTEMS ONLINE</span></span><span>BUILT FOR THE OPEN ROAD. <b>AND BEYOND.</b></span><span>VOL. 01 <i class="footer-cross">＋</i></span></footer>

  <section class="game-hud" id="hud" hidden aria-label="Game status">
    <div class="hud-score"><span class="micro-label">SCORE</span><strong id="score">000000</strong><div><span id="distance">0.00 KM</span><span class="hud-bolts">${icon('bolt')}<b id="bolts">0</b></span></div></div>
    <div class="route-tag"><span class="status-dot"></span><span>PACIFIC COAST</span><b>NORTHBOUND / ∞</b></div>
    <div class="combo-display" id="combo-display"><span class="micro-label">MULTIPLIER</span><strong id="combo">×1</strong><div class="combo-track"><i id="combo-fill"></i></div></div>
    <div class="event-toast" id="event-toast" role="status"></div>
    <div class="pickup-effects" id="pickup-effects"></div>
    <div class="bottom-hud"><div class="speed-display"><strong id="speed">158</strong><div><span>KM/H</span><b id="drive-mode">ELECTRIC DRIVE</b></div><div class="speed-bars">${'<i></i>'.repeat(16)}</div></div><div class="air-display"><div><span>${icon('up')} THRUSTER ENERGY</span><strong id="air-number">100<span>%</span></strong></div><div class="air-track"><i id="air-fill"></i></div><p><kbd>SPACE</kbd> HOLD TO FLY <span id="altitude">GROUND LEVEL</span></p></div></div>
    <div class="game-key-hint"><kbd>W</kbd> BOOST <span>/</span> <kbd>S</kbd> DIVE <span>/</span> <kbd>Q</kbd> <kbd>E</kbd> BARREL ROLL</div>
  </section>

  <div class="touch-controls" id="touch-controls" hidden>
    <div class="touch-steering"><button data-control="left" aria-label="Steer left">${icon('left')}</button><button data-control="right" aria-label="Steer right">${icon('right')}</button></div>
    <div class="touch-actions"><button data-control="rollLeft" aria-label="Roll left">${icon('roll')}<span>ROLL L</span></button><button data-control="dive" aria-label="Dive">${icon('up')}<span>DIVE</span></button><button data-control="rollRight" aria-label="Roll right">${icon('roll')}<span>ROLL R</span></button><button class="touch-fly" data-control="fly" aria-label="Hold to fly">${icon('up')}<span>FLY</span></button><button data-control="accelerate" aria-label="Boost">${icon('bolt')}<span>BOOST</span></button></div>
  </div>
  <div class="impact-flash" id="impact-flash" aria-hidden="true"></div>

  <dialog id="help-dialog" class="panel-dialog help-dialog">
    <button class="dialog-close icon-button" aria-label="Close how to play">${icon('close')}</button>
    <div class="eyebrow">DRIVER’S MANUAL / 01</div><h2>NO TRAFFIC.<br><em>JUST POSSIBILITIES.</em></h2><p class="dialog-intro">Go further. Get closer. Take the scenic route above it all.</p>
    <div class="manual-grid"><div><span>01</span><h3>FIND YOUR LINE</h3><p>Use <kbd>A</kbd> <kbd>D</kbd> or arrow keys to move between five lanes. Hold <kbd>W</kbd> or <kbd>SHIFT</kbd> for a boost.</p></div><div><span>02</span><h3>LEAVE THE ROAD</h3><p>Tap <kbd>SPACE</kbd> to hop. Hold it to fly. Release to descend, or hold <kbd>S</kbd> to dive. Energy refills on the ground.</p></div><div><span>03</span><h3>MAKE IT A CLOSE CALL</h3><p><kbd>Q</kbd> <kbd>E</kbd> barrel roll through danger. Chain near misses and collect bolts to build your score.</p></div><div><span>04</span><h3>GO THE EXTRA MILE</h3><p>Collect air, shields, magnets, double points and rockets. Sky traffic is real—keep watching ahead.</p></div></div>
    <div class="manual-note"><span>${icon('shield')} ROLL = BRIEF COLLISION PROTECTION</span><span><kbd>ESC</kbd> PAUSE &nbsp; <kbd>M</kbd> SOUND</span></div>
    <button class="primary-button dialog-close"><span>GOT IT. LET’S GO.</span>${icon('arrow')}</button>
  </dialog>

  <dialog id="settings-dialog" class="panel-dialog settings-dialog"><button class="dialog-close icon-button" aria-label="Close settings">${icon('close')}</button><div class="eyebrow">TUNE YOUR EXPERIENCE</div><h2>THE DETAILS<br><em>MATTER.</em></h2><div class="setting-row"><div><h3>SOUND</h3><p>Engine, soundtrack and the wind.</p></div><button class="toggle-button" id="sound-setting" role="switch" aria-checked="true">ON <i></i></button></div><div class="setting-row"><div><h3>GRAPHICS</h3><p>Find your balance of detail and speed.</p></div><select id="quality" aria-label="Graphics quality"><option value="high">HIGH QUALITY</option><option value="performance">PERFORMANCE</option></select></div><div class="settings-note">Your records and preferences are saved on this device.<br>Original reference assets + an additional PBR concept car.</div><button class="text-button" data-open="credits">VIEW ASSET CREDITS ${icon('arrow')}</button></dialog>

  <dialog id="credits-dialog" class="panel-dialog credits-dialog"><button class="dialog-close icon-button" aria-label="Close credits">${icon('close')}</button><div class="eyebrow">UNDER THE HOOD</div><h2>GOOD COMPANY.</h2><p>Inspired by Roadster Rush. Original car, traffic, billboards, soundtrack, voices and Inter font copied from the public reference at your request.</p><a href="https://roadster-rush.ai.studio/" target="_blank" rel="noopener noreferrer">Roadster Rush reference ${icon('arrow')}</a><p>Aero GT uses CarConcept by Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH, licensed CC BY 4.0. Paint and license plate materials modified.</p><a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept" target="_blank" rel="noopener noreferrer">CarConcept / Khronos ${icon('arrow')}</a><p>Venice Sunset HDR by Greg Zaal / Poly Haven, CC0. Manrope and Space Grotesk fonts under SIL OFL. Built with Three.js.</p><a href="https://polyhaven.com/a/venice_sunset" target="_blank" rel="noopener noreferrer">Poly Haven ${icon('arrow')}</a></dialog>

  <dialog id="pause-dialog" class="panel-dialog run-dialog"><div class="eyebrow"><span class="status-dot"></span> TAKE A BREATHER</div><h2>THE ROAD<br><em>CAN WAIT.</em></h2><p>Your run is right where you left it.</p><button class="primary-button" id="resume"><span>BACK TO THE DRIVE</span>${icon('arrow')}</button><button class="secondary-button" id="restart">START A FRESH RUN</button><button class="text-button" id="pause-home">RETURN TO GARAGE</button></dialog>

  <dialog id="results-dialog" class="panel-dialog run-dialog results-dialog"><div class="eyebrow" id="result-eyebrow">ONE FOR THE BOOKS</div><h2>WHAT<br><em>A RIDE.</em></h2><span class="micro-label">FINAL SCORE</span><strong class="result-score" id="result-score">000000</strong><div class="result-stats"><div><span>DISTANCE</span><strong id="result-distance">0.00 <small>KM</small></strong></div><div><span>BOLTS</span><strong id="result-bolts">0</strong></div><div><span>NEAR MISSES</span><strong id="result-near">0</strong></div></div><p class="result-best" id="result-best"></p><button class="primary-button" id="retry"><span>ONE MORE RUN</span>${icon('arrow')}</button><button class="text-button" id="result-home">BACK TO GARAGE</button></dialog>
  <div class="fatal-error" id="fatal-error" hidden><div class="eyebrow">A QUICK PIT STOP</div><h2>3D COULDN’T START.</h2><p>Your browser couldn’t create a WebGL context. Enable hardware acceleration or try a WebGL-capable browser.</p><button class="primary-button" onclick="location.reload()">TRY AGAIN</button></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const sim = new Simulation(Math.floor(Math.random() * 2147483647));
const audio = new GameAudio();
let scene: GameRenderer;
try {
  scene = new GameRenderer($('#scene'));
} catch (error) {
  $('#fatal-error').hidden = false;
  console.error('WebGL initialization failed', error);
  throw error;
}
scene.setQuality(prefs.quality);
scene.onModelLoaded = () => {
  scene.setPaint(prefs.paint);
  $('#systems').textContent = 'SYSTEMS ONLINE';
};
if (prefs.car === 'concept') void scene.loadCar('CarConcept.glb');

const assetPath = (path: string) => `${import.meta.env.BASE_URL}assets/reference/audio/${path}`;
const music = new Audio(assetPath('music/run.mp3'));
music.loop = true;
music.volume = 0.19;
music.preload = 'none';
const voice = new Audio();
voice.volume = 0.42;
voice.preload = 'none';
let lastVoice = 0,
  lowAirAnnounced = false;
const speak = (name: string, force = false) => {
  if (!prefs.sound || (!force && performance.now() - lastVoice < 5500)) return;
  lastVoice = performance.now();
  voice.src = assetPath(`voice/${name}_0.mp3`);
  void voice.play().catch(() => {});
};

const keys = new Set<string>();
const pointers = new Map<number, keyof Controls>();
let panel: 'drive' | 'garage' = 'drive';
let lastStatus = sim.state.status;
let toastUntil = 0;
let resultTimeout: ReturnType<typeof setTimeout> | undefined;
const clearInput = () => {
  keys.clear();
  pointers.clear();
  document.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
};
const anyDialog = () => document.querySelector('dialog[open]') !== null;
const closeDialogs = () =>
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((dialog) => dialog.close());
const number = (value: number) => Math.floor(value).toString().padStart(6, '0');
function refreshRecords() {
  $('#menu-best').textContent = number(prefs.bestScore);
  $('#menu-distance').textContent = (prefs.bestDistance / 1000).toFixed(2);
}
function refreshGarage() {
  document.querySelectorAll<HTMLButtonElement>('[data-car]').forEach((el) => {
    const selected = el.dataset.car === prefs.car;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-paint]').forEach((el) => {
    const selected = Number(el.dataset.paint) === prefs.paint;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', String(selected));
  });
  $('#paint-name').textContent = [
    prefs.car === 'roadster' ? 'ORIGINAL' : 'VOLT',
    'CERAMIC',
    'TITANIUM',
    'EMBER',
    'GRAPHITE',
  ][prefs.paint];
  const firstPaint = $<HTMLButtonElement>('[data-paint="0"]');
  firstPaint.style.setProperty('--paint', prefs.car === 'roadster' ? '#a8b0ae' : '#d7ed65');
  firstPaint.setAttribute(
    'aria-label',
    prefs.car === 'roadster' ? 'Original finish' : 'Volt paint',
  );
  $('#car-caption').innerHTML =
    prefs.car === 'roadster' ? 'ROADSTER <span>/ 01</span>' : 'AERO GT <span>/ 02</span>';
}
function setPanel(next: 'drive' | 'garage') {
  panel = next;
  $('#drive-panel').hidden = next !== 'drive';
  $('#garage-panel').hidden = next !== 'garage';
  document
    .querySelectorAll<HTMLElement>('[data-panel]')
    .forEach((el) => el.classList.toggle('active', el.dataset.panel === next));
  document.body.dataset.panel = next;
}
function setSound(enabled: boolean) {
  prefs.sound = enabled;
  audio.setEnabled(enabled);
  save();
  $('#sound').innerHTML = icon(enabled ? 'sound' : 'mute');
  $('#sound').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
  $('#sound-setting').setAttribute('aria-checked', String(enabled));
  $('#sound-setting').innerHTML = `${enabled ? 'ON' : 'OFF'} <i></i>`;
  if (!enabled) {
    music.pause();
    voice.pause();
  } else if (sim.state.status === 'playing') {
    void audio.unlock();
    void music.play().catch(() => {});
  }
}
function startRun() {
  if (resultTimeout) clearTimeout(resultTimeout);
  closeDialogs();
  clearInput();
  sim.start();
  lastStatus = 'playing';
  lowAirAnnounced = false;
  document.body.dataset.mode = 'playing';
  $('#hud').hidden = false;
  $('#touch-controls').hidden = false;
  $('#scene').focus({ preventScroll: true });
  void audio.unlock();
  audio.play('start');
  if (prefs.sound) {
    music.currentTime = 0;
    void music.play().catch(() => {});
    speak('start', true);
  }
  toast('MAKE THE ROAD YOURS', 'PACIFIC COAST / NORTHBOUND');
}
function pauseRun() {
  if (sim.state.status !== 'playing') return;
  sim.pause();
  clearInput();
  music.pause();
  audio.update(0, false, false);
  $<HTMLDialogElement>('#pause-dialog').showModal();
}
function resumeRun() {
  closeDialogs();
  clearInput();
  sim.resume();
  $('#scene').focus({ preventScroll: true });
  if (prefs.sound) void music.play().catch(() => {});
}
function goHome() {
  if (resultTimeout) clearTimeout(resultTimeout);
  closeDialogs();
  clearInput();
  sim.menu();
  lastStatus = 'menu';
  music.pause();
  voice.pause();
  document.body.dataset.mode = 'menu';
  $('#hud').hidden = true;
  $('#touch-controls').hidden = true;
  setPanel('drive');
  refreshRecords();
  $('#start').focus({ preventScroll: true });
}
function showDialog(name: string) {
  audio.play('click');
  if (sim.state.status === 'playing') {
    sim.pause();
    clearInput();
    music.pause();
  }
  closeDialogs();
  $<HTMLDialogElement>(`#${name}-dialog`).showModal();
}
function toast(title: string, subtitle = '') {
  $('#event-toast').innerHTML =
    `<span>${title}</span>${subtitle ? `<small>${subtitle}</small>` : ''}`;
  $('#event-toast').classList.remove('show');
  void $('#event-toast').offsetWidth;
  $('#event-toast').classList.add('show');
  toastUntil = performance.now() + 2000;
}
function crash() {
  clearInput();
  music.pause();
  speak('crash', true);
  audio.play('crash');
  $('#impact-flash').classList.add('active');
  setTimeout(() => $('#impact-flash').classList.remove('active'), 240);
  const s = sim.state;
  const newBest = s.score > prefs.bestScore;
  prefs.bestScore = Math.max(prefs.bestScore, Math.floor(s.score));
  prefs.bestDistance = Math.max(prefs.bestDistance, s.distance);
  prefs.bolts += s.bolts;
  prefs.runs++;
  save();
  $('#result-eyebrow').textContent = newBest ? 'A NEW PERSONAL BEST' : 'ONE FOR THE BOOKS';
  $('#result-score').textContent = number(s.score);
  $('#result-distance').innerHTML = `${(s.distance / 1000).toFixed(2)} <small>KM</small>`;
  $('#result-bolts').textContent = String(s.bolts);
  $('#result-near').textContent = String(s.nearMisses);
  $('#result-best').textContent = `PERSONAL BEST ${number(prefs.bestScore)} PTS`;
  resultTimeout = setTimeout(() => {
    if (sim.state.status === 'crashed') $<HTMLDialogElement>('#results-dialog').showModal();
  }, 700);
}

$('#start').addEventListener('click', startRun);
$('#garage-start').addEventListener('click', startRun);
$('#retry').addEventListener('click', startRun);
$('#restart').addEventListener('click', startRun);
$('#pause').addEventListener('click', pauseRun);
$('#resume').addEventListener('click', resumeRun);
$('#pause-home').addEventListener('click', goHome);
$('#result-home').addEventListener('click', goHome);
$('#brand').addEventListener('click', () => {
  if (sim.state.status === 'playing') pauseRun();
  else if (sim.state.status === 'menu') setPanel('drive');
});
$('#sound').addEventListener('click', () => {
  void audio.unlock();
  setSound(!prefs.sound);
});
$('#sound-setting').addEventListener('click', () => {
  void audio.unlock();
  setSound(!prefs.sound);
});
$('#settings').addEventListener('click', () => showDialog('settings'));
$('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast('FULLSCREEN UNAVAILABLE', 'CONTINUE IN YOUR BROWSER');
  }
});
document.querySelectorAll<HTMLElement>('[data-panel]').forEach((el) =>
  el.addEventListener('click', () => {
    audio.play('click');
    setPanel(el.dataset.panel as 'drive' | 'garage');
  }),
);
document
  .querySelectorAll<HTMLElement>('[data-open]')
  .forEach((el) => el.addEventListener('click', () => showDialog(el.dataset.open!)));
document.querySelectorAll<HTMLButtonElement>('.dialog-close').forEach((el) =>
  el.addEventListener('click', () => {
    closeDialogs();
    if (sim.state.status === 'paused') $<HTMLDialogElement>('#pause-dialog').showModal();
  }),
);
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (dialog.id === 'results-dialog') goHome();
    else if (sim.state.status === 'paused') resumeRun();
    else dialog.close();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-car]').forEach((el) =>
  el.addEventListener('click', () => {
    prefs.car = el.dataset.car as 'roadster' | 'concept';
    save();
    refreshGarage();
    $('#systems').textContent = 'PREPARING YOUR MACHINE';
    void scene.loadCar(
      prefs.car === 'concept' ? 'CarConcept.glb' : 'reference/models/roadster_user.glb',
    );
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-paint]').forEach((el) =>
  el.addEventListener('click', () => {
    prefs.paint = Number(el.dataset.paint);
    scene.setPaint(prefs.paint);
    refreshGarage();
    save();
    audio.play('click');
  }),
);
$<HTMLSelectElement>('#quality').value = prefs.quality;
$('#quality').addEventListener('change', () => {
  prefs.quality = $<HTMLSelectElement>('#quality').value as Preferences['quality'];
  scene.setQuality(prefs.quality);
  save();
});

const controlCodes: Record<string, keyof Controls> = CONTROL_CODES;
window.addEventListener('keydown', (event) => {
  const interactive =
    event.target instanceof Element && Boolean(event.target.closest('button,select,input,a'));
  const action = keyAction(event.code, sim.state.status, anyDialog(), interactive);
  if (action === 'native') return;
  event.preventDefault();
  if (event.repeat) return;
  switch (action) {
    case 'mute':
      void audio.unlock();
      setSound(!prefs.sound);
      break;
    case 'start':
      startRun();
      break;
    case 'pause':
      pauseRun();
      break;
    case 'resume':
      resumeRun();
      break;
    case 'home':
      goHome();
      break;
    case 'close':
      closeDialogs();
      break;
    case 'control':
      keys.add(event.code);
      break;
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  clearInput();
  pauseRun();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInput();
    pauseRun();
  }
});
window.addEventListener('resize', () => scene.resize());

document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    if (sim.state.status !== 'playing') return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.control as keyof Controls);
    button.classList.add('pressed');
  });
  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    button.classList.remove('pressed');
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
});

function controls(): Controls {
  const result = { ...EMPTY_CONTROLS };
  for (const key of keys) if (controlCodes[key]) result[controlCodes[key]] = true;
  for (const control of pointers.values()) result[control] = true;
  return result;
}
const hud = {
  score: $('#score'),
  distance: $('#distance'),
  bolts: $('#bolts'),
  speed: $('#speed'),
  mode: $('#drive-mode'),
  combo: $('#combo'),
  comboFill: $('#combo-fill'),
  comboDisplay: $('#combo-display'),
  air: $('#air-fill'),
  airNumber: $('#air-number'),
  altitude: $('#altitude'),
  effects: $('#pickup-effects'),
};
let lastFrame = performance.now(),
  lastHud = 0,
  effectsKey = '';
function frame(now: number) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  sim.update(dt, controls());
  const s = sim.state;
  if (s.status === 'playing') {
    for (const event of s.events) {
      if (event.type === 'pickup') audio.play(event.label?.includes('BOLT') ? 'bolt' : 'pickup');
      if (event.type === 'roll') {
        audio.play('roll');
        speak('roll');
      }
      if (event.type === 'near-miss') {
        audio.play('nearMiss');
        speak('closeCall');
      }
      if (event.type === 'shield') audio.play('pickup');
      if (event.label && !event.label.includes('BOLT')) toast(event.label);
    }
    if (s.air < 18 && !lowAirAnnounced) {
      speak('airLow');
      lowAirAnnounced = true;
    }
    if (s.air > 40) lowAirAnnounced = false;
  }
  if (s.status === 'crashed' && lastStatus !== 'crashed') crash();
  lastStatus = s.status;
  scene.update(s, dt, panel === 'garage');
  audio.update(s.status === 'playing' ? s.speed : 0, s.boosting, s.y > 1);
  if (now - lastHud > 65 && s.status !== 'menu') {
    hud.score.textContent = number(s.score);
    hud.distance.textContent = `${(s.distance / 1000).toFixed(2)} KM`;
    hud.bolts.textContent = String(s.bolts);
    hud.speed.textContent = String(Math.round(s.speed * 3.6));
    hud.mode.textContent =
      s.rocket > 0
        ? 'ROCKET ASSIST'
        : s.y > 0.8
          ? 'FLIGHT MODE'
          : s.boosting
            ? 'THRUST ENGAGED'
            : 'ELECTRIC DRIVE';
    hud.combo.textContent = `×${s.combo * (s.double > 0 ? 2 : 1)}`;
    hud.comboFill.style.transform = `scaleX(${Math.min(1, s.comboTimer / 4)})`;
    hud.comboDisplay.classList.toggle('active', s.combo > 1);
    hud.air.style.transform = `scaleX(${s.air / 100})`;
    hud.air.classList.toggle('low', s.air < 20);
    hud.airNumber.innerHTML = `${Math.ceil(s.air)}<span>%</span>`;
    hud.altitude.textContent = s.y > 0.5 ? `${s.y.toFixed(1)} M ALTITUDE` : 'GROUND LEVEL';
    const speedAmount = Math.floor((s.speed / 86) * 16);
    document
      .querySelectorAll('.speed-bars i')
      .forEach((el, i) => el.classList.toggle('lit', i < speedAmount));
    const activeEffects = (['shield', 'magnet', 'double', 'rocket'] as const).filter(
      (key) => s[key] > 0,
    );
    const nextKey = activeEffects.map((key) => `${key}${Math.ceil(s[key])}`).join();
    if (nextKey !== effectsKey) {
      hud.effects.innerHTML = activeEffects
        .map(
          (key) =>
            `<span>${key === 'double' ? '2× POINTS' : key.toUpperCase()} <b>${Math.ceil(s[key])}s</b></span>`,
        )
        .join('');
      effectsKey = nextKey;
    }
    lastHud = now;
  }
  if (toastUntil && now > toastUntil) {
    $('#event-toast').classList.remove('show');
    toastUntil = 0;
  }
  requestAnimationFrame(frame);
}
document.body.dataset.mode = 'menu';
document.body.dataset.panel = 'drive';
refreshRecords();
refreshGarage();
setSound(prefs.sound);
requestAnimationFrame(frame);

window.addEventListener('pagehide', () => {
  music.pause();
  voice.pause();
  audio.dispose();
  scene.dispose();
});
