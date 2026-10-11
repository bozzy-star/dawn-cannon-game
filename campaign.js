// Campaign data and save handling are independent of the renderer and audio.
const freeze = (value) => {
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object') freeze(item);
  }
  return Object.freeze(value);
};

export const ENEMY_TYPES = freeze({
  destroyer: {
    name: '駆逐艦', hp: 4, speed: 2.9, score: 180,
    attackInterval: 14, damage: 5, radius: 4.0, scale: 1.0,
  },
  cruiser: {
    name: '巡洋艦', hp: 10, speed: 2.1, score: 420,
    attackInterval: 16, damage: 8, radius: 5.8, scale: 1.35,
  },
  battleship: {
    name: '戦艦', hp: 24, speed: 1.2, score: 900,
    attackInterval: 20, damage: 13, radius: 7.8, scale: 1.8,
  },
  carrier: {
    name: '空母', hp: 20, speed: 1.65, score: 1100,
    attackInterval: 17, damage: 10, radius: 8.5, scale: 1.9,
  },
});

const formation = (kinds, distance = 155, spacing = 39) =>
  kinds.map((kind, index) => ({
    kind,
    x: (index - (kinds.length - 1) / 2) * spacing,
    z: -distance - Math.abs(index - (kinds.length - 1) / 2) * 9,
  }));

export const AREAS = freeze([
  {
    id: 1, name: '霧の入口', seaTint: 0x163642, fogTint: 0xa5b6c2,
    briefing: '初出撃。黒潮艦隊の駆逐艦が補給航路を封鎖している。3門の主砲で2波を退け、朝日の進路を切り開け。',
    waves: [formation(['destroyer', 'destroyer'], 145, 48),
      formation(['destroyer', 'destroyer', 'destroyer'], 163, 42)],
  },
  {
    id: 2, name: '鋼鉄の回廊', seaTint: 0x123e4b, fogTint: 0x9eb4bf,
    briefing: '補給航路の先に巡洋艦が現れた。装甲を貫く徹甲弾を整え、敵の包囲を突破せよ。',
    waves: [formation(['destroyer', 'cruiser', 'destroyer'], 163, 43),
      formation(['cruiser', 'destroyer', 'cruiser'], 177, 45)],
  },
  {
    id: 3, name: '巨艦の砦', seaTint: 0x213642, fogTint: 0xb0adb0,
    briefing: '敵主力の戦艦が海峡を守っている。重い装甲と反撃に備え、強化砲弾で巨艦を沈めよ。',
    waves: [formation(['cruiser', 'battleship', 'cruiser'], 176, 49),
      formation(['battleship', 'destroyer', 'cruiser', 'battleship'], 189, 43)],
  },
  {
    id: 4, name: '翼の群島', seaTint: 0x173f4d, fogTint: 0xb4bec1,
    briefing: '群島を支配する空母打撃群を捕捉した。大型の飛行甲板を狙い、次の補給拠点を確保せよ。',
    waves: [formation(['cruiser', 'carrier', 'cruiser'], 185, 53),
      formation(['carrier', 'destroyer', 'battleship', 'carrier'], 196, 47)],
  },
  {
    id: 5, name: '黒潮決戦域', seaTint: 0x1d2f40, fogTint: 0x9cabb8,
    briefing: '全艦種の混成艦隊が進路を阻む。3門を結ぶ龍神砲の設計が解禁された。装備を整え、最終海域への道を開け。',
    waves: [formation(['destroyer', 'cruiser', 'battleship', 'carrier'], 185, 47),
      formation(['battleship', 'carrier', 'cruiser', 'carrier', 'battleship'], 202, 43)],
  },
  {
    id: 6, name: '夜明けの中枢', seaTint: 0x17313b, fogTint: 0xc2b7a8,
    briefing: '黒潮艦隊の最後の集結地。光子主砲と龍神砲で主力艦隊を撃破し、すべての海域に夜明けをもたらせ。',
    waves: [formation(['battleship', 'carrier', 'cruiser', 'carrier', 'battleship'], 194, 44),
      formation(['battleship', 'carrier', 'battleship', 'carrier', 'battleship'], 211, 44)],
  },
]);

