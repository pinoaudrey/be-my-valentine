(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });
  const overlay = document.getElementById("overlay");

  // Personalization
  const HER_NAME = "Leah";

  // 7 reasons
  const reasons = [
    "You make ordinary days feel like something I want to replay.",
    "Your laugh is basically my favorite sound effect.",
    "You are the person I want to tell everything to first.",
    "You somehow make errands feel like dates, which is suspiciously powerful.",
    "Inside joke placeholder, the one that makes you do the exact face you do.",
    "You are sweet, sharp, and you keep me honest in the best way.",
    "I like my life more with you in it, every single day."
  ];

  // Portrait emotion indices per reason
  // Portraits: 0=neutral, 1=smile, 2=grin, 3=big smile, 4=blushing, 5=thinking, 6=excited
  const EMOTION_MAP = [
    { audrey: 0, leah: 4 },
    { audrey: 6, leah: 2 },
    { audrey: 3, leah: 1 },
    { audrey: 0, leah: 5 },
    { audrey: 6, leah: 2 },
    { audrey: 4, leah: 3 },
    { audrey: 4, leah: 6 }
  ];

  /* ═══════════════════════════════════════════
     ASSET PRELOADER
     ═══════════════════════════════════════════ */
  const ASSET_PATHS = {
    leahWalk:        "assets/leah_cozy_sweater_outfit.png",
    leahPortraits:   "assets/leah_portraits.png",
    leahReaction:    "assets/leah_heart_reaction.png",
    audreyWalk:      "assets/audrey_casual_red_outfit.png",
    audreyPortraits: "assets/audrey_portraits.png",
    audreyReaction:  "assets/audrey_heart_reaction.png"
  };

  const sprites = {};
  let assetsLoaded = false;

  function loadAssets() {
    return new Promise(resolve => {
      const keys = Object.keys(ASSET_PATHS);
      let loaded = 0;
      const total = keys.length;
      keys.forEach(key => {
        const img = new Image();
        img.onload = () => {
          sprites[key] = img;
          loaded++;
          drawLoadingScreen(loaded / total);
          if (loaded === total) { assetsLoaded = true; resolve(); }
        };
        img.onerror = () => {
          // Count as loaded so we don't block the game
          loaded++;
          drawLoadingScreen(loaded / total);
          if (loaded === total) { assetsLoaded = true; resolve(); }
        };
        img.src = ASSET_PATHS[key];
      });
    });
  }

  function drawLoadingScreen(progress) {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a0f18");
    g.addColorStop(1, "#1a1030");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const fontSize = Math.max(16, scaleUnit * 0.025);
    ctx.font = `600 ${fontSize}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 120, 170, 0.9)";
    ctx.fillText(`Loading\u2026 ${Math.round(progress * 100)}%`, w / 2, h / 2 - 20);

    // Progress bar
    const barW = Math.min(280, w * 0.55);
    const barH = 6;
    const barX = (w - barW) / 2;
    const barY = h / 2 + 10;
    ctx.fillStyle = "rgba(255, 120, 170, 0.15)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "rgba(255, 120, 170, 0.8)";
    ctx.fillRect(barX, barY, barW * progress, barH);
    ctx.textAlign = "start";
  }

  /* ═══════════════════════════════════════════
     SPRITE GRID AUTO-DETECTION
     Scans pixel density to find actual character
     positions in AI-generated spritesheets.
     ═══════════════════════════════════════════ */
  function detectSpriteGrid(img) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, c.width, c.height).data;

    function isContent(i) {
      return data[i + 3] > 30 &&
        (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235);
    }

    // Column density
    const colD = new Float32Array(c.width);
    for (let x = 0; x < c.width; x++)
      for (let y = 0; y < c.height; y++)
        if (isContent((y * c.width + x) * 4)) colD[x]++;

    // Row density
    const rowD = new Float32Array(c.height);
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (isContent((y * c.width + x) * 4)) rowD[y]++;

    function findRuns(arr, thresh) {
      const runs = [];
      let inRun = false, start = 0;
      for (let i = 0; i <= arr.length; i++) {
        const v = i < arr.length ? arr[i] : 0;
        if (v > thresh && !inRun)  { inRun = true; start = i; }
        if (v <= thresh && inRun)  { runs.push({ start, end: i }); inRun = false; }
      }
      return runs;
    }

    // Merge runs with tiny gaps (< minGap px)
    function mergeRuns(runs, minGap) {
      if (runs.length === 0) return runs;
      const m = [{ ...runs[0] }];
      for (let i = 1; i < runs.length; i++) {
        const prev = m[m.length - 1];
        if (runs[i].start - prev.end < minGap) prev.end = runs[i].end;
        else m.push({ ...runs[i] });
      }
      return m;
    }

    // Detect columns: find content runs separated by empty gaps
    let colRuns = mergeRuns(findRuns(colD, 3), 8);
    // Detect rows
    let rowRuns = mergeRuns(findRuns(rowD, 3), 8);

    // Build frame rects: { x, w } for each column, { y, h } for each row
    const cols = colRuns.map(r => ({ x: r.start, w: r.end - r.start }));
    const rows = rowRuns.map(r => ({ y: r.start, h: r.end - r.start }));

    return { cols, rows };
  }

  /* ═══════════════════════════════════════════
     SPRITE ANIMATOR
     Supports both uniform grids and auto-detected grids.
     ═══════════════════════════════════════════ */
  class SpriteAnimator {
    /**
     * @param {HTMLImageElement} img
     * @param {number} cols – column count (uniform grid) or ignored if grid provided
     * @param {number} rows – row count (uniform grid) or ignored if grid provided
     * @param {object} [grid] – detected grid from detectSpriteGrid: {cols:[{x,w}],rows:[{y,h}]}
     */
    constructor(img, cols, rows, grid) {
      this.img = img;
      if (grid && grid.cols.length && grid.rows.length) {
        this.grid = grid;
        this.cols = grid.cols.length;
        this.rows = grid.rows.length;
      } else {
        this.grid = null;
        this.cols = cols;
        this.rows = rows;
      }
      this.frameW = img ? img.width / this.cols : 0;  // used for aspect ratio fallback
      this.frameH = img ? img.height / this.rows : 0;
      this.frame = 0;
      this.row = 0;
      this.elapsed = 0;
      this.fps = 15;
      this.playing = true;
      this.loop = true;
      this.startFrame = 0;
      this.onFinish = null;
    }

    update(dt) {
      if (!this.playing || !this.img) return;
      this.elapsed += dt;
      const dur = 1 / this.fps;
      while (this.elapsed >= dur) {
        this.elapsed -= dur;
        this.frame++;
        if (this.frame >= this.cols) {
          if (this.loop) {
            this.frame = this.startFrame;
          } else {
            this.frame = this.cols - 1;
            this.playing = false;
            if (this.onFinish) this.onFinish();
          }
        }
      }
    }

    draw(ctx, x, y, dw, dh, flipH) {
      if (!this.img) return;
      let sx, sy, sw, sh;
      if (this.grid) {
        const col = this.grid.cols[Math.min(this.frame, this.grid.cols.length - 1)];
        const row = this.grid.rows[Math.min(this.row,   this.grid.rows.length - 1)];
        sx = col.x; sw = col.w;
        sy = row.y; sh = row.h;
      } else {
        sx = this.frame * this.frameW;
        sy = this.row * this.frameH;
        sw = this.frameW;
        sh = this.frameH;
      }
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (flipH) {
        ctx.translate(x + dw, y);
        ctx.scale(-1, 1);
        ctx.drawImage(this.img, sx, sy, sw, sh, 0, 0, dw, dh);
      } else {
        ctx.drawImage(this.img, sx, sy, sw, sh, x, y, dw, dh);
      }
      ctx.restore();
    }

    setRow(r) {
      if (this.row !== r) {
        this.row = r;
        this.frame = this.startFrame;
        this.elapsed = 0;
      }
    }

    reset(play) {
      if (play === undefined) play = true;
      this.frame = this.startFrame;
      this.elapsed = 0;
      this.playing = play;
    }
  }

  /* ═══════════════════════════════════════════
     LAYOUT CONSTANTS
     ═══════════════════════════════════════════ */
  const WALK_COLS = 5, WALK_ROWS = 3;
  const PORTRAIT_COLS = 7;
  const REACTION_COLS = 4, REACTION_ROWS = 1;

  // Walk rows: 0=down, 1=left, 2=up   Right = flip row 1
  const DIR = { DOWN: 0, LEFT: 1, UP: 2, RIGHT: 3 };

  /* ═══════════════════════════════════════════
     STATE MACHINE
     ═══════════════════════════════════════════ */
  const State = {
    LOADING:        "loading",
    START:          "start",
    PLAYING:        "playing",
    HEART_REACTING: "heartReacting",
    SHOWING_REASON: "showingReason",
    FINAL_GATE:     "finalGate",
    ENDING_SCENE:   "endingScene",
    ENDING:         "ending"
  };

  let state = State.LOADING;

  /* ═══════════════════════════════════════════
     WORLD & ENTITIES
     ═══════════════════════════════════════════ */
  let w = 0, h = 0, dpr = 1, scaleUnit = 1;

  const player = { x: 0, y: 0, r: 12, speed: 0, tx: null, ty: null };
  const heart  = { x: 0, y: 0, r: 12, alive: false, bobT: 0 };

  let collected = 0;
  let lastHeartSpawned = false;
  let muted = false;
  const particles = [];

  /* ═══════════════════════════════════════════
     SPRITE STATE
     ═══════════════════════════════════════════ */
  let leahWalkAnim = null;
  let leahReactionAnim = null;
  let audreyWalkAnim = null;
  let audreyReactionAnim = null;

  let playerDir = DIR.DOWN;
  let playerMoving = false;
  let spriteH = 60, spriteW = 54;

  /* ── Input state ── */
  const keysDown = new Set();            // keyboard keys currently held
  const joy = { active: false, dx: 0, dy: 0, // virtual joystick direction vector
                cx: 0, cy: 0,            // joystick center (canvas coords)
                tx: 0, ty: 0,            // current touch point
                baseR: 0, knobR: 0 };    // sizes (set in resize)

  // Heart reaction overlay on canvas
  let heartReactTimer = 0;
  const HEART_REACT_DUR = 0.45;
  let heartReactX = 0, heartReactY = 0;

  // Ending scene
  let endingTimer = 0;
  let endingPhase = 0;
  let audreyEndX = 0, audreyEndY = 0;
  let leahEndX = 0, leahEndY = 0;
  const ENDING_WALK_DUR = 2.0;
  const ENDING_REACT_DUR = 1.0;

  // Background floating hearts
  const bgHearts = [];
  let bgTime = 0;

  function initBgHearts() {
    bgHearts.length = 0;
    for (let i = 0; i < 35; i++) {
      bgHearts.push({
        x: Math.random(),
        y: Math.random(),
        size: 3 + Math.random() * 5,
        speed: 0.02 + Math.random() * 0.04,
        alpha: 0.05 + Math.random() * 0.10,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  /* ═══════════════════════════════════════════
     RESIZE
     ═══════════════════════════════════════════ */
  function resize() {
    dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    w = Math.floor(window.innerWidth);
    h = Math.floor(window.innerHeight);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    scaleUnit = Math.min(w, h);

    player.r = Math.max(10, scaleUnit * 0.03);
    heart.r  = Math.max(10, scaleUnit * 0.028);
    // Speed tuned so walk animation stride matches movement distance
    player.speed = Math.max(120, scaleUnit * 0.34);

    // Virtual joystick sizing (bottom-left corner)
    joy.baseR = Math.max(36, scaleUnit * 0.07);
    joy.knobR = joy.baseR * 0.45;
    joy.cx = safeMargin() + joy.baseR + 16;
    joy.cy = h - safeMargin() - joy.baseR - 16;

    spriteH = Math.max(56, scaleUnit * 0.12);
    spriteW = spriteH * 0.65; // match detected walk frame aspect ratio (~125w/200h)

    const margin = safeMargin();
    if (!player.x && !player.y) {
      player.x = w * 0.5;
      player.y = h * 0.60;
      player.tx = player.x;
      player.ty = player.y;
    }
    player.x = clamp(player.x, margin, w - margin);
    player.y = clamp(player.y, margin, h - margin);
    if (player.tx != null) player.tx = clamp(player.tx, margin, w - margin);
    if (player.ty != null) player.ty = clamp(player.ty, margin, h - margin);
    if (heart.alive) {
      heart.x = clamp(heart.x, margin, w - margin);
      heart.y = clamp(heart.y, margin, h - margin);
    }
    if (state !== State.LOADING) renderOverlayForState();
  }

  /* ═══════════════════════════════════════════
     UTILITY
     ═══════════════════════════════════════════ */
  function safeMargin() { return Math.max(16, scaleUnit * 0.06); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function spawnHeart() {
    const margin = safeMargin();
    const minP = player.r * 5.2;
    const minH = heart.r * 4;
    let tries = 0, nx, ny;
    do {
      nx = rand(margin, w - margin);
      ny = rand(margin, h - margin);
      if (dist(nx, ny, player.x, player.y) > minP &&
          (!heart.alive || dist(nx, ny, heart.x, heart.y) > minH)) break;
      tries++;
    } while (tries < 80);
    heart.x = nx; heart.y = ny; heart.bobT = 0; heart.alive = true;
  }

  /* ═══════════════════════════════════════════
     STATE MANAGEMENT
     ═══════════════════════════════════════════ */
  function setState(next) {
    state = next;
    // Clear movement inputs on state change
    player.tx = null; player.ty = null;
    playerMoving = false;
    renderOverlayForState();
  }

  function showOverlay(html) {
    overlay.innerHTML = html;
    overlay.classList.add("show");
    wireOverlayButtons();
  }

  function hideOverlay() {
    overlay.classList.remove("show");
    overlay.innerHTML = "";
  }

  /* ── Portrait auto-detection & helper ── */
  // Cache detected frame rects per sheet key: { x, w }[]
  const portraitFrameCache = {};

  function detectPortraitFrames(img) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, c.width, c.height).data;

    // Build column density: count non-white non-transparent pixels per column
    const raw = new Float32Array(c.width);
    for (let x = 0; x < c.width; x++) {
      let count = 0;
      for (let y = 0; y < c.height; y++) {
        const i = (y * c.width + x) * 4;
        const a = data[i + 3];
        if (a > 30 && (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235)) count++;
      }
      raw[x] = count;
    }

    // Smooth with window of ±5px
    const smooth = new Float32Array(c.width);
    for (let x = 0; x < c.width; x++) {
      let sum = 0, n = 0;
      for (let dx = -5; dx <= 5; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < c.width) { sum += raw[xx]; n++; }
      }
      smooth[x] = sum / n;
    }

    // Find content bounds
    let cStart = 0, cEnd = c.width - 1;
    while (cStart < c.width && smooth[cStart] < 3) cStart++;
    while (cEnd > cStart && smooth[cEnd] < 3) cEnd--;

    // Find local minima (valleys between faces) in content region
    const allMinima = [];
    for (let x = cStart + 20; x < cEnd - 20; x++) {
      let isMin = true;
      for (let dx = -10; dx <= 10; dx++) {
        if (smooth[x + dx] < smooth[x]) { isMin = false; break; }
      }
      if (isMin) {
        // Only keep if not too close to previous
        if (allMinima.length === 0 || x - allMinima[allMinima.length - 1].x > 60) {
          allMinima.push({ x, d: smooth[x] });
        }
      }
    }

    // We need N-1 valleys for N portraits
    const needed = PORTRAIT_COLS - 1;
    let valleys;
    if (allMinima.length >= needed) {
      // Sort by density (shallowest last) and take the deepest N-1
      valleys = allMinima.sort((a, b) => a.d - b.d).slice(0, needed)
        .sort((a, b) => a.x - b.x).map(m => m.x);
    } else {
      // Fallback: uniform grid within content bounds
      const fw = (cEnd - cStart) / PORTRAIT_COLS;
      valleys = [];
      for (let i = 1; i < PORTRAIT_COLS; i++) valleys.push(Math.round(cStart + i * fw));
    }

    // Build frames from valleys
    const frames = [];
    const edges = [cStart, ...valleys, cEnd];
    for (let i = 0; i < edges.length - 1; i++) {
      frames.push({ x: edges[i], w: edges[i + 1] - edges[i] });
    }
    return frames;
  }

  function getPortraitDataURL(sheetKey, frameIdx) {
    const img = sprites[sheetKey];
    if (!img) return "";

    // Detect & cache frame positions for this sheet
    if (!portraitFrameCache[sheetKey]) {
      portraitFrameCache[sheetKey] = detectPortraitFrames(img);
    }
    const frames = portraitFrameCache[sheetKey];
    const frame = frames[Math.min(frameIdx, frames.length - 1)];
    if (!frame) return "";

    // Add small horizontal padding (5% of frame width) for safety
    const padX = Math.floor(frame.w * 0.05);
    const cropX = frame.x + padX;
    const cropW = frame.w - padX * 2;

    // Crop vertically to content region (skip top/bottom whitespace)
    const cropTop = Math.floor(img.height * 0.22);
    const cropH   = Math.floor(img.height * 0.60);

    const tmp = document.createElement("canvas");
    tmp.width  = Math.ceil(cropW);
    tmp.height = Math.ceil(cropH);
    const tc = tmp.getContext("2d");
    tc.imageSmoothingEnabled = false;
    tc.drawImage(img,
      cropX, cropTop, cropW, cropH,
      0, 0, Math.ceil(cropW), Math.ceil(cropH));
    return tmp.toDataURL();
  }

  /* ═══════════════════════════════════════════
     OVERLAY RENDERING
     ═══════════════════════════════════════════ */
  function renderOverlayForState() {
    // States with no overlay
    if (state === State.LOADING || state === State.PLAYING ||
        state === State.HEART_REACTING || state === State.ENDING_SCENE) {
      hideOverlay();
      return;
    }

    if (state === State.START) {
      showOverlay(`
        <div class="card">
          <div class="h1">Hey ${HER_NAME} <span class="heart-icon">\u2665</span></div>
          <p class="p">Collect all 7 hearts. Each one has a reason.</p>
          <div class="row">
            <button class="btn" data-action="start">Play</button>
            <button class="btn secondary" data-action="how">How to play</button>
          </div>
          <p class="p small" style="margin-top:12px">Tip: use arrow keys, WASD, the joystick, or tap to move.</p>
        </div>
      `);
      return;
    }

    if (state === State.SHOWING_REASON) {
      const reasonText = reasons[collected - 1] || "You found a heart.";
      const emotions = EMOTION_MAP[collected - 1] || { audrey: 0, leah: 0 };
      const ap = getPortraitDataURL("audreyPortraits", emotions.audrey);
      const lp = getPortraitDataURL("leahPortraits",  emotions.leah);
      showOverlay(`
        <div class="card dialogue-card">
          <div class="dialogue-header">Heart ${collected} of ${reasons.length}</div>
          <div class="dialogue-body">
            <div class="portrait-slot">
              ${ap ? `<img class="portrait" src="${ap}" alt="Audrey">` : ""}
              <span class="portrait-name">Audrey</span>
            </div>
            <div class="dialogue-text">
              <p class="dialogue-reason">\u201C${escapeHtml(reasonText)}\u201D</p>
            </div>
            <div class="portrait-slot">
              ${lp ? `<img class="portrait" src="${lp}" alt="Leah">` : ""}
              <span class="portrait-name">Leah</span>
            </div>
          </div>
          <div class="row" style="justify-content:center">
            <button class="btn" data-action="nextReason">Next</button>
          </div>
        </div>
      `);
      return;
    }

    if (state === State.FINAL_GATE) {
      showOverlay(`
        <div class="card">
          <div class="h1">One last heart <span class="heart-icon">\u2665</span></div>
          <p class="p">It is shy. It will not appear until you click a promise.</p>
          <div class="row">
            <button class="btn" data-action="promiseYes">I promise to say yes</button>
            <button class="btn secondary" data-action="fineShow">Fine, show me</button>
          </div>
        </div>
      `);
      return;
    }

    if (state === State.ENDING) {
      showOverlay(`
        <div class="card">
          <div class="h1">Leah, will you be my Valentine? <span class="heart-icon">\u2665</span></div>
          <p class="p">No pressure. Except yes, pressure. Romantic pressure.</p>
          <div class="row">
            <button class="btn" data-action="yes">Yes</button>
            <button class="btn secondary" data-action="yesAlso">Absolutely yes</button>
          </div>
        </div>
      `);
      return;
    }
  }

  function wireOverlayButtons() {
    overlay.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", e => {
        handleAction(e.currentTarget.getAttribute("data-action"));
      }, { passive: true });
    });
  }

  function handleAction(action) {
    if (action === "how") {
      showOverlay(`
        <div class="card">
          <div class="h1">How to play</div>
          <p class="p">Use arrow keys / WASD, the on-screen joystick, or tap to move. Collect the heart. Read the reason. Repeat.</p>
          <div class="row">
            <button class="btn" data-action="backToStart">Got it</button>
          </div>
        </div>
      `);
      return;
    }

    if (action === "backToStart") { setState(State.START); return; }
    if (action === "start")       { startGame(); return; }

    if (action === "nextReason") {
      if (collected === reasons.length - 1 && !lastHeartSpawned) {
        setState(State.FINAL_GATE);
        return;
      }
      if (collected >= reasons.length) {
        startEndingScene();
        return;
      }
      setState(State.PLAYING);
      spawnHeart();
      return;
    }

    if (action === "promiseYes" || action === "fineShow") {
      lastHeartSpawned = true;
      setState(State.PLAYING);
      spawnHeart();
      return;
    }

    if (action === "yes" || action === "yesAlso") {
      popConfettiBurst(w * 0.5, h * 0.45, 120);
      const ap = getPortraitDataURL("audreyPortraits", 4);
      const lp = getPortraitDataURL("leahPortraits",  1);
      showOverlay(`
        <div class="card dialogue-card">
          <div class="h1">Correct answer <span class="heart-icon">\u2665</span></div>
          <div class="dialogue-body" style="margin-bottom:14px">
            <div class="portrait-slot">
              ${ap ? `<img class="portrait" src="${ap}" alt="Audrey">` : ""}
            </div>
            <div class="dialogue-text">
              <p class="dialogue-reason">Happy Valentine\u2019s Day, ${HER_NAME}. I am taking you on a proper date.</p>
              <p class="p small" style="margin-top:8px">Now screenshot this and hold it over my head forever.</p>
            </div>
            <div class="portrait-slot">
              ${lp ? `<img class="portrait" src="${lp}" alt="Leah">` : ""}
            </div>
          </div>
          <div class="row" style="justify-content:center">
            <button class="btn" data-action="restart">Play again</button>
          </div>
        </div>
      `);
      return;
    }

    if (action === "restart") {
      resetGame();
      setState(State.START);
      return;
    }
  }

  function startGame() {
    resetGame();
    setState(State.PLAYING);
    spawnHeart();
  }

  function resetGame() {
    collected = 0;
    lastHeartSpawned = false;
    heart.alive = false;
    particles.length = 0;
    player.x  = w * 0.5;
    player.y  = h * 0.60;
    player.tx = player.x;
    player.ty = player.y;
    playerDir = DIR.DOWN;
    playerMoving = false;
    endingTimer = 0;
    endingPhase = 0;
  }

  /* ═══════════════════════════════════════════
     ENDING SCENE
     ═══════════════════════════════════════════ */
  function startEndingScene() {
    endingTimer = 0;
    endingPhase = 0;
    const cy = h * 0.55;
    audreyEndX = -spriteW * 2;
    audreyEndY = cy;
    leahEndX   = w + spriteW * 2;
    leahEndY   = cy;

    // Audrey walks right (side-row, not flipped since row faces right)
    if (audreyWalkAnim) {
      audreyWalkAnim.setRow(1);
      audreyWalkAnim.startFrame = 1;
      audreyWalkAnim.fps = 15;
      audreyWalkAnim.reset();
    }
    // Leah walks left (side-row, flipped to face left)
    if (leahWalkAnim) {
      leahWalkAnim.setRow(1);
      leahWalkAnim.startFrame = 1;
      leahWalkAnim.fps = 15;
      leahWalkAnim.reset();
    }
    // Reactions start paused
    if (leahReactionAnim) {
      leahReactionAnim.loop = false;
      leahReactionAnim.startFrame = 0;
      leahReactionAnim.reset(false);
    }
    if (audreyReactionAnim) {
      audreyReactionAnim.loop = false;
      audreyReactionAnim.startFrame = 0;
      audreyReactionAnim.reset(false);
    }

    setState(State.ENDING_SCENE);
  }

  function updateEndingScene(dt) {
    endingTimer += dt;
    const cx  = w * 0.5;
    const gap = spriteW * 0.6;

    if (endingPhase === 0) {
      // Walk toward center
      const t = Math.min(endingTimer / ENDING_WALK_DUR, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      audreyEndX = lerp(-spriteW * 2, cx - gap - spriteW, ease);
      leahEndX   = lerp(w + spriteW * 2, cx + gap, ease);

      if (audreyWalkAnim) audreyWalkAnim.update(dt);
      if (leahWalkAnim)   leahWalkAnim.update(dt);

      if (t >= 1) {
        endingPhase = 1;
        endingTimer = 0;
        if (leahReactionAnim)   leahReactionAnim.reset(true);
        if (audreyReactionAnim) audreyReactionAnim.reset(true);
      }
    } else if (endingPhase === 1) {
      // Play heart reactions
      if (leahReactionAnim)   leahReactionAnim.update(dt);
      if (audreyReactionAnim) audreyReactionAnim.update(dt);

      if (endingTimer >= ENDING_REACT_DUR) {
        endingPhase = 2;
        endingTimer = 0;
        popConfettiBurst(cx, h * 0.35, 100);
      }
    } else if (endingPhase === 2) {
      // Confetti pause, then show final card
      if (endingTimer >= 0.6) {
        setState(State.ENDING);
      }
    }
  }

  function drawEndingScene() {
    if (endingPhase === 0) {
      // Phase 0: Walk animations
      if (audreyWalkAnim && sprites.audreyWalk) {
        audreyWalkAnim.draw(ctx, audreyEndX, audreyEndY - spriteH, spriteW, spriteH, false);
      }
      if (leahWalkAnim && sprites.leahWalk) {
        leahWalkAnim.draw(ctx, leahEndX, leahEndY - spriteH, spriteW, spriteH, true);
      }
    } else {
      // Phase 1+: Show idle walk sprites with reaction sprites above
      // Draw idle walk sprites (front-facing, frame 0 row 0)
      if (sprites.audreyWalk) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        const fw = sprites.audreyWalk.width / WALK_COLS;
        const fh = sprites.audreyWalk.height / WALK_ROWS;
        ctx.drawImage(sprites.audreyWalk, 0, 0, fw, fh,
          audreyEndX, audreyEndY - spriteH, spriteW, spriteH);
        ctx.restore();
      }
      if (sprites.leahWalk) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        const fw = sprites.leahWalk.width / WALK_COLS;
        const fh = sprites.leahWalk.height / WALK_ROWS;
        ctx.drawImage(sprites.leahWalk, 0, 0, fw, fh,
          leahEndX, leahEndY - spriteH, spriteW, spriteH);
        ctx.restore();
      }

      // Draw reaction animations above the walk sprites
      if (endingPhase >= 1) {
        const rH = spriteH * 1.6;
        const rAR = getFrameAspect(leahReactionAnim);
        const rW = rH * rAR;

        if (audreyReactionAnim && sprites.audreyReaction) {
          audreyReactionAnim.draw(ctx,
            audreyEndX + (spriteW - rW) * 0.5,
            audreyEndY - spriteH - rH * 0.55,
            rW, rH, false);
        }
        if (leahReactionAnim && sprites.leahReaction) {
          leahReactionAnim.draw(ctx,
            leahEndX + (spriteW - rW) * 0.5,
            leahEndY - spriteH - rH * 0.55,
            rW, rH, false);
        }
      }
    }
  }

  /* ═══════════════════════════════════════════
     INPUT — Keyboard, Virtual Joystick, Tap-to-move
     ═══════════════════════════════════════════ */

  // ── Keyboard ──
  document.addEventListener("keydown", e => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"].includes(e.key)) {
      e.preventDefault();
      keysDown.add(e.key);
    }
  });
  document.addEventListener("keyup", e => {
    keysDown.delete(e.key);
  });

  function getKeyboardDir() {
    let dx = 0, dy = 0;
    if (keysDown.has("ArrowLeft")  || keysDown.has("a")) dx -= 1;
    if (keysDown.has("ArrowRight") || keysDown.has("d")) dx += 1;
    if (keysDown.has("ArrowUp")    || keysDown.has("w")) dy -= 1;
    if (keysDown.has("ArrowDown")  || keysDown.has("s")) dy += 1;
    if (dx === 0 && dy === 0) return null;
    const len = Math.hypot(dx, dy);
    return { dx: dx / len, dy: dy / len };
  }

  // ── Virtual Joystick (touch) ──
  let joyTouchId = null;

  function isInsideJoystick(cx, cy) {
    return dist(cx, cy, joy.cx, joy.cy) <= joy.baseR * 1.4;
  }

  function updateJoystickFromTouch(cx, cy) {
    const dx = cx - joy.cx;
    const dy = cy - joy.cy;
    const d  = Math.hypot(dx, dy);
    const maxDist = joy.baseR * 0.85;
    if (d > 1) {
      joy.dx = dx / d;
      joy.dy = dy / d;
      const clamped = Math.min(d, maxDist);
      joy.tx = joy.cx + joy.dx * clamped;
      joy.ty = joy.cy + joy.dy * clamped;
    } else {
      joy.dx = 0; joy.dy = 0;
      joy.tx = joy.cx; joy.ty = joy.cy;
    }
    joy.active = true;
  }

  canvas.addEventListener("touchstart", e => {
    if (state !== State.PLAYING) return;
    for (const touch of e.changedTouches) {
      const rect = canvas.getBoundingClientRect();
      const cx = touch.clientX - rect.left;
      const cy = touch.clientY - rect.top;
      if (isInsideJoystick(cx, cy)) {
        joyTouchId = touch.identifier;
        updateJoystickFromTouch(cx, cy);
        e.preventDefault();
        return;
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", e => {
    if (state !== State.PLAYING) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier === joyTouchId) {
        const rect = canvas.getBoundingClientRect();
        updateJoystickFromTouch(touch.clientX - rect.left, touch.clientY - rect.top);
        e.preventDefault();
        return;
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchend", e => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === joyTouchId) {
        joyTouchId = null;
        joy.active = false;
        joy.dx = 0; joy.dy = 0;
        joy.tx = joy.cx; joy.ty = joy.cy;
        return;
      }
    }
  }, { passive: true });

  canvas.addEventListener("touchcancel", e => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === joyTouchId) {
        joyTouchId = null;
        joy.active = false;
        joy.dx = 0; joy.dy = 0;
        joy.tx = joy.cx; joy.ty = joy.cy;
        return;
      }
    }
  }, { passive: true });

  // ── Tap / Click to move (fallback) ──
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const margin = safeMargin();
    return {
      x: clamp(e.clientX - rect.left, margin, w - margin),
      y: clamp(e.clientY - rect.top,  margin, h - margin)
    };
  }

  function onPointerDown(e) {
    if (state !== State.PLAYING) return;
    // Don't set tap target if using joystick touch
    if (e.pointerType === "touch") {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (isInsideJoystick(cx, cy)) return;
    }
    const pos = getCanvasPos(e);
    player.tx = pos.x;
    player.ty = pos.y;
  }

  document.addEventListener("touchmove", e => {
    if (state === State.PLAYING) e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });

  // Mute button
  const corner = document.createElement("div");
  corner.className = "corner";
  corner.innerHTML = `<button class="iconBtn" id="muteBtn" aria-label="toggle sound">\uD83D\uDD07</button>`;
  document.body.appendChild(corner);
  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = muted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
  });

  /* ═══════════════════════════════════════════
     GAME LOOP
     ═══════════════════════════════════════════ */
  let lastT = performance.now();

  function loop(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    bgTime += dt;

    if (heart.alive) heart.bobT += dt * 3.2;

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 520 * dt;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Heart reaction on canvas
    if (state === State.HEART_REACTING) {
      heartReactTimer += dt;
      if (leahReactionAnim) leahReactionAnim.update(dt);
      if (heartReactTimer >= HEART_REACT_DUR) {
        setState(State.SHOWING_REASON);
      }
      return;
    }

    // Ending scene
    if (state === State.ENDING_SCENE) {
      updateEndingScene(dt);
      return;
    }

    if (state !== State.PLAYING) return;

    // ── Determine movement direction (priority: keyboard > joystick > tap-to-move) ──
    let moveX = 0, moveY = 0;
    const kdir = getKeyboardDir();
    if (kdir) {
      // Keyboard: clear any tap target so it doesn't fight
      player.tx = null; player.ty = null;
      moveX = kdir.dx;
      moveY = kdir.dy;
    } else if (joy.active && (joy.dx !== 0 || joy.dy !== 0)) {
      player.tx = null; player.ty = null;
      moveX = joy.dx;
      moveY = joy.dy;
    } else if (player.tx != null && player.ty != null) {
      // Tap-to-move
      const dx = player.tx - player.x;
      const dy = player.ty - player.y;
      const d  = Math.hypot(dx, dy);
      if (d > 2) {
        moveX = dx / d;
        moveY = dy / d;
      }
    }

    // ── Apply movement ──
    if (moveX !== 0 || moveY !== 0) {
      playerMoving = true;
      const step = player.speed * dt;
      const margin = safeMargin();
      player.x = clamp(player.x + moveX * step, margin, w - margin);
      player.y = clamp(player.y + moveY * step, margin, h - margin);

      // Direction detection (favour horizontal for diagonals)
      if (Math.abs(moveY) > Math.abs(moveX) * 1.2) {
        playerDir = moveY > 0 ? DIR.DOWN : DIR.UP;
      } else {
        playerDir = moveX > 0 ? DIR.RIGHT : DIR.LEFT;
      }
    } else {
      playerMoving = false;
    }

    // Update walk animation
    if (leahWalkAnim) {
      if (playerMoving) {
        leahWalkAnim.startFrame = 1;
        const row = playerDir === DIR.DOWN ? 0 : playerDir === DIR.UP ? 2 : 1;
        leahWalkAnim.setRow(row);
        // Snap out of idle frame instantly when starting to walk
        if (leahWalkAnim.frame < 1) {
          leahWalkAnim.frame = 1;
          leahWalkAnim.elapsed = 0;
        }
        leahWalkAnim.update(dt);
      } else {
        // Idle — show frame 0 immediately
        const row = playerDir === DIR.DOWN ? 0 : playerDir === DIR.UP ? 2 : 1;
        leahWalkAnim.row = row;
        leahWalkAnim.frame = 0;
        leahWalkAnim.elapsed = 0;
      }
    }

    // Check collision
    if (heart.alive) {
      const bobOff = Math.sin(heart.bobT) * (heart.r * 0.22);
      const hx = heart.x;
      const hy = heart.y + bobOff;

      if (dist(player.x, player.y, hx, hy) <= (player.r + heart.r) * 1.2) {
        heart.alive = false;
        collected++;
        if (navigator.vibrate) navigator.vibrate(18);
        popConfettiBurst(hx, hy, 26);

        // Start on-canvas heart reaction
        heartReactTimer = 0;
        heartReactX = player.x;
        heartReactY = player.y;
        if (leahReactionAnim) {
          leahReactionAnim.loop = false;
          leahReactionAnim.startFrame = 0;
          leahReactionAnim.fps = REACTION_COLS / HEART_REACT_DUR;
          leahReactionAnim.reset();
        }
        setState(State.HEART_REACTING);
      }
    }
  }

  /* ═══════════════════════════════════════════
     DRAW
     ═══════════════════════════════════════════ */
  function draw() {
    ctx.clearRect(0, 0, w, h);
    drawBackground();
    drawHud();

    // Heart
    if (heart.alive) {
      const bobOff = Math.sin(heart.bobT) * (heart.r * 0.22);
      drawHeart(heart.x, heart.y + bobOff, heart.r);
    }

    // Player
    if (state === State.PLAYING || state === State.HEART_REACTING) {
      drawPlayer(player.x, player.y);
    }

    // (Heart reaction sprite removed — confetti burst is the visual cue instead)

    // Ending scene
    if (state === State.ENDING_SCENE) {
      drawEndingScene();
    }

    drawParticles();
  }

  /* ── Drawing helpers ── */

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a0f18");
    g.addColorStop(1, "#1a1030");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Floating mini hearts (parallax drift)
    for (const bh of bgHearts) {
      const rawY = ((bh.y - bh.speed * bgTime) % 1.4 + 1.4) % 1.4 - 0.2;
      const px = (bh.x + Math.sin(bgTime * 0.4 + bh.phase) * 0.03) * w;
      const py = rawY * h;
      ctx.globalAlpha = bh.alpha;
      drawMiniHeart(px, py, bh.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawMiniHeart(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    const sc = s / 16;
    ctx.scale(sc, sc);
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(0, -1, -10, -1, -10, 4);
    ctx.bezierCurveTo(-10, 11, 0, 16, 0, 20);
    ctx.bezierCurveTo(0, 16, 10, 11, 10, 4);
    ctx.bezierCurveTo(10, -1, 0, -1, 0, 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 120, 170, 0.7)";
    ctx.fill();
    ctx.restore();
  }

  function drawHud() {
    if (state === State.LOADING || state === State.START ||
        state === State.ENDING  || state === State.ENDING_SCENE) return;

    const fs = Math.max(14, scaleUnit * 0.022);
    ctx.globalAlpha = 0.9;

    // Heart icon via text
    ctx.fillStyle = "rgba(255, 120, 170, 0.95)";
    ctx.font = `${Math.round(fs * 1.1)}px system-ui`;
    ctx.fillText("\u2665", 14, 28);

    // Count
    ctx.fillStyle = "rgba(255, 200, 220, 0.90)";
    ctx.font = `600 ${fs}px system-ui`;
    ctx.fillText(`${collected} / ${reasons.length}`, 14 + Math.round(fs * 0.95), 28);
    ctx.globalAlpha = 1;

    // Target indicator (tap-to-move only)
    if (state === State.PLAYING && player.tx != null && player.ty != null) {
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(player.tx, player.ty, Math.max(10, player.r * 0.55), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 180, 200, 0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Virtual joystick
    if (state === State.PLAYING) {
      drawJoystick();
    }
  }

  function drawJoystick() {
    // Base circle
    ctx.globalAlpha = joy.active ? 0.35 : 0.18;
    ctx.beginPath();
    ctx.arc(joy.cx, joy.cy, joy.baseR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 180, 200, 0.25)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 180, 200, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Knob
    const kx = joy.active ? joy.tx : joy.cx;
    const ky = joy.active ? joy.ty : joy.cy;
    ctx.globalAlpha = joy.active ? 0.6 : 0.25;
    ctx.beginPath();
    ctx.arc(kx, ky, joy.knobR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 140, 180, 0.7)";
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Get the width/height aspect ratio of a frame in an animator
  function getFrameAspect(anim) {
    if (!anim) return 0.65;
    if (anim.grid && anim.grid.cols.length && anim.grid.rows.length) {
      return anim.grid.cols[0].w / anim.grid.rows[0].h;
    }
    return anim.frameW / anim.frameH;
  }

  function drawPlayer(x, y) {
    if (leahWalkAnim && sprites.leahWalk) {
      const flip = playerDir === DIR.LEFT;
      leahWalkAnim.draw(ctx,
        x - spriteW * 0.5,
        y - spriteH * 0.8,
        spriteW, spriteH, flip);
    } else {
      // Fallback circle
      ctx.beginPath();
      ctx.arc(x, y, player.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 200, 220, 0.88)";
      ctx.fill();
    }
  }

  function drawHeart(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r / 16, r / 16);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(0, -2, -14, -2, -14, 6);
    ctx.bezierCurveTo(-14, 16, 0, 22, 0, 28);
    ctx.bezierCurveTo(0, 22, 14, 16, 14, 6);
    ctx.bezierCurveTo(14, -2, 0, -2, 0, 6);
    ctx.closePath();
    ctx.shadowBlur = 22;
    ctx.shadowColor = "rgba(255, 120, 170, 0.65)";
    ctx.fillStyle = "rgba(255, 120, 170, 0.95)";
    ctx.fill();
    ctx.restore();
  }

  /* ── Confetti ── */
  const CONFETTI_COLORS = ["#ff78aa", "#ff4477", "#ffaacc", "#fff", "#ff6699", "#ffbbdd"];

  function popConfettiBurst(x, y, count) {
    for (let i = 0; i < count; i++) {
      const a  = Math.random() * Math.PI * 2;
      const sp = rand(120, 420);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 180,
        life: rand(0.55, 1.15),
        size: rand(2, 5),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        isHeart: Math.random() < 0.35
      });
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.min(1, p.life * 1.5);
      ctx.globalAlpha = a * 0.9;
      if (p.isHeart) {
        drawMiniHeart(p.x, p.y, p.size * 1.6);
      } else {
        ctx.fillStyle = p.color || "#ffaacc";
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ═══════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════ */
  window.addEventListener("resize", resize, { passive: true });
  resize();
  initBgHearts();
  drawLoadingScreen(0);

  loadAssets().then(() => {
    // Create sprite animators with auto-detected grids for walk sprites
    if (sprites.leahWalk) {
      const grid = detectSpriteGrid(sprites.leahWalk);
      leahWalkAnim = new SpriteAnimator(sprites.leahWalk, WALK_COLS, WALK_ROWS, grid);
    }
    if (sprites.leahReaction) {
      const grid = detectSpriteGrid(sprites.leahReaction);
      leahReactionAnim = new SpriteAnimator(sprites.leahReaction, REACTION_COLS, REACTION_ROWS, grid);
      leahReactionAnim.fps = 5;
    }
    if (sprites.audreyWalk) {
      const grid = detectSpriteGrid(sprites.audreyWalk);
      audreyWalkAnim = new SpriteAnimator(sprites.audreyWalk, WALK_COLS, WALK_ROWS, grid);
    }
    if (sprites.audreyReaction) {
      const grid = detectSpriteGrid(sprites.audreyReaction);
      audreyReactionAnim = new SpriteAnimator(sprites.audreyReaction, REACTION_COLS, REACTION_ROWS, grid);
      audreyReactionAnim.fps = 5;
    }

    setState(State.START);
    requestAnimationFrame(loop);
  });
})();
