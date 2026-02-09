(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });
  const overlay = document.getElementById("overlay");

  // Personalization
  const HER_NAME = "Leah";

  // 7 placeholder reasons you can edit later
  const reasons = [
    "You make ordinary days feel like something I want to replay.",
    "Your laugh is basically my favorite sound effect.",
    "You are the person I want to tell everything to first.",
    "You somehow make errands feel like dates, which is suspiciously powerful.",
    "Inside joke placeholder, the one that makes you do the exact face you do.",
    "You are sweet, sharp, and you keep me honest in the best way.",
    "I like my life more with you in it, every single day."
  ];

  // State machine
  const State = {
    START: "start",
    PLAYING: "playing",
    SHOWING_REASON: "showingReason",
    FINAL_GATE: "finalGate",
    ENDING: "ending"
  };

  let state = State.START;

  // World sizing
  let w = 0, h = 0, dpr = 1;
  let scaleUnit = 1;

  // Gameplay entities
  const player = {
    x: 0, y: 0,
    r: 12,
    speed: 0,
    tx: null, ty: null  // target position for tap to move
  };

  const heart = {
    x: 0, y: 0,
    r: 12,
    alive: false,
    bobT: 0
  };

  // Progress
  let collected = 0; // how many hearts collected so far
  let lastHeartSpawned = false;

  // Optional vibes
  let muted = false;
  const particles = [];

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
    heart.r = Math.max(10, scaleUnit * 0.028);
    player.speed = Math.max(120, scaleUnit * 0.30);

    const margin = safeMargin();

    // If first time, place player center
    if (!player.x && !player.y) {
      player.x = w * 0.5;
      player.y = h * 0.60;
      player.tx = player.x;
      player.ty = player.y;
    }

    // Clamp positions
    player.x = clamp(player.x, margin, w - margin);
    player.y = clamp(player.y, margin, h - margin);
    if (player.tx != null) player.tx = clamp(player.tx, margin, w - margin);
    if (player.ty != null) player.ty = clamp(player.ty, margin, h - margin);

    if (heart.alive) {
      heart.x = clamp(heart.x, margin, w - margin);
      heart.y = clamp(heart.y, margin, h - margin);
    }

    renderOverlayForState();
  }

  function safeMargin() {
    return Math.max(16, scaleUnit * 0.06);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function spawnHeart() {
    const margin = safeMargin();
    const minDistFromPlayer = player.r * 5.2;
    const minDistFromPrev = heart.r * 4.0;

    let tries = 0;
    let nx, ny;

    do {
      nx = rand(margin, w - margin);
      ny = rand(margin, h - margin);

      const okPlayer = dist(nx, ny, player.x, player.y) > minDistFromPlayer;
      const okPrev = !heart.alive || dist(nx, ny, heart.x, heart.y) > minDistFromPrev;

      if (okPlayer && okPrev) break;
      tries++;
    } while (tries < 80);

    heart.x = nx;
    heart.y = ny;
    heart.bobT = 0;
    heart.alive = true;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function setState(next) {
    state = next;
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

  function renderOverlayForState() {
    if (state === State.START) {
      showOverlay(`
        <div class="card">
          <div class="h1">Hey ${HER_NAME}</div>
          <p class="p">Collect all 7 hearts. Each one has a reason.</p>
          <div class="row">
            <button class="btn" data-action="start">Play</button>
            <button class="btn secondary" data-action="how">How to play</button>
          </div>
          <p class="p small" style="margin-top:12px">Tip: tap anywhere to move.</p>
        </div>
      `);
      return;
    }

    if (state === State.SHOWING_REASON) {
      const reasonText = reasons[collected - 1] || "You found a heart.";
      showOverlay(`
        <div class="card">
          <div class="h1">Heart ${collected} of ${reasons.length}</div>
          <p class="p">${escapeHtml(reasonText)}</p>
          <div class="row">
            <button class="btn" data-action="nextReason">Next</button>
          </div>
        </div>
      `);
      return;
    }

    if (state === State.FINAL_GATE) {
      showOverlay(`
        <div class="card">
          <div class="h1">One last heart</div>
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
          <div class="h1">Leah, will you be my Valentine?</div>
          <p class="p">No pressure. Except yes, pressure. Romantic pressure.</p>
          <div class="row">
            <button class="btn" data-action="yes">Yes</button>
            <button class="btn secondary" data-action="yesAlso">Absolutely yes</button>
          </div>
        </div>
      `);
      return;
    }

    // Playing
    hideOverlay();
  }

  function wireOverlayButtons() {
    overlay.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const action = e.currentTarget.getAttribute("data-action");
        handleAction(action);
      }, { passive: true });
    });
  }

  function handleAction(action) {
    if (action === "how") {
      showOverlay(`
        <div class="card">
          <div class="h1">How to play</div>
          <p class="p">Tap anywhere to move. Collect the heart. Read the reason. Repeat.</p>
          <div class="row">
            <button class="btn" data-action="backToStart">Got it</button>
          </div>
        </div>
      `);
      return;
    }

    if (action === "backToStart") {
      setState(State.START);
      return;
    }

    if (action === "start") {
      startGame();
      return;
    }

    if (action === "nextReason") {
      // After a reason, decide what happens next
      if (collected === reasons.length - 1 && !lastHeartSpawned) {
        setState(State.FINAL_GATE);
        return;
      }
      if (collected >= reasons.length) {
        setState(State.ENDING);
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
      showOverlay(`
        <div class="card">
          <div class="h1">Correct answer</div>
          <p class="p">Happy Valentine’s Day, ${HER_NAME}. I am taking you on a proper date.</p>
          <p class="p small">Now screenshot this and hold it over my head forever.</p>
          <div class="row">
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

    player.x = w * 0.5;
    player.y = h * 0.60;
    player.tx = player.x;
    player.ty = player.y;
  }

  // Touch controls: tap to move
  function onPointerDown(e) {
    if (state !== State.PLAYING) return;

    const pos = getCanvasPos(e);
    player.tx = pos.x;
    player.ty = pos.y;
  }

  function onPointerMove(e) {
    // Optional: allow dragging to update target continuously
    if (state !== State.PLAYING) return;
    if (e.buttons === 0 && e.pointerType === "mouse") return;

    const pos = getCanvasPos(e);
    player.tx = pos.x;
    player.ty = pos.y;
  }

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    const margin = safeMargin();
    return {
      x: clamp(x, margin, w - margin),
      y: clamp(y, margin, h - margin)
    };
  }

  // Prevent browser gestures interfering on mobile
  document.addEventListener("touchmove", (e) => {
    if (state === State.PLAYING) e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });

  // Optional mute button in corner
  const corner = document.createElement("div");
  corner.className = "corner";
  corner.innerHTML = `<button class="iconBtn" id="muteBtn" aria-label="toggle sound">🔇</button>`;
  document.body.appendChild(corner);

  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = muted ? "🔇" : "🔊";
  });

  function tick(dt) {
    update(dt);
    draw(dt);
    requestAnimationFrame(loop);
  }

  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;
    tick(dt);
  }

  function update(dt) {
    // Heart bobbing
    if (heart.alive) heart.bobT += dt * 3.2;

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (state !== State.PLAYING) return;

    // Move player toward target
    if (player.tx != null && player.ty != null) {
      const dx = player.tx - player.x;
      const dy = player.ty - player.y;
      const d = Math.hypot(dx, dy);

      if (d > 1.0) {
        const step = player.speed * dt;
        const nx = dx / d;
        const ny = dy / d;

        player.x += nx * Math.min(step, d);
        player.y += ny * Math.min(step, d);
      }
    }

    // Check collision
    if (heart.alive) {
      const bobOffset = Math.sin(heart.bobT) * (heart.r * 0.22);
      const hx = heart.x;
      const hy = heart.y + bobOffset;

      const hit = dist(player.x, player.y, hx, hy) <= (player.r + heart.r) * 0.92;
      if (hit) {
        heart.alive = false;
        collected++;

        // Light haptics if allowed
        if (navigator.vibrate) navigator.vibrate(18);

        popConfettiBurst(hx, hy, 26);

        setState(State.SHOWING_REASON);
      }
    }
  }

  function draw() {
    // Background
    ctx.clearRect(0, 0, w, h);
    drawBackground();

    // HUD
    drawHud();

    // Heart
    if (heart.alive) {
      const bobOffset = Math.sin(heart.bobT) * (heart.r * 0.22);
      drawHeart(heart.x, heart.y + bobOffset, heart.r);
    }

    // Player
    drawPlayer(player.x, player.y, player.r);

    // Particles
    drawParticles();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b0f1a");
    g.addColorStop(1, "#1a1030");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Subtle stars
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 42; i++) {
      const x = (i * 97) % w;
      const y = (i * 173) % h;
      const r = 1 + (i % 3) * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `600 ${Math.max(14, scaleUnit * 0.02)}px system-ui`;
    ctx.fillText(`Hearts: ${collected} / ${reasons.length}`, 16, 28);
    ctx.globalAlpha = 1;

    // Target indicator
    if (state === State.PLAYING && player.tx != null && player.ty != null) {
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(player.tx, player.ty, Math.max(10, player.r * 0.55), 0, Math.PI * 2);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawPlayer(x, y, r) {
    // Body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fill();

    // Face
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(20,20,30,0.95)";
    const eyeOff = r * 0.32;
    const eyeR = Math.max(1.5, r * 0.11);

    ctx.beginPath();
    ctx.arc(x - eyeOff, y - r * 0.15, eyeR, 0, Math.PI * 2);
    ctx.arc(x + eyeOff, y - r * 0.15, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.12, r * 0.40, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = "rgba(20,20,30,0.55)";
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  function drawHeart(x, y, r) {
    // Simple heart using paths
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

    // Fill and glow
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(255, 120, 170, 0.55)";
    ctx.fillStyle = "rgba(255, 120, 170, 0.95)";
    ctx.fill();

    ctx.restore();
  }

  function popConfettiBurst(x, y, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(120, 420);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 180,
        life: rand(0.55, 1.15),
        size: rand(2, 5)
      });
    }
  }

  function drawParticles() {
    ctx.globalAlpha = 0.9;
    for (const p of particles) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(p.x, p.y, p.size, p.size);
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

  // Init
  window.addEventListener("resize", resize, { passive: true });
  resize();
  setState(State.START);
  requestAnimationFrame(loop);
})();