export const UPGRADES = freeze({
  weapon: [
    { kind: 'weapon', level: 1, name: '徹甲弾', description: '装甲を貫く砲弾。主砲の威力が上がる。', price: 650, unlockArea: 1 },
    { kind: 'weapon', level: 2, name: '炸裂弾', description: '強化炸薬の一撃。大型艦にも大きな損傷を与える。', price: 1450, unlockArea: 2 },
    { kind: 'weapon', level: 3, name: '電磁砲', description: '電磁加速で高速弾を射出。威力と弾速が上がる。', price: 2800, unlockArea: 3 },
    { kind: 'weapon', level: 4, name: '光子主砲', description: '光の砲弾を放つ最終主砲。重装甲艦を圧倒する。', price: 4200, unlockArea: 4 },
  ],
  reload: [
    { kind: 'reload', level: 1, name: '給弾機構 I', description: '3門すべての装填時間を短縮する。', price: 400, unlockArea: 1 },
    { kind: 'reload', level: 2, name: '給弾機構 II', description: '高速給弾で砲撃の間隔をさらに短縮する。', price: 850, unlockArea: 2 },
    { kind: 'reload', level: 3, name: '給弾機構 III', description: '最終給弾機構。連続砲撃を支える。', price: 1500, unlockArea: 4 },
  ],
  armor: [
    { kind: 'armor', level: 1, name: '追加装甲 I', description: '船体耐久を増やし、反撃への備えを強める。', price: 450, unlockArea: 1 },
    { kind: 'armor', level: 2, name: '追加装甲 II', description: '複合装甲で船体耐久をさらに増やす。', price: 950, unlockArea: 2 },
    { kind: 'armor', level: 3, name: '追加装甲 III', description: '最終防御区画。決戦の砲火に耐える。', price: 1800, unlockArea: 4 },
  ],
  special: [
    { kind: 'special', level: 1, name: '龍神砲', description: '3門が合体し、現在出現中の敵艦をすべて撃沈する。1海域への出撃につき1回。', price: 3600, unlockArea: 5 },
  ],
});

const SAVE_KEY = 'asahi-cannon-campaign-v1';
const KINDS = Object.keys(UPGRADES);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const objectLike = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const bounded = (value, low, high, fallback = low) => Math.max(low, Math.min(high, finite(value, fallback)));
const integer = (value, low, high, fallback = low) => Math.floor(bounded(value, low, high, fallback));
const freshState = () => ({
  version: 1, credits: 0, unlockedArea: 1, conquered: [],
  upgrades: { weapon: 0, reload: 0, armor: 0, special: 0 }, records: {},
});

function validateState(source) {
  const state = freshState();
  if (!objectLike(source) || source.version !== 1) return state;
  state.credits = integer(source.credits, 0, 1e9);
  state.unlockedArea = integer(source.unlockedArea, 1, AREAS.length);
  if (Array.isArray(source.conquered)) {
    state.conquered = [...new Set(source.conquered.filter((value) =>
      Number.isInteger(value) && value >= 1 && value <= AREAS.length))].sort((a, b) => a - b);
    // A completed area always keeps its successor available.
    for (const id of state.conquered) state.unlockedArea = Math.max(state.unlockedArea, Math.min(AREAS.length, id + 1));
  }
  if (objectLike(source.upgrades)) {
    for (const kind of KINDS) {
      if (!own(source.upgrades, kind)) continue;
      let level = integer(source.upgrades[kind], 0, UPGRADES[kind].length);
      while (level > 0 && UPGRADES[kind][level - 1].unlockArea > state.unlockedArea) level--;
      state.upgrades[kind] = level;
    }
  }
  if (objectLike(source.records)) {
    for (const area of AREAS) {
      const key = String(area.id);
      if (!own(source.records, key) || !objectLike(source.records[key])) continue;
      const record = source.records[key];
      state.records[key] = {
        bestScore: integer(record.bestScore, 0, 1e9),
        bestAccuracy: Math.round(bounded(record.bestAccuracy, 0, 100) * 10) / 10,
        bestTime: bounded(record.bestTime, 0, 86400),
        victories: integer(record.victories, 0, 1e6),
        rank: ['S', 'A', 'B', 'C', 'D'].includes(record.rank) ? record.rank : 'D',
      };
    }
  }
  return state;
}

export class CampaignStore {
  constructor(storage) {
    // Accessing localStorage itself can throw in private or embedded browsers.
    this.storage = null;
    this._state = freshState();
    try {
      this.storage = storage === undefined ? globalThis.localStorage : storage;
      const saved = this.storage?.getItem(SAVE_KEY);
      if (saved) this._state = validateState(JSON.parse(saved));
    } catch {
      // The game remains playable with an in-memory save.
    }
  }

  get state() { return this._state; }

