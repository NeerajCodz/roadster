import '@fontsource-variable/manrope';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './style.css';
import { Simulation, EMPTY_CONTROLS, type Controls } from './game/simulation';
import { GameRenderer } from './game/renderer';
import { GameAudio } from './game/audio';
import { CONTROL_CODES, keyAction } from './game/keyboard';
import { GestureInput } from './game/gestures';
import {
  BODY_COLORS,
  CARS,
  FACTORY,
  FINISHES,
  RIM_COLORS,
  STAT_ROWS,
  adjacentCar,
  carById,
  colorName,
  isDefaultLook,
  litSegments,
  lookSummary,
  sanitizeLook,
  shownBody,
  statFraction,
  type CarId,
  type CarLook,
  type CarSpec,
} from './game/cars';

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
  roller: '<path d="M4 4h13v5H4zM17 6.5h3v5.5h-9v2.5M10 14.5h2V21h-2z"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
  spin: '<path d="M8 16.4C4.9 15.7 3 14 3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5c0 2.2-3.2 4-7.5 4.4M11 14l3 2.5-3 2.5"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.arrow}</svg>`;
const brand = `<span class="brand-symbol"><i></i><i></i></span><span class="brand-word">ROASTER<span>SIM</span></span>`;

/* Showroom building blocks (class badges, stars, cards, swatches and stat bars). */
const SEGMENTS = 12;
const QUICK_PAINTS = [
  FACTORY,
  '#e9e6e0',
  '#d7ed65',
  '#0e0f11',
  '#b3121f',
  '#f2a71b',
  '#1f9aa6',
  '#2448c8',
];
const BODY_SWATCHES = [{ name: 'Factory', hex: FACTORY }, ...BODY_COLORS];
const tierBadge = (tier: string) =>
  `<span class="tier-badge" data-tier="${tier}" aria-hidden="true"><b>${tier}</b></span>`;
