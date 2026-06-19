(() => {
  "use strict";

  const WIDTH = 960;
  const HEIGHT = 640;
  const GRID = { x: 132, y: 76, w: 696, h: 258, cols: 6, rows: 6 };
  const PLAYER_DAMAGE_Y = HEIGHT - 42;
  const NODE_Y = 558;
  const NODE_RADIUS = 27;
  const NODE_ZONE_HEIGHT = 78;
  const NODE_ZONE_GAP = 8;
  const LANE_KEYS = ["a", "s", "d", "l", ";", "'"];
  const LANE_LABELS = ["A", "S", "D", "L", ";", "'"];
  const BOSS_BALL_SHAPES = ["orb", "bar", "triangle", "square"];
  const MOB_IMAGE_ASPECT = 1448 / 1086;
  const BOSS_IMAGE_ASPECT = 1915 / 821;
  const BOSS_RENDER_WIDTH = 320;
  const MOB_SHOOT_FEEDBACK_TIME = 0.18;
  const BOSS_SHOOT_FEEDBACK_TIME = 0.24;

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const ui = {
    level: document.getElementById("level-value"),
    phase: document.getElementById("phase-value"),
    health: document.getElementById("health-value"),
    target: document.getElementById("target-value"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlay-title"),
    overlayCopy: document.getElementById("overlay-copy"),
    overlayButton: document.getElementById("overlay-button"),
    startButton: document.getElementById("start-button"),
    pauseButton: document.getElementById("pause-button"),
  };

  const imagePaths = {
    background: "assets/ui/background.png",
    node: "assets/player/node.png",
    mob: "assets/enemies/mob.png",
    mobShoot: "assets/enemies/mob_shoot.png",
    boss: "assets/boss/boss.png",
    bossShoot: "assets/boss/boss_shoot.png",
    ball: "assets/balls/ball.png",
  };

  const images = Object.fromEntries(
    Object.entries(imagePaths).map(([key, src]) => [key, loadImage(src)]),
  );

  const state = {
    status: "ready",
    level: 1,
    phase: "mob",
    health: 10,
    maxHealth: 10,
    nodeLane: 2,
    enemies: [],
    boss: null,
    balls: [],
    particles: [],
    fireTimer: 0,
    transitionTimer: 0,
    transitionTo: null,
    shake: 0,
    score: 0,
    lastTime: 0,
  };

  function loadImage(src) {
    const img = new Image();
    img.loaded = false;
    img.onload = () => {
      img.loaded = true;
    };
    img.onerror = () => {
      img.loaded = false;
    };
    img.src = src;
    return img;
  }

  function laneX(index) {
    return laneWidth() * (index + 0.5);
  }

  function laneWidth() {
    return WIDTH / LANE_KEYS.length;
  }

  function laneLeft(index) {
    return laneWidth() * index;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fitToAspect(maxW, maxH, aspect) {
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return { w, h };
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function normalize(dx, dy) {
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function mobHealthForLevel() {
    return 1 + Math.floor((state.level - 1) / 2);
  }

  function mobCountForLevel() {
    return Math.min(10 + state.level * 2, 32);
  }

  function mobFireInterval() {
    return Math.max(0.56, 1.62 - state.level * 0.11);
  }

  function mobFireDelay() {
    const base = mobFireInterval();
    return rand(base * 0.35, base * 0.9);
  }

  function mobBallLimit() {
    return state.level + 2;
  }

  function mobBallsInPlay() {
    return state.balls.filter((ball) => ball.kind === "mob").length;
  }

  function bossHealthForLevel() {
    return 10 + state.level * 5;
  }

  function bossFireInterval() {
    return Math.max(0.58, 1.48 - state.level * 0.055);
  }

  function bossBallLimit() {
    return state.level + 1;
  }

  function mobShotSpeed() {
    return 300 + state.level * 26;
  }

  function ballSpeedBase() {
    return 285 + state.level * 14;
  }

  function bossSpeedCap() {
    return Math.min(940, 515 + state.level * 45);
  }

  function currentNode() {
    return {
      x: laneX(state.nodeLane),
      y: NODE_Y,
      r: NODE_RADIUS,
    };
  }

  function currentNodeZone() {
    return {
      x: laneX(state.nodeLane),
      y: NODE_Y,
      w: laneWidth() - NODE_ZONE_GAP * 2,
      h: NODE_ZONE_HEIGHT,
    };
  }

  function enemyCenter(enemy) {
    const cellW = GRID.w / GRID.cols;
    const cellH = GRID.h / GRID.rows;
    return {
      x: GRID.x + cellW * (enemy.col + 0.5),
      y: GRID.y + cellH * (enemy.row + 0.5),
    };
  }

  function mobRenderSize() {
    const cellW = GRID.w / GRID.cols;
    const cellH = GRID.h / GRID.rows;
    return fitToAspect(cellW * 0.78, cellH * 0.86, MOB_IMAGE_ASPECT);
  }

  function mobRect(enemy) {
    const center = enemyCenter(enemy);
    const size = mobRenderSize();
    return {
      x: center.x,
      y: center.y,
      w: size.w,
      h: size.h,
    };
  }

  function setCanvasScale() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function startGame() {
    state.status = "playing";
    state.level = 1;
    state.health = state.maxHealth;
    state.score = 0;
    state.nodeLane = 2;
    startMobRound();
    hideOverlay();
  }

  function restartRound() {
    if (state.status === "ready" || state.status === "gameover") {
      startGame();
      return;
    }
    state.status = "playing";
    state.health = state.maxHealth;
    startMobRound();
    hideOverlay();
  }

  function startMobRound() {
    state.phase = "mob";
    state.balls = [];
    state.particles = [];
    state.boss = null;
    state.fireTimer = mobFireDelay();
    state.transitionTimer = 0;
    state.transitionTo = null;

    const spots = [];
    for (let row = 0; row < GRID.rows; row += 1) {
      for (let col = 0; col < GRID.cols; col += 1) {
        spots.push({ row, col });
      }
    }

    const hp = mobHealthForLevel();
    state.enemies = shuffle(spots)
      .slice(0, mobCountForLevel())
      .map((spot, index) => ({
        id: `m-${state.level}-${index}`,
        row: spot.row,
        col: spot.col,
        hp,
        maxHp: hp,
        alive: true,
        wobble: rand(0, Math.PI * 2),
        shootTimer: 0,
        shootDuration: MOB_SHOOT_FEEDBACK_TIME,
        recoilTimer: 0,
        recoilDuration: MOB_SHOOT_FEEDBACK_TIME,
        recoilX: 0,
        recoilY: 0,
      }));
  }

  function startBossRound() {
    state.phase = "boss";
    state.enemies = [];
    state.balls = [];
    state.particles = [];
    state.fireTimer = 0.75;
    state.transitionTimer = 0;
    state.transitionTo = null;
    state.boss = {
      x: WIDTH / 2,
      y: 118,
      w: BOSS_RENDER_WIDTH,
      h: BOSS_RENDER_WIDTH / BOSS_IMAGE_ASPECT,
      hp: bossHealthForLevel(),
      maxHp: bossHealthForLevel(),
      hurtFlash: 0,
      shootTimer: 0,
      shootDuration: BOSS_SHOOT_FEEDBACK_TIME,
      recoilTimer: 0,
      recoilDuration: BOSS_SHOOT_FEEDBACK_TIME,
      recoilX: 0,
      recoilY: 0,
    };
  }

  function nextLevel() {
    state.level += 1;
    startMobRound();
  }

  function beginTransition(to) {
    state.phase = "transition";
    state.transitionTo = to;
    state.transitionTimer = 1.2;
    state.balls = [];
  }

  function gameOver() {
    state.status = "gameover";
    state.phase = "gameover";
    state.balls = [];
    state.particles = [];
    showOverlay("GAME OVER", `LEVEL ${state.level}  SCORE ${state.score}`, "RESTART");
  }

  function togglePause() {
    if (state.status === "ready" || state.status === "gameover") {
      return;
    }

    if (state.status === "paused") {
      state.status = "playing";
      hideOverlay();
    } else {
      state.status = "paused";
      showOverlay("PAUSED", `LEVEL ${state.level}`, "RESUME");
    }
  }

  function showOverlay(title, copy, buttonText) {
    ui.overlayTitle.textContent = title;
    ui.overlayCopy.textContent = copy;
    ui.overlayButton.textContent = buttonText;
    ui.overlay.classList.remove("is-hidden");
  }

  function hideOverlay() {
    ui.overlay.classList.add("is-hidden");
  }

  function triggerShootFeedback(actor, dir, power, duration) {
    actor.shootTimer = duration;
    actor.shootDuration = duration;
    actor.recoilTimer = duration;
    actor.recoilDuration = duration;
    actor.recoilX = -dir.x * power;
    actor.recoilY = -dir.y * power;
  }

  function updateShootFeedback(actor, dt) {
    actor.shootTimer = Math.max(0, (actor.shootTimer || 0) - dt);
    actor.recoilTimer = Math.max(0, (actor.recoilTimer || 0) - dt);
  }

  function actorRecoilOffset(actor) {
    const duration = actor.recoilDuration || 1;
    const t = clamp((actor.recoilTimer || 0) / duration, 0, 1);
    const eased = Math.sin(t * Math.PI);
    return {
      x: (actor.recoilX || 0) * eased,
      y: (actor.recoilY || 0) * eased,
    };
  }

  function updateActorFeedback(dt) {
    for (const enemy of state.enemies) {
      if (enemy.alive) {
        updateShootFeedback(enemy, dt);
      }
    }

    if (state.boss) {
      updateShootFeedback(state.boss, dt);
    }
  }

  function fireMobBall(enemy) {
    const from = enemyCenter(enemy);
    const target = { x: laneX(enemy.col), y: NODE_Y };
    const dir = normalize(target.x - from.x, target.y - from.y);
    const speed = mobShotSpeed();
    triggerShootFeedback(enemy, dir, 10, MOB_SHOOT_FEEDBACK_TIME);

    state.balls.push({
      kind: "mob",
      x: from.x,
      y: from.y + 18,
      vx: dir.x * speed,
      vy: dir.y * speed,
      radius: 9,
      originId: enemy.id,
      targetLane: enemy.col,
      reflected: false,
      nodeCooldown: 0,
      trail: [],
    });
  }

  function fireBossBall() {
    if (!state.boss) {
      return;
    }

    const lanes = [0, 1, 2, 3, 4, 5].filter((lane) => lane !== state.nodeLane);
    const targetLane = lanes[Math.floor(Math.random() * lanes.length)];
    const from = {
      x: state.boss.x + rand(-state.boss.w * 0.28, state.boss.w * 0.28),
      y: state.boss.y + state.boss.h * 0.5,
    };
    const target = { x: laneX(targetLane), y: NODE_Y };
    const dir = normalize(target.x - from.x, target.y - from.y);
    const speed = ballSpeedBase() * 0.94;
    triggerShootFeedback(state.boss, dir, 18, BOSS_SHOOT_FEEDBACK_TIME);

    state.balls.push({
      kind: "boss",
      x: from.x,
      y: from.y,
      vx: dir.x * speed,
      vy: dir.y * speed,
      radius: 10,
      targetLane,
      speed,
      nodeCooldown: 0,
      hitCooldown: 0,
      shape: BOSS_BALL_SHAPES[Math.floor(Math.random() * BOSS_BALL_SHAPES.length)],
      rotation: rand(0, Math.PI * 2),
      spin: 0,
      spinTimer: 0,
      spinDuration: 0.55,
      trail: [],
    });
  }

  function reflectMobBall(ball) {
    const targetEnemy = pickMobReturnTarget(ball);
    if (!targetEnemy) {
      ball.remove = true;
      return;
    }

    const target = enemyCenter(targetEnemy);
    const dir = normalize(target.x - ball.x, target.y - ball.y);
    const speed = Math.min(mobShotSpeed() * 1.15, 650);
    ball.vx = dir.x * speed;
    ball.vy = dir.y * speed;
    ball.reflected = true;
    ball.returnTargetId = targetEnemy.id;
    ball.nodeCooldown = 0.15;
    state.shake = Math.max(state.shake, 3);
    spawnBurst(ball.x, ball.y, "#30d5c8", 8);
  }

  function pickMobReturnTarget(ball) {
    const originEnemy = state.enemies.find((enemy) => enemy.id === ball.originId && enemy.alive);
    if (originEnemy) {
      return originEnemy;
    }

    return state.enemies
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({
        enemy,
        distance: Math.abs(enemyCenter(enemy).x - ball.x),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.enemy;
  }

  function findMobHitByBall(ball) {
    const start = {
      x: typeof ball.prevX === "number" ? ball.prevX : ball.x,
      y: typeof ball.prevY === "number" ? ball.prevY : ball.y,
    };

    return state.enemies
      .filter((enemy) => enemy.alive && ballTouchesRect(ball, mobRect(enemy)))
      .map((enemy) => ({
        enemy,
        distance: distance(start, enemyCenter(enemy)),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.enemy;
  }

  function accelerateBossBall(ball, amount = 1.075) {
    const current = Math.hypot(ball.vx, ball.vy) || ball.speed || ballSpeedBase();
    const next = Math.min(current * amount, bossSpeedCap());
    const dir = normalize(ball.vx, ball.vy);
    ball.vx = dir.x * next;
    ball.vy = dir.y * next;
    ball.speed = next;
  }

  function triggerBossShapeSpin(ball, power = 6) {
    if (ball.kind !== "boss" || ball.shape === "orb") {
      return;
    }

    const direction = ball.vx >= 0 ? 1 : -1;
    ball.spin = direction * rand(power * 0.75, power * 1.25);
    ball.spinTimer = ball.spinDuration || 0.55;
  }

  function updateBossShapeSpin(ball, dt) {
    if (ball.kind !== "boss" || ball.shape === "orb") {
      return;
    }

    ball.spinTimer = Math.max(0, (ball.spinTimer || 0) - dt);
    if (ball.spinTimer <= 0) {
      ball.spin = 0;
      return;
    }

    const remaining = ball.spinTimer / (ball.spinDuration || 0.55);
    ball.rotation += (ball.spin || 0) * remaining * dt;
  }

  function reflectBossBallFromNode(ball, zone) {
    const offset = clamp((ball.x - zone.x) / (zone.w / 2), -1, 1);
    const angle = -Math.PI / 2 + offset * 0.82;
    const speed = Math.min((ball.speed || ballSpeedBase()) * 1.08, bossSpeedCap());
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.speed = speed;
    ball.nodeCooldown = 0.15;
    triggerBossShapeSpin(ball, 7);
    state.shake = Math.max(state.shake, 4);
    spawnBurst(ball.x, ball.y, "#30d5c8", 10);
  }

  function rectBounds(rect, pad = 0) {
    return {
      left: rect.x - rect.w / 2 - pad,
      right: rect.x + rect.w / 2 + pad,
      top: rect.y - rect.h / 2 - pad,
      bottom: rect.y + rect.h / 2 + pad,
    };
  }

  function circleRectHit(ball, rect) {
    const { left, right, top, bottom } = rectBounds(rect);
    const closestX = clamp(ball.x, left, right);
    const closestY = clamp(ball.y, top, bottom);
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    return dx * dx + dy * dy <= ball.radius * ball.radius;
  }

  function pointInBounds(x, y, bounds) {
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }

  function segmentIntersectsBounds(x1, y1, x2, y2, bounds) {
    if (pointInBounds(x1, y1, bounds) || pointInBounds(x2, y2, bounds)) {
      return true;
    }

    const dx = x2 - x1;
    const dy = y2 - y1;
    let tMin = 0;
    let tMax = 1;
    const edges = [
      [-dx, x1 - bounds.left],
      [dx, bounds.right - x1],
      [-dy, y1 - bounds.top],
      [dy, bounds.bottom - y1],
    ];

    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) {
          return false;
        }
        continue;
      }

      const t = q / p;
      if (p < 0) {
        tMin = Math.max(tMin, t);
      } else {
        tMax = Math.min(tMax, t);
      }

      if (tMin > tMax) {
        return false;
      }
    }

    return true;
  }

  function ballTouchesRect(ball, rect) {
    if (circleRectHit(ball, rect)) {
      return true;
    }

    if (typeof ball.prevX !== "number" || typeof ball.prevY !== "number") {
      return false;
    }

    return segmentIntersectsBounds(
      ball.prevX,
      ball.prevY,
      ball.x,
      ball.y,
      rectBounds(rect, ball.radius),
    );
  }

  function bounceBallOnArenaWalls(ball, includeBottom = true) {
    let bounced = false;

    if (ball.x < ball.radius) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx);
      bounced = true;
    } else if (ball.x > WIDTH - ball.radius) {
      ball.x = WIDTH - ball.radius;
      ball.vx = -Math.abs(ball.vx);
      bounced = true;
    }

    if (ball.y < ball.radius) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
      bounced = true;
    } else if (includeBottom && ball.y > HEIGHT - ball.radius) {
      ball.y = HEIGHT - ball.radius;
      ball.vy = -Math.abs(ball.vy);
      bounced = true;
    }

    if (bounced) {
      state.shake = Math.max(state.shake, 2);
      spawnBurst(ball.x, ball.y, "#30d5c8", 5);
    }

    return bounced;
  }

  function damagePlayer() {
    state.health = Math.max(0, state.health - 1);
    state.shake = Math.max(state.shake, 10);
    spawnBurst(WIDTH / 2, HEIGHT - 34, "#ef476f", 18);
    if (state.health <= 0) {
      gameOver();
    }
  }

  function hitEnemy(enemy, ball) {
    enemy.hp -= 1;
    state.score += 10;
    spawnBurst(ball.x, ball.y, enemy.hp <= 0 ? "#f7b84b" : "#ef476f", 14);
    state.shake = Math.max(state.shake, 5);

    if (enemy.hp <= 0) {
      enemy.alive = false;
      state.score += 35;
    }
  }

  function hitBoss(ball) {
    if (!state.boss || ball.hitCooldown > 0) {
      return;
    }

    state.boss.hp = Math.max(0, state.boss.hp - 1);
    state.boss.hurtFlash = 0.12;
    ball.hitCooldown = 0.25;
    ball.y = state.boss.y + state.boss.h / 2 + ball.radius + 2;
    ball.vy = Math.abs(ball.vy);
    accelerateBossBall(ball, 1.06);
    triggerBossShapeSpin(ball, 6.5);
    state.score += 25;
    state.shake = Math.max(state.shake, 5);
    spawnBurst(ball.x, ball.y, "#f7b84b", 15);

    if (state.boss.hp <= 0) {
      state.score += 150 + state.level * 20;
      beginTransition("next");
    }
  }

  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x,
        y,
        vx: rand(-150, 150),
        vy: rand(-150, 150),
        life: rand(0.22, 0.48),
        maxLife: 0.48,
        size: rand(2, 5),
        color,
      });
    }
  }

  function update(dt) {
    if (state.status !== "playing") {
      return;
    }

    state.shake = Math.max(0, state.shake - dt * 24);
    updateParticles(dt);
    updateActorFeedback(dt);

    if (state.phase === "transition") {
      state.transitionTimer -= dt;
      if (state.transitionTimer <= 0) {
        if (state.transitionTo === "boss") {
          startBossRound();
        } else if (state.transitionTo === "next") {
          nextLevel();
        }
      }
      return;
    }

    if (state.phase === "mob") {
      updateMobRound(dt);
    } else if (state.phase === "boss") {
      updateBossRound(dt);
    }

    updateBalls(dt);
  }

  function updateMobRound(dt) {
    const aliveEnemies = state.enemies.filter((enemy) => enemy.alive);
    if (aliveEnemies.length === 0) {
      beginTransition("boss");
      return;
    }

    state.fireTimer -= dt;
    if (state.fireTimer <= 0) {
      if (mobBallsInPlay() < mobBallLimit()) {
        const enemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        fireMobBall(enemy);
        state.fireTimer = mobFireDelay();
      } else {
        state.fireTimer = 0.05;
      }
    }
  }

  function updateBossRound(dt) {
    if (!state.boss) {
      return;
    }

    state.boss.hurtFlash = Math.max(0, state.boss.hurtFlash - dt);
    state.fireTimer -= dt;

    if (state.fireTimer <= 0 && state.balls.length < bossBallLimit()) {
      fireBossBall();
      state.fireTimer = bossFireInterval();
    }
  }

  function updateBalls(dt) {
    const nodeZone = currentNodeZone();

    for (const ball of state.balls) {
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 9) {
        ball.trail.shift();
      }

      ball.prevX = ball.x;
      ball.prevY = ball.y;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.kind === "boss") {
        updateBossShapeSpin(ball, dt);
      }

      if (ball.kind === "mob") {
        updateMobBall(ball, nodeZone, dt);
      } else {
        updateBossBall(ball, nodeZone, dt);
      }
    }

    state.balls = state.balls.filter((ball) => !ball.remove);
  }

  function updateMobBall(ball, nodeZone, dt) {
    ball.nodeCooldown = Math.max(0, (ball.nodeCooldown || 0) - dt);

    if (ball.nodeCooldown <= 0 && ball.vy > 0 && ballTouchesRect(ball, nodeZone)) {
      reflectMobBall(ball);
      return;
    }

    if (ball.reflected) {
      bounceBallOnArenaWalls(ball, false);

      const hitEnemyTarget = findMobHitByBall(ball);
      if (hitEnemyTarget) {
        hitEnemy(hitEnemyTarget, ball);
        ball.remove = true;
        return;
      }

      if (ball.vy > 0 && ball.y + ball.radius >= PLAYER_DAMAGE_Y) {
        ball.remove = true;
        damagePlayer();
      }
    } else if (ball.vy > 0 && ball.y + ball.radius >= PLAYER_DAMAGE_Y) {
      ball.remove = true;
      damagePlayer();
    }
  }

  function updateBossBall(ball, nodeZone, dt) {
    ball.nodeCooldown = Math.max(0, ball.nodeCooldown - dt);
    ball.hitCooldown = Math.max(0, ball.hitCooldown - dt);

    if (ball.x < ball.radius) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx);
      accelerateBossBall(ball, 1.025);
      triggerBossShapeSpin(ball, 5);
    } else if (ball.x > WIDTH - ball.radius) {
      ball.x = WIDTH - ball.radius;
      ball.vx = -Math.abs(ball.vx);
      accelerateBossBall(ball, 1.025);
      triggerBossShapeSpin(ball, 5);
    }

    if (ball.y < ball.radius) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
      accelerateBossBall(ball, 1.025);
      triggerBossShapeSpin(ball, 5);
    }

    if (ball.nodeCooldown <= 0 && ball.vy > 0 && ballTouchesRect(ball, nodeZone)) {
      reflectBossBallFromNode(ball, nodeZone);
    }

    if (state.boss && circleRectHit(ball, state.boss)) {
      hitBoss(ball);
    }

    if (ball.y > HEIGHT + ball.radius) {
      ball.remove = true;
      damagePlayer();
    }
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function render() {
    ctx.save();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const shakeX = state.shake ? rand(-state.shake, state.shake) : 0;
    const shakeY = state.shake ? rand(-state.shake, state.shake) : 0;
    ctx.translate(shakeX, shakeY);

    drawBackground();
    drawLanes();

    if (state.phase === "mob" || state.phase === "transition") {
      drawEnemies();
    }

    if (state.phase === "boss" || (state.phase === "transition" && state.transitionTo === "next")) {
      drawBoss();
    }

    drawBalls();
    drawNode();
    drawParticles();
    drawRoundMessage();

    ctx.restore();
    updateHud();
    requestAnimationFrame(loop);
  }

  function drawBackground() {
    if (images.background.loaded) {
      ctx.drawImage(images.background, 0, 0, WIDTH, HEIGHT);
    } else {
      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bg.addColorStop(0, "#17171b");
      bg.addColorStop(0.52, "#101014");
      bg.addColorStop(1, "#151315");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= WIDTH; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= HEIGHT; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fillRect(0, 458, WIDTH, 2);
    ctx.fillStyle = "rgba(239,71,111,0.13)";
    ctx.fillRect(0, PLAYER_DAMAGE_Y, WIDTH, HEIGHT - PLAYER_DAMAGE_Y);
  }

  function drawLanes() {
    const zoneTop = NODE_Y - NODE_ZONE_HEIGHT / 2;

    for (let i = 0; i < 6; i += 1) {
      const x = laneX(i);
      const left = laneLeft(i);
      const active = i === state.nodeLane;

      ctx.fillStyle = active ? "rgba(48,213,200,0.11)" : "rgba(255,255,255,0.025)";
      ctx.fillRect(left + NODE_ZONE_GAP, zoneTop, laneWidth() - NODE_ZONE_GAP * 2, NODE_ZONE_HEIGHT);

      ctx.strokeStyle = active ? "rgba(48,213,200,0.78)" : "rgba(255,255,255,0.12)";
      ctx.lineWidth = active ? 3 : 1;
      ctx.strokeRect(left + NODE_ZONE_GAP, zoneTop, laneWidth() - NODE_ZONE_GAP * 2, NODE_ZONE_HEIGHT);

      ctx.strokeStyle = active ? "rgba(48,213,200,0.55)" : "rgba(255,255,255,0.1)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 48);
      ctx.lineTo(x, HEIGHT - 48);
      ctx.stroke();

      ctx.fillStyle = active ? "#30d5c8" : "rgba(255,255,255,0.45)";
      ctx.font = "900 18px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(LANE_LABELS[i], x, HEIGHT - 16);
    }
  }

  function drawEnemies() {
    const size = mobRenderSize();

    for (const enemy of state.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const center = enemyCenter(enemy);
      const pulse = Math.sin(performance.now() / 360 + enemy.wobble) * 2;
      const w = size.w;
      const h = size.h;
      const recoil = actorRecoilOffset(enemy);
      const drawX = center.x + recoil.x;
      const drawY = center.y + pulse + recoil.y;
      const shooting = enemy.shootTimer > 0;
      const mobImage = shooting && images.mobShoot.loaded ? images.mobShoot : images.mob.loaded ? images.mob : null;

      if (mobImage) {
        ctx.drawImage(mobImage, drawX - w / 2, drawY - h / 2, w, h);
      } else {
        ctx.fillStyle = shooting ? "#4a3a32" : "#2e3136";
        ctx.fillRect(drawX - w / 2, drawY - h / 2, w, h);
        ctx.fillStyle = shooting ? "#f7b84b" : "#ef476f";
        ctx.fillRect(drawX - w / 2 + 5, drawY - h / 2 + 5, w - 10, h - 10);
        ctx.fillStyle = "#f7b84b";
        ctx.fillRect(drawX - w / 2 + 9, drawY - h / 2 + 9, w - 18, 7);
        if (shooting) {
          ctx.fillStyle = "#f3efe7";
          ctx.fillRect(drawX - 5, drawY + h / 2 - 4, 10, 9);
        }
      }

      drawHealthBar(drawX - w / 2, drawY + h / 2 + 7, w, 5, enemy.hp, enemy.maxHp);
    }
  }

  function drawBoss() {
    if (!state.boss) {
      return;
    }

    const boss = state.boss;
    const recoil = actorRecoilOffset(boss);
    const drawX = boss.x + recoil.x;
    const drawY = boss.y + recoil.y;
    const left = drawX - boss.w / 2;
    const top = drawY - boss.h / 2;
    const flash = boss.hurtFlash > 0;
    const shooting = boss.shootTimer > 0;
    const bossImage = shooting && images.bossShoot.loaded ? images.bossShoot : images.boss.loaded ? images.boss : null;

    if (bossImage) {
      ctx.globalAlpha = flash ? 0.72 : 1;
      ctx.drawImage(bossImage, left, top, boss.w, boss.h);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = flash || shooting ? "#f7b84b" : "#3c3442";
      ctx.fillRect(left, top, boss.w, boss.h);
      ctx.fillStyle = "#30d5c8";
      ctx.fillRect(left + 18, top + 16, boss.w - 36, 10);
      ctx.fillStyle = "#ef476f";
      ctx.fillRect(left + 36, top + 44, boss.w - 72, 22);
      ctx.fillStyle = "#101012";
      ctx.fillRect(left + 70, top + 42, 24, 28);
      ctx.fillRect(left + boss.w - 94, top + 42, 24, 28);
      if (shooting) {
        ctx.fillStyle = "#f3efe7";
        ctx.fillRect(left + boss.w / 2 - 18, top + boss.h - 10, 36, 16);
      }
    }

    drawHealthBar(left, top + boss.h + 13, boss.w, 9, boss.hp, boss.maxHp);
  }

  function drawNode() {
    const node = currentNode();
    ctx.save();
    ctx.translate(node.x, node.y);

    if (images.node.loaded) {
      ctx.drawImage(images.node, -NODE_RADIUS, -NODE_RADIUS, NODE_RADIUS * 2, NODE_RADIUS * 2);
    } else {
      ctx.fillStyle = "rgba(48,213,200,0.16)";
      ctx.beginPath();
      ctx.arc(0, 0, NODE_RADIUS + 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#30d5c8";
      ctx.beginPath();
      ctx.arc(0, 0, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#f3efe7";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(0, -12);
      ctx.lineTo(11, 0);
      ctx.lineTo(0, 12);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBalls() {
    for (const ball of state.balls) {
      for (let i = 0; i < ball.trail.length; i += 1) {
        const point = ball.trail[i];
        const alpha = (i + 1) / ball.trail.length;
        const trailColor = ball.kind === "boss" ? "247, 184, 75" : "48, 213, 200";
        ctx.fillStyle = `rgba(${trailColor}, ${alpha * 0.16})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, ball.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      if (ball.kind === "boss") {
        drawBossBall(ball);
      } else if (images.ball.loaded) {
        ctx.drawImage(
          images.ball,
          ball.x - ball.radius * 1.4,
          ball.y - ball.radius * 1.4,
          ball.radius * 2.8,
          ball.radius * 2.8,
        );
      } else {
        drawMobBall(ball);
      }
    }
  }

  function drawMobBall(ball) {
    ctx.fillStyle = ball.reflected ? "#30d5c8" : "#ef476f";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.35, ball.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBossBall(ball) {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rotation || 0);
    ctx.fillStyle = "#f7b84b";
    ctx.strokeStyle = "#f3efe7";
    ctx.lineWidth = 2;

    if (ball.shape === "bar") {
      ctx.fillRect(-18, -5, 36, 10);
      ctx.strokeRect(-18, -5, 36, 10);
      ctx.fillStyle = "#ef476f";
      ctx.fillRect(-4, -5, 8, 10);
    } else if (ball.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(15, 12);
      ctx.lineTo(-15, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ef476f";
      ctx.beginPath();
      ctx.arc(0, 3, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (ball.shape === "square") {
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.fillStyle = "#30d5c8";
      ctx.fillRect(-5, -5, 10, 10);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(-4, -5, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      ctx.globalAlpha = 1;
    }
  }

  function drawHealthBar(x, y, w, h, hp, maxHp) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hp / maxHp > 0.35 ? "#76e06f" : "#ef476f";
    ctx.fillRect(x, y, w * clamp(hp / maxHp, 0, 1), h);
  }

  function drawRoundMessage() {
    if (state.phase !== "transition") {
      return;
    }

    const text = state.transitionTo === "boss" ? "BOSS" : `LEVEL ${state.level + 1}`;
    ctx.fillStyle = "rgba(16,16,18,0.58)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#f3efe7";
    ctx.font = "900 72px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, WIDTH / 2, HEIGHT / 2);
  }

  function updateHud() {
    ui.level.textContent = state.level;
    ui.health.textContent = state.health;

    if (state.phase === "mob") {
      ui.phase.textContent = "잡몹";
      ui.target.textContent = state.enemies.filter((enemy) => enemy.alive).length;
    } else if (state.phase === "boss") {
      ui.phase.textContent = "보스";
      ui.target.textContent = state.boss ? `${state.boss.hp}/${state.boss.maxHp}` : "0";
    } else if (state.phase === "transition") {
      ui.phase.textContent = "전환";
      ui.target.textContent = "-";
    } else {
      ui.phase.textContent = "-";
      ui.target.textContent = "-";
    }

    ui.pauseButton.textContent = state.status === "paused" ? "▶" : "Ⅱ";
  }

  function loop(timestamp) {
    const dt = Math.min((timestamp - state.lastTime) / 1000 || 0, 0.033);
    state.lastTime = timestamp;
    update(dt);
    render();
  }

  function handleKeydown(event) {
    let key = event.key.toLowerCase();
    if (event.code === "Semicolon") {
      key = ";";
    } else if (event.code === "Quote") {
      key = "'";
    }

    const lane = LANE_KEYS.indexOf(key);
    if (lane >= 0) {
      state.nodeLane = lane;
      event.preventDefault();
      return;
    }

    if (event.code === "Space" || event.code === "Enter") {
      if (state.status === "ready" || state.status === "gameover") {
        startGame();
      } else {
        togglePause();
      }
      event.preventDefault();
    }
  }

  ui.startButton.addEventListener("click", restartRound);
  ui.overlayButton.addEventListener("click", () => {
    if (state.status === "paused") {
      togglePause();
    } else {
      startGame();
    }
  });
  ui.pauseButton.addEventListener("click", togglePause);
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", setCanvasScale);

  setCanvasScale();
  showOverlay("REBOUND NODE", "LEVEL 1", "START");
  requestAnimationFrame(loop);
})();
