/* =========================================================================
   entities.js — the "things" in the game world and how each one
   updates and draws itself. game.js owns the lists and the main loop.
   ========================================================================= */

// ---------- Small math helpers ----------
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// ---------- Player ----------
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = CONFIG.PLAYER.radius;
    this.maxHp = CONFIG.PLAYER.maxHp;
    this.hp = this.maxHp;
    this.speed = CONFIG.PLAYER.speed;
    this.fireDelay = CONFIG.PLAYER.fireDelay;
    this.damage = CONFIG.PLAYER.bulletDamage;
    this.cooldown = 0;     // time until next shot allowed
    this.angle = 0;        // facing direction (radians), follows the mouse
    this.flash = 0;        // muzzle flash timer
    this.hurtTimer = 0;    // red tint timer after taking damage
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Gun barrel
    ctx.fillStyle = '#9fb3c8';
    ctx.fillRect(4, -3, 20, 6);

    // Muzzle flash (a quick yellow burst at the end of the barrel)
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255, 230, 120, 0.9)';
      ctx.beginPath();
      ctx.arc(28, 0, 7 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body
    ctx.shadowColor = '#4fc3ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = this.hurtTimer > 0 ? '#ff6b6b' : '#4fc3ff';
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Visor
    ctx.fillStyle = '#e8f7ff';
    ctx.beginPath();
    ctx.arc(6, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- Radio tower ----------
// The tower shrinks as it takes damage (100% size at full health down to
// ~45% near zero) and grows back when repaired. Its hitbox (this.r) always
// matches the drawn size.
class Tower {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.baseR = CONFIG.TOWER.radius;
    this.maxHp = CONFIG.TOWER.maxHp;
    this.hp = this.maxHp;
    this.scale = 1;      // smoothed size factor
    this.r = this.baseR; // collision radius = drawn radius
    this.pulse = 0;      // drives the expanding signal rings
    this.hurtTimer = 0;
  }

  // Size the tower should be at its current health.
  targetScale() {
    const f = clamp(this.hp / this.maxHp, 0, 1);
    return CONFIG.TOWER.minScale + (1 - CONFIG.TOWER.minScale) * f;
  }

  update(dt) {
    this.pulse += dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    // Ease toward the target size (smooth shrink / regrow).
    this.scale += (this.targetScale() - this.scale) * Math.min(1, dt * 4);
    this.r = this.baseR * this.scale;
  }

  // signal: 0..1, how close rescue is. Rings get brighter as it grows.
  draw(ctx, signal) {
    const { x, y, r, scale: s } = this;

    // Expanding signal rings (3 rings, offset in time) — weaker when damaged
    for (let i = 0; i < 3; i++) {
      const t = (this.pulse * 0.6 + i / 3) % 1;      // 0..1
      const ringR = r + t * 220 * s;
      ctx.strokeStyle = `rgba(80, 220, 255, ${(1 - t) * (0.25 + signal * 0.5) * (0.4 + 0.6 * s)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Soft glow on the ground
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    glow.addColorStop(0, `rgba(80, 200, 255, ${0.15 + 0.2 * s})`);
    glow.addColorStop(1, 'rgba(80, 200, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 3, 0, Math.PI * 2);
    ctx.fill();

    // Base platform (hexagon)
    ctx.fillStyle = this.hurtTimer > 0 ? '#5a2a2a' : '#1d2a3a';
    ctx.strokeStyle = '#4fc3ff';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Antenna mast (cross shape seen from above)
    ctx.strokeStyle = '#9fdcff';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y); ctx.lineTo(x + r * 0.6, y);
    ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x, y + r * 0.6);
    ctx.stroke();

    // Blinking beacon on top
    const blink = 0.5 + 0.5 * Math.sin(this.pulse * 6);
    ctx.shadowColor = '#ff4040';
    ctx.shadowBlur = 20 * blink * s;
    ctx.fillStyle = `rgba(255, ${80 + 100 * blink}, 80, 1)`;
    ctx.beginPath();
    ctx.arc(x, y, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ---------- Bullet ----------
class Bullet {
  constructor(x, y, angle, speed, damage, color) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.color = color;
    this.r = 3;
    this.life = 1.2;   // seconds before it disappears
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    // Draw as a short glowing streak pointing the way it travels.
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.02, this.y - this.vy * 0.02);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// ---------- Alien ----------
class Alien {
  constructor(type, x, y, hpScale, speedScale) {
    const def = CONFIG.ALIENS[type];
    this.type = type;
    this.x = x;
    this.y = y;
    this.r = def.radius;
    this.maxHp = def.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = def.speed * speedScale * rand(0.9, 1.1);
    this.damage = def.damage;     // damage per second while touching
    this.points = def.points;
    this.color = def.color;
    // Decide what this alien goes after.
    this.target = def.target === 'mixed' ? (Math.random() < 0.35 ? 'player' : 'tower') : def.target;
    this.wobble = Math.random() * Math.PI * 2; // for the animated legs
    this.hitFlash = 0;
    this.dead = false;
  }

  // Move toward the target; returns which thing it is touching (or null).
  update(dt, player, tower) {
    this.wobble += dt * 10;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    const goal = this.target === 'player' ? player : tower;
    const d = dist(this.x, this.y, goal.x, goal.y);
    const touchDist = this.r + goal.r;

    if (d > touchDist) {
      this.x += ((goal.x - this.x) / d) * this.speed * dt;
      this.y += ((goal.y - this.y) / d) * this.speed * dt;
    }

    // Aliens on their way to the tower will still bite the player if they bump into them.
    if (dist(this.x, this.y, player.x, player.y) <= this.r + player.r + 2) return 'player';
    if (dist(this.x, this.y, tower.x, tower.y) <= this.r + tower.r + 2) return 'tower';
    return null;
  }

  draw(ctx) {
    const { x, y, r } = this;
    ctx.save();
    ctx.translate(x, y);

    // Wiggling legs
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.sin(this.wobble + i) * 0.25;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
      ctx.stroke();
    }

    // Glowing body
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : this.color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Eyes
    ctx.fillStyle = '#0a0f0a';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.arc(r * 0.35, -r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Small health bar for tougher aliens once damaged
    if (this.hp < this.maxHp && this.maxHp > 20) {
      ctx.fillStyle = '#300';
      ctx.fillRect(x - r, y - r - 9, r * 2, 4);
      ctx.fillStyle = '#7dff5a';
      ctx.fillRect(x - r, y - r - 9, r * 2 * (this.hp / this.maxHp), 4);
    }
  }
}

// ---------- Auto-turret ----------
class Turret {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 12;
    this.angle = 0;
    this.cooldown = 0;
    this.flash = 0;
  }

  // Finds the nearest alien in range and returns a new Bullet if it fires.
  update(dt, aliens) {
    this.cooldown -= dt;
    if (this.flash > 0) this.flash -= dt;

    let best = null;
    let bestD = CONFIG.TURRET.range;
    for (const a of aliens) {
      const d = dist(this.x, this.y, a.x, a.y);
      if (d < bestD) { best = a; bestD = d; }
    }
    if (!best) return null;

    this.angle = Math.atan2(best.y - this.y, best.x - this.x);
    if (this.cooldown <= 0) {
      this.cooldown = CONFIG.TURRET.fireDelay;
      this.flash = 0.05;
      return new Bullet(
        this.x + Math.cos(this.angle) * 16, this.y + Math.sin(this.angle) * 16,
        this.angle, 650, CONFIG.TURRET.damage, '#ffb347'
      );
    }
    return null;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#2b3442';
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    ctx.fillRect(-this.r, -this.r, this.r * 2, this.r * 2);
    ctx.strokeRect(-this.r, -this.r, this.r * 2, this.r * 2);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(0, -3, 18, 6);
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
      ctx.beginPath();
      ctx.arc(20, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- Particle (sparks, alien goo, etc.) ----------
class Particle {
  constructor(x, y, color, speed = 200, life = 0.5, size = 3) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.3, speed);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.color = color;
    this.life = this.maxLife = life * rand(0.6, 1.2);
    this.size = size;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.92; // friction
    this.vy *= 0.92;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

// ---------- Floating text ("+5", "REPAIRED", ...) ----------
class FloatText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 0.8;
    this.dead = false;
  }
  update(dt) {
    this.y -= 40 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life / 0.8);
    ctx.fillStyle = this.color;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}