const stars = (count: number) =>
  `<span class="stars" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i${i < count ? ' class="on"' : ''}></i>`).join('')}</span>`;
/** Longer names drop a size so they hold one line on cards and in the info panel. */
const longName = (car: CarSpec) => (car.name.length > 9 ? ' data-long' : '');
const carCard = (car: CarSpec, index: number) =>
  `<button class="car-card" role="radio" aria-checked="false" tabindex="-1" data-car="${car.id}" style="--i:${index}" aria-label="${car.name} ${car.trim}, class ${car.tier}, ${car.stars} of 5 stars, rank ${car.rating}">
    <span class="card-top">${tierBadge(car.tier)}${stars(car.stars)}</span>
    <strong class="card-name"${longName(car)}><span>${car.name}</span></strong>
    <span class="card-meta"><span>${car.trim}</span><b><small>RANK</small>${car.rating}</b></span>
    <span class="card-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
    <span class="card-load" aria-hidden="true"></span>
  </button>`;
const swatch = (kind: 'body' | 'rim', { name, hex }: { name: string; hex: string }) =>
  `<button class="swatch${hex === FACTORY ? ' swatch-factory' : ''}" role="radio" aria-checked="false" tabindex="-1" data-${kind}="${hex}"${hex === FACTORY ? '' : ` style="--paint:${hex}"`} aria-label="${hex === FACTORY ? (kind === 'rim' ? 'Factory rims' : 'Factory colour') : name}" title="${name}"></button>`;
const statRow = ({ key, label, unit }: (typeof STAT_ROWS)[number]) =>
  `<div class="stat-row" data-stat="${key}"><dt>${label}</dt><dd><span class="stat-value"><b>0</b>${unit ? ` <small>${unit}</small>` : ''}</span><span class="seg-bar" aria-hidden="true">${Array.from({ length: SEGMENTS }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span></dd></div>`;
type Preferences = {
  sound: boolean;
  quality: 'high' | 'performance';
  car: CarId;
  /** Paint shop choices, remembered per car. */
  looks: Record<CarId, CarLook>;
  bestScore: number;
  bestDistance: number;
  bolts: number;
  runs: number;
};
const defaultLooks = () =>
  Object.fromEntries(CARS.map((car) => [car.id, { ...car.look }])) as Record<CarId, CarLook>;
const defaults: Preferences = {
  sound: true,
  quality: 'high',
  car: 'roadster',
  looks: defaultLooks(),
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
    car: carById(saved.car).id,
    looks: Object.fromEntries(
      CARS.map((car) => [car.id, sanitizeLook(saved.looks?.[car.id], car)]),
    ) as Record<CarId, CarLook>,
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
  <canvas id="scene" aria-label="3D Roaster Sim game" tabindex="-1"></canvas>
  <div class="film-grain" aria-hidden="true"></div>
  <div class="menu-shade" aria-hidden="true"></div>
  <header class="site-header">
    <button class="brand" id="brand" aria-label="Roaster Sim home">${brand}</button>
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

    <section class="garage-panel paint-shop" id="garage-panel" hidden aria-labelledby="garage-title">
      <div class="eyebrow"><span class="status-dot"></span> PAINT SHOP <span class="eyebrow-car" id="shop-car">/ ROADSTER</span></div>
      <h1 id="garage-title">MAKE IT <em>YOURS.</em></h1>
      <div class="shop-body">
        <div class="shop-spec"><span class="micro-label" id="shop-spec-label">CURRENT SPEC</span><strong id="shop-summary">FACTORY SPEC</strong><span class="shop-rim" id="shop-rim">RIMS · FACTORY</span></div>
        <div class="shop-tabs" role="tablist" aria-label="Paint category">
          <button class="shop-tab" role="tab" id="tab-body" data-tab="body" aria-selected="true" aria-controls="pane-body"><span id="tab-body-label">BODY</span></button>
          <button class="shop-tab" role="tab" id="tab-rims" data-tab="rims" aria-selected="false" aria-controls="pane-rims" tabindex="-1"><span>RIMS</span></button>
        </div>
        <div class="shop-panes">
        <div class="shop-pane" role="tabpanel" id="pane-body" aria-labelledby="tab-body">
          <div class="shop-field"><span class="micro-label" id="finish-label">FINISH <b id="finish-name">FACTORY</b></span>
            <div class="finish-chips" role="radiogroup" aria-labelledby="finish-label">${FINISHES.map(({ id, label }) => `<button class="finish-chip" role="radio" aria-checked="false" tabindex="-1" data-finish="${id}"><i class="finish-preview" aria-hidden="true"></i><span>${label}</span></button>`).join('')}</div>
          </div>
          <div class="shop-field"><span class="micro-label" id="body-label"><span id="body-kind">COLOUR</span> <b id="body-name">FACTORY</b></span>
            <div class="swatches swatch-grid" role="radiogroup" aria-labelledby="body-label">${BODY_SWATCHES.map((item) => swatch('body', item)).join('')}</div>
            <p class="shop-note" id="tint-note" hidden>RUSH ORIGINAL WEARS A BAKED LIVERY. COLOURS TINT IT RATHER THAN REPAINT IT.</p>
          </div>
        </div>
        <div class="shop-pane" role="tabpanel" id="pane-rims" aria-labelledby="tab-rims" hidden>
          <div class="shop-field"><span class="micro-label" id="rim-label">RIM COLOUR <b id="rim-name">FACTORY</b></span>
            <div class="swatches swatch-grid" id="rim-swatches" role="radiogroup" aria-labelledby="rim-label" aria-describedby="rim-note">${RIM_COLORS.map((item) => swatch('rim', item)).join('')}</div>
            <p class="shop-note" id="rim-note" hidden></p>
          </div>
        </div>
        </div>
        <div class="shop-actions">
          <button class="ghost-button" id="paint-reset" title="Back to the showroom spec">${icon('reset')}<span>RESET PAINT</span></button>
          <button class="primary-button" id="garage-start"><span>TAKE IT FOR A DRIVE</span>${icon('arrow')}</button>
        </div>
      </div>
    </section>
  </main>

  <div class="stage-loader" aria-hidden="true"><span>LOADING <b id="stage-loader-name">ROADSTER</b></span><i></i></div>
  <aside class="car-info" id="car-info" aria-labelledby="ci-name">
    <div class="ci-head"><span id="ci-tier">${tierBadge('S')}</span><span class="ci-class" id="ci-class">CLASS S</span><span id="ci-stars">${stars(5)}</span><span class="sr-only" id="ci-stars-text"></span></div>
    <h2 class="car-name" id="ci-name"><span>ROADSTER</span></h2>
    <p class="ci-trim"><b id="ci-trim">2026 · THRUST</b><span id="ci-tagline"></span></p>
    <div class="ci-rank"><span class="micro-label"><span class="ci-rank-pre">PERFORMANCE </span>RANK</span><strong id="ci-rank">0000</strong><button class="ci-toggle" id="ci-toggle" aria-expanded="false" aria-controls="ci-stats"><span>SPECS</span>${icon('down')}</button></div>
    <div class="ci-stats" id="ci-stats">
      <dl class="stat-list">${STAT_ROWS.map(statRow).join('')}</dl>
      <p class="ci-note">SHOWROOM FIGURES · EVERY CAR RUNS THE SAME ROAD</p>
    </div>
  </aside>

  <section class="showroom-dock" id="showroom-dock" aria-label="Showroom">
    <div class="dock-paint" id="dock-paint">
      <div class="dock-label"><span class="micro-label" id="quick-paint-label">QUICK PAINT</span><b id="quick-paint-name">FACTORY</b></div>
      <div class="dock-paint-row">
        <div class="swatches quick-swatches" role="radiogroup" aria-labelledby="quick-paint-label">${QUICK_PAINTS.map((hex) => swatch('body', { name: colorName(hex), hex })).join('')}</div>
        <button class="skew-button" id="customize"><span>${icon('roller')}<span class="skew-label">CUSTOMIZE</span></span></button>
      </div>
    </div>
    <div class="dock-garage">
      <div class="dock-label"><span class="micro-label" id="garage-label">SHOWROOM <span>/ ${String(CARS.length).padStart(2, '0')} MACHINES</span></span><span class="dock-status" id="dock-status" aria-hidden="true"></span><span class="spin-hint">${icon('spin')}<span>DRAG THE CAR TO SPIN IT</span></span></div>
      <div class="carousel">
        <button class="carousel-arrow" id="car-prev" aria-label="Previous car">${icon('left')}</button>
        <div class="carousel-track" id="car-track" role="radiogroup" aria-labelledby="garage-label">${CARS.map(carCard).join('')}</div>
        <button class="carousel-arrow" id="car-next" aria-label="Next car">${icon('right')}</button>
      </div>
    </div>
    <p class="sr-only" id="car-live" role="status" aria-live="polite"></p>
  </section>
  <footer class="site-footer" id="site-footer"><span><i class="tiny-dot"></i> <span id="systems">SYSTEMS ONLINE</span></span><span class="controls-preview"><span><kbd>A</kbd><kbd>D</kbd> STEER</span><span><kbd>SPACE</kbd> FLY</span><span><kbd>Q</kbd><kbd>E</kbd> AIR ROLL</span><span><kbd>SHIFT</kbd> BOOST</span></span><span>VOL. 01 <i class="footer-cross">＋</i></span></footer>

  <section class="game-hud" id="hud" hidden aria-label="Game status">
    <div class="hud-score"><span class="micro-label">SCORE</span><strong id="score">000000</strong><div><span id="distance">0.00 KM</span><span class="hud-bolts">${icon('bolt')}<b id="bolts">0</b></span></div></div>
    <div class="route-tag"><span class="status-dot"></span><span>PACIFIC COAST</span><b>NORTHBOUND / ∞</b></div>
    <div class="combo-display" id="combo-display"><span class="micro-label">MULTIPLIER</span><strong id="combo">×1</strong><div class="combo-track"><i id="combo-fill"></i></div></div>
    <div class="roll-status"><span class="micro-label">AIR BARREL ROLL</span><strong id="roll-ready">TAKE OFF</strong><div class="combo-track"><i id="roll-fill"></i></div></div>
    <div class="event-toast" id="event-toast" role="status"></div>
    <div class="pickup-effects" id="pickup-effects"></div>
    <div class="bottom-hud"><div class="speed-display"><strong id="speed">158</strong><div><span>KM/H</span><b id="drive-mode">ELECTRIC DRIVE</b></div><div class="speed-bars">${'<i></i>'.repeat(16)}</div></div><div class="air-display"><div><span>${icon('up')} THRUSTER ENERGY</span><strong id="air-number">100<span>%</span></strong></div><div class="air-track"><i id="air-fill"></i></div><p><kbd>SPACE</kbd> HOLD TO FLY <span id="altitude">GROUND LEVEL</span></p></div></div>
    <div class="game-key-hint"><kbd>W</kbd> BOOST <span>/</span> <kbd>S</kbd> DIVE <span>/</span> <kbd>Q</kbd> <kbd>E</kbd> AIR ROLL</div>
  </section>

  <div class="touch-controls" id="touch-controls" hidden>
    <div class="touch-steering"><button data-control="left" aria-label="Steer left">${icon('left')}</button><button data-control="right" aria-label="Steer right">${icon('right')}</button></div>
    <div class="touch-actions"><button data-control="rollLeft" aria-label="Roll left">${icon('roll')}<span>ROLL L</span></button><button data-control="dive" aria-label="Dive">${icon('up')}<span>DIVE</span></button><button data-control="rollRight" aria-label="Roll right">${icon('roll')}<span>ROLL R</span></button><button class="touch-fly" data-control="fly" aria-label="Hold to fly">${icon('up')}<span>FLY</span></button><button data-control="accelerate" aria-label="Boost">${icon('bolt')}<span>BOOST</span></button></div>
  </div>
  <div class="impact-flash" id="impact-flash" aria-hidden="true"></div>

  <dialog id="help-dialog" class="panel-dialog help-dialog">
    <button class="dialog-close icon-button" aria-label="Close how to play">${icon('close')}</button>
    <div class="eyebrow">DRIVER’S MANUAL / 01</div><h2>NO TRAFFIC.<br><em>JUST POSSIBILITIES.</em></h2><p class="dialog-intro">Go further. Get closer. Take the scenic route above it all.</p>
    <div class="manual-grid"><div><span>01</span><h3>FIND YOUR LINE</h3><p>Use <kbd>A</kbd> <kbd>D</kbd> or arrow keys to move between five lanes. Hold <kbd>W</kbd> or <kbd>SHIFT</kbd> for a boost.</p></div><div><span>02</span><h3>LEAVE THE ROAD</h3><p>Tap <kbd>SPACE</kbd> to hop. Hold it to fly. Release to descend, or hold <kbd>S</kbd> to dive. Energy refills on the ground.</p></div><div><span>03</span><h3>MAKE IT A CLOSE CALL</h3><p><kbd>Q</kbd> <kbd>E</kbd> barrel roll through danger while airborne. Chain near misses and collect bolts to build your score.</p></div><div><span>04</span><h3>GO THE EXTRA MILE</h3><p>Collect air, shields, magnets, double points and rockets. Sky traffic is real—keep watching ahead.</p></div></div>
    <p class="gesture-help">ON TOUCH: swipe to steer, hold the scene to fly, swipe down to dive, and double-tap in the air to barrel roll. The on-screen buttons work together, too.</p>
    <div class="manual-note"><span>${icon('shield')} AIR ROLL = BRIEF COLLISION PROTECTION</span><span><kbd>ESC</kbd> PAUSE &nbsp; <kbd>M</kbd> SOUND</span></div>
    <button class="primary-button dialog-close"><span>GOT IT. LET’S GO.</span>${icon('arrow')}</button>
  </dialog>

  <dialog id="settings-dialog" class="panel-dialog settings-dialog"><button class="dialog-close icon-button" aria-label="Close settings">${icon('close')}</button><div class="eyebrow">TUNE YOUR EXPERIENCE</div><h2>THE DETAILS<br><em>MATTER.</em></h2><div class="setting-row"><div><h3>SOUND</h3><p>Engine, soundtrack and the wind.</p></div><button class="toggle-button" id="sound-setting" role="switch" aria-checked="true">ON <i></i></button></div><div class="setting-row"><div><h3>GRAPHICS</h3><p>Find your balance of detail and speed.</p></div><select id="quality" aria-label="Graphics quality"><option value="high">HIGH QUALITY</option><option value="performance">PERFORMANCE</option></select></div><div class="settings-note">Your records, car and paint choices are saved on this device.<br>Three machines: the Roadster (2026), an original procedural build, plus the Rush Original and the Aero GT concept.</div><button class="text-button" data-open="credits">VIEW ASSET CREDITS ${icon('arrow')}</button></dialog>

  <dialog id="credits-dialog" class="panel-dialog credits-dialog"><button class="dialog-close icon-button" aria-label="Close credits">${icon('close')}</button><div class="eyebrow">UNDER THE HOOD</div><h2>GOOD COMPANY.</h2><p>The Roadster (2026) is an original procedural model built for Roaster Sim in tools/roadster. It uses no third-party assets, so no outside license applies.</p><p>Inspired by Roadster Rush. The Rush Original car, traffic, billboards, soundtrack, voices and Inter font were copied from the public reference at your request.</p><a href="https://roadster-rush.ai.studio/" target="_blank" rel="noopener noreferrer">Roadster Rush reference ${icon('arrow')}</a><p>Aero GT uses CarConcept by Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH, licensed CC BY 4.0. Paint and license plate materials modified.</p><a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept" target="_blank" rel="noopener noreferrer">CarConcept / Khronos ${icon('arrow')}</a><p>Venice Sunset HDR by Greg Zaal / Poly Haven, CC0. Manrope and Space Grotesk fonts under SIL OFL. Built with Three.js.</p><a href="https://polyhaven.com/a/venice_sunset" target="_blank" rel="noopener noreferrer">Poly Haven ${icon('arrow')}</a></dialog>

  <dialog id="pause-dialog" class="panel-dialog run-dialog"><div class="eyebrow"><span class="status-dot"></span> TAKE A BREATHER</div><h2>THE ROAD<br><em>CAN WAIT.</em></h2><p>Your run is right where you left it.</p><button class="primary-button" id="resume"><span>BACK TO THE DRIVE</span>${icon('arrow')}</button><button class="secondary-button" id="restart">START A FRESH RUN</button><button class="text-button" id="pause-home">BACK TO SHOWROOM</button></dialog>

  <dialog id="results-dialog" class="panel-dialog run-dialog results-dialog"><div class="eyebrow" id="result-eyebrow">ONE FOR THE BOOKS</div><h2>WHAT<br><em>A RIDE.</em></h2><span class="micro-label">FINAL SCORE</span><strong class="result-score" id="result-score">000000</strong><div class="result-stats"><div><span>DISTANCE</span><strong id="result-distance">0.00 <small>KM</small></strong></div><div><span>BOLTS</span><strong id="result-bolts">0</strong></div><div><span>NEAR MISSES</span><strong id="result-near">0</strong></div></div><p class="result-best" id="result-best"></p><button class="primary-button" id="retry"><span>ONE MORE RUN</span>${icon('arrow')}</button><button class="text-button" id="result-home">BACK TO SHOWROOM</button></dialog>
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
/** The car whose model is on screen, the one being fetched, and one that just failed to load. */
let shownCar: CarId | null = null;
let loadingCar: CarId | null = prefs.car;
let failedCar: CarId | null = null;
let announceCar = false;
let statusTimeout: ReturnType<typeof setTimeout> | undefined;
scene.onModelLoaded = (path) => carLoaded(path);
scene.onModelError = (path) => carFailed(path);
scene.setLook(prefs.looks[prefs.car]);
void scene.loadCar(carById(prefs.car).model);

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
let audioStarted = false;
let currentTrack: 'title' | 'run' | 'rocket' = 'run';
let peakCombo = 1;
const voiceUses = new Map<string, number>();
function unlockAudio() {
  audioStarted = true;
  void audio.unlock();
}
function track(name: typeof currentTrack, reset = false) {
  if (currentTrack !== name) {
    currentTrack = name;
    music.src = assetPath(`music/${name}.mp3`);
  }
  if (reset) music.currentTime = 0;
  if (prefs.sound && audioStarted) void music.play().catch(() => {});
}
const speak = (name: string, force = false) => {
  if (!prefs.sound || (!force && performance.now() - lastVoice < 5500)) return;
  lastVoice = performance.now();
  const count = ['start', 'closeCall', 'combo', 'roll', 'crash'].includes(name) ? 2 : 1;
  const use = voiceUses.get(name) ?? 0;
  voiceUses.set(name, use + 1);
  voice.src = assetPath(`voice/${name}_${use % count}.mp3`);
  void voice.play().catch(() => {});
};

const keys = new Set<string>();
const pointers = new Map<number, keyof Controls>();
const gestures = new GestureInput();
let panel: 'drive' | 'garage' = 'drive';
/** The menu panel a run was launched from, restored when the driver heads back. */
let runPanel: 'drive' | 'garage' = 'drive';
let lastStatus = sim.state.status;
let toastUntil = 0;
let resultTimeout: ReturnType<typeof setTimeout> | undefined;
let showroomDrag: { id: number; x: number; time: number } | null = null;
function endShowroomDrag() {
  if (!showroomDrag) return;
  // Holding still before letting go should not fling the car.
  if (performance.now() - showroomDrag.time > 90) scene.dragMenuYaw(0);
  showroomDrag = null;
  scene.releaseMenuYaw();
  document.body.classList.remove('spinning');
}
const clearInput = () => {
  endShowroomDrag();
  keys.clear();
  pointers.clear();
  gestures.reset();
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
/** Marks the matching radios checked and gives the group one tab stop (roving tabindex). */
function syncRadios(group: ParentNode, checked: (el: HTMLButtonElement) => boolean) {
  const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  let stop = radios.find((el) => !el.disabled && checked(el));
  stop ??= radios.find((el) => !el.disabled);
  for (const el of radios) {
    el.setAttribute('aria-checked', String(checked(el)));
    el.tabIndex = el === stop ? 0 : -1;
  }
}
/** Arrow keys, Home and End move through a radio group (or tab list) and select as they go. */
function arrowKeys(group: HTMLElement, role: 'radio' | 'tab') {
  const steps: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  group.addEventListener('keydown', (event) => {
    if (!(event.key in steps) && event.key !== 'Home' && event.key !== 'End') return;
    const items = [...group.querySelectorAll<HTMLButtonElement>(`[role="${role}"]:not(:disabled)`)];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (Math.max(current, 0) + steps[event.key] + items.length) % items.length;
    items[next].focus();
    items[next].click();
  });
}
const sameColor = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
function setDockStatus(kind: '' | 'loading' | 'error', text = '') {
  const status = $('#dock-status');
  status.dataset.kind = kind;
  status.textContent = text;
  document.body.classList.toggle('car-loading', kind === 'loading');
}
function announce(message: string) {
  // Clear first so repeating the same message is still read out.
  $('#car-live').textContent = '';
  requestAnimationFrame(() => ($('#car-live').textContent = message));
}
let infoCar: CarId | null = null;
function refreshShowroom() {
  const car = carById(prefs.car);
  const look = prefs.looks[car.id];
  const track = $('#car-track');
  syncRadios(track, (el) => el.dataset.car === car.id);
  track.querySelectorAll<HTMLElement>('[data-car]').forEach((el) => {
    el.classList.toggle('loading', el.dataset.car === loadingCar);
    el.classList.toggle('failed', el.dataset.car === failedCar);
  });
  // Car info panel: class badge, name, rank and segmented stat bars.
  if (infoCar !== car.id) {
    $('#ci-tier').innerHTML = tierBadge(car.tier);
    $('#ci-class').textContent = `CLASS ${car.tier}`;
    $('#ci-stars').innerHTML = stars(car.stars);
    $('#ci-stars-text').textContent = `${car.stars} of 5 stars`;
    $('#ci-name').innerHTML = `<span>${car.name}</span>`;
    $('#ci-name').toggleAttribute('data-long', longName(car) !== '');
    $('#ci-trim').textContent = car.trim;
    $('#ci-tagline').textContent = car.tagline;
    $('#ci-rank').textContent = String(car.rating);
    for (const { key, decimals } of STAT_ROWS) {
      const row = $(`.stat-row[data-stat="${key}"]`);
      row.querySelector('b')!.textContent = car.stats[key].toFixed(decimals);
      const lit = litSegments(statFraction(key, car.stats[key]), SEGMENTS);
      row.querySelectorAll('.seg-bar i').forEach((el, i) => el.classList.toggle('on', i < lit));
    }
    $('#car-info').dataset.tier = car.tier;
    // Restart the entry animation for the newly selected car.
    $('#car-info').classList.remove('swap');
    void $('#car-info').offsetWidth;
    $('#car-info').classList.add('swap');
    infoCar = car.id;
  }
  // Paint: quick swatches, the paint shop grid, finish chips and rims.
  document
    .querySelectorAll<HTMLElement>('.swatches[role="radiogroup"]:not(#rim-swatches)')
    .forEach((group) => syncRadios(group, (el) => sameColor(el.dataset.body, look.body)));
  syncRadios($('.finish-chips'), (el) => el.dataset.finish === look.finish);
  syncRadios($('#rim-swatches'), (el) => sameColor(el.dataset.rim, look.rim));
  const bodyName = colorName(look.body).toUpperCase();
  const finish = FINISHES.find(({ id }) => id === look.finish)!;
  // Paint picked while the next car is still on its way lands with it, so say so.
  const pending = loadingCar === car.id && shownCar !== null;
  $('#quick-paint-name').textContent = pending ? `${bodyName} · ON ARRIVAL` : bodyName;
  $('#body-name').textContent = bodyName;
  $('#finish-name').textContent = finish.label;
  $('#rim-name').textContent = car.rims ? colorName(look.rim, RIM_COLORS).toUpperCase() : 'N/A';
  // Swatches, finish previews and the spec chip show the car's own paint for Factory.
  document.body.style.setProperty('--factory', car.factoryHex);
  $('.paint-shop').style.setProperty('--paint', shownBody(look, car));
  $('#shop-car').textContent = `/ ${car.name} ${car.trim}`;
  $('#shop-summary').textContent = lookSummary(look);
  $('#shop-spec-label').textContent = pending
    ? `APPLIES WHEN ${car.name} ARRIVES`
    : car.tintOnly
      ? 'CURRENT TINT'
      : 'CURRENT SPEC';
  $('#shop-rim').textContent = car.rims
    ? `RIMS · ${colorName(look.rim, RIM_COLORS).toUpperCase()}`
    : 'RIMS · BAKED IN';
  $('#tab-body-label').textContent = car.tintOnly ? 'TINT' : 'BODY';
  $('#body-kind').textContent = car.tintOnly ? 'TINT' : 'COLOUR';
  $('#tint-note').hidden = !car.tintOnly;
  const rimGroup = $('#rim-swatches');
  rimGroup.setAttribute('aria-disabled', String(!car.rims));
  rimGroup.querySelectorAll<HTMLButtonElement>('button').forEach((el) => (el.disabled = !car.rims));
  syncRadios(rimGroup, (el) => sameColor(el.dataset.rim, look.rim));
  $('#rim-note').hidden = car.rims;
  $('#rim-note').textContent = car.rims
    ? ''
    : `THE ${car.name}'S WHEELS ARE PART OF ITS BAKED BODY, SO THERE IS NO SEPARATE RIM TO PAINT.`;
  // aria-disabled rather than disabled, so keyboard focus stays on the button after a reset.
  $('#paint-reset').setAttribute('aria-disabled', String(isDefaultLook(look, car)));
}
function setShopTab(tab: 'body' | 'rims') {
  for (const el of document.querySelectorAll<HTMLButtonElement>('.shop-tab')) {
    const selected = el.dataset.tab === tab;
    el.setAttribute('aria-selected', String(selected));
    el.tabIndex = selected ? 0 : -1;
  }
  $('#pane-body').hidden = tab !== 'body';
  $('#pane-rims').hidden = tab !== 'rims';
  scene.setShowroomFocus(tab === 'rims' ? 'wheels' : 'car');
}
/** Paint changes apply live and are remembered per car. */
function updateLook(change: Partial<CarLook>) {
  const car = carById(prefs.car);
  prefs.looks[car.id] = sanitizeLook({ ...prefs.looks[car.id], ...change }, car);
  // While another model is still loading, the outgoing car keeps its own paint.
  if (!loadingCar) scene.setLook(prefs.looks[car.id]);
  save();
  refreshShowroom();
  audio.play('click');
}
function selectCar(id: CarId) {
  const car = carById(id);
  if (car.id === prefs.car && (loadingCar === car.id || shownCar === car.id)) return;
  prefs.car = car.id;
  save();
  loadingCar = car.id;
  failedCar = null;
  announceCar = true;
  if (statusTimeout) clearTimeout(statusTimeout);
  setDockStatus('loading', `LOADING ${car.name}`);
  $('#stage-loader-name').textContent = car.name;
  $('#systems').textContent = 'PREPARING YOUR MACHINE';
  audio.play('click');
  refreshShowroom();
  scrollCardIntoView(car.id);
  void scene.loadCar(car.model);
}
function carLoaded(path: string) {
  const car = carById(prefs.car);
  if (path !== car.model) return;
  // Paint the new model as it lands, so the outgoing car never wears the incoming look.
  scene.setLook(prefs.looks[car.id]);
  shownCar = car.id;
  loadingCar = null;
  $('#systems').textContent = 'SYSTEMS ONLINE';
  if ($('#dock-status').dataset.kind === 'loading') setDockStatus('');
  document.body.classList.remove('car-loading');
  if (announceCar)
    announce(`${car.name} ${car.trim} ready. Class ${car.tier}, rank ${car.rating}.`);
  announceCar = false;
  refreshShowroom();
}
function carFailed(path: string) {
  const failed = carById(prefs.car);
  if (path !== failed.model) return;
  loadingCar = null;
  failedCar = failed.id;
  announceCar = false;
  // Back to the car on screen; on a failed first load, to the default car (already cached).
  const fallbackId =
    shownCar && shownCar !== failed.id ? shownCar : failed.id !== CARS[0].id ? CARS[0].id : null;
  const fallback = fallbackId ? carById(fallbackId) : null;
  const message = fallback
    ? `${failed.name} UNAVAILABLE · BACK IN ${fallback.name}`
    : `${failed.name} UNAVAILABLE`;
  setDockStatus('error', message);
  $('#systems').textContent = 'MODEL UNAVAILABLE';
  announce(
    `${failed.name} ${failed.trim} could not be loaded.${fallback ? ` ${shownCar ? 'Staying in' : 'Switching to'} ${fallback.name} ${fallback.trim}.` : ''}`,
  );
  if (fallback) {
    prefs.car = fallback.id;
    save();
    scene.setLook(prefs.looks[fallback.id]);
    if (!shownCar) {
      // Nothing is on screen yet, so the fallback is still a load to wait for.
      loadingCar = fallback.id;
      $('#stage-loader-name').textContent = fallback.name;
      document.body.classList.add('car-loading');
    }
    void scene.loadCar(fallback.model);
  }
  refreshShowroom();
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    failedCar = null;
    if ($('#dock-status').dataset.kind === 'error') setDockStatus('');
    refreshShowroom();
  }, 4500);
}
function scrollCardIntoView(id: CarId) {
  const track = $('#car-track');
  const card = track.querySelector<HTMLElement>(`[data-car="${id}"]`);
  if (!card || track.scrollWidth <= track.clientWidth) return;
  // The track is positioned, so offsetLeft is the card's place within its scrolling content.
  const left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
  track.scrollTo({
    left,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}
function setPanel(next: 'drive' | 'garage') {
  panel = next;
  $('#drive-panel').hidden = next !== 'drive';
  $('#garage-panel').hidden = next !== 'garage';
  document
    .querySelectorAll<HTMLElement>('[data-panel]')
    .forEach((el) => el.classList.toggle('active', el.dataset.panel === next));
  document.body.dataset.panel = next;
  const rims = $('#tab-rims').getAttribute('aria-selected') === 'true';
  scene.setShowroomFocus(next === 'garage' && rims ? 'wheels' : 'car');
  // The carousel narrows beside the paint shop; keep the chosen car in view.
  requestAnimationFrame(() => scrollCardIntoView(prefs.car));
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
    unlockAudio();
    track(sim.state.rocket > 0 ? 'rocket' : 'run');
  } else if (sim.state.status === 'menu' && audioStarted) {
    track('title');
  }
}
function startRun() {
  if (sim.state.status === 'menu') runPanel = panel;
  if (resultTimeout) clearTimeout(resultTimeout);
  closeDialogs();
  clearInput();
  sim.start();
  lastStatus = 'playing';
  lowAirAnnounced = false;
  peakCombo = 1;
  document.body.dataset.mode = 'playing';
  $('#hud').hidden = false;
  $('#touch-controls').hidden = false;
  $('#scene').focus({ preventScroll: true });
  unlockAudio();
  audio.play('start');
  if (prefs.sound) {
    track('run', true);
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
  if (prefs.sound && audioStarted) track('title');
  document.body.dataset.mode = 'menu';
  $('#hud').hidden = true;
  $('#touch-controls').hidden = true;
  setPanel(runPanel);
  refreshRecords();
  $(runPanel === 'garage' ? '#garage-start' : '#start').focus({ preventScroll: true });
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
  $('#result-best').textContent = `BEST ${number(prefs.bestScore)} PTS / PEAK CHAIN ×${peakCombo}`;
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
  unlockAudio();
  setSound(!prefs.sound);
});
$('#sound-setting').addEventListener('click', () => {
  unlockAudio();
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
// Showroom: car carousel, quick paint and the paint shop.
$('#car-track').addEventListener('click', (event) => {
  const card = (event.target as Element).closest<HTMLElement>('[data-car]');
  if (card) selectCar(carById(card.dataset.car).id);
});
$('#car-prev').addEventListener('click', () => selectCar(adjacentCar(prefs.car, -1)));
$('#car-next').addEventListener('click', () => selectCar(adjacentCar(prefs.car, 1)));
arrowKeys($('#car-track'), 'radio');
document.querySelectorAll<HTMLElement>('[role="radiogroup"]:not(#car-track)').forEach((group) => {
  arrowKeys(group, 'radio');
  group.addEventListener('click', (event) => {
    const el = (event.target as Element).closest<HTMLButtonElement>('[role="radio"]');
    if (!el || el.disabled || el.getAttribute('aria-checked') === 'true') return;
    if (el.dataset.body) updateLook({ body: el.dataset.body });
    else if (el.dataset.finish) updateLook({ finish: el.dataset.finish as CarLook['finish'] });
    else if (el.dataset.rim) updateLook({ rim: el.dataset.rim });
  });
});
arrowKeys($('.shop-tabs'), 'tab');
document
  .querySelectorAll<HTMLButtonElement>('.shop-tab')
  .forEach((el) =>
    el.addEventListener('click', () => setShopTab(el.dataset.tab as 'body' | 'rims')),
  );
$('#paint-reset').addEventListener('click', () => {
  if ($('#paint-reset').getAttribute('aria-disabled') === 'true') return;
  const car = carById(prefs.car);
  updateLook({ ...car.look });
  announce(`${car.name} paint reset to ${lookSummary(car.look).toLowerCase()}.`);
});
$('#customize').addEventListener('click', () => {
  audio.play('click');
  setPanel('garage');
  $<HTMLButtonElement>('.shop-tab[aria-selected="true"]').focus({ preventScroll: true });
});
$('#ci-toggle').addEventListener('click', () => {
  const open = $('#ci-toggle').getAttribute('aria-expanded') !== 'true';
  $('#ci-toggle').setAttribute('aria-expanded', String(open));
  $('#car-info').dataset.open = String(open);
});
// Keep the info panel parked just above the dock on compact layouts.
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    '--dock-h',
    `${Math.ceil($('#showroom-dock').getBoundingClientRect().height)}px`,
  ),
).observe($('#showroom-dock'));
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
      unlockAudio();
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
function pauseForFocusLoss() {
  clearInput();
  music.pause();
  voice.pause();
  pauseRun();
}
window.addEventListener('blur', pauseForFocusLoss);
window.addEventListener('focus', () => {
  if (!document.hidden && sim.state.status === 'menu' && prefs.sound && audioStarted)
    track('title');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForFocusLoss();
});
window.addEventListener('resize', () => {
  scene.resize();
  scrollCardIntoView(prefs.car);
});

const canvas = $<HTMLCanvasElement>('#scene');
canvas.addEventListener('pointerdown', (event) => {
  // In the showroom, dragging the scene spins the car on its turntable.
  if (sim.state.status === 'menu') {
    if (showroomDrag || anyDialog() || !event.isPrimary || event.button !== 0) return;
    if (event.pointerType === 'touch') event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    showroomDrag = { id: event.pointerId, x: event.clientX, time: performance.now() };
    document.body.classList.add('spinning');
    return;
  }
  if (event.pointerType !== 'touch' || sim.state.status !== 'playing') return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  gestures.begin(event.pointerId, event.clientX, event.clientY, performance.now());
});
canvas.addEventListener('pointermove', (event) => {
  if (showroomDrag?.id === event.pointerId) {
    const dx = event.clientX - showroomDrag.x;
    if (dx) scene.dragMenuYaw(dx * 0.008);
    showroomDrag.x = event.clientX;
    showroomDrag.time = performance.now();
    return;
  }
  if (event.pointerType !== 'touch') return;
  gestures.move(event.pointerId, event.clientX, event.clientY, performance.now());
});
const releaseShowroom = (event: PointerEvent) => {
  if (showroomDrag?.id !== event.pointerId) return false;
  endShowroomDrag();
  return true;
};
canvas.addEventListener('pointerup', (event) => {
  if (!releaseShowroom(event)) gestures.end(event.pointerId, performance.now());
});
canvas.addEventListener('pointercancel', (event) => {
  if (!releaseShowroom(event)) gestures.cancel(event.pointerId);
});
canvas.addEventListener('lostpointercapture', (event) => {
  if (!releaseShowroom(event)) gestures.cancel(event.pointerId);
});

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
  for (const [action, active] of Object.entries(gestures.read(performance.now()))) {
    if (active) result[action as keyof Controls] = true;
  }
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
  rollReady: $('#roll-ready'),
  rollFill: $('#roll-fill'),
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
    peakCombo = Math.max(peakCombo, s.combo * (s.double > 0 ? 2 : 1));
    const desiredTrack = s.rocket > 0 ? 'rocket' : 'run';
    if (desiredTrack !== currentTrack) track(desiredTrack);
    for (const event of s.events) {
      if (event.type === 'pickup') {
        audio.play(event.label?.includes('BOLT') ? 'bolt' : 'pickup');
        if (event.label?.includes('ROCKET')) speak('rocket', true);
      }
      if (event.type === 'roll') {
        audio.play('roll');
        speak('roll');
      }
      if (event.type === 'near-miss') {
        audio.play('nearMiss');
        speak('closeCall');
      }
      if (event.type === 'shield') audio.play('pickup');
      if (event.type === 'milestone') {
        audio.play('pickup');
        speak('milestone', true);
      }
      if (event.type === 'combo') speak('combo');
      if (event.type === 'big-air') speak('sky');
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
    const rollReadiness = sim.getRollReadiness();
    hud.rollReady.textContent =
      rollReadiness === 'grounded'
        ? 'TAKE OFF'
        : rollReadiness === 'low-air'
          ? 'LOW AIR'
          : rollReadiness === 'cooldown'
            ? `${s.rollCooldown.toFixed(1)}s`
            : 'READY';
    hud.rollFill.style.transform = `scaleX(${rollReadiness === 'grounded' || rollReadiness === 'low-air' ? 0 : 1 - Math.min(1, s.rollCooldown / 1.7)})`;
    for (const button of document.querySelectorAll<HTMLElement>(
      '[data-control="rollLeft"],[data-control="rollRight"]',
    ))
      button.classList.toggle('cooling', rollReadiness !== 'ready');
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
setShopTab('body');
refreshShowroom();
if (loadingCar) {
  setDockStatus('loading', `LOADING ${carById(loadingCar).name}`);
  $('#stage-loader-name').textContent = carById(loadingCar).name;
}
requestAnimationFrame(() => scrollCardIntoView(prefs.car));
setSound(prefs.sound);
requestAnimationFrame(frame);

window.addEventListener('pagehide', () => {
  music.pause();
  voice.pause();
  audio.dispose();
  scene.dispose();
});
