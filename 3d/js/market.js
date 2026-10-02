/* =========================================================================
   market.js — the buy menu (HTML overlay). Weapon cards with price, stat
   bars and owned state, plus gear (ammo, shields, med kit, tower repair,
   auto-turret). The actual buying rules live in Game.buy() in main.js.
   ========================================================================= */
import { CONFIG } from './config.js?v=0c35b74f43';
import { WEAPON_ORDER } from './weapons.js?v=0c35b74f43';

const $ = (id) => document.getElementById(id);
const BUY_KEYS_WEAPONS = { rifle: '1', sniper: '2', rpg: '3', grenade: '4', bow: '5' };
const BUY_KEYS_ITEMS = { ammo: '6', light: '7', heavy: '8', medkit: '9', repair: '0', turret: 'T' };

// Draw a simple flat silhouette of each weapon for its card.
function drawIcon(id) {
  const c = document.createElement('canvas');
  c.width = 180; c.height = 50;
  const g = c.getContext('2d');
  g.fillStyle = '#ece8e1'; g.strokeStyle = '#ece8e1'; g.lineWidth = 4;
  const R = (x, y, w, h) => g.fillRect(x, y, w, h);
  switch (id) {
    case 'knife': g.beginPath(); g.moveTo(40, 25); g.lineTo(140, 20); g.lineTo(150, 25); g.lineTo(40, 32); g.fill(); R(20, 22, 22, 12); R(40, 16, 5, 22); break;
    case 'pistol': R(55, 12, 70, 12); R(60, 24, 16, 22); R(118, 14, 10, 6); break;
    case 'rifle': R(30, 18, 100, 12); R(130, 21, 40, 5); R(10, 18, 24, 16); R(70, 30, 12, 18); R(48, 30, 9, 14); R(80, 12, 24, 6); g.fillStyle = '#ff4655'; R(36, 14, 40, 4); break;
    case 'sniper': R(20, 20, 90, 10); R(110, 22, 64, 5); R(50, 8, 46, 9); R(4, 20, 20, 15); R(56, 30, 9, 14); g.fillStyle = '#2fd3c5'; R(20, 30, 40, 3); break;
    case 'rpg': R(20, 18, 130, 14); g.beginPath(); g.moveTo(150, 14); g.lineTo(176, 25); g.lineTo(150, 36); g.fill(); R(60, 32, 9, 14); R(100, 32, 9, 12); g.fillStyle = '#ff9a3d'; R(30, 16, 100, 3); break;
    case 'grenade': R(70, 12, 40, 24); R(110, 16, 50, 12); R(36, 18, 34, 12); R(80, 36, 9, 12); g.fillStyle = '#7dff3a'; R(70, 23, 40, 3); break;
    case 'bow': g.beginPath(); g.arc(90, 80, 72, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.lineWidth = 1.5; g.beginPath(); g.moveTo(24, 46); g.lineTo(156, 46); g.stroke(); R(30, 30, 140, 2); g.fillStyle = '#29f0ff'; g.beginPath(); g.moveTo(170, 26); g.lineTo(178, 31); g.lineTo(170, 36); g.fill(); break;
  }
  return c;
}

export class Market {
  constructor(game) {
    this.game = game;
    this.el = $('market');
    this.open = false;
    this.buildCards();
  }

  buildCards() {
    const wrap = $('mk-weapons');
    wrap.innerHTML = '';
    this.cards = {};
    for (const id of WEAPON_ORDER) {
      const d = CONFIG.WEAPONS[id];
      const card = document.createElement('div');
      card.className = 'wcard';
      card.dataset.id = id;
      const stats = Object.entries(d.stats).map(([k, v]) => `<div class="stat"><span>${k.toUpperCase()}</span><div class="sb"><i style="width:${v * 10}%"></i></div></div>`).join('');
      card.innerHTML = `<div class="key">${BUY_KEYS_WEAPONS[id] ? '[' + BUY_KEYS_WEAPONS[id] + ']' : 'SLOT ' + d.slot}</div>
        <div class="wname">${d.name}</div><div class="wprice"></div>
        <div class="icon"></div><div class="wdesc">${d.desc}</div>${stats}`;
      card.querySelector('.icon').appendChild(drawIcon(id));
      card.addEventListener('click', () => this.clickWeapon(id, card));
      wrap.appendChild(card);
      this.cards[id] = card;
    }
    const list = $('mk-items');
    list.innerHTML = '';
    this.items = {};
    for (const [id, it] of Object.entries(CONFIG.ITEMS)) {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `<div><div class="iname">[${BUY_KEYS_ITEMS[id]}] ${it.name}</div><div class="idesc">${it.desc}</div></div><div class="iprice">◆ ${it.price}</div>`;
      row.addEventListener('click', () => this.flash(row, this.game.buy(id)));
      list.appendChild(row);
      this.items[id] = row;
    }
  }

  clickWeapon(id, card) {
    const g = this.game;
    if (g.weapons.owned[id]) { g.weapons.select(id); g.sound.ui(); this.refresh(); return; }
    this.flash(card, g.buy(id));
  }

  flash(el, ok) {
    el.classList.remove('flash-buy', 'flash-deny'); void el.offsetWidth;
    el.classList.add(ok ? 'flash-buy' : 'flash-deny');
    this.refresh();
  }

  /** Keyboard shortcuts while the market is open. Returns true if handled. */
  key(code) {
    const k = code.replace('Digit', '').replace('Key', '');
    for (const [id, key] of Object.entries(BUY_KEYS_WEAPONS)) if (key === k) { this.clickWeapon(id, this.cards[id]); return true; }
    for (const [id, key] of Object.entries(BUY_KEYS_ITEMS)) if (key === k) { this.flash(this.items[id], this.game.buy(id)); return true; }
    return false;
  }

  show(betweenWaves) {
    this.open = true;
    this.el.classList.remove('hidden');
    $('btn-mk-ready').style.display = betweenWaves ? '' : 'none';
    $('mk-sub').textContent = betweenWaves ? `BUY PHASE — AREA ${this.game.area} · NEXT WAVE ${this.game.wave + 1}` : 'FIELD TERMINAL — ENEMIES ARE STILL COMING!';
    this.refresh();
  }

  hide() { this.open = false; this.el.classList.add('hidden'); }

  refresh() {
    const g = this.game;
    $('mk-credits').textContent = g.credits.toLocaleString();
    for (const id of WEAPON_ORDER) {
      const d = CONFIG.WEAPONS[id], card = this.cards[id];
      const owned = !!g.weapons.owned[id];
      card.classList.toggle('owned', owned);
      card.classList.toggle('poor', !owned && g.credits < d.price);
      const pr = card.querySelector('.wprice');
      pr.className = 'wprice' + (owned ? ' own' : '');
      pr.textContent = owned ? (g.weapons.current === id ? '✔ EQUIPPED' : 'OWNED — CLICK TO EQUIP') : `◆ ${d.price}`;
    }
    for (const [id, it] of Object.entries(CONFIG.ITEMS)) {
      const blocked = g.buyBlocked(id);
      this.items[id].classList.toggle('poor', !!blocked);
      this.items[id].title = blocked || '';
    }
    $('mk-status').innerHTML = `Health <b>${Math.ceil(g.player.hp)}</b> / ${g.player.maxHp}<br>Armour <b>${Math.ceil(g.player.armour)}</b><br>
      Tower <b>${Math.ceil(g.towerHp)}</b> / ${CONFIG.TOWER.maxHp}<br>Turrets <b>${g.turrets.count}</b> / ${CONFIG.ITEMS.turret.max}<br>
      Score <b>${g.score.toLocaleString()}</b>`;
  }
}
