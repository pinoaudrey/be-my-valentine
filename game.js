(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });
  const overlay = document.getElementById("overlay");

  // Personalization
  const HER_NAME = "Leah";

  // 7 reasons
  const reasons = [
    "You're so thoughtful. The flowers, the dark chocolate pretzel yum yums, the Murdle book...you notice the little things nobody else does.",
    "I never get bored with you. Our lazy bed rot days are (not so) secretly the best days.",
    "You're so funny. You dish the sass right back, match my wit, and somehow always catch me off guard in the best way.",
    "You challenge the way I think, and I love that about you. It doesn't hurt that you can basically read my mind.",
    "Cosima. That's it. That's the reason.",
    "It's the little everyday things with you that make me feel so chosen, I never have to wonder."
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
    audreyReaction:  "assets/audrey_heart_reaction.png",
    audreyKiss:      "assets/audrey_kiss_right.png",
    leahKiss:        "assets/leah_kiss_right.png"
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

    if (bgCache) {
      // Draw the meadow background scaled down then back up to simulate blur
      ctx.save();
      const scale = 0.06; // smaller = blurrier
      const tmp = document.createElement("canvas");
      tmp.width = Math.max(1, Math.floor(w * scale));
      tmp.height = Math.max(1, Math.floor(h * scale));
      const tc = tmp.getContext("2d");
      tc.drawImage(bgCache, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(tmp, 0, 0, w, h);
      ctx.restore();

      // Frosted overlay matching the dialogue screens
      ctx.fillStyle = "rgba(180, 220, 200, 0.35)";
      ctx.fillRect(0, 0, w, h);
    } else {
      // Fallback if bgCache isn't ready yet
      ctx.fillStyle = "#daf0ff";
      ctx.fillRect(0, 0, w, h);
    }

    const fontSize = Math.max(16, scaleUnit * 0.025);
    ctx.font = `600 ${fontSize}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(140, 60, 95, 0.80)";
    ctx.fillText(`Loading\u2026 ${Math.round(progress * 100)}%`, w / 2, h / 2 - 20);

    // Progress bar
    const barW = Math.min(280, w * 0.55);
    const barH = 6;
    const barX = (w - barW) / 2;
    const barY = h / 2 + 10;
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "rgba(210, 100, 150, 0.70)";
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

  /**
   * Compute per-frame horizontal content center (as fraction 0-1 within each cell)
   * for a uniform-grid spritesheet. Returns an array of x-offsets (pixels) that
   * should be added when drawing each frame to keep the content visually centred.
   */
  function computeFrameXOffsets(img, cols, rows) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, c.width, c.height).data;
    const fw = img.width / cols;
    const fh = img.height / rows;

    // For row 0 only (reaction sprites are 1 row)
    const centers = [];
    for (let f = 0; f < cols; f++) {
      let sumX = 0, count = 0;
      const x0 = Math.round(f * fw);
      const x1 = Math.round((f + 1) * fw);
      for (let y = 0; y < fh; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * c.width + x) * 4;
          if (data[i + 3] > 30) { // has content
            sumX += (x - x0);
            count++;
          }
        }
      }
      centers.push(count > 0 ? sumX / count : fw * 0.5);
    }

    // Average center across all frames
    const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
    // Offset = how much to shift each frame so its center aligns with the average
    return centers.map(cx => avg - cx);
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
      this.sequence = null;  // optional custom frame sequence, e.g. [0, 2, 3]
      this._seqIdx = 0;      // current index into the sequence
      this.onFinish = null;
    }

    update(dt) {
      if (!this.playing || !this.img) return;
      this.elapsed += dt;
      const dur = 1 / this.fps;
      while (this.elapsed >= dur) {
        this.elapsed -= dur;
        if (this.sequence) {
          this._seqIdx++;
          if (this._seqIdx >= this.sequence.length) {
            if (this.loop) {
              this._seqIdx = 0;
            } else {
              this._seqIdx = this.sequence.length - 1;
              this.playing = false;
              if (this.onFinish) this.onFinish();
            }
          }
          this.frame = this.sequence[this._seqIdx];
        } else {
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
    }

    /** Pre-render each frame to its own canvas to eliminate bleed between frames. */
    preRenderFrames() {
      if (!this.img) return;
      this._frameCvs = [];
      // Use putImageData for pixel-perfect extraction (no interpolation at all)
      const srcCvs = document.createElement("canvas");
      srcCvs.width = this.img.width;
      srcCvs.height = this.img.height;
      const srcCtx = srcCvs.getContext("2d");
      srcCtx.drawImage(this.img, 0, 0);

      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          let sx, sy, sw, sh;
          if (this.grid) {
            const col = this.grid.cols[Math.min(c, this.grid.cols.length - 1)];
            const row = this.grid.rows[Math.min(r, this.grid.rows.length - 1)];
            sx = Math.round(col.x); sw = Math.round(col.w);
            sy = Math.round(row.y); sh = Math.round(row.h);
          } else {
            // Trim right edge only — next character's content bleeds into this frame zone
            sx = Math.round(c * this.frameW);
            sy = Math.round(r * this.frameH);
            sw = Math.round((c + 1) * this.frameW) - sx - 8;
            sh = Math.round((r + 1) * this.frameH) - sy;
          }
          // Pixel-perfect copy via getImageData/putImageData — zero interpolation
          const imageData = srcCtx.getImageData(sx, sy, sw, sh);
          const fc = document.createElement("canvas");
          fc.width = sw; fc.height = sh;
          const fctx = fc.getContext("2d");
          fctx.putImageData(imageData, 0, 0);
          this._frameCvs.push({ cvs: fc, w: sw, h: sh });
        }
      }
    }

    draw(ctx, x, y, dw, dh, flipH) {
      if (!this.img) return;
      const drawFrame = this.frame;

      // If pre-rendered frames exist, draw from the clean individual canvas
      if (this._frameCvs) {
        const idx = this.row * this.cols + drawFrame;
        const fc = this._frameCvs[Math.min(idx, this._frameCvs.length - 1)];
        if (fc) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          if (flipH) {
            ctx.translate(x + dw, y);
            ctx.scale(-1, 1);
            ctx.drawImage(fc.cvs, 0, 0, fc.w, fc.h, 0, 0, dw, dh);
          } else {
            ctx.drawImage(fc.cvs, 0, 0, fc.w, fc.h, x, y, dw, dh);
          }
          ctx.restore();
          return;
        }
      }

      let sx, sy, sw, sh;
      if (this.grid) {
        const col = this.grid.cols[Math.min(drawFrame, this.grid.cols.length - 1)];
        const row = this.grid.rows[Math.min(this.row,   this.grid.rows.length - 1)];
        sx = col.x; sw = col.w;
        sy = row.y; sh = row.h;
      } else {
        sx = Math.round(drawFrame * this.frameW);
        sy = Math.round(this.row * this.frameH);
        sw = Math.round((drawFrame + 1) * this.frameW) - sx;
        sh = Math.round((this.row + 1) * this.frameH) - sy;
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
      this._seqIdx = 0;
      this.frame = this.sequence ? this.sequence[0] : this.startFrame;
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
  const KISS_COLS = 4, KISS_ROWS = 1;

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
  const particles = [];

  /* ═══════════════════════════════════════════
     SPRITE STATE
     ═══════════════════════════════════════════ */
  let leahWalkAnim = null;
  let leahReactionAnim = null;
  let audreyWalkAnim = null;
  let audreyReactionAnim = null;
  let audreyKissAnim = null;
  let leahKissAnim = null;

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
  const HEART_REACT_DUR = 0.7;
  let heartReactX = 0, heartReactY = 0;

  // Ending scene
  let endingTimer = 0;
  let endingPhase = 0;
  let audreyEndX = 0, audreyEndY = 0;
  let leahEndX = 0, leahEndY = 0;
  const ENDING_WALK_DUR = 2.0;
  const ENDING_REACT_DUR = 1.0;

  // Meadow background objects
  const clouds = [];
  const petals = [];
  const flowers = [];
  let bgCache = null; // offscreen canvas cache for static background

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
    player.speed = Math.max(120, scaleUnit * 0.38);

    // Virtual joystick sizing (bottom-left corner)
    joy.baseR = Math.max(36, scaleUnit * 0.07);
    joy.knobR = joy.baseR * 0.45;
    joy.cx = w - safeMargin() - joy.baseR - 16;
    joy.cy = h - safeMargin() - joy.baseR - 16;

    spriteH = Math.max(56, scaleUnit * 0.12);
    spriteW = spriteH * 0.65; // match detected walk frame aspect ratio (~125w/200h)

    const margin = safeMargin();
    if (!player.x && !player.y) {
      player.x = w * 0.5;
      player.y = h * 0.60;
    }
    const topMargin = margin + spriteH * 1.2;
    player.x = clamp(player.x, margin, w - margin);
    player.y = clamp(player.y, topMargin, h - margin);
    if (heart.alive) {
      heart.x = clamp(heart.x, margin, w - margin);
      heart.y = clamp(heart.y, topMargin, h - margin);
    }
    if (state !== State.LOADING) renderOverlayForState();
    initMeadow();
  }

  /* ═══════════════════════════════════════════
     UTILITY
     ═══════════════════════════════════════════ */
  function safeMargin() { return Math.max(16, scaleUnit * 0.07); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ═══════════════════════════════════════════
     MEADOW BACKGROUND
     ═══════════════════════════════════════════ */
  function initMeadow() {
    clouds.length = 0;
    petals.length = 0;
    const nClouds = Math.max(6, Math.floor(w / 220));
    for (let i = 0; i < nClouds; i++) clouds.push(makeCloud(true));
    const nPetals = Math.max(18, Math.floor((w * h) / 60000));
    for (let i = 0; i < nPetals; i++) petals.push(makePetal(true));

    // Pre-generate fixed flower positions on the ground
    flowers.length = 0;
    const groundTop = h * 0.80;
    const flowerCount = Math.max(18, Math.floor(w / 40));
    for (let i = 0; i < flowerCount; i++) {
      flowers.push({
        x: (i * 47) % w,
        y: rand(groundTop + 8, h - 10),
        s: rand(scaleUnit * 0.010, scaleUnit * 0.017)
      });
    }
    // Render entire static background to an offscreen canvas
    renderBgCache();
  }

  function makeCloud(randomizeX) {
    const s = rand(scaleUnit * 0.10, scaleUnit * 0.22);
    return {
      x: randomizeX ? rand(-w * 0.2, w * 1.2) : rand(0, w),
      y: rand(h * 0.06, h * 0.35),
      w: s * rand(1.4, 2.0),
      h: s * rand(0.55, 0.85),
      vx: rand(6, 18)
    };
  }

  function makePetal(randomizePos) {
    const size = rand(scaleUnit * 0.008, scaleUnit * 0.016);
    return {
      x: randomizePos ? rand(0, w) : -20,
      y: randomizePos ? rand(0, h) : rand(h * 0.08, h * 0.75),
      vx: rand(10, 40),
      vy: rand(8, 28),
      rot: rand(0, Math.PI * 2),
      vr: rand(-2.2, 2.2),
      s: size,
      phase: rand(0, Math.PI * 2)
    };
  }

  function drawRoundedCloud(x, y, cw, ch, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    const r1 = ch * 0.55;
    const r2 = ch * 0.65;
    const r3 = ch * 0.50;
    ctx.arc(x + cw * 0.28, y + ch * 0.55, r1, 0, Math.PI * 2);
    ctx.arc(x + cw * 0.48, y + ch * 0.40, r2, 0, Math.PI * 2);
    ctx.arc(x + cw * 0.70, y + ch * 0.55, r3, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHill(yBase, height, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const step = w / 4;
    ctx.lineTo(0, yBase);
    ctx.quadraticCurveTo(step * 0.5, yBase - height * 0.9, step, yBase);
    ctx.quadraticCurveTo(step * 1.5, yBase + height * 0.4, step * 2, yBase);
    ctx.quadraticCurveTo(step * 2.5, yBase - height * 0.7, step * 3, yBase);
    ctx.quadraticCurveTo(step * 3.5, yBase + height * 0.35, w, yBase);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFlower(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    // Stem
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = "rgba(60, 170, 90, 0.85)";
    ctx.lineWidth = Math.max(1, s * 0.2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, s * 2.2);
    ctx.stroke();
    // Petals
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    const pr = s * 0.55;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Center
    ctx.fillStyle = "rgba(255, 225, 120, 0.95)";
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(255, 150, 190, 0.70)";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.s * 0.9, p.s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function spawnHeart() {
    const margin = safeMargin();
    // Extra top margin so reaction animations don't get clipped at the top
    const topMargin = margin + spriteH * 1.2;
    const minP = player.r * 5.2;
    const minH = heart.r * 4;
    const joyExclude = joy.baseR * 2.2; // keep hearts away from joystick area
    let tries = 0, nx, ny;
    do {
      nx = rand(margin, w - margin);
      ny = rand(topMargin, h - margin);
      if (dist(nx, ny, player.x, player.y) > minP &&
          dist(nx, ny, joy.cx, joy.cy) > joyExclude &&
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
    playerMoving = false;
    renderOverlayForState();
  }

  function showOverlay(html) {
    overlay.innerHTML = html;
    overlay.classList.add("show");
    wireOverlayButtons();
    // Start typewriter effect on any element with data-typewriter
    overlay.querySelectorAll("[data-typewriter]").forEach(el => {
      typewrite(el);
    });
  }

  let typewriterTimer = null;
  function typewrite(el) {
    if (typewriterTimer) { clearTimeout(typewriterTimer); typewriterTimer = null; }
    const text = el.textContent;
    el.textContent = "";
    let i = 0;
    function step() {
      if (i < text.length) {
        el.textContent += text[i++];
        typewriterTimer = setTimeout(step, 18);
      } else {
        typewriterTimer = null;
      }
    }
    step();
  }

  function hideOverlay() {
    overlay.classList.remove("show");
    overlay.classList.remove("transparent");
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
        state === State.HEART_REACTING) {
      hideOverlay();
      return;
    }

    // Ending scene: only show overlay during phase 1 (Valentine question)
    if (state === State.ENDING_SCENE) {
      if (endingPhase === 1) {
        showEndingQuestion();
      } else {
        hideOverlay();
      }
      return;
    }

    if (state === State.START) {
      showOverlay(`
        <div class="card">
          <div class="h1">Hey ${HER_NAME} <span class="heart-icon">\u2665</span></div>
          <p class="p">I made this little game just for you. There are <strong>7 hearts</strong> hidden across the meadow, and each one holds a special reason why you mean so much to me.</p>
          <p class="p">Walk around, find them all, and read every reason — there's a surprise waiting at the end!</p>
          <div class="row">
            <button class="btn" data-action="start">Let's Go!</button>
          </div>
          <p class="p small" style="margin-top:12px">Tip: use arrow keys, WASD, or the joystick to move.</p>
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
          <div class="dialogue-header">Heart ${collected} of ${reasons.length + 1}</div>
          <div class="dialogue-body">
            <div class="portrait-slot">
              ${ap ? `<img class="portrait" src="${ap}" alt="Audrey">` : ""}
            </div>
            <div class="dialogue-text">
              <p class="dialogue-reason" data-typewriter>\u201C${escapeHtml(reasonText)}\u201D</p>
            </div>
            <div class="portrait-slot">
              ${lp ? `<img class="portrait" src="${lp}" alt="Leah">` : ""}
            </div>
          </div>
          <div class="row" style="justify-content:center">
            <button class="btn" data-action="nextReason">Next</button>
          </div>
        </div>
      `);
      return;
    }


    if (state === State.ENDING) {
      const ap = getPortraitDataURL("audreyPortraits", 4);
      const lp = getPortraitDataURL("leahPortraits",  1);
      showOverlay(`
        <div class="card dialogue-card">
          <div class="h1">Happy Valentine's Day <span class="heart-icon">\u2665</span></div>
          <div class="dialogue-body" style="margin-bottom:14px">
            <div class="portrait-slot">
              ${ap ? `<img class="portrait" src="${ap}" alt="Audrey">` : ""}
            </div>
            <div class="dialogue-text">
              <p class="dialogue-reason" data-typewriter>You are the best valentine I could ask for. I can't wait to celebrate together.</p>
              <p class="p small" style="margin-top:6px">Screenshot this to redeem for 5 million kisses. Non-negotiable. No refunds.</p>
            </div>
            <div class="portrait-slot">
              ${lp ? `<img class="portrait" src="${lp}" alt="${HER_NAME}">` : ""}
            </div>
          </div>
          <div class="row" style="justify-content:center">
            <button class="btn" data-action="restart">Play again</button>
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


    if (action === "backToStart") { setState(State.START); return; }
    if (action === "start")       { startGame(); return; }

    if (action === "nextReason") {
      setState(State.PLAYING);
      spawnHeart();
      return;
    }

    if (action === "endingYes") {
      // Hide the question overlay and trigger heart reaction animations
      hideOverlay();
      endingAnswered = true;
      endingPhase = 2;
      endingTimer = 0;
      if (leahReactionAnim)   { leahReactionAnim.loop = true;  leahReactionAnim.reset(true); }
      if (audreyReactionAnim) { audreyReactionAnim.loop = true; audreyReactionAnim.reset(true); }
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
    heart.alive = false;
    particles.length = 0;
    player.x  = w * 0.5;
    player.y  = h * 0.60;
    playerDir = DIR.DOWN;
    playerMoving = false;
    endingTimer = 0;
    endingPhase = 0;
    endingAnswered = false;
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

  let endingAnswered = false; // set true when user clicks yes/absolutely yes

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
        endingAnswered = false;
        // Show the Valentine question as an in-game overlay
        showEndingQuestion();
      }
    } else if (endingPhase === 1) {
      // Idle — waiting for the player to click yes/absolutely yes
      // (handled by showEndingQuestion buttons)
    } else if (endingPhase === 2) {
      // Play heart reactions (replacing walk sprites entirely)
      if (leahReactionAnim)   leahReactionAnim.update(dt);
      if (audreyReactionAnim) audreyReactionAnim.update(dt);

      if (endingTimer >= ENDING_REACT_DUR) {
        endingPhase = 3;
        endingTimer = 0;
        // Move characters closer together for kiss
        const kissGap = spriteW * 0.15;
        audreyEndX = cx - kissGap - spriteW * 0.5;
        leahEndX   = cx + kissGap - spriteW * 0.5;
        if (audreyKissAnim) { audreyKissAnim.loop = false; audreyKissAnim.reset(true); }
        if (leahKissAnim)   { leahKissAnim.loop = false; leahKissAnim.reset(true); }
      }
    } else if (endingPhase === 3) {
      // Kiss animation
      if (audreyKissAnim) audreyKissAnim.update(dt);
      if (leahKissAnim)   leahKissAnim.update(dt);

      if (endingTimer >= 1.2) {
        endingPhase = 4;
        endingTimer = 0;
        popConfettiBurst(cx, h * 0.35, 100);
      }
    } else if (endingPhase === 4) {
      // Confetti pause, then show final card
      if (endingTimer >= 0.6) {
        setState(State.ENDING);
      }
    }
  }

  function showEndingQuestion() {
    // Only show floating buttons — question text is drawn on canvas
    overlay.classList.add("transparent");
    showOverlay(`
      <div style="position:fixed;bottom:33%;left:0;right:0;display:flex;justify-content:center;gap:10px;">
        <button class="btn" data-action="endingYes">Yes</button>
        <button class="btn secondary" data-action="endingYes">Absolutely yes</button>
      </div>
    `);
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
    } else if (endingPhase === 1) {
      // Phase 1: Idle front-facing sprites with question text on canvas
      drawEndingIdleSprites();
      drawEndingQuestionText();
    } else if (endingPhase === 2) {
      // Phase 2: Heart reaction sprites REPLACE the walk sprites entirely
      const rW = spriteH * 1.1;
      const frameAR = leahReactionAnim ? (leahReactionAnim.frameH / leahReactionAnim.frameW) : 1;
      const rH = rW * frameAR;

      // Audrey at full size, Leah scaled down slightly to match
      drawEndingReaction(audreyReactionAnim, sprites.audreyReaction, audreyEndX, audreyEndY, rW, rH, "audrey");
      drawEndingReaction(leahReactionAnim, sprites.leahReaction, leahEndX, leahEndY, rW * 0.9, rH * 0.9, "leah");
    } else {
      // Phase 3+: Kiss animation
      drawEndingKiss();
    }
  }

  function drawEndingIdleSprites() {
    drawEndingIdleSprite("audrey");
    drawEndingIdleSprite("leah");
  }

  function drawEndingIdleSprite(who) {
    const isAudrey = who === "audrey";
    const anim = isAudrey ? audreyWalkAnim : leahWalkAnim;
    const ex = isAudrey ? audreyEndX : leahEndX;
    const ey = isAudrey ? audreyEndY : leahEndY;
    if (!anim) return;
    // Temporarily set to front-facing idle (row 0, frame 0) and draw
    const savedRow = anim.row;
    const savedFrame = anim.frame;
    anim.row = 0;
    anim.frame = 0;
    anim.draw(ctx, ex, ey - spriteH, spriteW, spriteH, false);
    anim.row = savedRow;
    anim.frame = savedFrame;
  }

  function drawEndingQuestionText() {
    const cx = (audreyEndX + spriteW * 0.5 + leahEndX + spriteW * 0.5) / 2;
    const topY = Math.min(audreyEndY, leahEndY) - spriteH;

    ctx.save();

    // Main question with heart on the left
    const mainFs = Math.max(18, scaleUnit * 0.032);
    const heartFs = Math.round(mainFs * 1.1);
    const questionText = `${HER_NAME}, will you be my Valentine?`;

    ctx.font = `700 ${mainFs}px system-ui`;
    const textW = ctx.measureText(questionText).width;
    ctx.font = `${heartFs}px system-ui`;
    const heartW = ctx.measureText("\u2665").width;
    const totalW = heartW + 8 + textW; // heart + gap + text
    const startX = cx - totalW / 2;

    // Heart icon
    ctx.fillStyle = "rgba(220, 50, 100, 0.85)";
    ctx.font = `${heartFs}px system-ui`;
    ctx.textAlign = "left";
    ctx.fillText("\u2665", startX, topY - mainFs * 2.2);

    // Question text
    ctx.fillStyle = "rgba(180, 50, 90, 0.90)";
    ctx.font = `700 ${mainFs}px system-ui`;
    ctx.fillText(questionText, startX + heartW + 8, topY - mainFs * 2.2);

    // Subtext
    const subFs = Math.max(12, scaleUnit * 0.018);
    ctx.font = `500 ${subFs}px system-ui`;
    ctx.fillStyle = "rgba(140, 60, 90, 0.65)";
    ctx.textAlign = "center";
    ctx.fillText("No pressure. Except yes, pressure. Romantic pressure.", cx, topY - mainFs * 1.0);

    ctx.restore();
  }

  function drawEndingReaction(anim, img, ex, ey, rW, rH, fallbackWho) {
    if (anim && img) {
      const scale = rW / anim.frameW;
      const xOff = anim._xOffsets ? anim._xOffsets[anim.frame] * scale : 0;
      anim.draw(ctx,
        ex + (spriteW - rW) * 0.5 + xOff,
        ey - rH * 0.9,
        rW, rH, false);
    } else {
      drawEndingIdleSprite(fallbackWho);
    }
  }

  function drawEndingKiss() {
    const kW = spriteH * 1.1;
    const kAR = audreyKissAnim ? (audreyKissAnim.frameH / audreyKissAnim.frameW) : 1;
    const kH = kW * kAR;

    // Audrey faces right (no flip)
    if (audreyKissAnim && sprites.audreyKiss) {
      const scale = kW / audreyKissAnim.frameW;
      const xOff = audreyKissAnim._xOffsets ? audreyKissAnim._xOffsets[audreyKissAnim.frame] * scale : 0;
      audreyKissAnim.draw(ctx,
        audreyEndX + (spriteW - kW) * 0.5 + xOff,
        audreyEndY - kH * 0.9,
        kW, kH, false);
    }

    // Leah faces right in sprite, flip to face left
    if (leahKissAnim && sprites.leahKiss) {
      const lkW = kW * 0.9; // slightly smaller to match reaction scaling
      const lkH = kH * 0.9;
      const scale = lkW / leahKissAnim.frameW;
      const xOff = leahKissAnim._xOffsets ? leahKissAnim._xOffsets[leahKissAnim.frame] * scale : 0;
      leahKissAnim.draw(ctx,
        leahEndX + (spriteW - lkW) * 0.5 - xOff,
        leahEndY - lkH * 0.9,
        lkW, lkH, true); // flipH = true
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

  // ── Virtual Joystick (pointer events — works for both mouse & touch) ──
  let joyPointerId = null;   // tracks the pointer currently driving the joystick

  function isInsideJoystick(cx, cy) {
    return dist(cx, cy, joy.cx, joy.cy) <= joy.baseR * 1.4;
  }

  function updateJoystickFromPointer(cx, cy) {
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

  function releaseJoystick() {
    joyPointerId = null;
    joy.active = false;
    joy.dx = 0; joy.dy = 0;
    joy.tx = joy.cx; joy.ty = joy.cy;
  }

  canvas.addEventListener("pointerdown", e => {
    if (state !== State.PLAYING) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // If pointer lands on the joystick, capture it for joystick control
    if (isInsideJoystick(cx, cy)) {
      joyPointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      updateJoystickFromPointer(cx, cy);
      return;
    }
  });

  canvas.addEventListener("pointermove", e => {
    if (e.pointerId === joyPointerId) {
      const rect = canvas.getBoundingClientRect();
      updateJoystickFromPointer(e.clientX - rect.left, e.clientY - rect.top);
    }
  });

  canvas.addEventListener("pointerup", e => {
    if (e.pointerId === joyPointerId) releaseJoystick();
  });

  canvas.addEventListener("pointercancel", e => {
    if (e.pointerId === joyPointerId) releaseJoystick();
  });

  // Prevent scroll while playing on touch devices
  document.addEventListener("touchmove", e => {
    if (state === State.PLAYING) e.preventDefault();
  }, { passive: false });

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
        // 7th heart (beyond reasons) triggers ending scene directly
        if (collected > reasons.length) {
          startEndingScene();
        } else {
          setState(State.SHOWING_REASON);
        }
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
      moveX = kdir.dx;
      moveY = kdir.dy;
    } else if (joy.active && (joy.dx !== 0 || joy.dy !== 0)) {
      moveX = joy.dx;
      moveY = joy.dy;
    }

    // ── Apply movement ──
    if (moveX !== 0 || moveY !== 0) {
      playerMoving = true;
      const step = player.speed * dt;
      const margin = safeMargin();
      const topMargin = margin + spriteH * 1.2;
      player.x = clamp(player.x + moveX * step, margin, w - margin);
      player.y = clamp(player.y + moveY * step, topMargin, h - margin);

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

      // Use sprite dimensions for collision so visual overlap matches
      const collisionR = Math.max(player.r, spriteW * 0.4) + heart.r;
      if (dist(player.x, player.y - spriteH * 0.35, hx, hy) <= collisionR) {
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
          // 3 frames in the sequence over the reaction duration
          leahReactionAnim.fps = leahReactionAnim.sequence.length / HEART_REACT_DUR;
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

    // Player or heart reaction (reaction replaces the walk sprite)
    if (state === State.HEART_REACTING) {
      if (leahReactionAnim && sprites.leahReaction) {
        // Size the reaction so the character portion matches the walk sprite scale
        const rW = spriteH * 1.1;
        const rH = rW * (leahReactionAnim.frameH / leahReactionAnim.frameW);
        // Apply per-frame x-offset to keep character centred across frames
        const scale = rW / leahReactionAnim.frameW;
        const xOff = leahReactionAnim._xOffsets ? leahReactionAnim._xOffsets[leahReactionAnim.frame] * scale : 0;
        leahReactionAnim.draw(ctx,
          heartReactX - rW * 0.5 + xOff,
          heartReactY - rH * 0.8,
          rW, rH, false);
      }
    } else if (state === State.PLAYING) {
      drawPlayer(player.x, player.y);
    }

    // Ending scene (also draw during ENDING state so characters show behind final overlay)
    if (state === State.ENDING_SCENE || state === State.ENDING) {
      drawEndingScene();
    }

    drawParticles();
  }

  /* ── Drawing helpers ── */

  function renderBgCache() {
    // Render the entire static background to an offscreen canvas once
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const oc = off.getContext("2d");

    // Sky gradient
    const sky = oc.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0.0, "#bfe8ff");
    sky.addColorStop(0.55, "#ffd1e6");
    sky.addColorStop(1.0, "#fff2c6");
    oc.fillStyle = sky;
    oc.fillRect(0, 0, w, h);

    // Soft sun glow
    const sunX = w * 0.80, sunY = h * 0.18, sunR = scaleUnit * 0.28;
    const sun = oc.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
    sun.addColorStop(0.0, "rgba(255, 250, 210, 0.95)");
    sun.addColorStop(0.35, "rgba(255, 230, 190, 0.55)");
    sun.addColorStop(1.0, "rgba(255, 210, 230, 0.0)");
    oc.fillStyle = sun;
    oc.fillRect(0, 0, w, h);

    // Clouds
    for (const c of clouds) {
      oc.save();
      oc.globalAlpha = 0.85;
      oc.fillStyle = "rgba(255,255,255,0.92)";
      oc.beginPath();
      oc.arc(c.x + c.w * 0.28, c.y + c.h * 0.55, c.h * 0.55, 0, Math.PI * 2);
      oc.arc(c.x + c.w * 0.48, c.y + c.h * 0.40, c.h * 0.65, 0, Math.PI * 2);
      oc.arc(c.x + c.w * 0.70, c.y + c.h * 0.55, c.h * 0.50, 0, Math.PI * 2);
      oc.closePath();
      oc.fill();
      oc.restore();
    }

    // Far hills
    function hill(yBase, height, color) {
      oc.fillStyle = color;
      oc.beginPath();
      oc.moveTo(0, h);
      const step = w / 4;
      oc.lineTo(0, yBase);
      oc.quadraticCurveTo(step * 0.5, yBase - height * 0.9, step, yBase);
      oc.quadraticCurveTo(step * 1.5, yBase + height * 0.4, step * 2, yBase);
      oc.quadraticCurveTo(step * 2.5, yBase - height * 0.7, step * 3, yBase);
      oc.quadraticCurveTo(step * 3.5, yBase + height * 0.35, w, yBase);
      oc.lineTo(w, h);
      oc.closePath();
      oc.fill();
    }
    hill(h * 0.72, scaleUnit * 0.10, "rgba(120, 220, 180, 0.55)");
    hill(h * 0.78, scaleUnit * 0.12, "rgba(90, 210, 160, 0.65)");

    // Ground band
    const groundTop = h * 0.80;
    const ground = oc.createLinearGradient(0, groundTop, 0, h);
    ground.addColorStop(0.0, "rgba(120, 235, 170, 0.95)");
    ground.addColorStop(1.0, "rgba(70, 200, 135, 0.98)");
    oc.fillStyle = ground;
    oc.fillRect(0, groundTop, w, h - groundTop);

    // Flowers
    for (const f of flowers) {
      oc.save();
      oc.translate(f.x, f.y);
      // Stem
      oc.globalAlpha = 0.75;
      oc.strokeStyle = "rgba(60, 170, 90, 0.85)";
      oc.lineWidth = Math.max(1, f.s * 0.2);
      oc.beginPath(); oc.moveTo(0, 0); oc.lineTo(0, f.s * 2.2); oc.stroke();
      // Petals
      oc.globalAlpha = 0.95;
      oc.fillStyle = "rgba(255, 255, 255, 0.95)";
      const pr = f.s * 0.55;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        oc.beginPath();
        oc.arc(Math.cos(a) * f.s * 0.55, Math.sin(a) * f.s * 0.55, pr, 0, Math.PI * 2);
        oc.fill();
      }
      // Center
      oc.fillStyle = "rgba(255, 225, 120, 0.95)";
      oc.beginPath(); oc.arc(0, 0, f.s * 0.45, 0, Math.PI * 2); oc.fill();
      oc.restore();
    }

    // Light vignette
    oc.globalAlpha = 0.12;
    const v = oc.createRadialGradient(w * 0.5, h * 0.5, scaleUnit * 0.15, w * 0.5, h * 0.5, scaleUnit * 0.80);
    v.addColorStop(0, "rgba(255,255,255,0)");
    v.addColorStop(1, "rgba(255, 170, 210, 0.35)");
    oc.fillStyle = v;
    oc.fillRect(0, 0, w, h);

    bgCache = off;
  }

  function drawBackground() {
    if (bgCache) {
      ctx.drawImage(bgCache, 0, 0);
    }
  }

  function drawHud() {
    if (state === State.LOADING || state === State.START ||
        state === State.ENDING  || state === State.ENDING_SCENE) return;

    const fs = Math.max(14, scaleUnit * 0.022);
    const heartFs = Math.round(fs * 1.3);
    const totalHearts = reasons.length + 1; // 6 reasons + 1 final
    const label = `${collected} / ${totalHearts}`;

    // Measure text width to center the pill
    ctx.font = `700 ${fs}px system-ui`;
    const textW = ctx.measureText(label).width;
    const pillW = heartFs + 8 + textW + 20; // icon + gap + text + padding
    const pillH = Math.round(fs * 2);
    const pillX = (w - pillW) / 2;
    const pillY = 12;
    const pillR = pillH / 2;

    // Frosted pill background
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillR);
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 100, 150, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Heart icon
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(220, 50, 100, 0.90)";
    ctx.font = `${heartFs}px system-ui`;
    ctx.textAlign = "left";
    ctx.fillText("\u2665", pillX + 10, pillY + pillH * 0.72);

    // Count text
    ctx.fillStyle = "rgba(80, 40, 60, 0.90)";
    ctx.font = `700 ${fs}px system-ui`;
    ctx.fillText(label, pillX + 10 + heartFs + 4, pillY + pillH * 0.66);
    ctx.globalAlpha = 1;
    ctx.textAlign = "start";

    // Virtual joystick
    if (state === State.PLAYING) {
      drawJoystick();
    }
  }

  function drawJoystick() {
    // Base circle
    ctx.globalAlpha = joy.active ? 0.55 : 0.35;
    ctx.beginPath();
    ctx.arc(joy.cx, joy.cy, joy.baseR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(60, 30, 50, 0.25)";
    ctx.fill();
    ctx.strokeStyle = "rgba(60, 30, 50, 0.45)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Knob
    const kx = joy.active ? joy.tx : joy.cx;
    const ky = joy.active ? joy.ty : joy.cy;
    ctx.globalAlpha = joy.active ? 0.75 : 0.45;
    ctx.beginPath();
    ctx.arc(kx, ky, joy.knobR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(180, 60, 100, 0.75)";
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
        // Inline mini heart shape (replaces removed drawMiniHeart)
        ctx.save();
        ctx.translate(p.x, p.y);
        const s = p.size * 1.6;
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
  drawLoadingScreen(0);

  loadAssets().then(() => {
    // Create sprite animators with auto-detected grids for walk sprites
    if (sprites.leahWalk) {
      const grid = detectSpriteGrid(sprites.leahWalk);
      leahWalkAnim = new SpriteAnimator(sprites.leahWalk, WALK_COLS, WALK_ROWS, grid);
    }
    if (sprites.leahReaction) {
      // Use uniform grid for reaction sprites (auto-detect misreads the decorations above heads)
      leahReactionAnim = new SpriteAnimator(sprites.leahReaction, REACTION_COLS, REACTION_ROWS, null);
      leahReactionAnim.fps = 5;
      // Only use frames 0 (neutral), 2 (heart), 3 (big heart) — skip frame 1 (exclamation)
      leahReactionAnim.sequence = [0, 2, 3];
      leahReactionAnim._xOffsets = computeFrameXOffsets(sprites.leahReaction, REACTION_COLS, REACTION_ROWS);
      leahReactionAnim.preRenderFrames();
    }
    if (sprites.audreyWalk) {
      const grid = detectSpriteGrid(sprites.audreyWalk);
      audreyWalkAnim = new SpriteAnimator(sprites.audreyWalk, WALK_COLS, WALK_ROWS, grid);
    }
    if (sprites.audreyReaction) {
      // Use uniform grid for reaction sprites (auto-detect misreads the decorations above heads)
      audreyReactionAnim = new SpriteAnimator(sprites.audreyReaction, REACTION_COLS, REACTION_ROWS, null);
      audreyReactionAnim.fps = 5;
      audreyReactionAnim.sequence = [0, 2, 3];
      audreyReactionAnim._xOffsets = computeFrameXOffsets(sprites.audreyReaction, REACTION_COLS, REACTION_ROWS);
      audreyReactionAnim.preRenderFrames();
    }

    // Kiss animators (4 cols, 1 row each)
    if (sprites.audreyKiss) {
      audreyKissAnim = new SpriteAnimator(sprites.audreyKiss, KISS_COLS, KISS_ROWS, null);
      audreyKissAnim.fps = 4;
      audreyKissAnim.loop = false;
      audreyKissAnim._xOffsets = computeFrameXOffsets(sprites.audreyKiss, KISS_COLS, KISS_ROWS);
      audreyKissAnim.preRenderFrames();
    }
    if (sprites.leahKiss) {
      leahKissAnim = new SpriteAnimator(sprites.leahKiss, KISS_COLS, KISS_ROWS, null);
      leahKissAnim.fps = 4;
      leahKissAnim.loop = false;
      leahKissAnim._xOffsets = computeFrameXOffsets(sprites.leahKiss, KISS_COLS, KISS_ROWS);
      leahKissAnim.preRenderFrames();
    }

    setState(State.START);
    requestAnimationFrame(loop);
  });
})();
