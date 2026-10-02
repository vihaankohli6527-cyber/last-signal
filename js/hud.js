/* =========================================================================
   hud.js — the on-screen display: health, armour, ammo, credits, wave,
   tower health, rescue signal, crosshair, hit markers, damage indicators,
   floating damage numbers, kill feed and banners. Plain HTML elements.
   ========================================================================= */
import * as THREE from '../lib/three.module.js';
import { CONFIG } from './config.js';
import { WEAPON_ORDER } from './weapons.js';

const $ = (id) => document.getElementById(id);
const ENEMY_NAMES = { runner: 'Runner', brute: 'Brute', spitter: 'Spitter', boss: 'Hive Colossus' };
const _v = new THREE.Vector3();

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.cache = {};
    this.indicators = [];
    this.numbers = [];
    this.hitT = 0;
    this.bannerT = 0;
    // pool of floating damage numbers
    for (let i = 0; i < 24; i++) {
      const d = document.createElement('div');
      d.className = 'dn'; d.style.display = 'none';
      $('dmg-numbers').appendChild(d);
      this.numbers.push({ el: d, t: 0, pos: new THREE.Vector3() });
    }
    this.numIdx = 0;
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  // Only touch the DOM when a value actually changes (keeps things fast).
  set(id, prop, value) {
    const key = id + prop;
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    const el = $(id);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'html') el.innerHTML = value;
  }

  weaponChanged() {
    const ws = this.game.weapons;
    if (!ws) return;
    const html = WEAPON_ORDER.map((id) => {
      const d = CONFIG.WEAPONS[id];
      const cls = ['slot', ws.owned[id] ? 'owned' : '', ws.current === id ? 'active' : ''].join(' ');
      return `<div class="${cls}"><b>${d.slot}</b>${d.short}</div>`;
    }).join('');
    $('weapon-slots').innerHTML = html;
    this.cache = {};
  }

  hitMarker(kind) { // kind: 'hit' | 'head' | 'kill'
    const el = $('hitmarker');
    el.className = kind === 'hit' ? '' : kind;
    el.style.opacity = 1;
    this.hitT = kind === 'kill' ? 0.35 : 0.18;
  }

  damageIndicator(srcPos) {
    const el = document.createElement('div');
    el.className = 'ind';
    $('dmg-indicators').appendChild(el);
    this.indicators.push({ el, src: srcPos.clone(), t: 1.2 });
  }

  damageNumber(pos, amount, head) {
    const n = this.numbers[this.numIdx];
    this.numIdx = (this.numIdx + 1) % this.numbers.length;
    n.pos.copy(pos); n.pos.y += 0.3;
    n.t = 0.8;
    n.el.textContent = Math.round(amount);
    n.el.className = 'dn' + (head ? ' head' : '');
    n.el.style.display = 'block';
    n.dx = (Math.random() - 0.5) * 30;
  }

  killFeed(weaponId, enemyType, credits, head) {
    const kf = $('killfeed');
    const el = document.createElement('div');
    el.className = 'kf';
    const wname = weaponId === 'turret' ? 'Turret' : CONFIG.WEAPONS[weaponId] ? CONFIG.WEAPONS[weaponId].name : weaponId;
    el.innerHTML = `<span class="w">${wname}</span> ▸ <span class="e" style="color:#${CONFIG.ENEMIES[enemyType].color.toString(16).padStart(6, '0')}">${ENEMY_NAMES[enemyType]}</span>${head ? '<span class="h">◎</span>' : ''}<span class="c">+${credits}</span>`;
    kf.prepend(el);
    while (kf.children.length > 6) kf.lastChild.remove();
    setTimeout(() => { el.style.opacity = 0; }, 3500);
    setTimeout(() => el.remove(), 4100);
  }

  banner(title, sub = '', dur = 2.5) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    const b = $('banner');
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    this.bannerT = dur;
  }

  hint(html) {
    const el = $('hint');
    if (this.cache.hint === html) return;
    this.cache.hint = html;
    el.innerHTML = html || '';
    el.classList.toggle('show', !!html);
  }

  update(dt) {
    const g = this.game, p = g.player, ws = g.weapons, d = ws.def, a = ws.ammo[ws.current];
    // Vitals
    this.set('hp-text', 'text', Math.ceil(p.hp));
    this.set('hp-fill', 'width', (p.hp / p.maxHp * 100).toFixed(1) + '%');
    this.set('armour-text', 'text', Math.ceil(p.armour));
    this.set('armour-fill', 'width', (p.armour / CONFIG.PLAYER.maxArmour * 100).toFixed(1) + '%');
    $('hp-text').parentElement.classList.toggle('low', p.hp < 30);
    // Low health = red edges
    const vig = Math.max(0, 1 - p.hp / 45);
    $('vignette').style.boxShadow = `inset 0 0 ${120 + vig * 120}px rgba(255,0,30,${(vig * 0.7 + g.hurtFlash * 0.6).toFixed(2)})`;
    g.hurtFlash = Math.max(0, g.hurtFlash - dt * 2.5);

    // Tower, credits, wave, signal
    const tf = Math.max(0, g.towerHp / CONFIG.TOWER.maxHp);
    this.set('tower-fill', 'width', (tf * 100).toFixed(1) + '%');
    this.set('tower-text', 'text', Math.ceil(g.towerHp));
    $('tower-fill').style.background = tf < 0.3 ? 'linear-gradient(90deg,#c81e3a,#ff4655)' : '';
    this.set('credits', 'text', g.credits.toLocaleString());
    this.set('area-label', 'text', `AREA ${g.area}`);
    this.set('wave-label', 'text', g.phase === 'wave' ? `WAVE ${g.wave}/${CONFIG.WAVES_PER_AREA}` : `NEXT: WAVE ${g.wave + 1}/${CONFIG.WAVES_PER_AREA}`);
    this.set('signal-fill', 'width', (g.signalProgress() * 100).toFixed(1) + '%');
    const left = g.enemiesRemaining();
    this.set('enemies-left', 'text', g.phase === 'wave' ? `ENEMIES ${left}` : 'BUY PHASE');
    // Boss bar
    const boss = g.enemies.list.find((e) => e.type === 'boss');
    $('boss-bar').classList.toggle('hidden', !boss);
    if (boss) this.set('boss-fill', 'width', (Math.max(0, boss.hp / boss.maxHp) * 100).toFixed(1) + '%');

    // Weapon / ammo
    this.set('weapon-name', 'text', d.name.toUpperCase());
    if (d.mag) {
      this.set('ammo-mag', 'text', a.mag);
      this.set('ammo-res', 'text', d.maxReserve >= 999 ? '/ ∞' : '/ ' + a.reserve);
      $('ammo').classList.toggle('empty', a.mag === 0);
    } else { this.set('ammo-mag', 'text', '—'); this.set('ammo-res', 'text', ''); }
    const reloading = ws.reloadT > 0;
    $('reload-bar').classList.toggle('hidden', !reloading);
    if (reloading) $('reload-fill').style.width = ((1 - ws.reloadT / d.reload) * 100) + '%';

    // Crosshair spreads with inaccuracy; hidden while scoped.
    const spread = 4 + ws.currentSpread() * 400;
    const ch = $('crosshair');
    ch.style.display = ws.scoped ? 'none' : 'block';
    ch.children[0].style.top = (-spread - 7) + 'px'; ch.children[1].style.top = spread + 'px';
    ch.children[2].style.left = (-spread - 7) + 'px'; ch.children[3].style.left = spread + 'px';
    $('scope').classList.toggle('hidden', !ws.scoped);
    // Bow charge bar
    const showCharge = ws.current === 'bow' && ws.charge > 0;
    $('charge').style.display = showCharge ? 'block' : 'none';
    if (showCharge) { $('charge-fill').style.width = (ws.charge * 100) + '%'; $('charge-fill').style.background = ws.charge >= 1 ? '#ffc23d' : ''; }

    // Hit marker fade
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').style.opacity = 0; }

    // Damage direction indicators (rotate toward where the hit came from)
    const cam = g.camera;
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      const ind = this.indicators[i];
      ind.t -= dt;
      if (ind.t <= 0) { ind.el.remove(); this.indicators.splice(i, 1); continue; }
      const ang = Math.atan2(ind.src.x - cam.position.x, ind.src.z - cam.position.z);
      // camera forward yaw: looking down -Z when rotation.y = 0
      const rel = cam.rotation.y - ang + Math.PI;
      ind.el.style.transform = `rotate(${rel}rad)`;
      ind.el.style.opacity = Math.min(1, ind.t);
    }

    // Floating damage numbers projected from 3D to the screen
    const w = window.innerWidth, h = window.innerHeight;
    for (const n of this.numbers) {
      if (n.t <= 0) continue;
      n.t -= dt;
      n.pos.y += dt * 1.2;
      _v.copy(n.pos).project(cam);
      if (n.t <= 0 || _v.z > 1) { n.el.style.display = 'none'; n.t = 0; continue; }
      n.el.style.left = ((_v.x + 1) / 2 * w + n.dx) + 'px';
      n.el.style.top = ((1 - _v.y) / 2 * h) + 'px';
      n.el.style.opacity = Math.min(1, n.t * 3);
    }

    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.add('hidden'); }
  }
}