  save() {
    // Whitelist fields again so accidental mutable-state changes cannot leak into a save.
    this._state = validateState(this._state);
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this._state)); } catch { /* Memory-only progress is still usable. */ }
  }

  get nextUpgradeKinds() { return KINDS.slice(); }

  nextUpgrade(kind) {
    if (!KINDS.includes(kind)) return null;
    const level = integer(this._state.upgrades[kind], 0, UPGRADES[kind].length);
    const upgrade = UPGRADES[kind][level];
    return upgrade ? { ...upgrade } : null;
  }

  canBuy(kind) {
    const upgrade = this.nextUpgrade(kind);
    return Boolean(upgrade && this._state.unlockedArea >= upgrade.unlockArea && this._state.credits >= upgrade.price);
  }

  buy(kind) {
    const upgrade = this.nextUpgrade(kind);
    if (!upgrade) return { ok: false, reason: KINDS.includes(kind) ? '最大まで強化済みです。' : '不明なパーツです。', upgrade: null };
    if (this._state.unlockedArea < upgrade.unlockArea) return { ok: false, reason: `第${upgrade.unlockArea}海域の解放後に購入できます。`, upgrade };
    if (this._state.credits < upgrade.price) return { ok: false, reason: '資金が不足しています。制圧済み海域への再出撃でも資金を獲得できます。', upgrade };
    this._state.credits -= upgrade.price;
    this._state.upgrades[kind] = upgrade.level;
    this.save();
    return { ok: true, reason: `${upgrade.name}を装備しました。`, upgrade };
  }

  settle(areaId, stats = {}, won = false) {
    const id = integer(areaId, 1, AREAS.length);
    const area = AREAS[id - 1];
    const input = objectLike(stats) ? stats : {};
    const fleet = area.waves.flat();
    const kills = integer(input.kills, 0, fleet.length);
    const shots = integer(input.shots, 0, 100000);
    const hits = integer(input.hits, 0, shots);
    const time = bounded(input.time, 0, 86400);
    const hull = bounded(input.hull, 0, 100);
    const accuracy = shots > 0 ? Math.round(hits / shots * 1000) / 10 : 0;
    const fullFleetScore = fleet.reduce((sum, enemy) => sum + ENEMY_TYPES[enemy.kind].score, 0);
    const sunkScore = Math.round(typeof input.killScore === 'number' && Number.isFinite(input.killScore)
      ? bounded(input.killScore, 0, fullFleetScore)
      : fullFleetScore * kills / fleet.length);
    const victory = won === true;
    const aimBonus = shots > 0 ? Math.round(accuracy * 6) : 0;
    const survivalBonus = victory ? Math.round(hull * 3) : 0;
    const timeBonus = victory ? Math.max(0, Math.round(450 - time * 1.5)) : 0;
    const score = sunkScore + aimBonus + survivalBonus + timeBonus;
    const firstClear = victory && !this._state.conquered.includes(id);
    const rank = victory ? (accuracy >= 75 && hull >= 50 ? 'S' : accuracy >= 50 ? 'A' : accuracy >= 25 ? 'B' : 'C') : 'D';
    const clearBonus = [900, 1200, 1600, 1900, 2400, 3200][id - 1];
    const reward = victory ? Math.max(200, Math.round(score * (firstClear ? .4 : .27) + clearBonus * (firstClear ? 1 : .3))) : 0;
    this._state.credits = Math.min(1e9, this._state.credits + reward);
    if (victory) {
      if (firstClear) this._state.conquered.push(id);
      this._state.conquered.sort((a, b) => a - b);
      this._state.unlockedArea = Math.max(this._state.unlockedArea, Math.min(AREAS.length, id + 1));
      const previous = this._state.records[String(id)];
      const rankOrder = ['D', 'C', 'B', 'A', 'S'];
      this._state.records[String(id)] = {
        bestScore: Math.max(previous?.bestScore || 0, score),
        bestAccuracy: Math.max(previous?.bestAccuracy || 0, accuracy),
        bestTime: previous?.victories > 0 ? Math.min(previous.bestTime, time) : time,
        victories: Math.min(1e6, (previous?.victories || 0) + 1),
        rank: rankOrder.indexOf(previous?.rank) > rankOrder.indexOf(rank) ? previous.rank : rank,
      };
    }
    this.save();
    return { score, reward, accuracy, rank, firstClear, credits: this._state.credits };
  }

  reset() {
    this._state = freshState();
    this.save();
    return this._state;
  }
}
