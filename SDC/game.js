/* ==========================================================
   霓虹废墟 · Neon Ruins  — 游戏主逻辑
   俯视角 2D · 射击搜刮撤离  · 参考 ZERO Sievert 风格
   ========================================================== */

(() => {
'use strict';

// -------------------- 画布与基础设置 --------------------
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const W = canvas.width;   // 1280
const H = canvas.height;  // 720

const radarCanvas = document.getElementById('radar-canvas');
const radarCtx = radarCanvas.getContext('2d');
radarCtx.imageSmoothingEnabled = false;

// 像素艺术绘制工具
function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

// -------------------- 工具函数 --------------------
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;

// -------------------- 世界设置 --------------------
const WORLD = { w: 3200, h: 2400 };  // 世界大小
const LOOT_GOAL = 120;               // 撤离所需最低物资价值

// 调色板（整体低饱和，电影感：避免亮红/亮品红刺眼）
const C = {
    ground1: '#2a2f3a',
    ground2: '#30343d',
    ground3: '#252832',
    road: '#1a1e26',
    neonCyan: '#5ec8e0',         // 略降饱和
    neonMag: '#a86890',          // 大幅降饱和（替换刺眼 #a86890）
    amber: '#d8a45c',            // 暖橙降饱和
    amberDim: '#8a6a3a',         // 暗橙（未激活提示用）
    rust: '#8a5a3b',
    white: '#e8eef2',
    danger: '#b85a6e',           // 雾粉红（替换刺眼 #b85a6e）
    enemyAlert: '#c8a868',       // 暖琥珀（替换亮红感叹号）
    loot: '#d8a45c',
    extract: '#5ec8e0',
    enemyMut: '#8a6a5a',         // 偏灰棕，更融入背景
    enemyBandit: '#7a6a4a',
    enemyElite: '#7a5070',       // 雾紫红（替换刺眼亮品红）
    eyeGlow: '#c8a868',          // 敌人眼睛/警示统一用暖琥珀
    shadow: 'rgba(0,0,0,0.45)'
};

// -------------------- 预渲染地面 --------------------
// 关键：所有随机量都用确定性 hash 公式（不依赖 Math.random），
// 这样预渲染后每一帧画面完全一致，不会"蠕动"
function hash2d(x, y, seed = 0) {
    let h = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791);
    h = (h * 2654435761) >>> 0;
    return (h % 10000) / 10000;  // 0..1
}
function prerenderGround() {
    if (G.groundCanvas && !G.groundDirty) return;
    G.groundCanvas = document.createElement('canvas');
    G.groundCanvas.width = WORLD.w;
    G.groundCanvas.height = WORLD.h;
    const g = G.groundCanvas.getContext('2d');
    g.imageSmoothingEnabled = false;

    // 1. 底色：8 种深灰蓝（确定性）
    const tileSize = 160;
    const colorTints = [
        '#2a2f3a', '#2d323d', '#272b35',
        '#303541', '#2a2e37', '#262a33',
        '#2e333c', '#292d36'
    ];
    for (let x = 0; x < WORLD.w; x += tileSize) {
        for (let y = 0; y < WORLD.h; y += tileSize) {
            const tIdx = Math.floor(hash2d(Math.floor(x / tileSize), Math.floor(y / tileSize), 1) * colorTints.length);
            g.fillStyle = colorTints[tIdx];
            g.fillRect(x, y, tileSize, tileSize);
        }
    }

    // 2. 沥青裂纹纹理（确定性位置）
    for (let i = 0; i < 1400; i++) {
        const x = hash2d(i, 100, 2) * WORLD.w;
        const y = hash2d(i, 200, 3) * WORLD.h;
        const w = 2 + Math.floor(hash2d(i, 300, 4) * 6);
        const h = 1 + Math.floor(hash2d(i, 400, 5) * 2);
        const c = hash2d(i, 500, 6);
        if (c < 0.5) g.fillStyle = 'rgba(0,0,0,0.18)';
        else if (c < 0.8) g.fillStyle = 'rgba(255,255,255,0.04)';
        else g.fillStyle = 'rgba(140,150,165,0.06)';
        g.fillRect(x, y, w, h);
    }

    // 3. 街道（用正弦波画一条灰色横路）
    g.fillStyle = '#1f2329';
    const roadY = WORLD.h * 0.5;
    for (let x = 0; x < WORLD.w; x += 4) {
        const yOff = Math.sin(x * 0.003) * 80 + Math.sin(x * 0.011) * 30;
        const w = 12 + Math.sin(x * 0.006) * 3;
        g.fillRect(x, roadY + yOff, 4, w);
    }
    // 路边缘高光
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < WORLD.w; x += 6) {
        const yOff = Math.sin(x * 0.003) * 80 + Math.sin(x * 0.011) * 30;
        g.fillRect(x, roadY + yOff - 1, 2, 1);
    }
    // 路中间虚线
    g.fillStyle = 'rgba(255,210,100,0.18)';
    for (let x = 0; x < WORLD.w; x += 30) {
        const yOff = Math.sin(x * 0.003) * 80 + Math.sin(x * 0.011) * 30;
        g.fillRect(x, roadY + yOff + 5, 16, 1);
    }

    // 4. 街道路灯位置
    for (let i = 0; i < 14; i++) {
        const lx = i * (WORLD.w / 14) + 200;
        const ly = roadY + Math.sin(lx * 0.003) * 80 + Math.sin(lx * 0.011) * 30;
        g.fillStyle = '#1a1d23';
        g.fillRect(lx, ly - 30, 1, 30);
        g.fillStyle = 'rgba(94,200,224,0.4)';
        g.fillRect(lx - 1, ly - 31, 3, 2);
        const grd = g.createRadialGradient(lx, ly, 0, lx, ly, 80);
        grd.addColorStop(0, 'rgba(94,200,224,0.06)');
        grd.addColorStop(1, 'rgba(94,200,224,0)');
        g.fillStyle = grd;
        g.fillRect(lx - 80, ly - 80, 160, 160);
    }

    // 5. 散落的小物件（确定性位置）
    for (let i = 0; i < 220; i++) {
        const x = hash2d(i, 600, 7) * WORLD.w;
        const y = hash2d(i, 700, 8) * WORLD.h;
        const r = hash2d(i, 800, 9);
        if (r < 0.4) {
            g.fillStyle = '#2a3140';
            g.fillRect(x, y, 4, 5);
            g.fillStyle = '#1a2028';
            g.fillRect(x + 1, y + 1, 2, 3);
        } else if (r < 0.7) {
            g.fillStyle = '#6a5a3a';
            g.fillRect(x, y, 5, 3);
            g.fillStyle = '#7a6a4a';
            g.fillRect(x, y, 3, 1);
        } else if (r < 0.9) {
            g.fillStyle = 'rgba(180,200,220,0.25)';
            g.fillRect(x, y, 2, 2);
            g.fillStyle = 'rgba(255,255,255,0.4)';
            g.fillRect(x, y, 1, 1);
        } else {
            g.fillStyle = 'rgba(255,180,60,0.4)';
            g.fillRect(x, y, 6, 1);
        }
    }

    // 6. 霓虹反光斑（确定性位置）
    for (let i = 0; i < 30; i++) {
        const x = hash2d(i, 900, 10) * WORLD.w;
        const y = hash2d(i, 1000, 11) * WORLD.h;
        const isCyan = hash2d(i, 1100, 12) < 0.6;
        const color = isCyan ? 'rgba(94,200,224,0.18)' : 'rgba(168,104,144,0.15)';
        const grd = g.createRadialGradient(x, y, 0, x, y, 35);
        grd.addColorStop(0, color);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x - 35, y - 35, 70, 70);
    }

    // 7. 水渍（确定性位置）
    for (let i = 0; i < 80; i++) {
        const x = hash2d(i, 1200, 13) * WORLD.w;
        const y = hash2d(i, 1300, 14) * WORLD.h;
        const w = 15 + hash2d(i, 1400, 15) * 20;
        const h = 5 + hash2d(i, 1500, 16) * 4;
        g.save();
        g.translate(x, y);
        g.scale(1, 0.4);
        g.fillStyle = 'rgba(20,30,40,0.35)';
        g.beginPath();
        g.arc(0, 0, w, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(120,140,160,0.18)';
        g.beginPath();
        g.arc(-w * 0.3, -h * 0.5, w * 0.3, 0, Math.PI * 2);
        g.fill();
        g.restore();
    }

    // 8. 网格刻线
    g.strokeStyle = 'rgba(94,200,224,0.04)';
    g.lineWidth = 1;
    for (let x = 0; x < WORLD.w; x += 64) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, WORLD.h); g.stroke();
    }
    for (let y = 0; y < WORLD.h; y += 64) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD.w, y); g.stroke();
    }
    G.groundDirty = false;  // 标记为已渲染，避免重复生成
}

// -------------------- 武器定义 --------------------
// 每种武器有独特手感：recoil 影响连续射击扩散，weight 影响移动衰减，
// reloadTime 影响装填速度，gunLen/gunColor 影响视觉外观。
const WEAPONS = {
    pistol: { name: '手枪', mag: 12, maxMag: 12, reserve: 30, ammoType: '9mm',
              dmg: 22, fireRate: 260, spread: 0.04, bulletSpeed: 900, bulletLen: 10,
              melee: false, range: 900,
              recoil: 1.0, recoilDecay: 8.0, weight: 0.8,
              gunLen: 18, gunColor: '#1a1a1a', gunLight: '#7a8898',
              reloadTime: 1200, switchTime: 250 },
    rifle: { name: '步枪', mag: 30, maxMag: 30, reserve: 0, ammoType: 'rifle',
             dmg: 28, fireRate: 95, spread: 0.045, bulletSpeed: 1300, bulletLen: 14,
             melee: false, range: 1400, pellets: 1,
             recoil: 1.6, recoilDecay: 5.5, weight: 2.8,
             gunLen: 28, gunColor: '#1a1a1a', gunLight: '#5a6a7a',
             reloadTime: 1900, switchTime: 450 },
    shotgun: { name: '霰弹', mag: 6, maxMag: 6, reserve: 0, ammoType: 'shotgun',
               dmg: 14, fireRate: 680, spread: 0.22, bulletSpeed: 820, bulletLen: 10,
               melee: false, range: 480, pellets: 7,
               recoil: 3.2, recoilDecay: 4.0, weight: 3.2,
               gunLen: 26, gunColor: '#2a1a10', gunLight: '#6a5a4a',
               reloadTime: 2400, switchTime: 600 },
    knife: { name: '战术刀', mag: 1, maxMag: 1, reserve: 0, ammoType: null,
             dmg: 60, fireRate: 420, spread: 0, bulletSpeed: 0, bulletLen: 0,
             melee: true, range: 78,
             recoil: 0, recoilDecay: 0, weight: 0.3,
             gunLen: 14, gunColor: '#d8e0e8', gunLight: '#ffffff',
             reloadTime: 0, switchTime: 150 },
    smg: { name: '冲锋枪', mag: 32, maxMag: 32, reserve: 0, ammoType: '9mm',
           dmg: 12, fireRate: 65, spread: 0.08, bulletSpeed: 1000, bulletLen: 10,
           melee: false, range: 700, pellets: 1,
           recoil: 0.6, recoilDecay: 6.0, weight: 1.8,
           gunLen: 20, gunColor: '#1a1a1a', gunLight: '#4a5a6a',
           reloadTime: 1400, switchTime: 300 },
    sniper: { name: '狙击枪', mag: 5, maxMag: 5, reserve: 0, ammoType: 'rifle',
              dmg: 85, fireRate: 1400, spread: 0.008, bulletSpeed: 1800, bulletLen: 18,
              melee: false, range: 2200, pellets: 1,
              recoil: 4.5, recoilDecay: 3.0, weight: 4.5,
              gunLen: 38, gunColor: '#1a2018', gunLight: '#3a4a3a',
              reloadTime: 2800, switchTime: 700 },
    grenade: { name: '榴弹', mag: 1, maxMag: 1, reserve: 0, ammoType: 'grenade',
               dmg: 80, fireRate: 2000, spread: 0.15, bulletSpeed: 400, bulletLen: 8,
               melee: false, range: 600, pellets: 1, explosive: true, blastRadius: 120,
               recoil: 2.0, recoilDecay: 5.0, weight: 1.5,
               gunLen: 16, gunColor: '#2a2010', gunLight: '#6a5040',
               reloadTime: 0, switchTime: 400 }
};

// 深拷贝一把武器（从定义）
function createWeapon(key) {
    const def = WEAPONS[key];
    return { key, ...def };
}

// -------------------- 物品定义 --------------------
// groundItem 的类型分类（拾取时加到对应背包栏）
const ITEM_TYPES = {
    '9mm':    { label: '9mm 弹药', color: C.neonCyan, weight: 0.1, value: 3,  kind: 'ammo', qty: 1 },
    'rifle':  { label: '步枪弹',  color: C.neonCyan, weight: 0.1, value: 4,  kind: 'ammo', qty: 1 },
    'shotgun':{ label: '霰弹',   color: C.neonCyan, weight: 0.15, value: 5, kind: 'ammo', qty: 1 },
    'med':    { label: '医疗包', color: '#8aff9d',  weight: 0.2, value: 12, kind: 'consumable', qty: 1 },
    'food':   { label: '食物',   color: C.amber,    weight: 0.3, value: 8,  kind: 'consumable', qty: 1 },
    'chip':   { label: '电路板', color: '#b987ff',  weight: 0.15, value: 18, kind: 'loot', qty: 1 },
    'rare':   { label: '稀有元件', color: C.neonMag, weight: 0.2, value: 40, kind: 'loot', qty: 1 },
    'battery':{ label: '电池',   color: '#b987ff',  weight: 0.3, value: 22, kind: 'loot', qty: 1 },
    'grenade':  { label: '榴弹', color: '#c87040', weight: 0.4, value: 25, kind: 'ammo', qty: 1 },
    'grenade_frag':    { label: '破片手雷', color: '#9a5a30', weight: 0.4, value: 35, kind: 'throwable', qty: 1 },
    'grenade_molotov': { label: '燃烧瓶',   color: '#ff8030', weight: 0.3, value: 28, kind: 'throwable', qty: 1 },
    'grenade_emp':     { label: '电磁脉冲', color: '#5acee8', weight: 0.4, value: 50, kind: 'throwable', qty: 1 },
    'grenade_flash':   { label: '闪光弹',   color: '#ffffff', weight: 0.3, value: 22, kind: 'throwable', qty: 1 },
    'w_pistol':  { label: '手枪', color: '#d8dfe5', weight: 1.2, value: 45,  kind: 'weapon', weaponKey: 'pistol' },
    'w_rifle':   { label: '步枪', color: '#d8dfe5', weight: 3.5, value: 140, kind: 'weapon', weaponKey: 'rifle' },
    'w_shotgun': { label: '霰弹', color: '#d8dfe5', weight: 3.0, value: 110, kind: 'weapon', weaponKey: 'shotgun' },
    'w_smg':     { label: '冲锋枪', color: '#d8dfe5', weight: 2.2, value: 90, kind: 'weapon', weaponKey: 'smg' },
    'w_sniper':  { label: '狙击枪', color: '#d8dfe5', weight: 5.0, value: 220, kind: 'weapon', weaponKey: 'sniper' },
    'w_grenade': { label: '榴弹发射器', color: '#d8dfe5', weight: 2.8, value: 160, kind: 'weapon', weaponKey: 'grenade' },
    'armor_t1':  { label: '战术护甲', color: '#a0b0c0', weight: 2.5, value: 70, kind: 'armor', reduction: 0.35 },
    'armor_t2':  { label: '重型护甲', color: '#d8d8d8', weight: 4.0, value: 140, kind: 'armor', reduction: 0.55 }
};

// -------------------- 手雷类型定义 --------------------
// type: 'frag' | 'molotov' | 'emp' | 'flash'
const GRENADE_TYPES = {
    frag: {
        name: '破片', color: '#9a5a30', fuse: 2.2, blastR: 90, dmg: 95,
        icon: '●', desc: '破片'
    },
    molotov: {
        name: '燃烧', color: '#ff8030', fuse: 1.5, blastR: 60, dmg: 15,
        burnDmg: 12, burnDuration: 4.0, burnRadius: 50,  // 留下火焰区域
        icon: '◉', desc: '燃烧'
    },
    emp: {
        name: '电磁', color: '#5acee8', fuse: 1.8, blastR: 110, dmg: 10,
        stunDuration: 3.5,  // 眩晕敌人
        icon: '◈', desc: '电磁'
    },
    flash: {
        name: '闪光', color: '#ffffff', fuse: 1.4, blastR: 130, dmg: 0,
        stunDuration: 2.5,  // 致盲敌人
        icon: '✦', desc: '闪光'
    }
};

// 搜刮容器可能产出的物品池（权重表）
const LOOT_POOL = [
    { key: '9mm',     qty: [3, 9],  weight: 18 },
    { key: 'rifle',   qty: [2, 6],  weight: 9 },
    { key: 'shotgun', qty: [1, 4],  weight: 7 },
    { key: 'med',     qty: [1, 2],  weight: 10 },
    { key: 'food',    qty: [1, 2],  weight: 9 },
    { key: 'chip',    qty: [1, 3],  weight: 11 },
    { key: 'battery', qty: [1, 1],  weight: 6 },
    { key: 'rare',    qty: [1, 1],  weight: 3 },
    { key: 'w_rifle', qty: [1, 1],  weight: 2 },
    { key: 'w_shotgun', qty: [1, 1], weight: 2 },
    { key: 'w_smg', qty: [1, 1], weight: 3 },
    { key: 'w_sniper', qty: [1, 1], weight: 1 },
    { key: 'w_grenade', qty: [1, 1], weight: 1 },
    { key: 'grenade', qty: [1, 2], weight: 4 },
    { key: 'grenade_frag',    qty: [1, 1], weight: 3 },
    { key: 'grenade_molotov', qty: [1, 1], weight: 3 },
    { key: 'grenade_emp',     qty: [1, 1], weight: 1 },
    { key: 'grenade_flash',   qty: [1, 2], weight: 3 },
    { key: 'armor_t1', qty: [1, 1], weight: 2 },
    { key: 'armor_t2', qty: [1, 1], weight: 1 }
];

function rollLoot(n) {
    // 按权重抽取 n 个物品（返回 {key, qty} 数组）
    const totalW = LOOT_POOL.reduce((s, p) => s + p.weight, 0);
    const out = [];
    for (let i = 0; i < n; i++) {
        let r = Math.random() * totalW;
        for (const p of LOOT_POOL) {
            if ((r -= p.weight) <= 0) { out.push({ key: p.key, qty: randi(p.qty[0], p.qty[1] + 1) }); break; }
        }
    }
    return out;
}

// -------------------- 游戏状态 --------------------
const G = {
    running: false,
    startedAt: 0,
    time: 0,
    camera: { x: 0, y: 0, shake: 0 },
    player: null,
    enemies: [],
    bullets: [],           // 玩家+敌人子弹统一处理
    containers: [],        // 搜刮容器
    groundItems: [],       // 地上的物品
    covers: [],            // 掩体（矩形）
    extractZones: [],      // 撤离点
    props: [],             // 装饰（霓虹招牌等）
    particles: [],
    muzzle: null,          // 枪口闪光
    lootValue: 0,
    enemyBullets: [],
    interactHint: { show: false, text: '', target: null },
    keys: {},
    mouse: { x: W / 2, y: H / 2, down: false, right: false },
    objectiveShown: false,
    ended: false,
    // === 武器手感状态 ===
    weaponRecoil: 0,       // 当前后坐力累加值（随时间衰减，影响 spread）
    lastSwitchAt: 0,       // 上次切换武器时间（ms）
    lastShootAt: 0,        // 上次开火时间（ms）
    // === 搜刮动画状态 ===
    looting: null,         // { container, startAt, duration } 或 null
    // === 库存系统 ===
    inventoryOpen: false,        // TAB 页是否打开
    inventoryContext: 'base',    // 'base' | 'raid' | 'endfail' | 'endsuccess'
    selectedItem: null,          // { source, key, ref, qty }
    lastExtractedValue: 0,       // 用于结算页
    // === 撤离飞船动画 ===
    extractAnim: null,           // { active, t, phase, playerX, playerY } 或 null
    // === 任务系统 ===
    mission: null,               // 当前任务
    missionCompleted: false,
    // === 子弹视觉增强系统 ===
    impactEffects: [],           // 命中特效：闪烁、冲击波、火花圈
    damageNumbers: [],           // 飘字伤害数字
    bulletHoles: [],              // 掩体上的弹孔贴片
    // === 手雷系统 ===
    grenades: [],                // 飞行中的手雷
    fireZones: [],               // 燃烧瓶留下的火焰区域
    pendingExplosions: [],       // 待触发的爆炸事件（避免在迭代中修改数组）
    selectedGrenade: 0           // 当前选中的手雷槽位索引
};

// === 仓库（跨局持久） ===
// 每个 item: { key, qty, label, color, weight, value, kind, ... }
const STASH = {
    capacity: 40,        // 仓库最大物品数
    items: []            // 物品数组
};

// -------------------- 仓库持久化（localStorage） --------------------
const STORAGE_KEY = 'neon_ruins_stash_v1';

function saveStash() {
    try {
        const data = {
            capacity: STASH.capacity,
            items: STASH.items.map(it => ({ key: it.key, qty: it.qty }))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        // localStorage 不可用时静默失败（例如隐私浏览模式等）
    }
}

function loadStash() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.items)) return;
        // 根据 key 查找 def，重建完整 item
        const rebuilt = [];
        for (const rawItem of data.items) {
            const def = ITEM_TYPES[rawItem.key];
            if (!def) continue;
            rebuilt.push({
                key: rawItem.key,
                qty: rawItem.qty,
                label: def.label,
                color: def.color,
                weight: def.weight,
                value: def.value,
                kind: def.kind,
                weaponKey: def.weaponKey,
                reduction: def.reduction
            });
        }
        STASH.items = rebuilt;
        if (data.capacity) STASH.capacity = data.capacity;
    } catch (e) {
        // 解析失败 — 清空，不要让坏数据影响下一局
    }
}

// -------------------- Web Audio 程序化声音系统 --------------------
// 用 Web Audio API 实时合成游戏音效 — 无需音频文件，零依赖
const Sound = (() => {
    let ctx = null;
    let master = null;
    let muted = false;
    let lastShot = 0;

    function init() {
        if (ctx) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = 0.35;
            master.connect(ctx.destination);
        } catch (e) {
            ctx = null;
        }
    }

    function resume() {
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    // 通用短包络音：快速起音 + 指数衰减
    function blip(freq, dur, type, vol, sweepTo) {
        if (!ctx || muted) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }

    // 白噪声：用于枪声/受伤/搜刮
    function noise(dur, vol, filterFreq, filterQ) {
        if (!ctx || muted) return;
        const t = ctx.currentTime;
        const bufferSize = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = filterFreq;
        filter.Q.value = filterQ || 1;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        src.start(t);
        src.stop(t + dur + 0.02);
    }

    // === 不同事件的声音预设 ===
    function shoot(weaponKey) {
        if (!ctx || muted) return;
        resume();
        const now = performance.now();
        if (now - lastShot < 30) return;  // 防止短时间连按
        lastShot = now;

        if (weaponKey === 'pistol') {
            noise(0.08, 0.45, 1800, 3);
            blip(320, 0.12, 'square', 0.25, 90);
        } else if (weaponKey === 'rifle') {
            noise(0.06, 0.55, 2200, 2);
            blip(180, 0.08, 'square', 0.3, 60);
        } else if (weaponKey === 'shotgun') {
            noise(0.15, 0.6, 900, 1.5);
            blip(90, 0.2, 'sawtooth', 0.35, 40);
        } else if (weaponKey === 'knife') {
            noise(0.06, 0.3, 3000, 4);
            blip(700, 0.05, 'triangle', 0.2, 300);
        }
    }

    function hit() {
        if (!ctx || muted) return;
        resume();
        noise(0.08, 0.4, 400, 2);
        blip(220, 0.15, 'sawtooth', 0.3, 80);
    }

    function pickup() {
        if (!ctx || muted) return;
        resume();
        blip(660, 0.08, 'triangle', 0.18, 990);
        setTimeout(() => blip(990, 0.1, 'triangle', 0.15, 1320), 40);
    }

    function loot() {
        // 搜刮完成 — 三声上升和弦
        if (!ctx || muted) return;
        resume();
        blip(440, 0.12, 'triangle', 0.2, 660);
        setTimeout(() => blip(660, 0.12, 'triangle', 0.2, 880), 80);
        setTimeout(() => blip(880, 0.18, 'triangle', 0.22, 1175), 160);
    }

    function reload() {
        if (!ctx || muted) return;
        resume();
        blip(180, 0.05, 'square', 0.15, 140);
        setTimeout(() => blip(260, 0.06, 'square', 0.15, 220), 200);
        setTimeout(() => blip(420, 0.08, 'triangle', 0.18, 620), 700);
    }

    function switchWeapon() {
        if (!ctx || muted) return;
        resume();
        blip(300, 0.04, 'square', 0.12, 180);
    }

    function grenadeThrow() {
        if (!ctx || muted) return;
        resume();
        // 短促的"嗖"声 - 模拟手雷脱手
        blip(180, 0.08, 'sawtooth', 0.18, 60);
        setTimeout(() => blip(80, 0.12, 'square', 0.12, 40), 30);
    }

    function extract() {
        // 撤离激活 — 长上升音
        if (!ctx || muted) return;
        resume();
        blip(330, 0.8, 'sawtooth', 0.25, 880);
    }

    function playerHurt() {
        if (!ctx || muted) return;
        resume();
        noise(0.15, 0.5, 300, 1);
        blip(140, 0.25, 'sawtooth', 0.3, 60);
    }

    function enemyDown() {
        if (!ctx || muted) return;
        resume();
        blip(200, 0.2, 'triangle', 0.2, 80);
        setTimeout(() => blip(120, 0.3, 'sawtooth', 0.25, 40), 80);
    }

    function toggleMute() {
        muted = !muted;
        return muted;
    }

    return { init, resume, shoot, hit, pickup, loot, reload, switchWeapon, extract, playerHurt, enemyDown, toggleMute, grenadeThrow };
})();

// -------------------- 程序化背景音乐 --------------------
// 自适应氛围音乐：基础环境音 + 战斗节奏 + 紧张度叠加
const Music = (() => {
    let ctx = null;
    let master = null;
    let muted = false;
    let active = false;
    // 音乐层
    let padOsc = null, padGain = null;
    let bassOsc = null, bassGain = null;
    let arpOsc = null, arpGain = null;
    let tensionOsc = null, tensionGain = null;
    let combatOsc = null, combatOscGain = null;
    // 节拍
    let nextNoteTime = 0;
    let beatCount = 0;
    let masterScheduler = null;
    // 目标音量
    let padTarget = 0.06, bassTarget = 0.05, arpTarget = 0.0, tensionTarget = 0.0;
    // 战斗目标音量（在 update 中设置，在 scheduleBeats 中读取）
    let combatTarget = 0.0;

    function init() {
        if (ctx) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = 0.55;
            master.connect(ctx.destination);
        } catch (e) { ctx = null; }
    }

    function resume() {
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    function start() {
        if (!ctx) init();
        if (!ctx || active) return;
        resume();
        active = true;
        // 基础 pad（持续低音铺底 - A1 + C2 + E2 小调氛围）
        padOsc = ctx.createOscillator();
        padOsc.type = 'sawtooth';
        padOsc.frequency.value = 55;  // A1
        padGain = ctx.createGain();
        padGain.gain.value = 0;
        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 600;
        padFilter.Q.value = 1;
        padOsc.connect(padFilter);
        padFilter.connect(padGain);
        padGain.connect(master);
        padOsc.start();

        // 加一个高频 pad（E3 三度叠加）
        const padOsc2 = ctx.createOscillator();
        padOsc2.type = 'sine';
        padOsc2.frequency.value = 110;
        const padGain2 = ctx.createGain();
        padGain2.gain.value = 0;
        padOsc2.connect(padGain2);
        padGain2.connect(master);
        padOsc2.start();
        padOsc2._gain = padGain2;
        padOsc._gain2 = padGain2;

        // Bass（重低音节拍）
        bassOsc = ctx.createOscillator();
        bassOsc.type = 'square';
        bassOsc.frequency.value = 41;  // E1
        bassGain = ctx.createGain();
        bassGain.gain.value = 0;
        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = 200;
        bassOsc.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.connect(master);
        bassOsc.start();

        // 紧张度层（高频 eery pad，仅在敌人接近时）
        tensionOsc = ctx.createOscillator();
        tensionOsc.type = 'sine';
        tensionOsc.frequency.value = 880;
        tensionGain = ctx.createGain();
        tensionGain.gain.value = 0;
        const tensionLfo = ctx.createOscillator();
        tensionLfo.frequency.value = 0.3;
        const tensionLfoGain = ctx.createGain();
        tensionLfoGain.gain.value = 200;
        tensionLfo.connect(tensionLfoGain);
        tensionLfoGain.connect(tensionOsc.frequency);
        tensionLfo.start();
        tensionOsc.connect(tensionGain);
        tensionGain.connect(master);
        tensionOsc.start();

        // Arp（琶音 - 战斗时）
        arpOsc = ctx.createOscillator();
        arpOsc.type = 'square';
        arpOsc.frequency.value = 220;
        arpGain = ctx.createGain();
        arpGain.gain.value = 0;
        const arpFilter = ctx.createBiquadFilter();
        arpFilter.type = 'lowpass';
        arpFilter.frequency.value = 1500;
        arpOsc.connect(arpFilter);
        arpFilter.connect(arpGain);
        arpGain.connect(master);
        arpOsc.start();

        // 战斗节奏合成器（脉冲）
        combatOsc = ctx.createOscillator();
        combatOsc.type = 'triangle';
        combatOsc.frequency.value = 80;
        combatOscGain = ctx.createGain();
        combatOscGain.gain.value = 0;
        combatOsc.connect(combatOscGain);
        combatOscGain.connect(master);
        combatOsc.start();

        // 启动节拍调度
        beatCount = 0;
        nextNoteTime = ctx.currentTime + 0.2;
        if (masterScheduler) clearInterval(masterScheduler);
        masterScheduler = setInterval(scheduleBeats, 50);
    }

    function stop() {
        if (!ctx || !active) return;
        active = false;
        if (masterScheduler) { clearInterval(masterScheduler); masterScheduler = null; }
        try { padOsc && padOsc.stop(); } catch (e) {}
        try { bassOsc && bassOsc.stop(); } catch (e) {}
        try { arpOsc && arpOsc.stop(); } catch (e) {}
        try { tensionOsc && tensionOsc.stop(); } catch (e) {}
        try { combatOsc && combatOsc.stop(); } catch (e) {}
        padOsc = bassOsc = arpOsc = tensionOsc = combatOsc = null;
    }

    // 节拍调度
    function scheduleBeats() {
        if (!ctx || !active) return;
        const now = ctx.currentTime;
        // 平滑过渡音量
        const fadetime = 0.3;
        if (padGain && padOsc && padOsc._gain2) {
            const t = Math.min(1, (now - (padOsc._startTime || 0)) / fadetime);
            padGain.gain.linearRampToValueAtTime(padTarget, now + 0.5);
            padOsc._gain2.gain.linearRampToValueAtTime(0.025, now + 0.5);
        }
        if (bassGain) bassGain.gain.linearRampToValueAtTime(bassTarget, now + 0.5);
        if (tensionGain) tensionGain.gain.linearRampToValueAtTime(tensionTarget, now + 0.5);
        if (arpGain) arpGain.gain.linearRampToValueAtTime(arpTarget, now + 0.5);
        if (combatOscGain) combatOscGain.gain.linearRampToValueAtTime(combatTarget * 0.6, now + 0.5);

        while (nextNoteTime < now + 0.3) {
            scheduleNote(beatCount, nextNoteTime);
            nextNoteTime += 60 / 80;  // 80 BPM
            beatCount++;
        }
    }

    // 调度单个音符
    function scheduleNote(beat, time) {
        if (combatTarget > 0.05 && beat % 2 === 0) {
            // 战斗鼓点 - 每拍一次底鼓
            playCombatKick(time);
        }
        if (combatTarget > 0.08 && beat % 4 === 2) {
            // 战斗军鼓 - 4 步中第 2 拍
            playCombatSnare(time);
        }
        if (arpTarget > 0.05) {
            // 战斗琶音
            const arpNotes = [220, 261.63, 329.63, 261.63, 220, 196, 261.63, 220];
            const note = arpNotes[beat % arpNotes.length];
            arpOsc.frequency.setValueAtTime(note, time);
            const eg = ctx.createGain();
            eg.gain.setValueAtTime(0, time);
            eg.gain.linearRampToValueAtTime(arpTarget * 0.3, time + 0.005);
            eg.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
            arpOsc.disconnect();
            arpOsc.connect(eg);
            eg.connect(master);
            setTimeout(() => eg.disconnect(), 200);
        }
    }

    function playCombatKick(time) {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.setValueAtTime(120, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(0.4, time + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
        osc.connect(g);
        g.connect(master);
        osc.start(time);
        osc.stop(time + 0.2);
    }

    function playCombatSnare(time) {
        if (!ctx) return;
        const bufferSize = Math.floor(ctx.sampleRate * 0.1);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.18, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800;
        filter.Q.value = 2;
        src.connect(filter);
        filter.connect(g);
        g.connect(master);
        src.start(time);
        src.stop(time + 0.12);
    }

    // 根据游戏状态更新各层音量
    function update(intensity, inCombat, hasCloseEnemies) {
        if (!ctx || muted) return;
        // intensity: 0~1 综合紧张度
        // inCombat: 是否有敌人追击
        // hasCloseEnemies: 是否有敌人接近
        if (inCombat) {
            bassTarget = 0.05 + intensity * 0.06;
            arpTarget = 0.05 + intensity * 0.07;
            tensionTarget = hasCloseEnemies ? 0.04 : 0.02;
            padTarget = 0.04 - intensity * 0.02;
        } else {
            bassTarget = 0.02;
            arpTarget = 0.0;
            tensionTarget = hasCloseEnemies ? 0.03 : 0.0;
            padTarget = 0.07;
        }
    }

    function toggleMute() {
        muted = !muted;
        if (master) master.gain.value = muted ? 0 : 0.55;
        return muted;
    }

    function isMuted() { return muted; }

    return { init, resume, start, stop, update, toggleMute, isMuted };
})();

// -------------------- 玩家 --------------------
// -------------------- 角色成长系统 --------------------
const PLAYER_PROGRESS = {
    level: 1,
    xp: 0,
    xpToNext: 100,
    totalKills: 0,
    totalExtractions: 0,
    // 等级加成
    getHpBonus: () => (PLAYER_PROGRESS.level - 1) * 5,
    getSpeedBonus: () => (PLAYER_PROGRESS.level - 1) * 3,
    getWeightBonus: () => (PLAYER_PROGRESS.level - 1) * 0.3
};

const PROGRESS_KEY = 'neon_ruins_progress_v1';

function saveProgress() {
    try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify({
            level: PLAYER_PROGRESS.level,
            xp: PLAYER_PROGRESS.xp,
            xpToNext: PLAYER_PROGRESS.xpToNext,
            totalKills: PLAYER_PROGRESS.totalKills,
            totalExtractions: PLAYER_PROGRESS.totalExtractions
        }));
    } catch (e) {}
}

function loadProgress() {
    try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        PLAYER_PROGRESS.level = data.level || 1;
        PLAYER_PROGRESS.xp = data.xp || 0;
        PLAYER_PROGRESS.xpToNext = data.xpToNext || 100;
        PLAYER_PROGRESS.totalKills = data.totalKills || 0;
        PLAYER_PROGRESS.totalExtractions = data.totalExtractions || 0;
    } catch (e) {}
}

function addXp(amount) {
    PLAYER_PROGRESS.xp += amount;
    while (PLAYER_PROGRESS.xp >= PLAYER_PROGRESS.xpToNext) {
        PLAYER_PROGRESS.xp -= PLAYER_PROGRESS.xpToNext;
        PLAYER_PROGRESS.level++;
        PLAYER_PROGRESS.xpToNext = Math.floor(PLAYER_PROGRESS.xpToNext * 1.3);
        // 升级特效
        if (G.player) {
            spawnParticles(G.player.x, G.player.y, '#ffd700', 40, 180);
            Sound.loot();
        }
    }
    saveProgress();
}

// -------------------- 成就系统 --------------------
// 成就定义（id, name, desc, icon, condition 函数）
// condition 接受 {p, run, stats} 参数，返回 boolean
const ACHIEVEMENTS = [
    // === 撤离类 ===
    { id: 'first_extract', name: '初出茅庐', desc: '首次成功撤离', icon: '🛬', category: 'extract',
      check: (s) => s.totalExtractions >= 1 },
    { id: 'extract_5', name: '老兵', desc: '累计成功撤离 5 次', icon: '🎖', category: 'extract',
      check: (s) => s.totalExtractions >= 5 },
    { id: 'extract_20', name: '撤离专家', desc: '累计成功撤离 20 次', icon: '✈', category: 'extract',
      check: (s) => s.totalExtractions >= 20 },
    { id: 'extract_fast', name: '闪电撤离', desc: '60 秒内完成撤离', icon: '⚡', category: 'extract',
      check: (s) => s.lastExtractTime && s.lastExtractTime < 60 },
    { id: 'extract_full', name: '满载而归', desc: '单局搜刮 ≥ 200 点后撤离', icon: '📦', category: 'extract',
      check: (s) => s.lastExtractLoot && s.lastExtractLoot >= 200 },

    // === 战斗类 ===
    { id: 'first_kill', name: '初次击杀', desc: '击杀第一个敌人', icon: '⚔', category: 'combat',
      check: (s) => s.totalKills >= 1 },
    { id: 'kills_10', name: '战士', desc: '累计击杀 10 个敌人', icon: '🗡', category: 'combat',
      check: (s) => s.totalKills >= 10 },
    { id: 'kills_50', name: '佣兵', desc: '累计击杀 50 个敌人', icon: '💀', category: 'combat',
      check: (s) => s.totalKills >= 50 },
    { id: 'kills_100', name: '死神', desc: '累计击杀 100 个敌人', icon: '☠', category: 'combat',
      check: (s) => s.totalKills >= 100 },
    { id: 'melee_kill', name: '刀锋', desc: '用近战击杀一个敌人', icon: '🔪', category: 'combat',
      check: (s) => s.meleeKills >= 1 },
    { id: 'grenade_kill', name: '爆破专家', desc: '用手雷击杀一个敌人', icon: '💣', category: 'combat',
      check: (s) => s.grenadeKills >= 1 },
    { id: 'grenade_kill_3', name: '投弹手', desc: '累计用手雷击杀 3 个敌人', icon: '🧨', category: 'combat',
      check: (s) => s.grenadeKills >= 3 },
    { id: 'stealth_kill', name: '暗影猎手', desc: '发现并击杀隐行者', icon: '👤', category: 'combat',
      check: (s) => s.stealthKills >= 1 },
    { id: 'no_damage', name: '毫发无伤', desc: '单局结束血量保持 100%', icon: '💎', category: 'combat',
      check: (s) => s.lastRunNoDamage },
    { id: 'all_kills', name: '清道夫', desc: '单局击杀地图上所有敌人', icon: '☠', category: 'combat',
      check: (s) => s.lastRunAllKills },

    // === 搜刮类 ===
    { id: 'loot_50', name: '拾荒者', desc: '单局搜刮 ≥ 50 点', icon: '📦', category: 'loot',
      check: (s) => s.bestLootRun && s.bestLootRun >= 50 },
    { id: 'loot_120', name: '高效拾荒', desc: '单局搜刮 ≥ 120 点（目标量）', icon: '🎯', category: 'loot',
      check: (s) => s.bestLootRun && s.bestLootRun >= 120 },
    { id: 'loot_300', name: '寻宝大师', desc: '单局搜刮 ≥ 300 点', icon: '💰', category: 'loot',
      check: (s) => s.bestLootRun && s.bestLootRun >= 300 },
    { id: 'rare_5', name: '稀有收藏家', desc: '单局搜刮 ≥ 5 个稀有元件', icon: '✦', category: 'loot',
      check: (s) => s.lastRunRare >= 5 },

    // === 装备 / 角色 ===
    { id: 'level_3', name: '初窥门径', desc: '角色达到 3 级', icon: '★', category: 'level',
      check: (s) => s.level >= 3 },
    { id: 'level_5', name: '资深拾荒者', desc: '角色达到 5 级', icon: '★★', category: 'level',
      check: (s) => s.level >= 5 },
    { id: 'level_10', name: '废墟传奇', desc: '角色达到 10 级', icon: '★★★', category: 'level',
      check: (s) => s.level >= 10 },
    { id: 'full_load', name: '满载而出', desc: '单局背负重量超过 6 kg', icon: '⛏', category: 'loot',
      check: (s) => s.lastRunMaxWeight >= 6 },

    // === 特殊 ===
    { id: 'first_raid', name: '踏入废墟', desc: '完成第一次游戏（无论成功失败）', icon: '🚶', category: 'special',
      check: (s) => s.totalRuns >= 1 },
    { id: 'first_death', name: '死亡是老师', desc: '第一次死亡', icon: '💀', category: 'special',
      check: (s) => s.totalDeaths >= 1 }
];

// 玩家成就状态（跨局持久）
const ACHIEVEMENT_STATE = {
    unlocked: {},      // {id: timestamp}
    // 全局统计
    totalKills: 0,
    totalExtractions: 0,
    totalRuns: 0,
    totalDeaths: 0,
    meleeKills: 0,
    grenadeKills: 0,
    stealthKills: 0,
    level: 1,
    bestLootRun: 0,
    // 本局
    lastRunNoDamage: false,
    lastRunAllKills: false,
    lastRunRare: 0,
    lastRunMaxWeight: 0,
    lastExtractTime: 0,
    lastExtractLoot: 0,
    // 通知队列
    pendingNotifs: []
};

const ACHIEVEMENT_KEY = 'neon_ruins_achievements_v1';

function saveAchievements() {
    try {
        localStorage.setItem(ACHIEVEMENT_KEY, JSON.stringify({
            unlocked: ACHIEVEMENT_STATE.unlocked,
            totalKills: ACHIEVEMENT_STATE.totalKills,
            totalExtractions: ACHIEVEMENT_STATE.totalExtractions,
            totalRuns: ACHIEVEMENT_STATE.totalRuns,
            totalDeaths: ACHIEVEMENT_STATE.totalDeaths,
            meleeKills: ACHIEVEMENT_STATE.meleeKills,
            grenadeKills: ACHIEVEMENT_STATE.grenadeKills,
            stealthKills: ACHIEVEMENT_STATE.stealthKills,
            level: ACHIEVEMENT_STATE.level,
            bestLootRun: ACHIEVEMENT_STATE.bestLootRun
        }));
    } catch (e) {}
}

function loadAchievements() {
    try {
        const raw = localStorage.getItem(ACHIEVEMENT_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        ACHIEVEMENT_STATE.unlocked = data.unlocked || {};
        ACHIEVEMENT_STATE.totalKills = data.totalKills || 0;
        ACHIEVEMENT_STATE.totalExtractions = data.totalExtractions || 0;
        ACHIEVEMENT_STATE.totalRuns = data.totalRuns || 0;
        ACHIEVEMENT_STATE.totalDeaths = data.totalDeaths || 0;
        ACHIEVEMENT_STATE.meleeKills = data.meleeKills || 0;
        ACHIEVEMENT_STATE.grenadeKills = data.grenadeKills || 0;
        ACHIEVEMENT_STATE.stealthKills = data.stealthKills || 0;
        ACHIEVEMENT_STATE.level = data.level || 1;
        ACHIEVEMENT_STATE.bestLootRun = data.bestLootRun || 0;
    } catch (e) {}
}

// 检查成就是否解锁，返回新解锁的成就列表
function checkAchievements() {
    const newly = [];
    for (const a of ACHIEVEMENTS) {
        if (ACHIEVEMENT_STATE.unlocked[a.id]) continue;
        // 把当前统计合并到 stats
        const stats = {
            ...ACHIEVEMENT_STATE,
            level: PLAYER_PROGRESS.level,
            totalKills: ACHIEVEMENT_STATE.totalKills + (G.player ? 0 : 0)  // will be updated separately
        };
        try {
            if (a.check(stats)) {
                ACHIEVEMENT_STATE.unlocked[a.id] = Date.now();
                newly.push(a);
                // 通知队列
                ACHIEVEMENT_STATE.pendingNotifs.push({ id: a.id, t: 0 });
            }
        } catch (e) {}
    }
    if (newly.length > 0) {
        saveAchievements();
        // 显示通知
        for (const a of newly) {
            showAchievementToast(a);
        }
    }
    return newly;
}

function showAchievementToast(a) {
    const el = document.createElement('div');
    el.className = 'achievement-toast';
    el.innerHTML = `
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-text">
            <div class="ach-label">成就解锁</div>
            <div class="ach-name">${a.name}</div>
            <div class="ach-desc">${a.desc}</div>
        </div>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 30);
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 400);
    }, 3800);
}

// 渲染成就列表（在开始界面）
function renderAchievementList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const cats = { extract: '撤离', combat: '战斗', loot: '搜刮', level: '成长', special: '特殊' };
    for (const [catKey, catName] of Object.entries(cats)) {
        const section = document.createElement('div');
        section.className = 'ach-section';
        section.innerHTML = `<div class="ach-section-title">${catName}</div>`;
        const list = ACHIEVEMENTS.filter(a => a.category === catKey);
        for (const a of list) {
            const unlocked = !!ACHIEVEMENT_STATE.unlocked[a.id];
            const div = document.createElement('div');
            div.className = 'ach-item' + (unlocked ? ' unlocked' : ' locked');
            div.innerHTML = `
                <div class="ach-icon">${a.icon}</div>
                <div class="ach-text">
                    <div class="ach-name">${a.name}</div>
                    <div class="ach-desc">${a.desc}</div>
                </div>
            `;
            section.appendChild(div);
        }
        container.appendChild(section);
    }
}

// 记录一次成就事件
function recordAchievementEvent(type, value) {
    switch (type) {
        case 'kill': ACHIEVEMENT_STATE.totalKills += (value || 1); break;
        case 'melee_kill': ACHIEVEMENT_STATE.meleeKills += (value || 1); break;
        case 'grenade_kill': ACHIEVEMENT_STATE.grenadeKills += (value || 1); break;
        case 'stealth_kill': ACHIEVEMENT_STATE.stealthKills += (value || 1); break;
        case 'extract': ACHIEVEMENT_STATE.totalExtractions += 1; break;
        case 'death': ACHIEVEMENT_STATE.totalDeaths += 1; break;
    }
    saveAchievements();
    checkAchievements();
}

function createPlayer() {
    const hpBonus = PLAYER_PROGRESS.getHpBonus();
    const speedBonus = PLAYER_PROGRESS.getSpeedBonus();
    const weightBonus = PLAYER_PROGRESS.getWeightBonus();
    return {
        x: WORLD.w / 2,
        y: WORLD.h / 2,
        r: 16,
        hp: 100 + hpBonus,
        maxHp: 100 + hpBonus,
        stamina: 100,
        maxStamina: 100,
        angle: 0,
        speed: 230 + speedBonus,
        sprintMul: 1.7,
        inventory: {
            '9mm': 15, 'rifle': 0, 'shotgun': 0, 'grenade': 0,
            med: 1, food: 1, chip: 0, rare: 0, battery: 0,
            grenade_frag: 1, grenade_molotov: 0, grenade_emp: 0, grenade_flash: 1
        },
        equipment: {
            head: null, body: null,
            primary: null, secondary: null, melee: null, backpack: null
        },
        weapons: [createWeapon('pistol')],
        currentWeapon: 0,
        armor: null,
        weight: 0,
        maxWeight: 8.0 + weightBonus,
        lastShot: 0,
        reloading: false,
        lastReload: 0,
        lastMelee: 0,
        inCover: false,
        flashTarget: null,
        damagedAt: 0,
        vaulting: false,
        vaultStart: 0,
        vaultTarget: null
    };
}

// -------------------- 世界实体 --------------------

// 搜刮容器
function createContainer(x, y) {
    const kinds = [
        { label: '生锈货箱', w: 60, h: 44, color: '#4a3f33' },
        { label: '废弃售货机', w: 46, h: 70, color: '#3c4854' },
        { label: '废墟堆', w: 80, h: 50, color: '#3a3b40' },
        { label: '补给箱', w: 54, h: 40, color: '#504030' }
    ];
    const kind = kinds[randi(0, kinds.length)];
    return {
        x, y, w: kind.w, h: kind.h,
        color: kind.color,
        label: kind.label,
        opened: false,
        lootCount: randi(3, 6),  // 打开后散落在地上的物品数量
        lootLeft: 0,             // 打开后未被拾取的物品数
        isContainer: true
    };
}

// 敌人
function createEnemy(x, y, type) {
    // === 搜打撤不是 roguelike：敌人应该慢、稀疏、有巡逻节奏，不追死人 ===
    const tpl = {
        mutant: { hp: 60, r: 15, speed: 95, dmg: 18, atkRange: 38, atkRate: 700,
                  ranged: false, color: C.enemyMut, name: '变异者',
                  perceptionRange: 220, loseRange: 420, alertDuration: 4 },
        bandit: { hp: 85, r: 16, speed: 80, dmg: 14, atkRange: 380, atkRate: 1100,
                  ranged: true, color: C.enemyBandit, name: '武装掠夺者',
                  bulletSpeed: 600, bulletDmg: 12, spread: 0.10,
                  perceptionRange: 260, loseRange: 460, alertDuration: 5 },
        elite:  { hp: 160, r: 18, speed: 90, dmg: 22, atkRange: 480, atkRate: 900,
                  ranged: true, color: C.enemyElite, name: '突袭者',
                  bulletSpeed: 780, bulletDmg: 22, spread: 0.07,
                  perceptionRange: 300, loseRange: 540, alertDuration: 6 },
        // === 隐行者：低血量、超快速度、近战 + 隐身 ===
        shadow: { hp: 50, r: 14, speed: 145, dmg: 28, atkRange: 30, atkRate: 550,
                  ranged: false, color: '#2a1a3a', name: '隐行者',
                  perceptionRange: 320, loseRange: 500, alertDuration: 5,
                  stealth: true, dash: true },
        // === 爆裂者：远程轰炸、爆炸子弹 ===
        bomber: { hp: 70, r: 16, speed: 70, dmg: 0, atkRange: 500, atkRate: 1500,
                  ranged: true, color: '#6a3a1a', name: '爆裂者',
                  bulletSpeed: 350, bulletDmg: 25, spread: 0.15,
                  perceptionRange: 280, loseRange: 480, alertDuration: 5,
                  explosive: true, blastRadius: 90 },
        // === 装甲兵：高血量、慢速、近战 + 高伤害 ===
        armored: { hp: 280, r: 20, speed: 60, dmg: 40, atkRange: 40, atkRate: 900,
                   ranged: false, color: '#4a4a5a', name: '装甲兵',
                   perceptionRange: 200, loseRange: 380, alertDuration: 6,
                   armored: true, armorReduction: 0.4 }
    }[type];

    return {
        x, y, r: tpl.r, hp: tpl.hp, maxHp: tpl.hp,
        speed: tpl.speed, dmg: tpl.dmg,
        atkRange: tpl.atkRange, atkRate: tpl.atkRate,
        ranged: tpl.ranged,
        color: tpl.color, name: tpl.name,
        bulletSpeed: tpl.bulletSpeed || 0,
        bulletDmg: tpl.bulletDmg || 0,
        spread: tpl.spread || 0,
        perceptionRange: tpl.perceptionRange,
        loseRange: tpl.loseRange,
        alertDuration: tpl.alertDuration,
        angle: rand(0, Math.PI * 2),
        state: 'patrol',      // patrol / alert / chase / attack / dead
        alertTimer: 0,
        lastShot: 0,
        patrolTarget: null,
        nextPatrolAt: 0,
        hitFlash: 0,
        type,
        inCover: false,
        id: Math.random() * 100,  // 用于动画帧偏移
        lastX: x, lastY: y,
        kbX: 0, kbY: 0,           // 击退速度，每帧衰减
        // === 智能AI状态 ===
        coverTarget: null,
        flankDir: 0,
        lastAlertOthers: 0,
        retreatTimer: 0,
        suppressTimer: 0,
        moveState: 'approach',
        // === 特殊敌人属性 ===
        stealth: tpl.stealth || false,    // 隐行者
        stealthTimer: 0,                   // 隐身计时
        dash: tpl.dash || false,           // 突进
        dashCooldown: 0,                   // 突进冷却
        explosive: tpl.explosive || false, // 爆裂者
        blastRadius: tpl.blastRadius || 0,
        armored: tpl.armored || false,     // 装甲兵
        armorReduction: tpl.armorReduction || 0
    };
}

// 地上的物品
function createGroundItem(x, y, key, qty = 1) {
    return { x, y, key, qty, r: 12, ttl: 999999, bob: Math.random() * Math.PI * 2 };
}

// 子弹（通用：玩家和敌人共用同一类型，但 owner 字段区分）
function createBullet(x, y, angle, speed, dmg, len, owner, color, life = 1.4) {
    return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        dmg, len, owner, color,
        life, age: 0
    };
}

// 撤离点
function createExtractZone(x, y) {
    return { x, y, r: 80, active: false, enterTime: 0, elapsed: 0 };
}

// -------------------- 任务系统 --------------------
const MISSION_TYPES = [
    {
        id: 'eliminate',
        name: '清除威胁',
        desc: '消灭所有敌人',
        check: () => G.enemies.every(e => e.state === 'dead'),
        reward: 150
    },
    {
        id: 'loot_value',
        name: '搜刮专家',
        desc: '搜集价值 300 的战利品',
        check: () => G.lootValue >= 300,
        reward: 100
    },
    {
        id: 'explore',
        name: '区域侦察',
        desc: '探索地图上的 3 个不同区域',
        check: (m) => (m.visitedZones || 0) >= 3,
        reward: 80
    },
    {
        id: 'headhunter',
        name: '精英猎手',
        desc: '消灭 2 个突袭者',
        check: (m) => (m.eliteKilled || 0) >= 2,
        reward: 200
    },
    {
        id: 'speedrun',
        name: '速战速决',
        desc: '在 90 秒内撤离',
        check: (m) => G.time > 0 && G.time < 90 && G.extractAnim && G.extractAnim.active,
        reward: 250
    }
];

function generateMission() {
    const type = MISSION_TYPES[Math.floor(Math.random() * MISSION_TYPES.length)];
    return {
        id: type.id,
        name: type.name,
        desc: type.desc,
        reward: type.reward,
        check: type.check,
        completed: false,
        visitedZones: 0,
        eliteKilled: 0,
        zonesVisited: new Set()
    };
}

function updateMission() {
    if (!G.mission || G.mission.completed || G.ended) return;
    const m = G.mission;
    if (m.check(m)) {
        m.completed = true;
        G.missionCompleted = true;
        G.lootValue += m.reward;
        spawnParticles(G.player.x, G.player.y, '#ffd700', 30, 150);
        Sound.loot();
    }
}

// 掩体矩形
// 掩体类型定义
const COVER_TYPES = {
    concrete: { label: '混凝土残骸', hp: 120, color: '#5a5a5a', debrisColor: '#7a7a7a', height: 'high' },
    metal:    { label: '金属货箱',   hp: 80,  color: '#4a5048', debrisColor: '#6a7068', height: 'high' },
    wood:     { label: '木箱堆',     hp: 40,  color: '#6a5030', debrisColor: '#8a7050', height: 'low'  },
    barrier:  { label: '路障',       hp: 60,  color: '#5a5a4a', debrisColor: '#7a7a6a', height: 'low'  }
};

let _coverIdCounter = 0;
function createCover(x, y, w, h) {
    const types = Object.keys(COVER_TYPES);
    const typeKey = types[Math.floor(Math.random() * types.length)];
    const type = COVER_TYPES[typeKey];
    return {
        _id: ++_coverIdCounter,
        x, y, w, h,
        typeKey,
        maxHp: type.hp,
        hp: type.hp,
        color: type.color,
        debrisColor: type.debrisColor,
        height: type.height,  // 'high' = 不可翻越, 'low' = 可翻越
        damaged: false,
        crackLines: Array.from({ length: 3 + Math.floor(Math.random() * 4) }, () => ({
            x0: Math.random(), y0: Math.random(),
            x1: Math.random(), y1: Math.random(),
            width: 1 + Math.random() * 2
        }))
    };
}

// -------------------- 初始化世界 --------------------
function initWorld() {
    G.player = createPlayer();
    G.enemies = [];
    G.bullets = [];
    G.containers = [];
    G.groundItems = [];
    G.covers = [];
    G.extractZones = [];
    G.props = [];
    G.particles = [];
    G.footstepDust = [];   // 脚步尘（拖尾）
    G.muzzleFlashes = [];  // 枪口闪光
    G.trailPts = [];       // 子弹拖尾
    G.casingEjects = [];   // 弹壳
    G.lightFlares = [];    // 强光闪烁
    G.impactEffects = [];  // 命中特效
    G.damageNumbers = [];  // 飘字伤害数字
    G.bulletHoles = [];    // 弹孔贴片
    G.grenades = [];       // 飞行中的手雷
    G.fireZones = [];      // 燃烧区域
    G.pendingExplosions = [];  // 待触发的爆炸
    G.selectedGrenade = 0;     // 选中的手雷槽
    G.grenadeHoldTime = 0;     // 蓄力时长
    G._gPressedAt = 0;         // G 键按下时刻
    G.lootValue = 0;
    G.ended = false;
    G.time = 0;
    G.objectiveShown = false;
    G.groundCanvas = null;
    G.groundDirty = true;
    G.inventoryOpen = false;
    G.selectedItem = null;
    G.mission = generateMission();
    G.missionCompleted = false;

    // 预渲染地面
    prerenderGround();

    // 搜刮容器 — 16 个，散布在世界各处
    const containerCount = 16;
    for (let i = 0; i < containerCount; i++) {
        let x, y, ok = false, tries = 0;
        while (!ok && tries++ < 80) {
            x = rand(200, WORLD.w - 200);
            y = rand(200, WORLD.h - 200);
            if (dist({x, y}, G.player) < 300) continue;
            ok = true;
            for (const c of G.containers) {
                if (Math.abs(c.x - x) < 90 && Math.abs(c.y - y) < 90) { ok = false; break; }
            }
        }
        if (ok) G.containers.push(createContainer(x, y));
    }

    // 敌人 — 稀疏分布（搜打撤风格：地图大、敌人少、有巡逻节奏）
    // 总共 10 个：3 变异者 / 3 掠夺者 / 1 精英 / 1 隐行者 / 1 爆裂者 / 1 装甲兵
    const enemySpec = [
        { type: 'mutant',  n: 3 },
        { type: 'bandit',  n: 3 },
        { type: 'elite',   n: 1 },
        { type: 'shadow',  n: 1 },
        { type: 'bomber',  n: 1 },
        { type: 'armored', n: 1 }
    ];
    for (const spec of enemySpec) {
        for (let i = 0; i < spec.n; i++) {
            let x, y, ok = false, tries = 0;
            while (!ok && tries++ < 100) {
                x = rand(300, WORLD.w - 300);
                y = rand(300, WORLD.h - 300);
                if (dist({x, y}, G.player) < 500) continue;       // 离玩家远
                ok = true;
                // 最小间距 280 — 避免敌人聚堆
                for (const e of G.enemies) if (dist({x, y}, e) < 280) { ok = false; break; }
                // 也不能太靠近容器
                if (ok) for (const c of G.containers) if (dist({x, y}, c) < 100) { ok = false; break; }
            }
            if (ok) G.enemies.push(createEnemy(x, y, spec.type));
        }
    }

    // 掩体 — 倒塌的建筑残骸、车辆、大货箱
    for (let i = 0; i < 30; i++) {
        const w = rand(60, 140);
        const h = rand(40, 90);
        const x = rand(200, WORLD.w - 200);
        const y = rand(200, WORLD.h - 200);
        if (dist({x, y}, G.player) < 220) continue;
        G.covers.push(createCover(x - w / 2, y - h / 2, w, h));
    }

    // 撤离点 — 3 个（地图四角与边缘）
    const zones = [
        { x: 300, y: 300 },
        { x: WORLD.w - 300, y: 300 },
        { x: WORLD.w / 2, y: WORLD.h - 300 }
    ];
    for (const z of zones) G.extractZones.push(createExtractZone(z.x, z.y));

    // 装饰 — 霓虹招牌（偶尔出现）
    for (let i = 0; i < 10; i++) {
        G.props.push({
            x: rand(200, WORLD.w - 200),
            y: rand(200, WORLD.h - 200),
            w: rand(60, 140),
            h: 16,
            color: Math.random() < 0.5 ? C.neonCyan : C.neonMag,
            flicker: Math.random()
        });
    }
}

// -------------------- 输入 --------------------
document.addEventListener('keydown', (e) => {
    G.keys[e.key.toLowerCase()] = true;
    if (!G.running || G.ended) return;
    const k = e.key.toLowerCase();
    if (k === '1' || k === '2') {
        const idx = parseInt(k, 10) - 1;
        if (G.player.weapons[idx] && !G.player.reloading && idx !== G.player.currentWeapon) {
            // 记录切换时间用于开火锁定

            G.lastSwitchAt = performance.now();
            G.player.currentWeapon = idx;
            G.weaponRecoil = 0; // 切枪时清空后坐力
            Sound.switchWeapon();
        }
    }
    if (k === 'f' && !G.player.reloading) {
        // 切换到近战（临时把武器切到 knife）
        const kw = G.player.weapons.find(w => w.key === 'knife');
        const currentIdx = G.player.weapons[G.player.currentWeapon];
        if (currentIdx && currentIdx.key === 'knife') return; // 已经是 knife
        if (!kw) G.player.weapons.push(createWeapon('knife'));
        G.lastSwitchAt = performance.now();
        G.weaponRecoil = 0;
        G.player.currentWeapon = G.player.weapons.findIndex(w => w.key === 'knife');
        Sound.switchWeapon();
    }
    if (k === 'r') tryReload();
    if (k === 'q') tryUseMed();
    if (k === 'e') tryInteract();
    if (k === ' ' || k === 'space') tryVault();
    if (k === 'm') {
        // 切换音乐静音
        Music.toggleMute();
        const isMuted = Music.isMuted();
        G.interactHint.text = isMuted ? '♪ 音乐已关闭' : '♪ 音乐已开启';
        G.interactHint.show = true;
        setTimeout(() => { G.interactHint.show = false; }, 800);
    }
    if (k === 'g') {
        // 第一次按下 → 切换手雷类型（每按一次循环）
        // 长按蓄力后松开才投出（在 keyup 处理）
        if (!G._gPressedAt) G._gPressedAt = performance.now();
        // 短按内（<200ms）算单击切换
        const held = performance.now() - G._gPressedAt;
        if (held > 250) return;  // 已经是长按，不重复触发
        // 切到下一个有手雷的类型
        const order = ['frag', 'molotov', 'emp', 'flash'];
        let attempts = 0;
        do {
            G.selectedGrenade = (G.selectedGrenade + 1) % 4;
            attempts++;
        } while (attempts < 4 && !(G.player.inventory['grenade_' + order[G.selectedGrenade]] > 0));
        const t = order[G.selectedGrenade];
        const cnt = G.player.inventory['grenade_' + t] || 0;
        G.interactHint.text = `${GRENADE_TYPES[t].name}手雷 × ${cnt}`;
        G.interactHint.show = true;
        setTimeout(() => { G.interactHint.show = false; }, 700);
    }
});
document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    G.keys[k] = false;
    if (k === 'g') {
        G._gPressedAt = 0;
        // 蓄力时长 > 50ms 才算"长按投出"，否则视为单击切换
        if (G.running && !G.ended && G.grenadeHoldTime > 0.05) {
            tryThrowGrenade();
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    G.mouse.x = (e.clientX - rect.left) * (W / rect.width);
    G.mouse.y = (e.clientY - rect.top) * (H / rect.height);
});
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) G.mouse.down = true;
    if (e.button === 2) G.mouse.right = true;
});
canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) G.mouse.down = false;
    if (e.button === 2) G.mouse.right = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// -------------------- 交互动作 --------------------
function tryReload() {
    const w = G.player.weapons[G.player.currentWeapon];
    if (!w || w.melee) return;
    if (w.mag >= w.maxMag) return;
    const invKey = w.ammoType;
    if ((G.player.inventory[invKey] || 0) <= 0) return;
    G.player.reloading = true;
    G.player.lastReload = performance.now();
    Sound.reload();
    setTimeout(() => {
        if (!G.player || G.ended) return;
        const need = w.maxMag - w.mag;
        const have = G.player.inventory[invKey] || 0;
        const take = Math.min(need, have);
        w.mag += take;
        G.player.inventory[invKey] = have - take;
        G.player.reloading = false;
    }, w.reloadTime);
}

function tryUseMed() {
    if ((G.player.inventory.med || 0) <= 0) return;
    if (G.player.hp >= G.player.maxHp) return;
    G.player.inventory.med--;
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + 35);
    spawnParticles(G.player.x, G.player.y, '#8aff9d', 18, 80);
}

// -------------------- 翻越掩体 --------------------
function tryVault() {
    const p = G.player;
    if (!p || p.vaulting) return;
    // 寻找附近的低矮掩体
    for (const c of G.covers) {
        if (c.height !== 'low' || c.hp <= 0) continue;
        // 检查玩家是否在掩体边缘附近
        const nearX = Math.abs(p.x - (c.x + c.w / 2)) < c.w / 2 + p.r + 10;
        const nearY = Math.abs(p.y - (c.y + c.h / 2)) < c.h / 2 + p.r + 10;
        const touching = nearX && nearY;
        // 检查玩家是否面向掩体
        const toCover = Math.atan2(c.y + c.h / 2 - p.y, c.x + c.w / 2 - p.x);
        const angleDiff = Math.abs(normalizeAngle(p.angle - toCover));
        if (touching && angleDiff < Math.PI / 3) {
            // 开始翻越
            p.vaulting = true;
            p.vaultStart = performance.now();
            p.vaultTarget = {
                x: c.x + c.w / 2 + Math.cos(p.angle) * (c.w / 2 + p.r + 15),
                y: c.y + c.h / 2 + Math.sin(p.angle) * (c.h / 2 + p.r + 15)
            };
            Sound.pickup(); // 使用拾取音作为翻越音效
            spawnParticles(p.x, p.y, '#aaaaaa', 6, 50);
            setTimeout(() => {
                if (p) p.vaulting = false;
            }, 400);
            break;
        }
    }
}

// 交互：拾取地上物品 / 搜刮容器 / 撤离
function tryInteract() {
    // 优先顺序：撤离 > 拾取地上物品 > 搜刮容器
    const p = G.player;
    const now = performance.now();

    // 撤离
    for (const z of G.extractZones) {
        if (z.active && dist(p, z) < z.r) {
            // 开始撤离计时 — 在 update 中持续检测
            return;
        }
    }

    // 拾取地上最近物品（距离 < 50）
    let nearestItem = null, best = 999;
    for (const it of G.groundItems) {
        const d = dist(p, it);
        if (d < 55 && d < best) { best = d; nearestItem = it; }
    }
    if (nearestItem) {
        pickupItem(nearestItem);
        return;
    }

    // 搜刮容器（按 E 开始搜刮动画 — 按住持续搜刮）
    let nearestC = null; best = 999;
    for (const c of G.containers) {
        if (c.opened) continue;
        const d = dist(p, c);
        if (d < 70 && d < best) { best = d; nearestC = c; }
    }
    if (nearestC && !G.looting) {
        // 开始搜刮动画：1.2 秒后完成
        G.looting = { container: nearestC, startAt: now, duration: 1200 };
    }
}

// 更新搜刮动画进度（每帧 update 中调用）
function updateLooting(now) {
    if (!G.looting) return false;
    const l = G.looting;
    const elapsed = now - l.startAt;
    const p = G.player;

    // 玩家必须靠近容器 & 不移动 & 不攻击，否则取消
    if (!p || !l.container || l.container.opened) {
        G.looting = null;
        return false;
    }
    if (dist(p, l.container) > 80) {
        G.looting = null;
        return false;
    }
    if (Math.hypot(p.vx || 0, p.vy || 0) > 25) {
        G.looting = null;
        return false;
    }
    if (G.mouse.down) {
        G.looting = null;
        return false;
    }

    // 进度中生成持续粒子反馈
    if (Math.random() < 0.35) {
        spawnParticles(
            l.container.x + (Math.random() - 0.5) * 40,
            l.container.y + (Math.random() - 0.5) * 20,
            '#d8a45c', 1, 50
        );
    }

    if (elapsed >= l.duration) {
        // 完成搜刮
        openContainer(l.container);
        G.looting = null;
        return true;
    }
    return false;
}

function openContainer(c) {
    c.opened = true;
    // 根据容器大小决定产出
    const n = randi(3, 6);
    const loot = rollLoot(n);
    c.lootLeft = loot.length;
    // 把物品散落在容器周围
    const baseAngle = rand(0, Math.PI * 2);
    loot.forEach((item, i) => {
        const ang = baseAngle + (i / loot.length) * Math.PI * 2 + rand(-0.3, 0.3);
        const rr = rand(55, 90);
        const ix = c.x + Math.cos(ang) * rr;
        const iy = c.y + Math.sin(ang) * rr;
        G.groundItems.push(createGroundItem(ix, iy, item.key, item.qty));
    });
    // === 视觉增强：多层粒子爆发 + 震屏 ===
    // 主爆发：琥珀色尘埃
    spawnParticles(c.x, c.y, C.amber, 28, 160);
    // 外层白色高光
    spawnParticles(c.x, c.y, '#ffffff', 10, 200);
    // 暗角
    spawnParticles(c.x, c.y, '#8a5a2a', 16, 120);
    G.camera.shake = Math.min(G.camera.shake + 8, 16);
    Sound.loot();
}

function pickupItem(groundItem) {
    const p = G.player;
    const def = ITEM_TYPES[groundItem.key];
    if (!def) return;

    // 武器 — 自动装备到武器栏
    if (def.kind === 'weapon') {
        // 找到一个空槽或替换空的
        let idx = p.weapons.findIndex(w => w === null);
        if (idx < 0) {
            if (p.weapons.length >= 2) {
                // 替换当前槽（或者丢弃旧的那把保留的，简单处理：把旧的变成空槽）
                const newW = createWeapon(def.weaponKey);
                // 给新武器一些初始备弹
                if (newW.ammoType) p.inventory[newW.ammoType] = (p.inventory[newW.ammoType] || 0) + newW.maxMag * 2;
                p.weapons[p.currentWeapon] = newW;
            } else {
                p.weapons.push(createWeapon(def.weaponKey));
            }
        } else {
            p.weapons[idx] = createWeapon(def.weaponKey);
            if (p.weapons[idx].ammoType) p.inventory[p.weapons[idx].ammoType] = (p.inventory[p.weapons[idx].ammoType] || 0) + p.weapons[idx].maxMag;
        }
        G.lootValue += def.value * groundItem.qty;
        Sound.pickup();
        spawnParticles(groundItem.x, groundItem.y, def.color, 14, 100);
        // 从地上移除
        G.groundItems = G.groundItems.filter(x => x !== groundItem);
        return;
    }

    // 护甲 — 直接装备（替换现有）
    if (def.kind === 'armor') {
        p.armor = { type: groundItem.key, reduction: def.reduction, value: def.value };
        G.lootValue += def.value * groundItem.qty;
        Sound.pickup();
        spawnParticles(groundItem.x, groundItem.y, def.color, 16, 110);
        G.groundItems = G.groundItems.filter(x => x !== groundItem);
        return;
    }

    // 普通物品（弹药/消耗品/战利品）— 检查负重
    const addWeight = def.weight * groundItem.qty;
    if (p.weight + addWeight > p.maxWeight) {
        // 超重，不能拾取 — 视觉上简单提示
        spawnParticles(groundItem.x, groundItem.y, '#666', 6, 40);
        return;
    }
    p.inventory[groundItem.key] = (p.inventory[groundItem.key] || 0) + groundItem.qty;
    p.weight += addWeight;
    G.lootValue += def.value * groundItem.qty;

    Sound.pickup();
    spawnParticles(groundItem.x, groundItem.y, def.color, 10, 90);
    G.groundItems = G.groundItems.filter(x => x !== groundItem);
}

// -------------------- 射击 --------------------
function tryShoot(now) {
    const p = G.player;
    if (!p) return;
    if (p.reloading) return;
    const w = p.weapons[p.currentWeapon];
    if (!w) return;

    // 切换武器冷却锁定（切枪后一段时间不能开火，让武器有切换动画感）
    const switchLock = G.lastSwitchAt ? (now - G.lastSwitchAt < w.switchTime) : false;
    if (switchLock) return;

    if (now - p.lastShot < w.fireRate) return;

    // === 后坐力驱动的散布 ===
    // 基础 + 移动 + 瞄准 + 连射累加
    let effectiveSpread = w.spread;
    // 瞄准：右键时大幅降低散布
    if (G.mouse.right) effectiveSpread *= 0.45;
    // 移动：速度越快散布越大
    const moveSpeed = Math.hypot(p.vx || 0, p.vy || 0);
    if (moveSpeed > 20) effectiveSpread *= 1.0 + Math.min(1.2, moveSpeed / 120);
    // 连射累加：后坐力叠加扩散
    effectiveSpread *= 1.0 + G.weaponRecoil * 0.35;

    // 近战
    if (w.melee) {
        p.lastShot = now;
        p.lastMelee = now;
        G.camera.shake = Math.min(G.camera.shake + 2.5, 10);
        // 对近距离敌人造成伤害
        for (const e of G.enemies) {
            if (e.state === 'dead') continue;
            const d = dist(p, e);
            if (d < w.range) {
                const aToE = Math.atan2(e.y - p.y, e.x - p.x);
                const diff = Math.abs(normalizeAngle(aToE - p.angle));
                if (diff < Math.PI / 3) {
                    const finalDmg = damageEnemy(e, w.dmg, p.angle);
                    e.causeOfDeath = 'melee';
                    // === 视觉增强：近战命中冲击 + 飘字 ===
                    spawnImpactEffect(e.x, e.y, e.armored ? 'metal' : 'flesh', e.color, aToE);
                    spawnDamageNumber(e.x, e.y, finalDmg, e.stealth ? 'stealth' : 'normal', true);
                }
            }
        }
        // 近战粒子效果
        spawnParticles(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20,
                       '#ffffff', 4, 60);
        return;
    }

    // 远程
    if (w.mag <= 0) {
        // 空仓咔哒：自动换弹
        const inv = p.inventory[w.ammoType] || 0;
        if (inv > 0) tryReload();
        p.lastShot = now;
        return;
    }
    p.lastShot = now;
    G.lastShootAt = now;
    w.mag--;

    // === 后坐力累加（每发子弹增加，霰弹加得最多）
    G.weaponRecoil = Math.min(5.0, G.weaponRecoil + w.recoil);

    // === 相机震动：按武器重量 & 后坐力差异化
    const shakeAmt = (w.weight * 1.8) + (w.recoil * 1.2);
    G.camera.shake = Math.min(G.camera.shake + shakeAmt, 16);

    // === 播放开火声
    Sound.shoot(w.key);

    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
        const ang = p.angle + (Math.random() - 0.5) * effectiveSpread * 2;
        const muzzleDist = 20;
        const bx = p.x + Math.cos(p.angle) * muzzleDist;
        const by = p.y + Math.sin(p.angle) * muzzleDist;
        const bullet = createBullet(bx, by, ang, w.bulletSpeed, w.dmg, w.bulletLen,
                                     'player', C.white, 1.0);
        // 榴弹特殊标记
        if (w.explosive) bullet.explosive = true;
        if (w.blastRadius) bullet.blastRadius = w.blastRadius;
        G.bullets.push(bullet);
    }
    // 枪口闪光（按武器差异化大小）
    const muzzleSize = (pellets > 1 ? 22 : 12) + w.weight * 2;
    G.muzzle = {
        x: p.x + Math.cos(p.angle) * 26,
        y: p.y + Math.sin(p.angle) * 26,
        angle: p.angle, life: 0.06, size: muzzleSize
    };
    // 枪口火花粒子
    spawnParticles(p.x + Math.cos(p.angle) * 32, p.y + Math.sin(p.angle) * 32,
                   '#fff0c0', 4 + Math.floor(w.recoil * 2), 80 + w.recoil * 20);
    // 弹壳抛出
    spawnParticles(p.x - Math.cos(p.angle) * 6, p.y - Math.sin(p.angle) * 6,
                   '#c8a060', 2, 50);

    // 射击声让附近敌人警觉（范围随武器重量变大）
    const alertRange = 400 + w.weight * 80;
    for (const e of G.enemies) {
        if (e.state === 'dead') continue;
        if (dist(e, p) < alertRange) { e.state = 'chase'; e.alertTimer = 5; }
    }
}

function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

// -------------------- 敌人受击 / 死亡 --------------------
function damageEnemy(e, dmg, fromAngle) {
    const origDmg = dmg;
    // === 装甲减伤 ===
    if (e.armored) {
        dmg *= (1 - e.armorReduction);
    }
    // === 隐身时受击有特殊效果 ===
    if (e.stealth) {
        e.stealthTimer = 0; // 取消隐身
        dmg *= 1.5; // 偷袭伤害加成
    }
    e.hp -= dmg;
    e.hitFlash = 0.15;
    e.state = 'chase';
    e.alertTimer = 5;
    // 击退
    e.kbX = Math.cos(fromAngle) * 180;
    e.kbY = Math.sin(fromAngle) * 180;
    // 血花（暗化）
    spawnParticles(e.x, e.y, '#4a2a2a', 10, 90);
    // 装甲兵受击溅出金属火花
    if (e.armored) {
        spawnParticles(e.x, e.y, '#aaaaaa', 6, 80);
    }
    G.camera.shake = Math.min(G.camera.shake + 1.5, 10);
    if (e.hp <= 0) {
        e.state = 'dead';
        Sound.enemyDown();
        // === 成就系统：记录击杀 ===
        recordAchievementEvent('kill');
        if (e.stealth) recordAchievementEvent('stealth_kill');
        if (e.causeOfDeath === 'melee') recordAchievementEvent('melee_kill');
        if (e.causeOfDeath === 'grenade') recordAchievementEvent('grenade_kill');
        // 死亡掉落 - 精英敌人掉落更多
        const dropCount = (e.type === 'elite' || e.type === 'armored') ? randi(3, 5) : randi(1, 3);
        const drops = rollLoot(dropCount);
        drops.forEach((item, i) => {
            const ang = rand(0, Math.PI * 2);
            const rr = rand(20, 45);
            G.groundItems.push(createGroundItem(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr, item.key, item.qty));
        });
        spawnParticles(e.x, e.y, e.color, 26, 160);
        // 装甲兵死亡爆炸效果
        if (e.armored) {
            spawnParticles(e.x, e.y, '#888888', 20, 140);
            G.camera.shake = Math.min(G.camera.shake + 8, 16);
        }
        G.camera.shake = Math.min(G.camera.shake + 6, 14);
        // 任务追踪：精英击杀
        if ((e.type === 'elite' || e.type === 'armored') && G.mission && G.mission.id === 'headhunter') {
            G.mission.eliteKilled = (G.mission.eliteKilled || 0) + 1;
        }
    }
    return dmg;  // 返回最终应用的伤害（用于飘字）
}

// -------------------- 粒子 --------------------
function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(speed * 0.3, speed);
        G.particles.push({
            x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
            life: rand(0.35, 0.85), age: 0,
            color, size: rand(1.5, 3.5)
        });
    }
}

// -------------------- 命中冲击特效 --------------------
// type: 'flesh' | 'cover' | 'metal' | 'spark' | 'shockwave'
function spawnImpactEffect(x, y, type, color, angle) {
    // 1. 主冲击波（短暂扩散环）
    if (type !== 'shockwave') {
        G.impactEffects.push({
            x, y, type: 'shockwave',
            radius: 4,
            maxRadius: type === 'flesh' ? 22 : (type === 'metal' ? 28 : 18),
            life: type === 'metal' ? 0.35 : 0.28,
            age: 0,
            color: type === 'flesh' ? '#ff6a4a' : (type === 'metal' ? '#ffd060' : color),
            lineWidth: 2
        });
    } else {
        G.impactEffects.push({
            x, y, type: 'shockwave',
            radius: 8,
            maxRadius: 36,
            life: 0.4, age: 0,
            color: color || '#ffd060', lineWidth: 2.5
        });
    }
    // 2. 中心闪白（核心闪点）
    G.impactEffects.push({
        x, y, type: 'flash',
        radius: type === 'metal' ? 6 : 4,
        maxRadius: type === 'metal' ? 14 : 10,
        life: 0.14, age: 0,
        color: type === 'flesh' ? '#ffaa66' : (type === 'metal' ? '#ffffe0' : '#ffffff')
    });
    // 3. 火花 / 血雾 粒子（方向性，向后扩散）
    if (type === 'flesh') {
        // 血雾：扇形散开
        const back = angle !== undefined ? angle : rand(0, Math.PI * 2);
        for (let i = 0; i < 5; i++) {
            const a = back + (Math.random() - 0.5) * 1.2;
            const s = rand(60, 180);
            G.particles.push({
                x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: rand(0.3, 0.6), age: 0,
                color: '#cc3322', size: rand(2, 3.5)
            });
        }
        // 滴落的血
        for (let i = 0; i < 3; i++) {
            G.particles.push({
                x: x + rand(-4, 4), y: y + rand(-4, 4),
                vx: rand(-30, 30), vy: rand(-30, 30),
                life: rand(0.5, 1.0), age: 0,
                color: '#881a14', size: rand(1.5, 2.5)
            });
        }
    } else if (type === 'metal') {
        // 装甲兵：橙白火花飞溅
        const back = angle !== undefined ? angle : rand(0, Math.PI * 2);
        for (let i = 0; i < 8; i++) {
            const a = back + (Math.random() - 0.5) * 1.5;
            const s = rand(80, 220);
            G.particles.push({
                x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: rand(0.25, 0.55), age: 0,
                color: Math.random() < 0.5 ? '#ffd060' : '#ff9020', size: rand(1.5, 2.5)
            });
        }
        // 金属粉尘
        for (let i = 0; i < 4; i++) {
            G.particles.push({
                x, y, vx: rand(-50, 50), vy: rand(-50, 50),
                life: rand(0.4, 0.8), age: 0,
                color: '#999999', size: rand(1, 2)
            });
        }
    } else if (type === 'cover') {
        // 掩体：碎片飞溅
        const back = angle !== undefined ? angle : rand(0, Math.PI * 2);
        for (let i = 0; i < 6; i++) {
            const a = back + (Math.random() - 0.5) * 1.4;
            const s = rand(50, 160);
            G.particles.push({
                x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: rand(0.3, 0.7), age: 0,
                color: color || '#7a6a5a', size: rand(1.5, 3)
            });
        }
        // 尘灰
        for (let i = 0; i < 4; i++) {
            G.particles.push({
                x, y, vx: rand(-30, 30), vy: rand(-30, 30),
                life: rand(0.5, 1.1), age: 0,
                color: '#aaaaaa', size: rand(1, 2)
            });
        }
    } else {
        // 通用 / spark：白色星点
        for (let i = 0; i < 4; i++) {
            const a = rand(0, Math.PI * 2);
            const s = rand(40, 120);
            G.particles.push({
                x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: rand(0.2, 0.5), age: 0,
                color: '#ffe080', size: rand(1, 2)
            });
        }
    }
    // 4. 命中点临时光照
    G.impactEffects.push({
        x, y, type: 'light',
        radius: type === 'metal' ? 32 : (type === 'flesh' ? 22 : 18),
        life: 0.18, age: 0,
        color: type === 'flesh' ? 'rgba(255, 100, 60, 0.5)' :
               type === 'metal' ? 'rgba(255, 220, 120, 0.6)' :
               (type === 'cover' ? 'rgba(255, 200, 150, 0.4)' : 'rgba(255, 240, 200, 0.5)')
    });
}

// -------------------- 飘字伤害数字 --------------------
function spawnDamageNumber(x, y, value, type, isCrit, isHeal) {
    if (isHeal) {
        G.damageNumbers.push({
            x, y: y - 8, vy: -55, vx: rand(-15, 15),
            value: '+' + Math.round(value),
            color: '#7aff9a', size: 14, life: 1.0, age: 0,
            type: 'heal'
        });
        return;
    }
    let color, size;
    if (isCrit) {
        color = '#ffd040';
        size = 22;
    } else if (type === 'armored') {
        color = '#ffe080';
        size = 17;
    } else if (type === 'stealth') {
        color = '#c88aff';
        size = 20;
    } else if (type === 'headshot') {
        color = '#ff7a4a';
        size = 20;
    } else if (type === 'cover') {
        color = '#aaaaaa';
        size = 14;
    } else if (value >= 40) {
        color = '#ffd060';
        size = 19;
    } else if (value >= 20) {
        color = '#ffeaa0';
        size = 17;
    } else {
        color = '#ffe0a0';
        size = 15;
    }
    G.damageNumbers.push({
        x: x + rand(-6, 6), y: y - 12, vy: -65, vx: rand(-25, 25),
        value: Math.round(value).toString(),
        color, size, life: 1.1, age: 0, type: type || 'normal',
        isCrit: !!isCrit
    });
}

// -------------------- 弹孔贴片 --------------------
function spawnBulletHole(cover, hitX, hitY) {
    // 在掩体上留一个弹孔，附着在掩体上随时间淡出
    G.bulletHoles.push({
        coverId: cover._id,    // 用于跟随掩体移动（虽然当前掩体不会动，但解耦更稳）
        ox: hitX - cover.x, oy: hitY - cover.y,  // 相对位置
        life: 8.0, age: 0
    });
    if (G.bulletHoles.length > 80) G.bulletHoles.shift();
}

function updateImpactEffects(dt) {
    const ns = [];
    for (const e of G.impactEffects) {
        e.age += dt;
        if (e.age < e.life) ns.push(e);
    }
    G.impactEffects = ns;
}

function updateDamageNumbers(dt) {
    const ns = [];
    for (const d of G.damageNumbers) {
        d.age += dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy *= 0.95;   // 减速飘字
        d.vx *= 0.9;
        if (d.age < d.life) ns.push(d);
    }
    G.damageNumbers = ns;
}

function updateBulletHoles(dt) {
    const ns = [];
    for (const h of G.bulletHoles) {
        h.age += dt;
        if (h.age < h.life) ns.push(h);
    }
    G.bulletHoles = ns;
}

// -------------------- 自适应音乐状态 --------------------
let _musicStateCache = { intensity: 0, inCombat: false, closeCount: 0 };
function updateMusicState() {
    if (G.ended || !G.player) return;
    // 计算紧张度
    let chaseCount = 0, closeCount = 0;
    let minDistToEnemy = 9999;
    for (const e of G.enemies) {
        if (e.state === 'dead') continue;
        const d = Math.hypot(e.x - G.player.x, e.y - G.player.y);
        if (d < minDistToEnemy) minDistToEnemy = d;
        if (e.state === 'chase') {
            chaseCount++;
            if (d < 250) closeCount++;
        }
    }
    const inCombat = chaseCount > 0;
    // 强度：0~1，基于敌人数量、距离、玩家血量
    const hpFactor = G.player.hp < 30 ? 0.4 : (G.player.hp < 60 ? 0.2 : 0);
    const distFactor = minDistToEnemy < 200 ? 0.4 : (minDistToEnemy < 400 ? 0.2 : 0);
    const chaseFactor = Math.min(0.5, chaseCount * 0.15);
    const intensity = Math.min(1, hpFactor + distFactor + chaseFactor);
    _musicStateCache = { intensity, inCombat, closeCount };
    Music.update(intensity, inCombat, closeCount > 0);
}

// -------------------- 命中冲击特效绘制 --------------------
function drawImpactEffects() {
    for (const e of G.impactEffects) {
        const t = e.age / e.life;
        if (e.type === 'shockwave') {
            const r = lerp(e.radius, e.maxRadius, t);
            const alpha = (1 - t) * 0.7;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = e.lineWidth * (1 - t * 0.5);
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else if (e.type === 'flash') {
            const r = lerp(e.radius * 0.5, e.maxRadius, t);
            const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
            grd.addColorStop(0, e.color);
            grd.addColorStop(0.4, e.color);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.save();
            ctx.globalAlpha = (1 - t) * 0.95;
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (e.type === 'light') {
            // 命中点临时光照（点亮周围地面）
            const r = e.radius * (1 + t * 0.5);
            const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
            grd.addColorStop(0, e.color);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.save();
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.fillStyle = grd;
            ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
            ctx.restore();
        }
    }
}

function drawDamageNumbers() {
    for (const d of G.damageNumbers) {
        const t = d.age / d.life;
        const alpha = t < 0.7 ? 1 : (1 - (t - 0.7) / 0.3);
        const yOff = -t * 18;  // 飘字附加偏移
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${d.size}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 黑色描边
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(d.value, d.x, d.y + yOff);
        // 颜色填充
        ctx.fillStyle = d.color;
        if (d.isCrit) {
            // 暴击有额外光晕
            ctx.shadowColor = d.color;
            ctx.shadowBlur = 8;
        }
        ctx.fillText(d.value, d.x, d.y + yOff);
        ctx.restore();
    }
}

function drawBulletHoles() {
    for (const h of G.bulletHoles) {
        // 找到对应掩体
        const c = G.covers.find(cc => cc._id === h.coverId);
        if (!c) continue;
        const x = c.x + h.ox;
        const y = c.y + h.oy;
        const t = h.age / h.life;
        const alpha = t < 0.6 ? 0.7 : (0.7 * (1 - (t - 0.6) / 0.4));
        ctx.save();
        ctx.globalAlpha = alpha;
        // 暗色弹孔核心
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        // 周围木屑/混凝土灰
        ctx.fillStyle = '#2a2018';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        // 高光碎屑
        ctx.fillStyle = 'rgba(255, 220, 160, 0.4)';
        ctx.beginPath();
        ctx.arc(x - 0.5, y - 0.5, 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// -------------------- 手雷系统 --------------------
// 获取玩家身上所有手雷（按类型）
function getGrenadeCounts() {
    const inv = G.player.inventory;
    return {
        frag:    inv.grenade_frag    || 0,
        molotov: inv.grenade_molotov || 0,
        emp:     inv.grenade_emp     || 0,
        flash:   inv.grenade_flash   || 0
    };
}

// 拿到第一个有手雷的槽位
function getFirstAvailableGrenade(startFrom) {
    const counts = getGrenadeCounts();
    const order = ['frag', 'molotov', 'emp', 'flash'];
    const start = startFrom || G.selectedGrenade || 0;
    for (let i = 0; i < order.length; i++) {
        const idx = (start + i) % order.length;
        if (counts[order[idx]] > 0) return order[idx];
    }
    return null;
}

// 投掷一颗手雷
function tryThrowGrenade() {
    if (!G.player || G.ended) return;
    // 优先投掷当前选中的类型
    let type = getFirstAvailableGrenade(G.selectedGrenade);
    if (!type) {
        // 提示无可用手雷
        G.interactHint.text = '没有手雷了！';
        G.interactHint.show = true;
        setTimeout(() => { G.interactHint.show = false; }, 800);
        return;
    }
    // 消耗一颗
    G.player.inventory['grenade_' + type]--;
    if (G.player.inventory['grenade_' + type] === 0) {
        delete G.player.inventory['grenade_' + type];
    }
    // 计算投掷方向（玩家朝向 + 一点上抛）
    const p = G.player;
    const def = GRENADE_TYPES[type];
    // 投掷距离基于蓄力时间（按住 G 越久越远，最多 1.0 秒）
    const heldTime = G.grenadeHoldTime || 0;
    const power = Math.min(1, heldTime);
    const throwSpeed = 280 + power * 320;  // 280~600
    const startX = p.x + Math.cos(p.angle) * (p.r + 8);
    const startY = p.y + Math.sin(p.angle) * (p.r + 8);
    G.grenades.push({
        x: startX, y: startY,
        vx: Math.cos(p.angle) * throwSpeed,
        vy: Math.sin(p.angle) * throwSpeed - 80 - power * 120,  // 抛物线上抛
        type, def,
        fuse: def.fuse,
        age: 0,
        bounces: 0,
        maxBounces: 2,
        r: 6,
        rotation: 0,
        flashTimer: 0  // 引信闪烁
    });
    // 投掷音效
    Sound.grenadeThrow();
    G.camera.shake = Math.min(G.camera.shake + 1.2, 6);
    G.grenadeHoldTime = 0;
}

// 引爆手雷：处理不同类型效果
function detonateGrenade(g) {
    const def = g.def;
    const p = G.player;
    // 通用爆炸视觉
    spawnImpactEffect(g.x, g.y, 'shockwave', def.color);
    spawnParticles(g.x, g.y, def.color, 30, 220);
    spawnParticles(g.x, g.y, '#ffffff', 12, 120);
    G.camera.shake = Math.min(G.camera.shake + (def.dmg >= 50 ? 8 : 4), 16);
    Sound.hit();

    if (g.type === 'frag') {
        // 破片：对范围内所有敌人造成伤害
        for (const e of G.enemies) {
            if (e.state === 'dead') continue;
            const d = Math.hypot(e.x - g.x, e.y - g.y);
            if (d < def.blastR) {
                const falloff = 1 - (d / def.blastR);
                const dmg = def.dmg * falloff;
                const finalDmg = damageEnemy(e, dmg, Math.atan2(e.y - g.y, e.x - g.x));
                e.causeOfDeath = 'grenade';
                spawnImpactEffect(e.x, e.y, e.armored ? 'metal' : 'flesh', e.color, Math.atan2(e.y - g.y, e.x - g.x));
                spawnDamageNumber(e.x, e.y, finalDmg, e.stealth ? 'stealth' : 'normal', finalDmg >= 50);
            }
        }
        // 玩家自伤（中心 50% 半径，伤害减半）
        const dp = Math.hypot(p.x - g.x, p.y - g.y);
        if (dp < def.blastR * 0.7) {
            const falloff = 1 - (dp / (def.blastR * 0.7));
            const selfDmg = def.dmg * falloff * 0.4;
            p.hp -= selfDmg;
            if (p.hp <= 0) { p.hp = 0; endGame(false); }
            spawnImpactEffect(p.x, p.y, 'flesh', '#ffaa66', Math.atan2(p.y - g.y, p.x - g.x));
            spawnDamageNumber(p.x, p.y, selfDmg, 'cover', false);
            Sound.playerHurt();
        }
    } else if (g.type === 'molotov') {
        // 燃烧瓶：留下持续燃烧区域
        G.fireZones.push({
            x: g.x, y: g.y, radius: def.burnRadius,
            life: def.burnDuration, age: 0,
            tickInterval: 0.3, tickTimer: 0,
            dmg: def.burnDmg
        });
        // 中心点立即造成小伤害
        for (const e of G.enemies) {
            if (e.state === 'dead') continue;
            const d = Math.hypot(e.x - g.x, e.y - g.y);
            if (d < def.blastR) {
                const falloff = 1 - (d / def.blastR);
                const finalDmg = damageEnemy(e, def.dmg * falloff, Math.atan2(e.y - g.y, e.x - g.x));
                e.causeOfDeath = 'grenade';
                spawnDamageNumber(e.x, e.y, finalDmg, e.armored ? 'armored' : 'normal', false);
                // 标记持续燃烧
                e.burning = def.burnDuration;
            }
        }
        // 玩家踩到火也会受伤
        const dp = Math.hypot(p.x - g.x, p.y - g.y);
        if (dp < def.blastR * 0.7) {
            p.hp -= def.dmg * 0.5;
            spawnDamageNumber(p.x, p.y, def.dmg * 0.5, 'cover', false);
            Sound.playerHurt();
            if (p.hp <= 0) { p.hp = 0; endGame(false); }
        }
    } else if (g.type === 'emp') {
        // 电磁脉冲：眩晕电子敌人，对装甲/电子敌人效果加倍
        for (const e of G.enemies) {
            if (e.state === 'dead') continue;
            const d = Math.hypot(e.x - g.x, e.y - g.y);
            if (d < def.blastR) {
                const falloff = 1 - (d / def.blastR);
                // 眩晕
                e.stunned = def.stunDuration * (0.5 + 0.5 * falloff);
                e.state = 'stunned';
                e.alertTimer = 0;
                e.kbX = Math.cos(Math.atan2(e.y - g.y, e.x - g.x)) * 100;
                e.kbY = Math.sin(Math.atan2(e.y - g.y, e.x - g.x)) * 100;
                // 小伤害
                const finalDmg = damageEnemy(e, def.dmg * falloff, Math.atan2(e.y - g.y, e.x - g.x));
                spawnDamageNumber(e.x, e.y, finalDmg, e.armored ? 'armored' : 'stealth', false);
                spawnImpactEffect(e.x, e.y, 'spark', '#5acee8');
            }
        }
        // 屏幕蓝白闪烁
        document.getElementById('game-wrapper').classList.add('emp-flash');
        setTimeout(() => document.getElementById('game-wrapper').classList.remove('emp-flash'), 200);
    } else if (g.type === 'flash') {
        // 闪光弹：致盲敌人，范围更大
        for (const e of G.enemies) {
            if (e.state === 'dead') continue;
            const d = Math.hypot(e.x - g.x, e.y - g.y);
            if (d < def.blastR) {
                const falloff = 1 - (d / def.blastR);
                // 致盲（短于眩晕但仅失去视野，无法追击）
                e.blinded = def.stunDuration * (0.4 + 0.6 * falloff);
                e.state = 'stunned';
                e.alertTimer = 0;
                // 视觉反馈
                spawnImpactEffect(e.x, e.y, 'flash', '#ffffff');
            }
        }
        // 屏幕白闪（玩家自己也受影响）
        document.getElementById('game-wrapper').classList.add('flash-flash');
        setTimeout(() => document.getElementById('game-wrapper').classList.remove('flash-flash'), 300);
    }
}

function updateGrenades(dt) {
    const survivors = [];
    for (const g of G.grenades) {
        g.age += dt;
        g.flashTimer = Math.max(0, g.flashTimer - dt);
        // 重力
        g.vy += 380 * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.rotation += dt * 8;
        // 检查掩体碰撞（撞到则反弹）
        for (const c of G.covers) {
            if (c.hp <= 0) continue;
            if (g.x > c.x && g.x < c.x + c.w && g.y > c.y && g.y < c.y + c.h) {
                // 反弹：取决于入射方向
                if (Math.abs(g.vx) > Math.abs(g.vy)) {
                    g.vx = -g.vx * 0.55;
                    g.x += g.vx * dt * 2;
                } else {
                    g.vy = -g.vy * 0.55;
                    g.y += g.vy * dt * 2;
                }
                g.bounces++;
                // 撞墙粒子
                spawnParticles(g.x, g.y, c.debrisColor, 3, 60);
                if (g.bounces > g.maxBounces) {
                    g.vx *= 0.4;
                    g.vy *= 0.4;
                }
                break;
            }
        }
        // 出世界则直接爆炸（避免丢失手雷）
        let outOfBounds = g.x < 0 || g.x > WORLD.w || g.y < 0 || g.y > WORLD.h;
        // 击中地面：y > WORLD.h - 4
        if (g.y > WORLD.h - 4) {
            g.y = WORLD.h - 4;
            g.vy = -g.vy * 0.4;
            g.vx *= 0.7;
            g.bounces++;
            spawnParticles(g.x, g.y, '#7a6a5a', 4, 80);
        }
        // 引信到时间
        if (g.age >= g.fuse || outOfBounds) {
            detonateGrenade(g);
            continue;
        }
        survivors.push(g);
    }
    G.grenades = survivors;
}

function updateFireZones(dt) {
    const survivors = [];
    for (const f of G.fireZones) {
        f.age += dt;
        f.tickTimer += dt;
        // 周期伤害
        if (f.tickTimer >= f.tickInterval) {
            f.tickTimer = 0;
            for (const e of G.enemies) {
                if (e.state === 'dead') continue;
                const d = Math.hypot(e.x - f.x, e.y - f.y);
                if (d < f.radius) {
                    const finalDmg = damageEnemy(e, f.dmg, Math.atan2(e.y - f.y, e.x - f.x));
                    spawnDamageNumber(e.x, e.y, finalDmg, 'armored', false);
                }
            }
            // 玩家踩火
            const dp = Math.hypot(G.player.x - f.x, G.player.y - f.y);
            if (dp < f.radius) {
                G.player.hp -= f.dmg * 0.4;
                spawnDamageNumber(G.player.x, G.player.y, f.dmg * 0.4, 'cover', false);
                if (G.player.hp <= 0) { G.player.hp = 0; endGame(false); }
            }
        }
        if (f.age < f.life) survivors.push(f);
    }
    G.fireZones = survivors;
}

function drawGrenade(g) {
    const def = g.def;
    const x = g.x, y = g.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(g.rotation);
    // 外圈光晕
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    grd.addColorStop(0, def.color + 'aa');
    grd.addColorStop(0.6, def.color + '33');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(-12, -12, 24, 24);
    // 主体（手雷形状 - 圆形 + 顶部小柄）
    ctx.fillStyle = def.color;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, g.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(-g.r * 0.35, -g.r * 0.35, g.r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 顶部小柄
    ctx.fillStyle = '#333';
    ctx.fillRect(-1.5, -g.r - 3, 3, 3);
    ctx.restore();
    // 引信闪烁警告（仅最后 0.8 秒）
    if (g.fuse - g.age < 0.8) {
        const flashT = (g.fuse - g.age);
        if (Math.floor(flashT * 12) % 2 === 0) {
            ctx.save();
            ctx.fillStyle = '#ffaa40';
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.time * 24);
            ctx.beginPath();
            ctx.arc(x, y, g.r + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

function drawFireZones() {
    for (const f of G.fireZones) {
        const t = f.age / f.life;
        const pulse = 0.7 + 0.3 * Math.sin(G.time * 12 + f.x);
        // 主体火焰（橙色径向渐变）
        const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
        grd.addColorStop(0, `rgba(255, 200, 80, ${(1 - t) * 0.6 * pulse})`);
        grd.addColorStop(0.4, `rgba(255, 130, 30, ${(1 - t) * 0.5 * pulse})`);
        grd.addColorStop(0.8, `rgba(255, 60, 20, ${(1 - t) * 0.3})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fill();
        // 火焰粒子（向上跳动）
        const flameCount = Math.floor(f.radius / 4);
        for (let i = 0; i < flameCount; i++) {
            const a = (i / flameCount) * Math.PI * 2 + G.time * 2;
            const r = f.radius * 0.7 * (0.5 + 0.5 * Math.sin(G.time * 4 + i));
            const px = f.x + Math.cos(a) * r;
            const py = f.y + Math.sin(a) * r * 0.8 - 4;
            const fgrd = ctx.createRadialGradient(px, py, 0, px, py, 8);
            fgrd.addColorStop(0, `rgba(255, 220, 100, ${(1 - t) * 0.7})`);
            fgrd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = fgrd;
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// -------------------- 掩体检测 --------------------
function isInCover(entity) {
    for (const c of G.covers) {
        // 简单的距离检测：如果 entity 在矩形边缘附近（贴近）
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        const dx = Math.abs(entity.x - cx) - c.w / 2;
        const dy = Math.abs(entity.y - cy) - c.h / 2;
        const d = Math.max(0, Math.max(dx, dy));
        if (d < entity.r + 8) return true;
    }
    return false;
}

// 检查一个点是否在掩体矩形内（子弹是否被挡住）
function pointInCovers(x, y) {
    for (const c of G.covers) {
        if (c.hp <= 0) continue; // 已摧毁的掩体不再阻挡
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return true;
    }
    return false;
}

// 检查子弹路径是否穿过掩体（简易：按步进采样）
function bulletBlockedByCover(bx, by, nbx, nby) {
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = lerp(bx, nbx, t);
        const y = lerp(by, nby, t);
        // 找到具体的掩体（不只是检测碰撞）
        for (const c of G.covers) {
            if (c.hp <= 0) continue;
            if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
                return { x, y, cover: c };
            }
        }
    }
    return null;
}

// -------------------- 智能AI辅助函数 --------------------

// 寻找最近的掩体（用于受伤躲避）
function findNearestCover(ex, ey, minDist = 80, maxDist = 400) {
    let best = null, bestD = Infinity;
    for (const c of G.covers) {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        const d = Math.hypot(cx - ex, cy - ey);
        if (d > minDist && d < maxDist && d < bestD) {
            // 检查掩体是否在玩家视线之外（更安全）
            const p = G.player;
            const blocked = bulletBlockedByCover(p.x, p.y, cx, cy);
            bestD = d;
            best = { x: cx, y: cy, w: c.w, h: c.h, blocked: !!blocked };
        }
    }
    return best;
}

// 寻找最佳包抄位置（从侧面绕后）
function findFlankPosition(e, p, dir) {
    const toP = Math.atan2(p.y - e.y, p.x - e.x);
    const flankAngle = toP + dir * Math.PI / 2.5; // 约70度侧面
    const dist = e.atkRange * 0.6;
    let fx = p.x + Math.cos(flankAngle) * dist;
    let fy = p.y + Math.sin(flankAngle) * dist;
    // 确保不超出世界边界
    fx = clamp(fx, 60, WORLD.w - 60);
    fy = clamp(fy, 60, WORLD.h - 60);
    // 如果目标点在掩体内，稍微偏移
    if (pointInCovers(fx, fy)) {
        fx += Math.cos(toP) * 40;
        fy += Math.sin(toP) * 40;
    }
    return { x: fx, y: fy };
}

// 通知附近同伴（团队配合）
function alertNearbyEnemies(alerter, range = 350) {
    const now = performance.now();
    if (now - alerter.lastAlertOthers < 2000) return; // 2秒内不重复通知
    alerter.lastAlertOthers = now;
    for (const other of G.enemies) {
        if (other === alerter || other.state === 'dead') continue;
        const d = Math.hypot(other.x - alerter.x, other.y - alerter.y);
        if (d < range) {
            other.state = 'chase';
            other.alertTimer = Math.max(other.alertTimer, other.alertDuration * 0.7);
            other.moveState = 'approach';
            // 如果已经有敌人在包抄，这个去另一侧
            if (alerter.flankDir !== 0) {
                other.flankDir = -alerter.flankDir;
                other.moveState = 'flank';
            }
        }
    }
}

// -------------------- 主循环 --------------------
let lastTime = performance.now();

function update(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (!G.running || G.ended) return;
    // 库存页打开时，暂停世界（玩家+敌人+子弹不动）
    if (G.inventoryOpen) return;
    // 撤离飞船动画播放中，锁定世界更新
    if (G.extractAnim && G.extractAnim.active) {
        updateExtractAnim(dt);
        return;
    }

    G.time += dt;

    // === 自适应音乐：根据游戏状态调整 ===
    updateMusicState();

    // ---- 搜刮动画进度 ----
    if (G.looting) updateLooting(now);

    // ---- 后坐力衰减（每帧降低，释放开火键会更快归零） ----
    if (G.player && G.player.weapons[G.player.currentWeapon]) {
        const w = G.player.weapons[G.player.currentWeapon];
        const decayRate = G.mouse.down ? (w.recoilDecay * 0.6) : (w.recoilDecay * 1.6);
        G.weaponRecoil = Math.max(0, G.weaponRecoil - decayRate * dt);
    }

    // ---- 玩家移动 ----
    const p = G.player;

    // 翻越中：自动移动到目标位置
    if (p.vaulting && p.vaultTarget) {
        const vaultProgress = Math.min(1, (now - p.vaultStart) / 400);
        // 抛物线运动：先快后慢，带一点"跳跃"感
        const ease = vaultProgress < 0.5 ? 2 * vaultProgress * vaultProgress : 1 - Math.pow(-2 * vaultProgress + 2, 2) / 2;
        p.x = lerp(p.x, p.vaultTarget.x, ease * 0.15);
        p.y = lerp(p.y, p.vaultTarget.y, ease * 0.15);
    } else {
        let mx = 0, my = 0;
        if (G.keys['w'] || G.keys['arrowup'])    my -= 1;
        if (G.keys['s'] || G.keys['arrowdown'])  my += 1;
        if (G.keys['a'] || G.keys['arrowleft'])  mx -= 1;
        if (G.keys['d'] || G.keys['arrowright']) mx += 1;
        const mag = Math.hypot(mx, my);
        if (mag > 0) { mx /= mag; my /= mag; }

        let speed = p.speed;
        // 冲刺
        const isSprinting = (G.keys['shift']) && p.stamina > 5 && mag > 0;
        if (isSprinting) {
            speed *= p.sprintMul;
            p.stamina = Math.max(0, p.stamina - 35 * dt);
        } else {
            p.stamina = Math.min(p.maxStamina, p.stamina + 20 * dt);
        }
        // 超重减速
        if (p.weight > p.maxWeight * 0.8) speed *= (1 - (p.weight - p.maxWeight * 0.8) / (p.maxWeight * 0.4) * 0.25);
        // 瞄准减速
        if (G.mouse.right) speed *= 0.55;
        // 装弹减速
        if (p.reloading) speed *= 0.7;

        const nx = p.x + mx * speed * dt;
        const ny = p.y + my * speed * dt;
        // 掩体碰撞（只检测未摧毁的掩体）
        if (!pointInCovers(nx, p.y)) p.x = clamp(nx, 50, WORLD.w - 50);
        if (!pointInCovers(p.x, ny)) p.y = clamp(ny, 50, WORLD.h - 50);
    }

    p.vx = (p.vaulting ? 0 : mx * speed);
    p.vy = (p.vaulting ? 0 : my * speed);
    p.inCover = isInCover(p);

    // === 脚步尘（按移动速度 + 是否冲刺生成） ===
    const moveMag = p.vaulting ? 0 : mag;
    if (moveMag > 0) {
        // 用 frame time 控制
        if (!p.lastDust) p.lastDust = 0;
        const dustInterval = isSprinting ? 60 : 130;
        if (now - p.lastDust > dustInterval) {
            p.lastDust = now;
            for (let i = 0; i < (isSprinting ? 3 : 1); i++) {
                G.footstepDust.push({
                    x: p.x + rand(-4, 4),
                    y: p.y + rand(-4, 4) + 4,
                    vx: -mx * speed * 0.1 + rand(-15, 15),
                    vy: -my * speed * 0.1 + rand(-15, 15),
                    life: 0.6, age: 0,
                    size: rand(2, 4)
                });
            }
        }
    } else {
        p.lastDust = now + 1000;
    }

    // 朝向鼠标（屏幕坐标 → 世界坐标）
    const worldMx = G.mouse.x + G.camera.x - W / 2;
    const worldMy = G.mouse.y + G.camera.y - H / 2;
    p.angle = Math.atan2(worldMy - p.y, worldMx - p.x);

    // ---- 射击（按住连发，手枪/步枪/霰弹有射速限制）----
    if (G.mouse.down) tryShoot(now);

    // ---- 相机 ----
    G.camera.x = lerp(G.camera.x, p.x, 0.12);
    G.camera.y = lerp(G.camera.y, p.y, 0.12);
    if (G.camera.shake > 0) G.camera.shake = Math.max(0, G.camera.shake - 20 * dt);

    // ---- 子弹 ----
    const surviving = [];
    for (const b of G.bullets) {
        const nbx = b.x + b.vx * dt;
        const nby = b.y + b.vy * dt;
        b.age += dt;
        // 掩体挡住 + 损坏
        const hit = bulletBlockedByCover(b.x, b.y, nbx, nby);
        if (hit && hit.cover) {
            const c = hit.cover;
            c.hp -= b.dmg;
            c.damaged = true;
            // 不同掩体类型的粒子效果
            const debrisColor = c.debrisColor || '#7a6a5a';
            spawnParticles(hit.x, hit.y, debrisColor, 4, 60);
            spawnParticles(hit.x, hit.y, '#ffffff', 2, 40);
            // === 视觉增强：命中掩体冲击波 + 弹孔 ===
            spawnImpactEffect(hit.x, hit.y, 'cover', debrisColor, Math.atan2(b.vy, b.vx));
            // 弹孔贴片（不同掩体类型颜色不同）
            if (Math.random() < 0.7) spawnBulletHole(c, hit.x, hit.y);
            // 掩体被摧毁
            if (c.hp <= 0) {
                spawnParticles(c.x + c.w / 2, c.y + c.h / 2, debrisColor, 20, 120);
                spawnParticles(c.x + c.w / 2, c.y + c.h / 2, '#aaaaaa', 10, 80);
                // 摧毁时大冲击波
                spawnImpactEffect(c.x + c.w / 2, c.y + c.h / 2, 'shockwave', '#ffaa40');
                G.camera.shake = Math.min(G.camera.shake + 4, 14);
                Sound.hit();
            }
            continue;
        }
        // 出世界
        if (nbx < 0 || nbx > WORLD.w || nby < 0 || nby > WORLD.h) continue;
        // 命中检测
        let consumed = false;
        if (b.owner === 'player') {
            for (const e of G.enemies) {
                if (e.state === 'dead') continue;
                if ((nbx - e.x) ** 2 + (nby - e.y) ** 2 < (e.r + 4) ** 2) {
                    let dmg = b.dmg;
                    const inCover = isInCover(e);
                    if (inCover) dmg *= 0.5;  // 敌人掩体减伤
                    // === 视觉增强：命中冲击波 + 飘字 ===
                    const hitAngle = Math.atan2(b.vy, b.vx);
                    const impactType = e.armored ? 'metal' : 'flesh';
                    spawnImpactEffect(nbx, nby, impactType, e.color, hitAngle);
                    // 应用伤害（damageEnemy 会处理装甲/隐身减伤，并返回最终伤害）
                    const finalDmg = damageEnemy(e, dmg, hitAngle);
                    e.causeOfDeath = 'bullet';
                    // 暴击判定：未在掩体、未被减伤、且伤害高于武器基础伤害
                    const isCrit = !inCover && !e.armored && finalDmg >= b.dmg * 1.2;
                    // 飘字伤害类型
                    let numberType = e.stealth ? 'stealth' :
                                     e.armored ? 'armored' :
                                     inCover ? 'cover' : 'normal';
                    spawnDamageNumber(nbx, nby, finalDmg, numberType, isCrit);
                    consumed = true;
                    break;
                }
            }
        } else {
            // 敌人子弹打玩家
            if ((nbx - p.x) ** 2 + (nby - p.y) ** 2 < (p.r + 4) ** 2) {
                let dmg = b.dmg;
                if (p.inCover) dmg *= 0.5;
                if (p.armor) dmg *= (1 - p.armor.reduction);
                p.hp -= dmg;
                Sound.playerHurt();
                p.damagedAt = G.time;
                document.getElementById('game-wrapper').classList.add('damaged');
                setTimeout(() => document.getElementById('game-wrapper').classList.remove('damaged'), 320);
                G.camera.shake = Math.min(G.camera.shake + 6, 16);
                spawnParticles(nbx, nby, '#5a4a52', 8, 100);
                // === 视觉增强：玩家被命中冲击波 + 飘字 ===
                const hitAngle = Math.atan2(b.vy, b.vx);
                spawnImpactEffect(nbx, nby, p.inCover ? 'cover' : 'flesh', b.color, hitAngle + Math.PI);
                spawnDamageNumber(nbx, nby, dmg, p.inCover ? 'cover' : 'normal', false);
                if (p.hp <= 0) { p.hp = 0; endGame(false); }
                consumed = true;
            }
        }
        // 榴弹爆炸逻辑
        if (!consumed && b.explosive && (b.age > 0.4 || consumed)) {
            const blastR = b.blastRadius || 100;
            // 爆炸视觉效果
            spawnParticles(b.x, b.y, '#ff8844', 30, 200);
            spawnParticles(b.x, b.y, '#ffaa00', 20, 150);
            spawnParticles(b.x, b.y, '#ffffff', 10, 100);
            // === 视觉增强：爆炸冲击波 + 临时强光 ===
            spawnImpactEffect(b.x, b.y, 'shockwave', '#ffaa40');
            G.camera.shake = Math.min(G.camera.shake + 10, 18);
            Sound.hit();
            // 范围伤害
            for (const e of G.enemies) {
                if (e.state === 'dead') continue;
                const d = Math.hypot(e.x - b.x, e.y - b.y);
                if (d < blastR) {
                    const falloff = 1 - (d / blastR);
                    const edmg = damageEnemy(e, b.dmg * falloff, Math.atan2(e.y - b.y, e.x - b.x));
                    // 飘字（爆炸伤害）
                    spawnDamageNumber(e.x, e.y, edmg, 'armored', false);
                }
            }
            // 玩家自伤
            const dToPlayer = Math.hypot(p.x - b.x, p.y - b.y);
            if (dToPlayer < blastR * 0.7) {
                const falloff = 1 - (dToPlayer / (blastR * 0.7));
                const playerDmg = b.dmg * falloff * 0.5;
                p.hp -= playerDmg;
                Sound.playerHurt();
                spawnDamageNumber(p.x, p.y, playerDmg, 'cover', false);
            }
            consumed = true;
        }
        if (!consumed && b.age < b.life) {
            b.x = nbx; b.y = nby; surviving.push(b);
        }
    }
    G.bullets = surviving;

    // ---- 敌人 AI ----
    for (const e of G.enemies) {
        if (e.state === 'dead') continue;
        if (e.hitFlash > 0) e.hitFlash -= dt;

        // 击退：先应用外力，再衰减
        e.x += e.kbX * dt;
        e.y += e.kbY * dt;
        e.kbX *= Math.pow(0.02, dt);
        e.kbY *= Math.pow(0.02, dt);
        // 简单分离：避免敌人叠在一起
        for (const other of G.enemies) {
            if (other === e || other.state === 'dead') continue;
            const ddx = e.x - other.x;
            const ddy = e.y - other.y;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            const minD = e.r + other.r + 4;
            if (dd < minD && dd > 0.01) {
                const push = (minD - dd) * 0.5;
                e.x += (ddx / dd) * push;
                e.y += (ddy / dd) * push;
            }
        }

        const toPlayer = dist(e, p);
        const canSeePlayer = toPlayer < e.perceptionRange && !bulletBlockedByCover(e.x, e.y, p.x, p.y);
        const aToP = Math.atan2(p.y - e.y, p.x - e.x);

        // === 隐行者隐身机制 ===
        if (e.stealth) {
            // 未战斗状态：每3-5秒获得一次隐身
            if (e.stealthTimer <= 0 && e.state !== 'chase' && e.hitFlash <= 0) {
                e.stealthTimer = 4 + Math.random() * 2; // 4-6秒隐身
            }
            if (e.stealthTimer > 0) {
                e.stealthTimer -= dt;
                // 接近玩家时隐身消失
                if (toPlayer < 100) e.stealthTimer = 0;
            }
        }
        // === 突进冷却 ===
        if (e.dash && e.dashCooldown > 0) e.dashCooldown -= dt;

        // === 燃烧倒计时 ===
        if (e.burning > 0) {
            e.burning -= dt;
            // 持续掉血（每 0.3 秒一次，2 点）
            if (!e._burnTick) e._burnTick = 0;
            e._burnTick += dt;
            if (e._burnTick >= 0.3) {
                e._burnTick = 0;
                const fdmg = damageEnemy(e, 2, Math.atan2(G.player.y - e.y, G.player.x - e.x));
                spawnDamageNumber(e.x, e.y, fdmg, 'armored', false);
            }
        }

        // === 眩晕 / 致盲状态 ===
        if (e.stunned > 0) {
            e.stunned -= dt;
            // 眩晕时不行动，但被击退可以
            e.kbX *= Math.pow(0.05, dt);
            e.kbY *= Math.pow(0.05, dt);
            // 显示眩晕效果（粒子）
            if (Math.floor(G.time * 8) % 4 === 0) {
                spawnParticles(e.x + rand(-6, 6), e.y - 14, '#5acee8', 1, 30);
            }
            if (e.stunned > 0) continue;  // 跳过其余 AI
        }
        if (e.blinded > 0) {
            e.blinded -= dt;
            // 致盲：仍能移动但无法看到玩家追击
            e.state = 'stunned';  // 暂时切到 stunned
            if (e.blinded > 0) continue;
        }

        // === 搜打撤 智能AI ===
        if (e.state === 'patrol') {
            // 发现玩家
            if (canSeePlayer) {
                e.state = 'chase';
                e.alertTimer = e.alertDuration;
                e.moveState = 'approach';
                e.flankDir = 0;
                // 通知同伴！
                alertNearbyEnemies(e);
            } else {
                // 巡逻 — 慢速、不连续
                if (!e.patrolTarget || now > e.nextPatrolAt || dist(e, e.patrolTarget) < 30) {
                    e.patrolTarget = { x: e.x + rand(-150, 150), y: e.y + rand(-150, 150) };
                    e.nextPatrolAt = now + rand(5000, 10000);
                }
                const a = Math.atan2(e.patrolTarget.y - e.y, e.patrolTarget.x - e.x);
                e.angle = lerp(e.angle, a, 0.04);
                const nx = e.x + Math.cos(a) * e.speed * 0.25 * dt;
                const ny = e.y + Math.sin(a) * e.speed * 0.25 * dt;
                if (!pointInCovers(nx, e.y)) e.x = clamp(nx, 80, WORLD.w - 80);
                if (!pointInCovers(e.x, ny)) e.y = clamp(ny, 80, WORLD.h - 80);
            }
        } else {
            // === 追击 / 攻击 / 战术移动 ===
            e.alertTimer -= dt;

            // 远距离丢失目标
            if (toPlayer > e.loseRange) {
                e.state = 'patrol';
                e.patrolTarget = null;
                e.coverTarget = null;
                e.moveState = 'approach';
                continue;
            }
            if (e.alertTimer <= 0) { e.state = 'patrol'; e.coverTarget = null; continue; }

            // === 战术决策：根据血量、距离、同伴位置决定行为 ===
            const hpRatio = e.hp / e.maxHp;
            const hasCover = isInCover(e);

            // 1. 低血量 + 受伤 → 寻找掩体撤退
            if (hpRatio < 0.35 && e.hitFlash > 0 && !e.coverTarget) {
                const cover = findNearestCover(e.x, e.y);
                if (cover) {
                    e.coverTarget = cover;
                    e.moveState = 'retreat';
                    e.retreatTimer = 3;
                }
            }

            // 2. 撤退到掩体
            if (e.moveState === 'retreat' && e.coverTarget) {
                e.retreatTimer -= dt;
                const toCover = Math.atan2(e.coverTarget.y - e.y, e.coverTarget.x - e.x);
                e.angle = lerp(e.angle, toCover, 0.1);
                const nx = e.x + Math.cos(toCover) * e.speed * 1.1 * dt;
                const ny = e.y + Math.sin(toCover) * e.speed * 1.1 * dt;
                if (!pointInCovers(nx, e.y)) e.x = clamp(nx, 80, WORLD.w - 80);
                if (!pointInCovers(e.x, ny)) e.y = clamp(ny, 80, WORLD.h - 80);
                // 到达掩体或撤退时间到
                if (dist(e, e.coverTarget) < 40 || e.retreatTimer <= 0) {
                    e.moveState = 'hold';
                    e.coverTarget = null;
                }
                // 撤退时偶尔回头射击（压制）
                if (e.ranged && now - e.lastShot > e.atkRate * 0.6) {
                    e.lastShot = now;
                    const ang = aToP + (Math.random() - 0.5) * e.spread * 3;
                    G.bullets.push(createBullet(
                        e.x + Math.cos(ang) * (e.r + 6),
                        e.y + Math.sin(ang) * (e.r + 6),
                        ang, e.bulletSpeed * 0.8, e.bulletDmg * 0.7, 8, 'enemy', e.color, 1.0
                    ));
                }
                continue;
            }

            // 3. 在掩体后坚守
            if (e.moveState === 'hold') {
                e.angle = lerp(e.angle, aToP, 0.06);
                // 血量恢复一些或玩家靠近就重新进攻
                if (hpRatio > 0.5 || toPlayer < e.atkRange * 0.5) {
                    e.moveState = 'approach';
                }
                // 掩体后射击（更准）
                if (e.ranged && toPlayer < e.atkRange && now - e.lastShot > e.atkRate) {
                    e.lastShot = now;
                    const ang = aToP + (Math.random() - 0.5) * e.spread * 1.2;
                    G.bullets.push(createBullet(
                        e.x + Math.cos(ang) * (e.r + 6),
                        e.y + Math.sin(ang) * (e.r + 6),
                        ang, e.bulletSpeed, e.bulletDmg, 8, 'enemy', e.color, 1.2
                    ));
                }
                continue;
            }

            // 4. 包抄行为：远程敌人在中距离时尝试从侧面绕
            if (e.ranged && e.moveState === 'approach' && toPlayer > e.atkRange * 0.4 && toPlayer < e.atkRange * 1.2) {
                // 随机决定包抄方向（首次）
                if (e.flankDir === 0) {
                    e.flankDir = Math.random() > 0.5 ? 1 : -1;
                }
                // 检查是否有同伴在另一侧包抄
                let otherFlanking = false;
                for (const other of G.enemies) {
                    if (other !== e && other.state === 'chase' && other.flankDir === -e.flankDir) {
                        otherFlanking = true; break;
                    }
                }
                // 如果同伴在另一侧，我也去包抄；否则有概率包抄
                if (otherFlanking || Math.random() < 0.008) {
                    e.moveState = 'flank';
                }
            }

            // 5. 包抄移动
            if (e.moveState === 'flank') {
                const flankPos = findFlankPosition(e, p, e.flankDir);
                const toFlank = Math.atan2(flankPos.y - e.y, flankPos.x - e.x);
                e.angle = lerp(e.angle, aToP, 0.08); // 始终面向玩家
                const nx = e.x + Math.cos(toFlank) * e.speed * 0.9 * dt;
                const ny = e.y + Math.sin(toFlank) * e.speed * 0.9 * dt;
                if (!pointInCovers(nx, e.y)) e.x = clamp(nx, 80, WORLD.w - 80);
                if (!pointInCovers(e.x, ny)) e.y = clamp(ny, 80, WORLD.h - 80);
                // 到达包抄位置或太靠近玩家就转回正常攻击
                if (dist(e, flankPos) < 50 || toPlayer < e.atkRange * 0.5) {
                    e.moveState = 'approach';
                }
                // 包抄过程中也射击
                if (e.ranged && toPlayer < e.atkRange && now - e.lastShot > e.atkRate * 1.3) {
                    e.lastShot = now;
                    const ang = aToP + (Math.random() - 0.5) * e.spread * 2;
                    G.bullets.push(createBullet(
                        e.x + Math.cos(ang) * (e.r + 6),
                        e.y + Math.sin(ang) * (e.r + 6),
                        ang, e.bulletSpeed, e.bulletDmg, 8, 'enemy', e.color, 1.2
                    ));
                }
                continue;
            }

            // 6. 标准接近/攻击
            e.angle = lerp(e.angle, aToP, 0.08);
            let desired = e.ranged ? (e.atkRange * 0.75) : 0;
            const moveDir = toPlayer > desired ? 0.8 : (toPlayer < desired * 0.6 ? -0.4 : 0);
            const chaseSpeed = e.speed * 0.8;
            const nx = e.x + Math.cos(aToP) * chaseSpeed * moveDir * dt;
            const ny = e.y + Math.sin(aToP) * chaseSpeed * moveDir * dt;
            if (!pointInCovers(nx, e.y)) e.x = clamp(nx, 80, WORLD.w - 80);
            if (!pointInCovers(e.x, ny)) e.y = clamp(ny, 80, WORLD.h - 80);

            // 攻击
            e.inCover = hasCover;
            if (toPlayer < e.atkRange) {
                if (e.ranged) {
                    if (now - e.lastShot > e.atkRate) {
                        e.lastShot = now;
                        const ang = aToP + (Math.random() - 0.5) * e.spread * 2;
                        const bullet = createBullet(
                            e.x + Math.cos(ang) * (e.r + 6),
                            e.y + Math.sin(ang) * (e.r + 6),
                            ang, e.bulletSpeed, e.bulletDmg, 8, 'enemy', e.color, 1.2
                        );
                        // === 爆裂者的爆炸子弹 ===
                        if (e.explosive) {
                            bullet.explosive = true;
                            bullet.blastRadius = e.blastRadius;
                        }
                        G.bullets.push(bullet);
                    }
                } else {
                    // === 隐行者突进 ===
                    if (e.dash && e.dashCooldown <= 0 && toPlayer < 250 && toPlayer > 60) {
                        // 触发突进
                        e.dashCooldown = 3;
                        e.kbX = Math.cos(aToP) * 600;
                        e.kbY = Math.sin(aToP) * 600;
                        spawnParticles(e.x, e.y, '#5a3a8a', 12, 100);
                        continue;
                    }
                    // 近战
                    if (toPlayer < e.r + p.r + 10 && now - e.lastShot > e.atkRate) {
                        e.lastShot = now;
                        let dmg = e.dmg;
                        if (p.inCover) dmg *= 0.4;
                        if (p.armor) dmg *= (1 - p.armor.reduction);
                        p.hp -= dmg;
                        Sound.playerHurt();
                        p.damagedAt = G.time;
                        document.getElementById('game-wrapper').classList.add('damaged');
                        setTimeout(() => document.getElementById('game-wrapper').classList.remove('damaged'), 320);
                        G.camera.shake = Math.min(G.camera.shake + 3, 14);
                        if (p.hp <= 0) { p.hp = 0; endGame(false); }
                    }
                }
            }
        }
    }

    // ---- 粒子 ----
    const ps = [];
    for (const pt of G.particles) {
        pt.age += dt;
        if (pt.age < pt.life) {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.vx *= 0.92;
            pt.vy *= 0.92;
            ps.push(pt);
        }
    }
    G.particles = ps;

    // === 脚步尘更新 ===
    const fd = [];
    for (const d of G.footstepDust) {
        d.age += dt;
        if (d.age < d.life) {
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.vx *= 0.85;
            d.vy *= 0.85;
            fd.push(d);
        }
    }
    G.footstepDust = fd;

    // === 命中冲击特效 / 飘字 / 弹孔更新 ===
    updateImpactEffects(dt);
    updateDamageNumbers(dt);
    updateBulletHoles(dt);

    // === 手雷系统更新 ===
    updateGrenades(dt);
    updateFireZones(dt);

    // === 蓄力手雷：按住 G 越久越远 ===
    if (G.keys['g']) {
        G.grenadeHoldTime = Math.min(1.0, (G.grenadeHoldTime || 0) + dt);
    }

    // ---- 撤离激活 ----
    if (G.lootValue >= LOOT_GOAL) {
        for (const z of G.extractZones) z.active = true;
        G.objectiveShown = true;
    }

    // ---- 撤离进度 ----
    let inAny = false;
    for (const z of G.extractZones) {
        if (!z.active) continue;
        if (dist(p, z) < z.r) {
            inAny = true;
            z.elapsed += dt;
            if (z.elapsed >= 5) {
                // 触发撤离飞船动画（8 秒后自动调 endGame）
                startExtractAnim();
                return;
            }
        } else {
            z.elapsed = Math.max(0, z.elapsed - dt * 2);
        }
    }

    // ---- 交互提示（走近物品/容器/撤离点时显示）----
    let hintText = '';
    let bestDist = 70;
    // 撤离
    for (const z of G.extractZones) {
        if (z.active) {
            const d = dist(p, z);
            if (d < z.r) {
                hintText = `撤离中 … ${(z.elapsed).toFixed(1)} / 5.0 秒`;
                bestDist = 0;
            } else if (d < z.r + 60 && hintText === '') {
                hintText = '进入圈内撤离';
            }
        }
    }
    // 物品
    if (bestDist > 0) {
        let nearestItem = null, bd = 999;
        for (const it of G.groundItems) {
            const d = dist(p, it);
            if (d < 60 && d < bd) { bd = d; nearestItem = it; }
        }
        if (nearestItem) {
            const def = ITEM_TYPES[nearestItem.key];
            hintText = `按 [E] 拾取 · ${def.label}${nearestItem.qty > 1 ? ' x' + nearestItem.qty : ''}`;
        } else {
            // 容器
            let nearestC = null, bcd = 999;
            for (const c of G.containers) {
                if (c.opened) continue;
                const d = dist(p, c);
                if (d < 70 && d < bcd) { bcd = d; nearestC = c; }
            }
            if (nearestC) hintText = `按 [E] 搜刮 · ${nearestC.label}`;
        }
    }
    G.interactHint.show = hintText !== '';
    G.interactHint.text = hintText;

    // ---- 任务更新 ----
    updateMission();
    // 探索任务：追踪玩家访问的区域
    if (G.mission && G.mission.id === 'explore' && !G.mission.completed) {
        const zoneX = Math.floor(p.x / (WORLD.w / 3));
        const zoneY = Math.floor(p.y / (WORLD.h / 3));
        const zoneKey = `${zoneX},${zoneY}`;
        if (!G.mission.zonesVisited.has(zoneKey)) {
            G.mission.zonesVisited.add(zoneKey);
            G.mission.visitedZones = G.mission.zonesVisited.size;
        }
    }

    // ---- HUD 更新 ----
    updateHUD();

    // 装弹进度显示（把武器栏 active 一下）
    // 更新武器 UI 的时机在 updateHUD 内部做
}

// -------------------- 渲染 --------------------
// ====================================================
//  撤离飞船动画（8 秒 4 阶段）
// ====================================================

const EXTRACT_ANIM_DUR = 8; // 总时长 8 秒

function startExtractAnim() {
    G.extractAnim = {
        active: true,
        t: 0,
        phase: 0,  // 0=启动 1=揭示 2=升空 3=转场
        playerX: G.player.x,
        playerY: G.player.y,
        // 预生成一些随机粒子（确定性）
        particles: Array.from({ length: 60 }, (_, i) => ({
            ox: (hash2d(i, 0, 42) - 0.5) * 600,
            oy: hash2d(i, 1, 42) * 400 + 100,
            size: 1 + hash2d(i, 2, 42) * 3,
            speed: 40 + hash2d(i, 3, 42) * 120,
            drift: (hash2d(i, 4, 42) - 0.5) * 30,
            alpha: 0.3 + hash2d(i, 5, 42) * 0.5
        })),
        // 舰体细节位置（确定性）
        details: Array.from({ length: 20 }, (_, i) => ({
            x: (hash2d(i, 10, 77) - 0.5) * 800,
            y: hash2d(i, 11, 77) * 200 + 50,
            w: 4 + hash2d(i, 12, 77) * 16,
            h: 3 + hash2d(i, 13, 77) * 8,
            type: hash2d(i, 14, 77) < 0.3 ? 'antenna' : (hash2d(i, 14, 77) < 0.6 ? 'container' : 'vent')
        })),
        // 甲板板块翻起角度
        plates: Array.from({ length: 12 }, (_, i) => ({
            x: (hash2d(i, 20, 88) - 0.5) * 500,
            y: hash2d(i, 21, 88) * 300 + 50,
            w: 20 + hash2d(i, 22, 88) * 40,
            h: 15 + hash2d(i, 23, 88) * 25,
            delay: hash2d(i, 24, 88) * 0.4
        }))
    };
    // 隐藏 HUD
    document.getElementById('interact-hint').classList.add('hidden');
    document.getElementById('objective').classList.add('hidden');
    Sound.extract();
}

function updateExtractAnim(dt) {
    const a = G.extractAnim;
    if (!a || !a.active) return;
    a.t += dt;
    // 阶段判定
    if (a.t < 1.5) a.phase = 0;
    else if (a.t < 4) a.phase = 1;
    else if (a.t < 6.5) a.phase = 2;
    else if (a.t < EXTRACT_ANIM_DUR) a.phase = 3;
    else {
        // 动画结束 → 结算
        a.active = false;
        endGame(true);
    }
}

function renderExtractAnim() {
    const a = G.extractAnim;
    if (!a) return;
    const t = a.t;
    const phase = a.phase;

    // === 通用：清屏 + 基础天空 ===
    ctx.fillStyle = '#0a0c0f';
    ctx.fillRect(0, 0, W, H);

    // 玩家位置（屏幕中心偏下）
    const pcx = W / 2;
    const pcy = H * 0.6;

    // 相机后拉量（随时间增大）
    const zoom = 1 - Math.min(t * 0.06, 0.45); // 从 1.0 缩到 0.55
    const riseOffset = phase >= 2 ? (t - 4) * 120 : (phase >= 1 ? (t - 1.5) * 15 : 0);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2 + riseOffset);

    // === Phase 0: 启动（0-1.5s）地面裂缝发光 + 震动 ===
    if (phase === 0) {
        const p = Math.min(t / 1.5, 1); // 0→1 进度
        // 画地面（复用预渲染）
        if (G.groundCanvas) {
            ctx.globalAlpha = 1;
            ctx.drawImage(G.groundCanvas, 0, 0);
        }
        // 裂缝发光（从玩家位置向外扩散）
        const crackRadius = p * 300;
        const crackAlpha = p * 0.6;
        const grad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, crackRadius);
        grad.addColorStop(0, `rgba(94,200,224,${crackAlpha})`);
        grad.addColorStop(0.5, `rgba(94,200,224,${crackAlpha * 0.3})`);
        grad.addColorStop(1, 'rgba(94,200,224,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        // 震动
        const shake = p * 12;
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        // 画玩家（静止）
        drawPlayer(G.player);
        // 裂缝线
        ctx.strokeStyle = `rgba(94,200,224,${crackAlpha})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + t * 0.5;
            const len = crackRadius * (0.6 + hash2d(i, 30, 55) * 0.4);
            ctx.beginPath();
            ctx.moveTo(pcx, pcy);
            ctx.lineTo(pcx + Math.cos(angle) * len, pcy + Math.sin(angle) * len);
            ctx.stroke();
        }
    }

    // === Phase 1: 揭示（1.5-4s）甲板板块翻起 + 舰体浮现 ===
    if (phase === 1) {
        const p = (t - 1.5) / 2.5; // 0→1
        // 暗化地面
        if (G.groundCanvas) {
            ctx.globalAlpha = 1 - p * 0.7;
            ctx.drawImage(G.groundCanvas, 0, 0);
            ctx.globalAlpha = 1;
        }
        // 甲板板块翻起（3D 透视模拟）
        for (const plate of a.plates) {
            const pp = Math.max(0, Math.min(1, (p - plate.delay) / 0.4));
            if (pp <= 0) continue;
            const angle = pp * Math.PI * 0.4; // 翻起角度
            const skewY = Math.sin(angle) * plate.h * 0.8;
            ctx.fillStyle = `rgba(42,47,58,${0.8 * pp})`;
            ctx.fillRect(plate.x + pcx - plate.w / 2, plate.y + pcy - plate.h / 2 - skewY, plate.w, plate.h);
            // 翻起面（亮面）
            ctx.fillStyle = `rgba(94,200,224,${0.15 * pp})`;
            ctx.fillRect(plate.x + pcx - plate.w / 2, plate.y + pcy - plate.h / 2 - skewY, plate.w, 2);
        }
        // 舰体从下方浮现
        const shipRise = p * 200;
        drawShipBody(pcx, pcy + 300 - shipRise, p);
        // 玩家
        drawPlayer(G.player);
        // 粒子（金属碎屑向上飘）
        for (const pt of a.particles) {
            if (pt.oy < 200) continue; // 只画近处的
            const py = pt.oy - p * pt.speed * 0.5;
            ctx.fillStyle = `rgba(180,200,220,${pt.alpha * p * 0.5})`;
            ctx.fillRect(pcx + pt.ox, pcy + py, pt.size, pt.size);
        }
    }

    // === Phase 2: 升空（4-6.5s）整舰上升 + 发动机喷流 ===
    if (phase === 2) {
        const p = (t - 4) / 2.5; // 0→1
        // 天空渐变（越升越高 → 暗蓝）
        const skyAlpha = p * 0.5;
        ctx.fillStyle = `rgba(10,15,30,${skyAlpha})`;
        ctx.fillRect(0, 0, W, H);
        // 舰体
        const shipY = pcy + 100 - p * 400;
        drawShipBody(pcx, shipY, 1);
        // 发动机喷流（舰体下方）
        drawEngineFlames(pcx, shipY + 180, p);
        // 甲板上的玩家（小）
        ctx.save();
        ctx.translate(pcx, shipY - 20);
        ctx.scale(0.8, 0.8);
        ctx.translate(-pcx, -shipY + 20);
        drawPlayer(G.player);
        ctx.restore();
        // 碎屑粒子向下掉落（相对运动）
        for (const pt of a.particles) {
            const py = pt.oy + p * pt.speed * 2;
            const px = pcx + pt.ox + pt.drift * p;
            ctx.fillStyle = `rgba(180,200,220,${pt.alpha * (1 - p * 0.5)})`;
            ctx.fillRect(px, py, pt.size, pt.size);
        }
        // 侧面的城市废墟轮廓（远景，快速下沉）
        drawDistantRuins(pcx, pcy + 200 + p * 500, p);
    }

    // === Phase 3: 转场（6.5-8s）白屏淡出 ===
    if (phase === 3) {
        const p = (t - 6.5) / 1.5; // 0→1
        // 残留的舰体（继续上升）
        const shipY = pcy - 300 - p * 600;
        ctx.globalAlpha = 1 - p;
        drawShipBody(pcx, shipY, 1);
        drawEngineFlames(pcx, shipY + 180, 1 - p);
        ctx.globalAlpha = 1;
        // 白蓝渐变覆盖
        const fadeGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
        fadeGrad.addColorStop(0, `rgba(200,220,240,${p * 0.9})`);
        fadeGrad.addColorStop(0.6, `rgba(100,140,180,${p * 0.7})`);
        fadeGrad.addColorStop(1, `rgba(20,30,50,${p * 0.5})`);
        ctx.fillStyle = fadeGrad;
        ctx.fillRect(0, 0, W, H);
        // 中央文字
        if (p > 0.3) {
            const textAlpha = Math.min(1, (p - 0.3) / 0.4);
            ctx.fillStyle = `rgba(94,200,224,${textAlpha})`;
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('EXFILTRATION COMPLETE', W / 2, H / 2 - 10);
            ctx.font = '14px monospace';
            ctx.fillStyle = `rgba(200,210,220,${textAlpha * 0.7})`;
            ctx.fillText('物资已安全入库', W / 2, H / 2 + 20);
            ctx.textAlign = 'left';
        }
    }

    ctx.restore();

    // 屏幕边缘光晕（所有阶段）
    if (phase <= 2) {
        const glowP = phase === 0 ? t / 1.5 : (phase === 1 ? 1 : Math.max(0, 1 - (t - 4) / 2.5));
        const edgeGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7);
        edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        edgeGrad.addColorStop(1, `rgba(10,12,15,${glowP * 0.4})`);
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, W, H);
    }
}

// 画舰体（重型货运舰）
function drawShipBody(cx, cy, reveal) {
    ctx.save();
    ctx.translate(cx, cy);
    const alpha = Math.min(1, reveal);
    ctx.globalAlpha = alpha;

    // === 主舰体（超宽扁平六边形） ===
    const shipW = 900, shipH = 180;
    // 舰体轮廓
    ctx.fillStyle = '#1a1e26';
    ctx.beginPath();
    ctx.moveTo(-shipW / 2, 0);
    ctx.lineTo(-shipW / 2 + 80, -shipH * 0.3);
    ctx.lineTo(-shipW / 4, -shipH * 0.5);
    ctx.lineTo(shipW / 4, -shipH * 0.5);
    ctx.lineTo(shipW / 2 - 80, -shipH * 0.3);
    ctx.lineTo(shipW / 2, 0);
    ctx.lineTo(shipW / 2 - 60, shipH * 0.4);
    ctx.lineTo(-shipW / 4, shipH * 0.5);
    ctx.lineTo(-shipW / 2 + 60, shipH * 0.4);
    ctx.closePath();
    ctx.fill();

    // 舰体高光（顶部边缘）
    ctx.strokeStyle = 'rgba(94,200,224,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-shipW / 2 + 80, -shipH * 0.3);
    ctx.lineTo(-shipW / 4, -shipH * 0.5);
    ctx.lineTo(shipW / 4, -shipH * 0.5);
    ctx.lineTo(shipW / 2 - 80, -shipH * 0.3);
    ctx.stroke();

    // 甲板纹理线
    ctx.strokeStyle = 'rgba(94,200,224,0.08)';
    ctx.lineWidth = 1;
    for (let x = -shipW / 2 + 40; x < shipW / 2 - 40; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, -shipH * 0.15);
        ctx.lineTo(x, shipH * 0.15);
        ctx.stroke();
    }

    // 青色缝灯（沿舰体边缘）
    const lampPulse = 0.5 + 0.5 * Math.sin(G.time * 3);
    ctx.strokeStyle = `rgba(94,200,224,${0.3 + lampPulse * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(-shipW / 2 + 100, -shipH * 0.28);
    ctx.lineTo(shipW / 2 - 100, -shipH * 0.28);
    ctx.stroke();
    ctx.setLineDash([]);

    // === 舰体细节 ===
    const a = G.extractAnim;
    if (a && a.details) {
        for (const d of a.details) {
            if (d.type === 'antenna') {
                // 天线
                ctx.strokeStyle = 'rgba(94,200,224,0.25)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(d.x, -shipH * 0.3);
                ctx.lineTo(d.x, -shipH * 0.3 - d.h * 3);
                ctx.stroke();
                // 顶部红灯
                ctx.fillStyle = `rgba(200,168,104,${0.4 + 0.3 * Math.sin(G.time * 2 + d.x)})`;
                ctx.fillRect(d.x - 1, -shipH * 0.3 - d.h * 3 - 2, 2, 2);
            } else if (d.type === 'container') {
                // 货柜
                ctx.fillStyle = '#252832';
                ctx.fillRect(d.x, -shipH * 0.1, d.w, d.h);
                ctx.strokeStyle = 'rgba(94,200,224,0.12)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(d.x, -shipH * 0.1, d.w, d.h);
            } else {
                // 排气口
                ctx.fillStyle = '#0a0c0f';
                ctx.fillRect(d.x, shipH * 0.1, d.w, d.h * 0.5);
                ctx.fillStyle = `rgba(216,164,92,${0.1 + 0.1 * Math.sin(G.time * 4 + d.x * 0.1)})`;
                ctx.fillRect(d.x + 1, shipH * 0.1, d.w - 2, 1);
            }
        }
    }

    // === 中央指挥塔 ===
    ctx.fillStyle = '#1e2228';
    ctx.fillRect(-30, -shipH * 0.5 - 40, 60, 40);
    ctx.fillStyle = '#252a32';
    ctx.fillRect(-25, -shipH * 0.5 - 38, 50, 36);
    // 塔顶窗
    ctx.fillStyle = `rgba(94,200,224,${0.3 + 0.2 * Math.sin(G.time * 2)})`;
    ctx.fillRect(-15, -shipH * 0.5 - 35, 30, 8);
    // 塔顶灯
    ctx.fillStyle = `rgba(200,168,104,${0.5 + 0.5 * Math.sin(G.time * 5)})`;
    ctx.fillRect(-2, -shipH * 0.5 - 42, 4, 3);

    ctx.globalAlpha = 1;
    ctx.restore();
}

// 发动机喷流
function drawEngineFlames(cx, topY, intensity) {
    if (intensity <= 0) return;
    ctx.save();
    ctx.translate(cx, topY);

    // 3 个发动机口
    const engines = [-200, 0, 200];
    for (const ex of engines) {
        const flameH = 60 + intensity * 100 + Math.sin(G.time * 15 + ex) * 15;
        const flameW = 20 + intensity * 10;

        // 外层（蓝白）
        const outerGrad = ctx.createLinearGradient(ex, 0, ex, flameH);
        outerGrad.addColorStop(0, `rgba(200,220,240,${intensity * 0.8})`);
        outerGrad.addColorStop(0.3, `rgba(94,200,224,${intensity * 0.5})`);
        outerGrad.addColorStop(1, 'rgba(94,200,224,0)');
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.moveTo(ex - flameW, 0);
        ctx.lineTo(ex - flameW * 0.3, flameH);
        ctx.lineTo(ex + flameW * 0.3, flameH);
        ctx.lineTo(ex + flameW, 0);
        ctx.closePath();
        ctx.fill();

        // 内层（暖橙）
        const innerH = flameH * 0.5;
        const innerGrad = ctx.createLinearGradient(ex, 0, ex, innerH);
        innerGrad.addColorStop(0, `rgba(255,220,160,${intensity * 0.9})`);
        innerGrad.addColorStop(0.5, `rgba(216,164,92,${intensity * 0.6})`);
        innerGrad.addColorStop(1, 'rgba(216,164,92,0)');
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.moveTo(ex - flameW * 0.5, 0);
        ctx.lineTo(ex, innerH);
        ctx.lineTo(ex + flameW * 0.5, 0);
        ctx.closePath();
        ctx.fill();

        // 发动机口（暗圆）
        ctx.fillStyle = '#0a0c0f';
        ctx.beginPath();
        ctx.ellipse(ex, 0, flameW * 0.8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(94,200,224,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // 喷流产生的光晕
    const glowGrad = ctx.createRadialGradient(0, 30, 0, 0, 30, 250);
    glowGrad.addColorStop(0, `rgba(216,164,92,${intensity * 0.15})`);
    glowGrad.addColorStop(0.5, `rgba(94,200,224,${intensity * 0.05})`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-300, 0, 600, 300);

    ctx.restore();
}

// 远景废墟轮廓（升空时快速下沉的城市天际线）
function drawDistantRuins(cx, cy, p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 0.3 - p * 0.3);
    ctx.fillStyle = '#1a1e26';
    // 简化的建筑轮廓
    const buildings = [
        { x: -500, w: 40, h: 120 }, { x: -440, w: 30, h: 80 },
        { x: -350, w: 50, h: 160 }, { x: -280, w: 25, h: 90 },
        { x: -180, w: 60, h: 200 }, { x: -100, w: 35, h: 110 },
        { x: 0, w: 45, h: 140 }, { x: 80, w: 55, h: 180 },
        { x: 160, w: 30, h: 100 }, { x: 220, w: 50, h: 150 },
        { x: 310, w: 40, h: 130 }, { x: 380, w: 60, h: 170 },
        { x: 460, w: 35, h: 90 }
    ];
    for (const b of buildings) {
        ctx.fillRect(cx + b.x, cy - b.h, b.w, b.h);
        // 窗户灯光
        ctx.fillStyle = `rgba(200,168,104,${0.15 + hash2d(b.x, 0, 33) * 0.15})`;
        for (let wy = cy - b.h + 8; wy < cy - 5; wy += 12) {
            for (let wx = cx + b.x + 4; wx < cx + b.x + b.w - 4; wx += 8) {
                if (hash2d(wx, wy, 44) > 0.4) {
                    ctx.fillRect(wx, wy, 3, 4);
                }
            }
        }
        ctx.fillStyle = '#1a1e26';
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

function render() {
    if (!G.player) {
        ctx.fillStyle = '#0a0c0f';
        ctx.fillRect(0, 0, W, H);
        return;
    }

    // === 撤离飞船动画：覆盖正常渲染 ===
    if (G.extractAnim && G.extractAnim.active) {
        renderExtractAnim();
        return;
    }

    // 相机抖动
    const shakeX = (Math.random() - 0.5) * G.camera.shake * 2;
    const shakeY = (Math.random() - 0.5) * G.camera.shake * 2;
    const camX = G.camera.x - W / 2 + shakeX;
    const camY = G.camera.y - H / 2 + shakeY;

    // 清屏
    ctx.fillStyle = '#0a0c0f';
    ctx.fillRect(0, 0, W, H);

    // 地面纹理（世界坐标系下）
    drawGround(camX, camY);

    // 世界坐标到屏幕的平移
    ctx.save();
    ctx.translate(-camX, -camY);

    // 世界边界
    ctx.strokeStyle = 'rgba(77, 217, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WORLD.w, WORLD.h);

    // 霓虹招牌
    for (const p of G.props) drawNeonSign(p);

    // 撤离点
    for (const z of G.extractZones) drawExtractZone(z);

    // 掩体（矩形建筑残骸）
    for (const c of G.covers) {
        if (c.hp > 0) drawCover(c);
    }

    // 弹孔贴片（在掩体上、地面上）
    drawBulletHoles();

    // 搜刮容器
    for (const c of G.containers) drawContainer(c);

    // 地上物品
    for (const it of G.groundItems) drawGroundItem(it);

    // 敌人
    for (const e of G.enemies) drawEnemy(e);

    // 玩家
    drawPlayer(G.player);

    // 子弹
    for (const b of G.bullets) drawBullet(b);

    // 枪口闪光
    if (G.muzzle) {
        G.muzzle.life -= 1 / 60;
        if (G.muzzle.life > 0) drawMuzzle(G.muzzle);
        else G.muzzle = null;
    }

    // 粒子
    for (const pt of G.particles) drawParticle(pt);

    // 燃烧区域
    drawFireZones();

    // 飞行中的手雷
    for (const g of G.grenades) drawGrenade(g);

    // 命中冲击特效（在粒子之上）
    drawImpactEffects();

    // 飘字伤害数字（最顶层）
    drawDamageNumbers();

    ctx.restore();

    // === 环境效果层 ===
    drawEnvironmentEffects();

    // 屏幕边缘暗角 + 扫描线通过 CSS 做

    // ---- 交互提示文本（屏幕中心下方） ----
    const hintEl = document.getElementById('interact-hint');
    if (G.looting) {
        // 搜刮中：显示进度百分比
        const l = G.looting;
        const pct = Math.min(100, (performance.now() - l.startAt) / l.duration * 100);
        hintEl.classList.remove('hidden');
        hintEl.textContent = `搜刮中… ${pct.toFixed(0)}%（保持不动）`;
    } else if (G.interactHint.show) {
        hintEl.classList.remove('hidden');
        hintEl.textContent = G.interactHint.text;
    } else {
        hintEl.classList.add('hidden');
    }

    // ---- 撤离目标提示 ----
    const objEl = document.getElementById('objective');
    if (G.objectiveShown && G.lootValue >= LOOT_GOAL) {
        objEl.classList.remove('hidden');
        let remaining = G.extractZones.find(z => z.active && z.elapsed > 0);
        if (remaining) {
            objEl.textContent = `正在撤离 … ${remaining.elapsed.toFixed(1)} 秒（离开圆圈会重置）`;
        } else {
            objEl.textContent = `撤离点已激活 — 走到任意闪烁的蓝色圈中停留 5 秒`;
        }
    } else {
        objEl.classList.add('hidden');
    }

    // 雷达
    drawRadar();
}

// -------------------- 环境效果 --------------------
function drawEnvironmentEffects() {
    const time = G.time;

    // 1. 全局光照变化（模拟时间流逝）
    // 游戏时间 0-180 秒，亮度从 1.0 降到 0.6
    const brightness = Math.max(0.55, 1.0 - (time / 180) * 0.45);
    if (brightness < 0.95) {
        ctx.fillStyle = `rgba(0, 0, 0, ${1.0 - brightness})`;
        ctx.fillRect(0, 0, W, H);
    }

    // 2. 环境雾气（底部聚集）
    const fogAlpha = 0.08 + 0.04 * Math.sin(time * 0.3);
    const fogGrad = ctx.createLinearGradient(0, H * 0.6, 0, H);
    fogGrad.addColorStop(0, 'rgba(94, 200, 224, 0)');
    fogGrad.addColorStop(0.5, `rgba(94, 200, 224, ${fogAlpha * 0.5})`);
    fogGrad.addColorStop(1, `rgba(94, 200, 224, ${fogAlpha})`);
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    // 3. 飘浮尘埃粒子（缓慢漂移）
    const dustCount = 40;
    for (let i = 0; i < dustCount; i++) {
        const dx = ((i * 137.5 + time * 8) % (W + 40)) - 20;
        const dy = ((i * 73.3 + time * 3) % (H + 40)) - 20;
        const size = 1 + (i % 3);
        const alpha = 0.1 + 0.1 * Math.sin(time * 0.5 + i);
        ctx.fillStyle = `rgba(200, 210, 220, ${alpha})`;
        ctx.fillRect(dx, dy, size, size);
    }

    // 4. 远处闪电（低概率）
    if (Math.random() < 0.003) {
        const lx = Math.random() * W;
        const ly = Math.random() * H * 0.3;
        ctx.strokeStyle = 'rgba(200, 220, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(lx + (Math.random() - 0.5) * 60, ly + 30 + i * 25);
        }
        ctx.stroke();
    }

    // 5. 辐射风暴警告（后期红色闪烁）
    if (time > 120) {
        const stormIntensity = Math.min(1, (time - 120) / 60);
        const flash = Math.sin(time * 8) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(180, 60, 60, ${stormIntensity * flash * 0.03})`;
        ctx.fillRect(0, 0, W, H);
    }
}

function drawGround(camX, camY) {
    // === 1. 预渲染地面（一次画到 offscreen canvas，运行时直接 drawImage） ===
    if (!G.groundCanvas) prerenderGround();
    ctx.drawImage(G.groundCanvas, camX, camY);

    // === 2. 玩家脚下的"光源"影响圈（动态跟随） ===
    const p = G.player;
    if (p) {
        const grd = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 220);
        grd.addColorStop(0, 'rgba(94,200,224,0.0)');
        grd.addColorStop(0.7, 'rgba(0,0,0,0.15)');
        grd.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
    }
}

function drawNeonSign(p) {
    // === 霓虹招牌（参考游戏的多层光效） ===
    const flicker = 0.85 + 0.15 * Math.sin(G.time * 5 + p.flicker * 20);
    // 有时坏掉（更暗）
    const broken = (Math.sin(G.time * 0.5 + p.flicker * 7) > 0.85) ? 0.3 : 1;
    const eff = flicker * broken;

    ctx.save();

    // 招牌背后的大光晕
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.w);
    grd.addColorStop(0, p.color === C.neonCyan ? `rgba(94,200,224,${0.15 * eff})` : `rgba(168,104,144,${0.15 * eff})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(p.x - p.w, p.y - p.w, p.w * 2, p.w * 2);

    // 招牌外壳（暗）
    ctx.fillStyle = 'rgba(10, 12, 15, 0.85)';
    ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);

    // 外框（霓虹）
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = eff;
    ctx.lineWidth = 2;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 22 * eff;
    ctx.strokeRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);

    // 内部横条（霓虹灯管）
    ctx.shadowBlur = 12 * eff;
    ctx.beginPath();
    ctx.moveTo(p.x - p.w / 2 + 6, p.y);
    ctx.lineTo(p.x + p.w / 2 - 6, p.y);
    ctx.stroke();
    // 第二条更暗的横线
    ctx.strokeStyle = p.color === C.neonCyan ? 'rgba(94,200,224,0.5)' : 'rgba(168,104,144,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - p.w / 2 + 6, p.y - 3);
    ctx.lineTo(p.x + p.w / 2 - 6, p.y - 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - p.w / 2 + 6, p.y + 3);
    ctx.lineTo(p.x + p.w / 2 - 6, p.y + 3);
    ctx.stroke();

    // 招牌底部的反光（地面霓虹倒影）
    ctx.globalAlpha = 0.2 * eff;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.w / 2 + 2, p.y + p.h / 2, p.w - 4, 4);
    ctx.fillRect(p.x - p.w / 2 + 6, p.y + p.h / 2 + 4, p.w - 12, 8);

    ctx.globalAlpha = 1;
    ctx.restore();
}

function drawCover(c) {
    // === 掩体：多层调色像素艺术 + 损坏状态 ===
    ctx.save();

    const hpRatio = c.hp / c.maxHp;
    const isDestroyed = c.hp <= 0;
    const isDamaged = hpRatio < 0.7;

    // 1. 大阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(c.x + 4, c.y + 6, c.w, c.h);

    // 2. 主体：垂直渐变（根据类型和损坏程度调整颜色）
    const baseColor = c.color || '#3c3d44';
    const grd = ctx.createLinearGradient(c.x, c.y, c.x, c.y + c.h);
    if (isDestroyed) {
        grd.addColorStop(0, '#1a1a1a');
        grd.addColorStop(1, '#0a0a0a');
    } else if (isDamaged) {
        // 损坏时颜色变暗、偏红
        grd.addColorStop(0, darkenColor(baseColor, 0.3));
        grd.addColorStop(0.5, darkenColor(baseColor, 0.4));
        grd.addColorStop(1, darkenColor(baseColor, 0.5));
    } else {
        grd.addColorStop(0, baseColor);
        grd.addColorStop(0.5, darkenColor(baseColor, 0.1));
        grd.addColorStop(1, darkenColor(baseColor, 0.3));
    }
    ctx.fillStyle = grd;
    ctx.fillRect(c.x, c.y, c.w, c.h);

    if (!isDestroyed) {
        // 3. 顶部高光
        ctx.fillStyle = `rgba(255,255,255,${isDamaged ? 0.08 : 0.18})`;
        ctx.fillRect(c.x, c.y, c.w, 1);
        ctx.fillStyle = `rgba(255,255,255,${isDamaged ? 0.04 : 0.08})`;
        ctx.fillRect(c.x, c.y + 1, c.w, 1);

        // 4. 砖块纹理
        for (let y = c.y + 4; y < c.y + c.h - 4; y += 12) {
            for (let x = c.x + 4; x < c.x + c.w - 4; x += 16) {
                const baseHash = hash2d(Math.floor((c.x + x) * 0.1), Math.floor((c.y + y) * 0.1), 99);
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                ctx.fillRect(x, y, 1, 1);
                ctx.fillRect(x + 1, y, 1, 1);
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(x + 14, y + 8, 2, 1);
                ctx.fillRect(x + 15, y + 9, 1, 1);
                if (baseHash < 0.3) {
                    ctx.fillStyle = 'rgba(0,0,0,0.15)';
                    ctx.fillRect(x + 3, y + 2, 1, 1);
                }
            }
        }

        // 5. 裂纹（根据损坏程度增加）
        const crackAlpha = isDamaged ? 0.6 : 0.3;
        ctx.strokeStyle = `rgba(0,0,0,${crackAlpha})`;
        ctx.lineWidth = isDamaged ? 1.5 : 1;
        // 基础裂纹
        for (let i = 0; i < (isDamaged ? 5 : 3); i++) {
            const cy = c.y + 8 + i * (c.h / (isDamaged ? 5 : 3));
            ctx.beginPath();
            ctx.moveTo(c.x + 5, cy);
            ctx.lineTo(c.x + 8, cy - 1);
            ctx.lineTo(c.x + 12, cy + 1);
            ctx.stroke();
        }
        // 垂直裂缝
        for (let i = 0; i < (isDamaged ? 4 : 2); i++) {
            const cx = c.x + (c.w * 0.2) + i * (c.w * 0.25);
            ctx.beginPath();
            ctx.moveTo(cx, c.y + 4);
            ctx.lineTo(cx + 1, c.y + 12);
            ctx.lineTo(cx - 1, c.y + 20);
            ctx.stroke();
        }
        // 严重损坏时的额外裂纹
        if (hpRatio < 0.4) {
            ctx.strokeStyle = 'rgba(180,60,60,0.5)';
            for (const crack of c.crackLines || []) {
                ctx.beginPath();
                ctx.moveTo(c.x + crack.x0 * c.w, c.y + crack.y0 * c.h);
                ctx.lineTo(c.x + crack.x1 * c.w, c.y + crack.y1 * c.h);
                ctx.stroke();
            }
        }

        // 6. 锈迹
        for (let i = 0; i < 5; i++) {
            const rx = c.x + hash2d(Math.floor(c.x), i, 7) * c.w;
            const ry = c.y + hash2d(Math.floor(c.y), i, 8) * c.h;
            const rA = 0.3 + hash2d(Math.floor(c.x + c.y), i, 9) * 0.3;
            ctx.fillStyle = `rgba(138,90,59,${rA})`;
            ctx.fillRect(rx, ry, 2, 1);
            ctx.fillRect(rx + 1, ry + 1, 1, 1);
        }

        // 7. 霓虹反光
        const neonGlint = 0.3 + 0.2 * Math.sin(G.time * 2);
        ctx.fillStyle = `rgba(94,200,224,${neonGlint})`;
        ctx.fillRect(c.x + 1, c.y + 1, 1, 1);
        ctx.fillRect(c.x + c.w - 2, c.y + c.h - 2, 1, 1);

        // 8. 边框
        ctx.strokeStyle = `rgba(94,200,224,${isDamaged ? 0.08 : 0.15})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);

        // 9. 可翻越提示（低矮掩体）
        if (c.height === 'low' && dist(G.player, c) < 100) {
            ctx.fillStyle = 'rgba(94,200,224,0.4)';
            ctx.fillRect(c.x + c.w / 2 - 4, c.y - 3, 8, 2);
            ctx.fillStyle = 'rgba(94,200,224,0.6)';
            ctx.fillRect(c.x + c.w / 2 - 2, c.y - 5, 4, 2);
        }
    }

    ctx.restore();
}

// 颜色暗化辅助函数
function darkenColor(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.max(0, Math.floor(r * (1 - amount)));
    const ng = Math.max(0, Math.floor(g * (1 - amount)));
    const nb = Math.max(0, Math.floor(b * (1 - amount)));
    return `rgb(${nr},${ng},${nb})`;
}

function drawContainer(c) {
    ctx.save();

    // 大阴影
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(c.x - c.w / 2 + 4, c.y - c.h / 2 + 6, c.w, c.h);

    // 主体
    const grd = ctx.createLinearGradient(c.x - c.w / 2, c.y - c.h / 2, c.x - c.w / 2, c.y + c.h / 2);
    if (c.opened) {
        grd.addColorStop(0, '#2a241f');
        grd.addColorStop(1, '#181410');
    } else {
        grd.addColorStop(0, c.color);
        grd.addColorStop(0.5, c.color);
        grd.addColorStop(1, '#1c1815');
    }
    ctx.fillStyle = grd;
    ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);

    // 顶部高光
    if (!c.opened) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, 1);
    }

    // 表面木板/金属纹理（横线 + 螺丝点）
    for (let y = c.y - c.h / 2 + 4; y < c.y + c.h / 2 - 4; y += 6) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(c.x - c.w / 2 + 1, y, c.w - 2, 1);
    }
    // 螺丝点（4 角）
    const sX = c.x - c.w / 2 + 4, sY = c.y - c.h / 2 + 4;
    px(sX, sY, 2, 2, '#1a1612');
    px(c.x + c.w / 2 - 6, sY, 2, 2, '#1a1612');
    px(sX, c.y + c.h / 2 - 6, 2, 2, '#1a1612');
    px(c.x + c.w / 2 - 6, c.y + c.h / 2 - 6, 2, 2, '#1a1612');

    // 十字绑带
    if (!c.opened) {
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x - c.w / 2, c.y);
        ctx.lineTo(c.x + c.w / 2, c.y);
        ctx.moveTo(c.x, c.y - c.h / 2);
        ctx.lineTo(c.x, c.y + c.h / 2);
        ctx.stroke();
        // 绑带扣
        px(c.x - 1, c.y - 1, 3, 3, '#5a4a3a');
    }

    // 标签（小贴纸）
    if (!c.opened) {
        const tagW = 14, tagH = 5;
        const tx = c.x - tagW / 2;
        const ty = c.y + c.h / 4;
        ctx.fillStyle = 'rgba(245,235,210,0.85)';
        ctx.fillRect(tx, ty, tagW, tagH);
        // 标签上的横线（条码/字）
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(tx + 2, ty + 1, 1, 3);
        ctx.fillRect(tx + 4, ty + 1, 1, 3);
        ctx.fillRect(tx + 7, ty + 1, 2, 3);
        ctx.fillRect(tx + 10, ty + 1, 1, 3);
        // 标签轻微折角
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(tx + tagW - 2, ty, 2, 1);
    }

    // 未开启时的发光提示（雾化琥珀，不再刺眼）
    if (!c.opened) {
        const pulse = 0.5 + 0.3 * Math.sin(G.time * 2.5);
        ctx.shadowColor = C.amber;
        ctx.shadowBlur = 12 * pulse;
        ctx.strokeStyle = `rgba(216,164,92,${0.4 + 0.3 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);

        // 箭头提示（向下）
        ctx.shadowBlur = 0;
        const ay = c.y - c.h / 2 - 12 + Math.sin(G.time * 4) * 2;
        ctx.fillStyle = `rgba(216,164,92,${0.5 + 0.25 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(c.x, ay);
        ctx.lineTo(c.x - 4, ay - 6);
        ctx.lineTo(c.x + 4, ay - 6);
        ctx.closePath();
        ctx.fill();
    } else {
        // 已开 — 暗
        ctx.strokeStyle = 'rgba(80,60,50,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    }

    // === 搜刮进度条（正在搜刮此容器）
    if (G.looting && G.looting.container === c) {
        const pct = Math.min(1, (performance.now() - G.looting.startAt) / G.looting.duration);
        const barW = c.w * 1.2;
        const barH = 4;
        const bx = c.x - barW / 2;
        const by = c.y - c.h / 2 - 18;
        // 底
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
        // 进度（琥珀色渐变）
        const progGrad = ctx.createLinearGradient(bx, by, bx + barW, by);
        progGrad.addColorStop(0, 'rgba(180,130,70,0.5)');
        progGrad.addColorStop(1, 'rgba(216,164,92,1)');
        ctx.fillStyle = progGrad;
        ctx.fillRect(bx, by, barW * pct, barH);
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(bx, by, barW * pct, 1);
    }

    ctx.restore();
}

function drawGroundItem(it) {
    const def = ITEM_TYPES[it.key];
    if (!def) return;
    it.bob += 0.04;
    const bob = Math.sin(it.bob) * 2;

    ctx.save();

    // 地面光晕（物品有"刚刚掉落"的发光感）
    const glowSize = it.r * 1.8;
    const grd = ctx.createRadialGradient(it.x, it.y + bob, 0, it.x, it.y + bob, glowSize);
    const hexToRgba = (hex, a) => {
        const m = hex.replace('#', '');
        const r = parseInt(m.substring(0, 2), 16);
        const g = parseInt(m.substring(2, 4), 16);
        const b = parseInt(m.substring(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
    };
    grd.addColorStop(0, hexToRgba(def.color, 0.4));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(it.x - glowSize, it.y + bob - glowSize, glowSize * 2, glowSize * 2);

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(it.x, it.y + 8, it.r * 0.8, it.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // === 按类型绘制精致物品 ===
    if (def.kind === 'weapon') {
        // 武器 — 像素画小枪
        const a = it.bob;
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        ctx.rotate(Math.sin(a) * 0.3);
        // 枪柄
        px(-4, -1.5, 3, 3, '#3a2a20');
        px(-3, -1.5, 1, 3, '#5a4030');
        // 枪身
        px(-1, -1, 6, 2, '#1a1a1a');
        px(-1, -1, 6, 1, '#5a6a7a');
        // 枪管
        px(5, -0.5, 2, 1, '#0a0a0a');
        // 扳机
        px(0, 1, 1, 1, '#1a1a1a');
        // 高光
        px(1, -0.5, 1, 0.5, '#c0d0e0');
        ctx.restore();
    } else if (def.kind === 'armor') {
        // 护甲 — 像素小背心
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        ctx.rotate(Math.sin(it.bob) * 0.2);
        // 主体
        px(-4, -3, 8, 6, '#6a7888');
        px(-4, -3, 8, 1, '#9aa8b8');
        // 中央拉链
        px(-0.5, -2, 1, 5, '#3a4858');
        // 边
        px(-4, 2, 8, 1, '#3a4858');
        // 钢片高光
        px(-3, -2, 1, 4, '#c0d0e0');
        px(2, -2, 1, 4, '#c0d0e0');
        ctx.restore();
    } else if (def.kind === 'ammo') {
        // 弹药 — 像素小弹盒
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        px(-3, -2, 6, 4, '#1a1612');
        px(-3, -2, 6, 1, '#4a3a2a');
        // 弹头横线
        px(-2, -1, 5, 1, '#5a4a30');
        px(-2, 0, 5, 1, '#3a2a20');
        // 高光
        px(-2, -2, 4, 0.5, def.color);
        ctx.restore();
    } else if (def.kind === 'consumable') {
        // 食物/医疗 — 像素小盒
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        const baseColor = def.color;
        px(-3, -2, 6, 4, baseColor);
        px(-3, -2, 6, 1, 'rgba(255,255,255,0.3)');
        // 十字（医疗）
        if (it.key === 'med') {
            px(-0.5, -1.5, 1, 3, '#ffffff');
            px(-1.5, -0.5, 3, 1, '#ffffff');
        } else {
            // 食物 — 标签
            px(-2, -0.5, 4, 1, '#5a3a1a');
        }
        ctx.restore();
    } else {
        // 战利品（电路板 / 稀有 / 电池）
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        // 主体
        px(-3, -3, 6, 6, def.color);
        px(-3, -3, 6, 1, 'rgba(255,255,255,0.3)');
        // 中央小图案
        if (it.key === 'chip') {
            // 电路板 — 网格
            px(-2, -2, 1, 1, '#ffffff');
            px(1, -2, 1, 1, '#ffffff');
            px(-2, 1, 1, 1, '#ffffff');
            px(1, 1, 1, 1, '#ffffff');
            px(-0.5, -0.5, 1, 1, '#ffffff');
        } else if (it.key === 'battery') {
            // 电池 — 闪电符号
            px(-0.5, -2, 1, 2, '#ffffff');
            px(-1, 0, 2, 1, '#ffffff');
        } else if (it.key === 'rare') {
            // 稀有 — 钻石
            px(-2, -2, 4, 1, '#ffffff');
            px(-1, -1, 2, 1, '#ffffff');
            px(0, 0, 1, 1, '#ffffff');
        }
        ctx.restore();
    }

    // 数量
    if (it.qty > 1) {
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(it.x - 8, it.y + bob + it.r - 1, 16, 10);
        ctx.fillStyle = '#e8eef2';
        ctx.fillText('x' + it.qty, it.x, it.y + bob + it.r + 7);
        ctx.textAlign = 'left';
    }

    // 稀有物品的持续光环
    if (it.key === 'rare' || it.key === 'w_rifle' || it.key === 'armor_t2') {
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(it.bob * 2);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(it.x, it.y + bob, it.r + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

function drawEnemy(e) {
    if (e.state === 'dead') {
        // 尸体：分裂的残骸
        ctx.save();
        ctx.globalAlpha = 0.5;
        // 血迹
        ctx.fillStyle = '#3a1a18';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 4, e.r * 1.5, e.r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // 残骸
        ctx.fillStyle = '#2a2020';
        px(e.x - 6, e.y - 2, 5, 4, '#2a2020');
        px(e.x + 2, e.y - 4, 6, 5, '#3a3030');
        px(e.x - 2, e.y + 2, 4, 3, '#1a1815');
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = e.color;
        px(e.x - 2, e.y - 2, 3, 2, e.color);
        ctx.restore();
        return;
    }

    // === 隐行者隐身效果 ===
    if (e.stealth && e.stealthTimer > 0) {
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(G.time * 4);
        drawEnemySprite(e);
        ctx.restore();
        // 隐身时的轮廓虚影
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#5a3a8a';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
    }

    drawEnemySprite(e);
}

// 敌人精灵绘制 - 拆分出来便于处理隐身
function drawEnemySprite(e) {
    ctx.save();

    // === 1. 敌人脚下阴影 ===
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.7, e.r * 0.9, e.r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // === 2. 根据敌人类型上色 ===
    let palette;
    if (e.type === 'mutant') {
        // 变异者 — 病态棕红（融入背景，不抢眼）
        palette = {
            body: '#5a3a2a', bodyLight: '#7a5040', bodyDark: '#3a2418',
            belly: '#4a2a1a', skin: '#6a4a3a', skinLight: '#8a6a5a',
            cloth: '#2a2018', clothLight: '#3a3028',
            eyes: '#c89868', claw: '#1a1010', clawLight: '#3a2a28',
            band: '#a86890'
        };
    } else if (e.type === 'bandit') {
        // 武装掠夺者 — 黄褐色 + 破布
        palette = {
            body: '#5a4a2a', bodyLight: '#7a6a4a', bodyDark: '#2a2014',
            belly: '#4a3a1a', skin: '#8a7a60', skinLight: '#a89880',
            cloth: '#3a2a1a', clothLight: '#5a4a30',
            eyes: '#c8a868', claw: '#1a1410', clawLight: '#3a342a',
            band: '#5ec8e0'
        };
    } else if (e.type === 'elite') {
        // 突袭者精英 — 深紫红（雾化）
        palette = {
            body: '#3a2a3a', bodyLight: '#5a4060', bodyDark: '#1a1020',
            belly: '#2a1a2a', skin: '#5a3a4a', skinLight: '#7a5a70',
            cloth: '#1a1018', clothLight: '#2a2030',
            eyes: '#c8a868', claw: '#1a0a14', clawLight: '#3a2a38',
            band: '#a86890'
        };
    } else if (e.type === 'shadow') {
        // 隐行者 — 暗紫黑（带紫色高光）
        palette = {
            body: '#1a1020', bodyLight: '#2a1830', bodyDark: '#0a0814',
            belly: '#180c20', skin: '#241830', skinLight: '#3a2848',
            cloth: '#0c0810', clothLight: '#1a1424',
            eyes: '#a868e0', claw: '#08040c', clawLight: '#2a1428',
            band: '#7a48a8'
        };
    } else if (e.type === 'bomber') {
        // 爆裂者 — 锈红橙（金属感）
        palette = {
            body: '#5a2818', bodyLight: '#7a3a28', bodyDark: '#3a1810',
            belly: '#4a2010', skin: '#7a4028', skinLight: '#9a6040',
            cloth: '#2a1408', clothLight: '#4a2410',
            eyes: '#ffaa44', claw: '#1a0a04', clawLight: '#3a1a10',
            band: '#ff8844'
        };
    } else if (e.type === 'armored') {
        // 装甲兵 — 金属蓝灰（重型）
        palette = {
            body: '#3a3a48', bodyLight: '#5a5a68', bodyDark: '#1a1a28',
            belly: '#2a2a38', skin: '#4a4a5a', skinLight: '#6a6a7a',
            cloth: '#1a1a28', clothLight: '#2a2a3a',
            eyes: '#5ec8e0', claw: '#0a0a14', clawLight: '#2a2a38',
            band: '#88a8c8'
        };
    }

    // 受击变白
    if (e.hitFlash > 0) {
        palette.body = '#ffffff';
        palette.bodyLight = '#f0f0f0';
    }

    // === 3. 动画帧 ===
    const speed = Math.hypot(e.x - (e.lastX || e.x), e.y - (e.lastY || e.y));
    e.lastX = e.x; e.lastY = e.y;
    const moving = speed > 0.2;
    const frame = moving ? Math.floor((G.time * 6 + (e.id || 0))) % 4 : 0;
    const legOff = moving ? (frame === 1 ? -1.2 : (frame === 3 ? 1.2 : 0)) : 0;
    const bob = moving ? Math.sin(G.time * 8 + (e.id || 0)) * 0.8 : 0;
    e.id = e.id || Math.random() * 100;

    // 像素艺术敌人画在 (e.x - 9, e.y - 11)，18×22 大小
    const ox = Math.floor(e.x - 9);
    const oy = Math.floor(e.y - 11 + bob);

    // === 4. 身体绘制（按类型） ===
    if (e.type === 'mutant') {
        // 变异者 — 不规则身体 + 触须 + 爪子
        // 后背阴影
        px(ox + 2, oy + 5, 14, 14, palette.bodyDark);
        // 主体
        px(ox + 3, oy + 5, 12, 12, palette.body);
        px(ox + 3, oy + 5, 12, 1, palette.bodyLight);
        // 肚子（暗）
        px(ox + 5, oy + 10, 8, 5, palette.belly);
        // 病变斑纹
        const lesion1 = (Math.sin(G.time * 2 + e.id) + 1) * 0.5;
        if (lesion1 > 0.6) {
            px(ox + 6, oy + 7, 2, 2, '#3a8a3a');
            px(ox + 11, oy + 13, 2, 1, '#3a8a3a');
        }
        // 触须（身后）
        for (let i = 0; i < 3; i++) {
            const tx = ox + 7 + i * 2;
            const ty = oy - 2 - i + Math.sin(G.time * 3 + i) * 1;
            px(tx, ty, 1, 3, palette.bodyDark);
        }
        // 头（不规则）
        px(ox + 4, oy - 1, 10, 7, palette.body);
        px(ox + 4, oy - 1, 10, 1, palette.bodyLight);
        // 嘴（大口）
        px(ox + 5, oy + 3, 8, 3, '#1a0a08');
        // 牙齿
        for (let i = 0; i < 3; i++) {
            px(ox + 5 + i * 3, oy + 3, 1, 2, '#d0c0a0');
        }
        // 眼睛（暖琥珀光，不再闪红）
        const eyeGlow = 0.5 + 0.3 * Math.sin(G.time * 2 + e.id);
        ctx.fillStyle = `rgba(200,168,104,${eyeGlow})`;
        ctx.fillRect(ox + 6, oy + 1, 2, 2);
        ctx.fillRect(ox + 10, oy + 1, 2, 2);
        // 爪子（前伸，按 e.angle 方向）
        const a = e.angle;
        for (let i = 0; i < 2; i++) {
            const ca = a + (i === 0 ? -0.4 : 0.4);
            const px2 = e.x + Math.cos(ca) * (e.r + 4);
            const py2 = e.y + Math.sin(ca) * (e.r + 4);
            ctx.strokeStyle = palette.claw;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(e.x + Math.cos(ca) * 4, e.y + Math.sin(ca) * 4);
            ctx.lineTo(px2, py2);
            ctx.stroke();
            // 爪尖
            ctx.strokeStyle = palette.clawLight;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px2, py2);
            ctx.lineTo(px2 + Math.cos(ca - 0.3) * 4, py2 + Math.sin(ca - 0.3) * 4);
            ctx.stroke();
        }
    } else {
        // bandit / elite — 人类体型 + 武器
        // 后背
        px(ox + 3, oy + 6, 12, 12, palette.cloth);
        // 斗篷/夹克
        px(ox + 3, oy + 6, 12, 1, palette.clothLight);
        // 身体
        px(ox + 4, oy + 7, 10, 8, palette.body);
        // 腰带
        px(ox + 4, oy + 13, 10, 1, palette.band === '#a86890' ? '#a86890' : '#5ec8e0');
        // 腿部
        px(ox + 5 + legOff, oy + 15, 3, 5, palette.cloth);
        px(ox + 10 - legOff, oy + 15, 3, 5, palette.cloth);
        // 鞋
        px(ox + 5 + legOff, oy + 19, 3, 2, '#0a0a0a');
        px(ox + 10 - legOff, oy + 19, 3, 2, '#0a0a0a');
        // 头
        px(ox + 5, oy - 1, 8, 7, palette.skin);
        px(ox + 5, oy - 1, 8, 1, palette.skinLight);
        // 头套/头盔（暗色顶）
        if (e.type === 'elite') {
            // 突袭者：带头盔
            px(ox + 4, oy - 2, 10, 5, palette.bodyDark);
            // 雾紫红面罩（不再亮品红）
            px(ox + 5, oy + 1, 8, 2, '#7a5070');
            // 护目镜（暖琥珀）
            px(ox + 6, oy + 1, 2, 2, '#c8a868');
            px(ox + 10, oy + 1, 2, 2, '#c8a868');
        } else {
            // 掠夺者：蒙面
            // 头发
            px(ox + 4, oy - 2, 10, 3, '#1a0e08');
            // 眼带
            px(ox + 5, oy + 1, 8, 1, '#0a0606');
            // 眼睛（暖琥珀，不再闪红）
            const eyeGlow = 0.4 + 0.3 * Math.sin(G.time * 2 + e.id);
            ctx.fillStyle = `rgba(200,168,104,${eyeGlow})`;
            ctx.fillRect(ox + 6, oy + 1, 2, 1);
            ctx.fillRect(ox + 10, oy + 1, 2, 1);
        }
        // 武器（按 e.angle 方向）
        const a = e.angle;
        const aox = e.x + Math.cos(a) * (e.r + 1);
        const aoy = e.y + Math.sin(a) * (e.r + 1);
        ctx.save();
        ctx.translate(aox, aoy);
        ctx.rotate(a);
        if (e.ranged) {
            // 步枪
            px(-2, -1, 9, 2, '#1a1a1a');
            px(-2, -1, 9, 1, '#5a6a7a');
            px(4, -0.5, 1, 1, '#c0d0e0');
        } else {
            // 大刀
            px(-2, -1, 4, 2, '#3a2a20');
            px(2, -0.8, 7, 1.6, '#d8e0e8');
        }
        ctx.restore();
    }

    // === 5. 状态指示 ===
    if (e.state === 'chase') {
        // 头顶警觉感叹号（暖琥珀，不再刺眼亮红）
        const alertGlow = 0.5 + 0.3 * Math.sin(G.time * 3);
        const alertColor = `rgba(200,168,104,${alertGlow + 0.3})`;
        px(ox + 8, oy - 8, 2, 4, alertColor);
        px(ox + 8, oy - 3, 2, 1, alertColor);
    }

    // === 6. HP 条 ===
    if (e.hp < e.maxHp) {
        const bw = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 14, bw, 2);
        // HP 颜色按 type 变（统一雾化，不再刺眼）
        const hpColor = e.type === 'elite' ? '#7a5070' : (e.type === 'bandit' ? '#c8a868' : '#b85a6e');
        ctx.fillStyle = hpColor;
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 14, bw * (e.hp / e.maxHp), 2);
        // HP 条边缘白色高光
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 14, bw, 1);
    }

    // === 7. 名字 + 类型标签（近距离时显示） ===
    if (dist(e, G.player) < 250) {
        const label = e.name;
        ctx.font = 'bold 9px monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - tw / 2 - 3, e.y - e.r - 25, tw + 6, 10);
        ctx.fillStyle = e.type === 'elite' ? '#c898b0' : (e.type === 'bandit' ? '#c8a868' : '#b89080');
        ctx.textAlign = 'center';
        ctx.fillText(label, e.x, e.y - e.r - 17);
        ctx.textAlign = 'left';
    }

    // === 7.5. 特殊敌人效果 ===
    if (e.type === 'shadow') {
        // 隐行者紫色虚影光环
        const glowAlpha = 0.2 + 0.15 * Math.sin(G.time * 5);
        ctx.strokeStyle = `rgba(168,104,224,${glowAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2);
        ctx.stroke();
    } else if (e.type === 'bomber') {
        // 爆裂者橙色危险光环
        const glowAlpha = 0.3 + 0.2 * Math.sin(G.time * 4);
        ctx.strokeStyle = `rgba(255,136,68,${glowAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
        ctx.stroke();
    } else if (e.type === 'armored') {
        // 装甲兵金属边缘高光
        ctx.strokeStyle = 'rgba(200,200,220,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    // === 8. 掩体中标识 ===
    if (e.inCover) {
        ctx.strokeStyle = 'rgba(94,200,224,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

function drawPlayer(p) {
    ctx.save();

    // === 角色脚下的光圈（角色移动时的灯光口） ===
    const lightGrd = ctx.createRadialGradient(p.x, p.y + 4, 0, p.x, p.y + 4, 110);
    lightGrd.addColorStop(0, 'rgba(94,200,224,0.18)');
    lightGrd.addColorStop(0.5, 'rgba(94,200,224,0.06)');
    lightGrd.addColorStop(1, 'rgba(94,200,224,0)');
    ctx.fillStyle = lightGrd;
    ctx.fillRect(p.x - 110, p.y - 106, 220, 220);

    // === 计算动画帧 ===
    const speed = Math.hypot(p.vx || 0, p.vy || 0);
    const moving = speed > 20;
    const frame = moving ? Math.floor((G.time * 8)) % 4 : 0;  // 4 帧走动
    const bob = moving ? Math.sin(G.time * 12) * 1.2 : Math.sin(G.time * 1.8) * 0.6;  // 上下浮动
    const legOff = moving ? (frame === 1 ? -1.5 : (frame === 3 ? 1.5 : 0)) : 0;  // 走路时腿交替
    const armSwing = moving ? (frame === 1 ? 2 : (frame === 3 ? -2 : 0)) : 0;  // 走路时手臂摆动

    // 像素艺术角色画在 (p.x - 11, p.y - 14) 位置，22×28 大小
    const ox = Math.floor(p.x - 11);
    const oy = Math.floor(p.y - 14 + bob);

    // === 1. 角色阴影 ===
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 13, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // === 2. 身体分层（背 → 头） ===
    // 斗篷（背）
    const c = {
        cloak: '#1a2530', cloakLight: '#2a3a4a', cloakEdge: '#5ec8e0',
        suit: '#2c3a4a', suitLight: '#3a4a5a',
        skin: '#c8a888', skinLight: '#e0c8a8',
        hair: '#2a1a18', hairLight: '#4a2a28',
        vest: '#1a2028', vestLight: '#2a3540',
        gun: '#0a0a0a', gunLight: '#5a6a7a',
        shoes: '#0a0a0a'
    };

    // 2.1 斗篷下摆（后）
    px(ox + 3, oy + 19, 16, 8, c.cloak);
    // 斗篷高光边
    px(ox + 3, oy + 19, 1, 8, c.cloakLight);
    px(ox + 18, oy + 19, 1, 8, c.cloakLight);
    // 斗篷上的霓虹细线（cyber 感）
    const cloakGlow = 0.5 + 0.5 * Math.sin(G.time * 2);
    ctx.fillStyle = `rgba(94,200,224,${0.4 * cloakGlow})`;
    ctx.fillRect(ox + 3, oy + 25, 16, 1);

    // 2.2 腿
    px(ox + 6 + legOff, oy + 23, 4, 5, c.suit);
    px(ox + 12 - legOff, oy + 23, 4, 5, c.suit);
    px(ox + 6 + legOff, oy + 23, 1, 5, c.suitLight);
    px(ox + 12 - legOff, oy + 23, 1, 5, c.suitLight);
    // 鞋
    px(ox + 6 + legOff, oy + 27, 4, 2, c.shoes);
    px(ox + 12 - legOff, oy + 27, 4, 2, c.shoes);

    // 2.3 身体（战术背心）
    px(ox + 5, oy + 12, 12, 12, c.vest);
    px(ox + 5, oy + 12, 12, 1, c.vestLight);
    px(ox + 5, oy + 23, 12, 1, c.vestLight);
    // 背心中间的扣具
    px(ox + 10, oy + 14, 2, 2, '#5ec8e0');
    px(ox + 10, oy + 18, 2, 1, '#7a8a9a');

    // 2.4 手臂（按武器状态不同形态）
    const w = p.weapons[p.currentWeapon];
    if (w && !w.melee) {
        // 持枪手：前伸
        // 持枪臂（沿 p.angle 方向）
        const a = p.angle;
        const gx = p.x + Math.cos(a) * 11;
        const gy = p.y + Math.sin(a) * 11;
        // 手臂阴影
        ctx.strokeStyle = c.vest;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        // 手臂高光
        ctx.strokeStyle = c.vestLight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        // 持枪手（圆）
        ctx.fillStyle = c.skin;
        ctx.beginPath();
        ctx.arc(gx, gy, 2.2, 0, Math.PI * 2);
        ctx.fill();
        // 枪
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(a);
        px(-2, -1.2, 7, 2.4, c.gun);
        px(2, -1.2, 2, 2.4, c.gunLight);
        // 枪口高光（白色横线）
        px(4, -0.5, 1, 1, '#c8d8e8');
        ctx.restore();
        // 另一只手（在身体另一侧）
        const ox2 = p.x + Math.cos(a + Math.PI) * 4;
        const oy2 = p.y + Math.sin(a + Math.PI) * 4;
        const ox3 = p.x + Math.cos(a + Math.PI) * 9;
        const oy3 = p.y + Math.sin(a + Math.PI) * 9;
        ctx.strokeStyle = c.vest;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ox2, oy2);
        ctx.lineTo(ox3, oy3);
        ctx.stroke();
    } else if (w && w.melee) {
        // 持刀：前挥
        const a = p.angle;
        const wx = p.x + Math.cos(a) * 11;
        const wy = p.y + Math.sin(a) * 11;
        // 刀
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(a);
        // 刀柄
        px(-2, -1, 4, 2, '#3a2a20');
        // 刀刃
        px(2, -0.8, 7, 1.6, '#d8e0e8');
        px(2, -0.8, 7, 1, '#ffffff');
        ctx.restore();
        // 持刀手
        ctx.fillStyle = c.skin;
        ctx.beginPath();
        ctx.arc(wx, wy, 2.2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // 普通：手自然下垂（按走路动画摆动）
        px(ox + 2, oy + 14 - armSwing, 3, 8, c.vest);
        px(ox + 17, oy + 14 + armSwing, 3, 8, c.vest);
        px(ox + 2, oy + 20 - armSwing, 3, 2, c.skin);
        px(ox + 17, oy + 20 + armSwing, 3, 2, c.skin);
    }

    // 2.5 头
    px(ox + 7, oy + 3, 8, 9, c.skin);
    px(ox + 7, oy + 3, 8, 1, c.skinLight);
    // 头发
    px(ox + 6, oy + 1, 10, 5, c.hair);
    px(ox + 7, oy + 0, 8, 2, c.hair);
    px(ox + 5, oy + 3, 2, 3, c.hair);
    px(ox + 15, oy + 3, 2, 3, c.hair);
    px(ox + 7, oy + 0, 1, 1, c.hairLight);

    // 眼睛 — 按朝向变化
    const eyeY = oy + 6;
    const eyeX1 = ox + 9;
    const eyeX2 = ox + 12;
    if (Math.abs(Math.cos(p.angle)) > Math.abs(Math.sin(p.angle))) {
        // 看左右
        const dir = Math.cos(p.angle) > 0 ? 1 : -1;
        px(eyeX1 + dir, eyeY, 1, 2, '#1a1a1a');
        px(eyeX2 + dir, eyeY, 1, 2, '#1a1a1a');
        // 眼高光
        px(eyeX1 + dir, eyeY, 1, 1, '#5ec8e0');
    } else {
        // 看上或看下
        const dir = Math.sin(p.angle) > 0 ? 1 : 0;
        px(eyeX1, eyeY + dir, 1, 1, '#1a1a1a');
        px(eyeX2, eyeY + dir, 1, 1, '#1a1a1a');
    }

    // 2.6 头顶战术护目镜（特色元素）
    const visorGlow = 0.6 + 0.4 * Math.sin(G.time * 3);
    ctx.fillStyle = `rgba(94,200,224,${0.3 * visorGlow})`;
    ctx.fillRect(ox + 7, oy + 5, 8, 1);
    px(ox + 7, oy + 4, 8, 1, '#0a1a28');
    px(ox + 8, oy + 5, 6, 1, `rgba(94,200,224,${0.5 * visorGlow})`);

    // 2.7 斗篷随时间摆动
    const cloakWave = Math.sin(G.time * 1.2) * 1;
    if (cloakWave > 0) {
        px(ox + 1, oy + 20, 2, 4, c.cloak);
        px(ox + 19, oy + 19, 2, 4, c.cloak);
    } else {
        px(ox + 1, oy + 21, 2, 4, c.cloak);
        px(ox + 19, oy + 20, 2, 4, c.cloak);
    }

    // === 3. 护甲指示（胸前的金属反光） ===
    if (p.armor) {
        const ap = 0.4 + 0.2 * Math.sin(G.time * 2);
        ctx.fillStyle = `rgba(180,200,220,${ap})`;
        ctx.fillRect(ox + 6, oy + 13, 2, 10);
        ctx.fillRect(ox + 14, oy + 13, 2, 10);
        // 护甲边缘
        ctx.strokeStyle = `rgba(220,230,240,${ap + 0.2})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + 5, oy + 12, 12, 12);
    }

    // === 4. 受伤时的雾粉红覆层 ===
    if (G.time - p.damagedAt < 0.3) {
        ctx.fillStyle = 'rgba(184,90,110,0.35)';
        ctx.fillRect(ox, oy, 22, 30);
    }

    // === 5. 装弹进度环 ===
    if (p.reloading) {
        const frac = Math.min(1, (performance.now() - p.lastReload) / (w ? w.reloadTime : 1200));
        ctx.strokeStyle = '#d8a45c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 10, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
    }

    // === 6. 掩体中提示 ===
    if (p.inCover) {
        ctx.strokeStyle = 'rgba(94,200,224,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

function drawBullet(b) {
    ctx.save();

    // === 1. 子弹的灯光口（飞行中照亮周围地面） ===
    const lightR = b.owner === 'player' ? 32 : 18;
    const lgrd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, lightR);
    lgrd.addColorStop(0, b.color === C.white ? 'rgba(255,240,180,0.45)' : (b.color + '66'));
    lgrd.addColorStop(0.5, b.color === C.white ? 'rgba(255,240,180,0.2)' : (b.color + '22'));
    lgrd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lgrd;
    ctx.fillRect(b.x - lightR, b.y - lightR, lightR * 2, lightR * 2);

    // === 2. 拖尾（保存过去 8 帧位置，多层渲染） ===
    if (!b.trail) b.trail = [];
    b.trail.push({ x: b.x, y: b.y, age: 0 });
    if (b.trail.length > 10) b.trail.shift();

    const speed = Math.hypot(b.vx, b.vy);
    // 根据速度决定拖尾拉伸效果
    const stretch = Math.min(2.5, 1 + speed / 1200);
    const isPlayer = b.owner === 'player';
    const baseColor = b.color === C.white ? '255,240,180' : null;
    const trailColor = b.color === C.white ? '#fff0b4' : b.color;

    // 2a. 外层：宽柔光拖尾
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 3; pass++) {
        const thickness = (isPlayer ? [4, 2.4, 1.2] : [2.5, 1.5, 0.8])[pass];
        const alphaMul = (isPlayer ? [0.18, 0.45, 0.95] : [0.12, 0.3, 0.7])[pass];
        for (let i = 0; i < b.trail.length - 1; i++) {
            const p1 = b.trail[i];
            const p2 = b.trail[i + 1];
            const t = i / b.trail.length;
            const alpha = t * alphaMul;
            ctx.strokeStyle = baseColor ?
                `rgba(${baseColor},${alpha})` :
                b.color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = thickness * t * stretch;
            // 拉伸：向后退方向延伸
            const dx = (p2.x - p1.x);
            const dy = (p2.y - p1.y);
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;
            const extLen = (isPlayer ? 14 : 8) * t;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x - ux * extLen * 0.3, p2.y - uy * extLen * 0.3);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;

    // === 3. 弹头（核心亮白点 + 强光晕） ===
    // 3a. 外光晕
    const glowR = isPlayer ? 4.5 : 3;
    const ggrd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, glowR);
    ggrd.addColorStop(0, isPlayer ? 'rgba(255,255,255,0.95)' : 'rgba(255,200,140,0.85)');
    ggrd.addColorStop(0.5, isPlayer ? 'rgba(255,240,200,0.5)' : 'rgba(200,160,80,0.4)');
    ggrd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ggrd;
    ctx.beginPath();
    ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 3b. 核心亮白点
    ctx.fillStyle = isPlayer ? '#ffffff' : '#fff0c0';
    ctx.shadowColor = trailColor;
    ctx.shadowBlur = isPlayer ? 14 : 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, isPlayer ? 1.8 : 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawMuzzle(m) {
    ctx.save();
    // === 1. 大范围灯光口 ===
    const grd = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.size * 4);
    grd.addColorStop(0, `rgba(255,220,150,${m.life * 6})`);
    grd.addColorStop(0.4, `rgba(255,150,80,${m.life * 2})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(m.x - m.size * 4, m.y - m.size * 4, m.size * 8, m.size * 8);

    // === 2. 核心闪白 ===
    ctx.globalAlpha = m.life * 14;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffa750';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
    ctx.fill();

    // === 3. 边缘的火花（横向 3-5 条短射线） ===
    ctx.shadowBlur = 0;
    ctx.globalAlpha = m.life * 8;
    ctx.strokeStyle = '#ffe080';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
        const ang = m.angle + (i - 2) * 0.15 + (Math.random() - 0.5) * 0.2;
        const len = m.size * (1 + Math.random() * 1.5);
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + Math.cos(ang) * len, m.y + Math.sin(ang) * len);
        ctx.stroke();
    }
    ctx.restore();
}

function drawParticle(p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawExtractZone(z) {
    ctx.save();
    const pulse = 0.6 + 0.4 * Math.sin(G.time * 2.5);
    if (z.active) {
        // === 1. 外圈光晕 ===
        const grd = ctx.createRadialGradient(z.x, z.y, z.r * 0.3, z.x, z.y, z.r * 1.4);
        grd.addColorStop(0, `rgba(94,200,224,${0.25 + 0.15 * pulse})`);
        grd.addColorStop(1, 'rgba(94,200,224,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(z.x - z.r * 1.4, z.y - z.r * 1.4, z.r * 2.8, z.r * 2.8);

        // === 2. 内部填充 ===
        ctx.fillStyle = `rgba(94,200,224,${0.12 + 0.06 * pulse})`;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fill();

        // === 3. 主圈（霓虹蓝） ===
        ctx.strokeStyle = C.neonCyan;
        ctx.shadowColor = C.neonCyan;
        ctx.shadowBlur = 28 * pulse;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.stroke();

        // === 4. 内部虚线圆（科技感） ===
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // === 5. 旋转的方位标（4 个刻度） ===
        ctx.shadowBlur = 0;
        for (let i = 0; i < 4; i++) {
            const a = (G.time * 0.5 + i * Math.PI / 2) % (Math.PI * 2);
            const tx1 = z.x + Math.cos(a) * (z.r * 0.85);
            const ty1 = z.y + Math.sin(a) * (z.r * 0.85);
            const tx2 = z.x + Math.cos(a) * (z.r * 0.95);
            const ty2 = z.y + Math.sin(a) * (z.r * 0.95);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tx1, ty1);
            ctx.lineTo(tx2, ty2);
            ctx.stroke();
        }

        // === 6. 中心 "EXTRACT" 标识 ===
        ctx.fillStyle = '#c8e8ff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = C.neonCyan;
        ctx.shadowBlur = 10;
        ctx.fillText('▣ EXTRACT', z.x, z.y - z.r - 12);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(200,232,255,0.6)';
        ctx.font = '9px monospace';
        ctx.fillText('撤离点', z.x, z.y - z.r - 2);

        // === 7. 撤离进度条 ===
        if (z.elapsed > 0) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.r + 8, -Math.PI / 2, -Math.PI / 2 + (z.elapsed / 5) * Math.PI * 2);
            ctx.stroke();
            // 进度环光晕
            ctx.strokeStyle = C.neonCyan;
            ctx.lineWidth = 2;
            ctx.shadowColor = C.neonCyan;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.r + 8, -Math.PI / 2, -Math.PI / 2 + (z.elapsed / 5) * Math.PI * 2);
            ctx.stroke();
        }
        ctx.textAlign = 'left';
    } else {
        // 未激活：浅蓝虚线圈，根据当前 lootValue 进度显示提示
        const progress = Math.min(1, G.lootValue / LOOT_GOAL);
        const nearActive = progress >= 0.7;
        const zPulse = nearActive ? 0.6 + 0.4 * Math.sin(G.time * 3) : 0.5 + 0.3 * Math.sin(G.time * 1.5);

        // 外圈淡光晕（nearActive 时加强）
        const grd = ctx.createRadialGradient(z.x, z.y, z.r * 0.5, z.x, z.y, z.r * 1.3);
        grd.addColorStop(0, `rgba(94,200,224,${0.08 + (nearActive ? 0.12 : 0.04) * zPulse})`);
        grd.addColorStop(1, 'rgba(94,200,224,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(z.x - z.r * 1.3, z.y - z.r * 1.3, z.r * 2.6, z.r * 2.6);

        // 主圈（淡青色虚线）
        ctx.strokeStyle = `rgba(94,200,224,${0.4 + 0.3 * zPulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 内部进度环（按当前物资价值）
        if (progress > 0) {
            ctx.strokeStyle = `rgba(216,164,92,${0.4 + 0.3 * zPulse})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.r * 0.7, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            ctx.stroke();
        }

        // 中心标识（根据物资价值显示不同文字）
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(200,232,255,0.8)';
        ctx.font = 'bold 10px monospace';
        if (G.lootValue === 0) {
            ctx.fillText('撤离点 · 开始搜刮', z.x, z.y - z.r - 8);
        } else {
            ctx.fillText(`撤离点 · ${G.lootValue}/${LOOT_GOAL}`, z.x, z.y - z.r - 8);
        }
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(216,164,92,0.7)';
        ctx.fillText(`还需 ${Math.max(0, LOOT_GOAL - G.lootValue)}`, z.x, z.y - z.r + 2);
        ctx.textAlign = 'left';
    }
    ctx.restore();
}

function drawRadar() {
    const r = radarCtx;
    r.clearRect(0, 0, 180, 180);
    r.save();
    r.translate(10, 10);
    const size = 160;
    r.fillStyle = 'rgba(10, 16, 22, 0.85)';
    r.fillRect(0, 0, size, size);
    r.strokeStyle = 'rgba(94,200,224,0.25)';
    r.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
        r.beginPath();
        r.arc(size / 2, size / 2, (size / 2) * i / 3, 0, Math.PI * 2);
        r.stroke();
    }
    r.beginPath();
    r.moveTo(size / 2, 0); r.lineTo(size / 2, size);
    r.moveTo(0, size / 2); r.lineTo(size, size / 2);
    r.stroke();

    const scaleX = size / WORLD.w;
    const scaleY = size / WORLD.h;
    const pcx = G.player.x * scaleX;
    const pcy = G.player.y * scaleY;

    for (const c of G.containers) {
        if (c.opened) continue;
        r.fillStyle = C.amber;
        r.fillRect(c.x * scaleX - 1.5, c.y * scaleY - 1.5, 3, 3);
    }
    for (const z of G.extractZones) {
        r.fillStyle = z.active ? C.neonCyan : 'rgba(94,200,224,0.3)';
        r.beginPath();
        r.arc(z.x * scaleX, z.y * scaleY, 3, 0, Math.PI * 2);
        r.fill();
    }
    for (const e of G.enemies) {
        if (e.state === 'dead') continue;
        const d = dist(e, G.player);
        if (d < 800) {
            r.fillStyle = e.state === 'chase' ? C.danger : '#c898a8';
            r.beginPath();
            r.arc(e.x * scaleX, e.y * scaleY, 2.5, 0, Math.PI * 2);
            r.fill();
        }
    }
    r.fillStyle = C.neonCyan;
    r.beginPath();
    r.arc(pcx, pcy, 4, 0, Math.PI * 2);
    r.fill();
    r.strokeStyle = '#e8f6ff';
    r.lineWidth = 1.5;
    r.beginPath();
    r.moveTo(pcx, pcy);
    r.lineTo(pcx + Math.cos(G.player.angle) * 10, pcy + Math.sin(G.player.angle) * 10);
    r.stroke();

    r.strokeStyle = 'rgba(94,200,224,0.15)';
    r.lineWidth = 1;
    r.strokeRect(0, 0, size, size);

    const scan = (G.time * 0.8) % (Math.PI * 2);
    const grd2 = r.createLinearGradient(
        pcx, pcy,
        pcx + Math.cos(scan) * 80,
        pcy + Math.sin(scan) * 80
    );
    grd2.addColorStop(0, 'rgba(94,200,224,0.3)');
    grd2.addColorStop(1, 'rgba(94,200,224,0)');
    r.fillStyle = grd2;
    r.beginPath();
    r.moveTo(pcx, pcy);
    r.arc(pcx, pcy, 80, scan - 0.25, scan);
    r.closePath();
    r.fill();
    r.restore();
}

function updateHUD() {
    const p = G.player;
    document.getElementById('hp-fill').style.width = ((p.hp / p.maxHp) * 100) + '%';
    document.getElementById('stm-fill').style.width = ((p.stamina / p.maxStamina) * 100) + '%';
    const lootText = `已搜刮: ${G.lootValue} 点 · 负重 ${p.weight.toFixed(1)}/${p.maxWeight}kg`;
    document.getElementById('loot-text').textContent = lootText;
    const radText = `辐射: ${Math.min(100, Math.floor((G.time / 180) * 100))}%`;
    document.getElementById('rad-text').textContent = radText;
    document.getElementById('cover-text').textContent = p.inCover ? '掩体中' : '暴露';

    for (let i = 0; i < 2; i++) {
        const slotEl = document.getElementById('weapon-slot-' + (i + 1));
        const w = p.weapons[i];
        if (!w) {
            slotEl.querySelector('.slot-name').textContent = '空';
            slotEl.querySelector('.slot-name').classList.add('empty');
            slotEl.querySelector('.slot-ammo').textContent = '-';
            slotEl.querySelector('.slot-ammo').classList.add('empty');
        } else {
            slotEl.querySelector('.slot-name').textContent = w.melee ? '战术刀' : w.name;
            slotEl.querySelector('.slot-name').classList.remove('empty');
            slotEl.querySelector('.slot-ammo').textContent =
                w.melee ? '∞' : `${w.mag}/${p.inventory[w.ammoType] || 0}`;
            slotEl.querySelector('.slot-ammo').classList.remove('empty');
        }
        slotEl.classList.toggle('active', i === p.currentWeapon);
    }
    const armorEl = document.getElementById('armor-slot');
    if (p.armor) {
        const def = ITEM_TYPES[p.armor.type];
        armorEl.querySelector('.slot-name').textContent = def.label;
        armorEl.querySelector('.slot-name').classList.remove('empty');
        armorEl.querySelector('.slot-ammo').textContent = `-${Math.round(p.armor.reduction * 100)}%`;
        armorEl.querySelector('.slot-ammo').classList.remove('empty');
    } else {
        armorEl.querySelector('.slot-name').textContent = '无护甲';
        armorEl.querySelector('.slot-name').classList.add('empty');
        armorEl.querySelector('.slot-ammo').textContent = '-';
        armorEl.querySelector('.slot-ammo').classList.add('empty');
    }

    document.getElementById('count-9mm').textContent = p.inventory['9mm'] || 0;
    document.getElementById('count-rifle').textContent = p.inventory.rifle || 0;
    document.getElementById('count-shotgun').textContent = p.inventory.shotgun || 0;
    document.getElementById('count-med').textContent = p.inventory.med || 0;
    document.getElementById('count-food').textContent = p.inventory.food || 0;
    document.getElementById('count-chip').textContent = p.inventory.chip || 0;
    document.getElementById('count-rare').textContent = p.inventory.rare || 0;

    // === 手雷槽位显示 ===
    const order = ['frag', 'molotov', 'emp', 'flash'];
    const selType = order[G.selectedGrenade] || 'frag';
    const selDef = GRENADE_TYPES[selType];
    const selCount = p.inventory['grenade_' + selType] || 0;
    const grenNameEl = document.getElementById('grenade-slot-name');
    const grenAmmoEl = document.getElementById('grenade-slot-ammo');
    const grenChargeEl = document.getElementById('grenade-charge');
    const grenSlotEl = document.getElementById('weapon-slot-grenade');
    if (grenNameEl) grenNameEl.textContent = selDef.name;
    if (grenAmmoEl) {
        grenAmmoEl.textContent = '× ' + selCount;
        grenAmmoEl.style.color = selCount > 0 ? selDef.color : '#666';
    }
    if (grenSlotEl) {
        grenSlotEl.style.borderColor = selCount > 0 ? selDef.color : 'rgba(77, 217, 255, 0.2)';
    }
    if (grenChargeEl) {
        const charge = Math.min(1, G.grenadeHoldTime || 0);
        grenChargeEl.style.width = (charge * 100) + '%';
        grenChargeEl.style.background = selDef.color;
    }

    // 任务显示
    const missionEl = document.getElementById('mission-text');
    if (missionEl && G.mission) {
        const m = G.mission;
        let progress = '';
        if (m.id === 'explore') progress = ` (${m.visitedZones || 0}/3)`;
        else if (m.id === 'headhunter') progress = ` (${m.eliteKilled || 0}/2)`;
        else if (m.id === 'loot_value') progress = ` (${G.lootValue}/300)`;
        missionEl.textContent = m.completed ? `✓ ${m.name}` : `◆ ${m.name}${progress}`;
        missionEl.style.color = m.completed ? '#8aff9d' : '#d8a45c';
    }
}

function endGame(success) {
    if (G.ended) return;
    G.ended = true;
    G.inventoryOpen = false;
    document.getElementById('inventory-overlay').classList.add('hidden');
    // 停止背景音乐
    Music.stop();
    // === 成就系统：记录本局统计 ===
    ACHIEVEMENT_STATE.totalRuns += 1;
    ACHIEVEMENT_STATE.lastRunRare = G.player.inventory.rare || 0;
    ACHIEVEMENT_STATE.lastRunMaxWeight = G.player.weight || 0;
    ACHIEVEMENT_STATE.lastRunNoDamage = G.player.hp >= G.player.maxHp - 0.5;
    ACHIEVEMENT_STATE.lastExtractTime = Math.floor(G.time);
    ACHIEVEMENT_STATE.lastExtractLoot = G.lootValue;
    // 杀光所有敌人？
    const alive = G.enemies.filter(e => e.state !== 'dead').length;
    ACHIEVEMENT_STATE.lastRunAllKills = (alive === 0 && G.enemies.length > 0);
    if (success) {
        recordAchievementEvent('extract');
        ACHIEVEMENT_STATE.bestLootRun = Math.max(ACHIEVEMENT_STATE.bestLootRun, G.lootValue);
    } else {
        recordAchievementEvent('death');
    }
    saveAchievements();
    checkAchievements();

    const titleEl = document.getElementById('end-title');
    const subtitleEl = document.getElementById('end-subtitle');
    const statsEl = document.getElementById('end-stats');
    if (success) {
        titleEl.textContent = '撤离成功';
        subtitleEl.textContent = 'EXFILTRATION COMPLETE';
        titleEl.style.color = '#5ec8e0';
        titleEl.style.textShadow = '0 0 18px rgba(94,200,224,0.5)';
        G.inventoryContext = 'endsuccess';
        // === 把本局物品搬入仓库 ===
        depositRaidToStash();
    } else {
        titleEl.textContent = '任务失败';
        subtitleEl.textContent = 'AGENT DOWN · 物资已遗失';
        titleEl.style.color = '#b85a6e';
        titleEl.style.textShadow = '0 0 18px rgba(184,90,110,0.5)';
        G.inventoryContext = 'endfail';
    }

    const timeMin = Math.floor(G.time / 60);
    const timeSec = Math.floor(G.time % 60);
    const bonus = success ? Math.max(0, 300 - Math.floor(G.time) * 3) : 0;
    const total = G.lootValue + bonus;
    const kills = G.enemies.filter(e => e.state === 'dead').length;
    G.lastExtractedValue = success ? G.lootValue : 0;

    // 经验计算和保存
    const xpGained = kills * 15 + (success ? 50 : 10) + Math.floor(G.lootValue / 10);
    addXp(xpGained);
    PLAYER_PROGRESS.totalKills += kills;
    if (success) PLAYER_PROGRESS.totalExtractions++;
    saveProgress();

    statsEl.innerHTML = `
        <div class="stat-line"><span class="label">任务时长</span><span class="value">${timeMin}分${timeSec}秒</span></div>
        <div class="stat-line"><span class="label">搜刮物资</span><span class="value">${G.lootValue} 点</span></div>
        <div class="stat-line"><span class="label">击杀</span><span class="value">${kills}</span></div>
        <div class="stat-line"><span class="label">速度奖励</span><span class="value">+${bonus}</span></div>
        <div class="stat-line"><span class="label">获得经验</span><span class="value">+${xpGained} XP</span></div>
        <div class="stat-line"><span class="label">角色等级</span><span class="value">Lv.${PLAYER_PROGRESS.level}</span></div>
        <div class="stat-line total"><span class="label">最终得分</span><span class="value cyan">${total}</span></div>
    `;
    // 结算界面里嵌入"角色 + 装备"轻量预览
    injectEndMiniPanel(success);
    // 同步开始界面的"仓库/装备"预览
    refreshStartMiniPanel();
    document.getElementById('end-overlay').classList.remove('hidden');
}

// 把本局背包 + 装备里的物品搬入 STASH
function depositRaidToStash() {
    if (!G.player) return;
    const p = G.player;
    // 1. 本局背包里的物品
    for (const k of Object.keys(p.inventory)) {
        const qty = p.inventory[k] || 0;
        if (qty > 0) {
            pushStash({ key: k, qty, def: ITEM_TYPES[k] });
            delete p.inventory[k];
        }
    }
    // 2. 装备里的非消耗品
    const slots = ['head', 'body', 'primary', 'secondary', 'melee', 'backpack'];
    for (const slot of slots) {
        const e = p.equipment[slot];
        if (!e) continue;
        const def = ITEM_TYPES[e.key];
        if (def && (def.kind === 'weapon' || def.kind === 'armor')) {
            pushStash({ key: e.key, qty: 1, def });
        }
        p.equipment[slot] = null;
    }
    // 重置玩家为起始状态（保留仓库）
    p.weapons = [createWeapon('pistol')];
    p.currentWeapon = 0;
    p.armor = null;
    p.weight = 0;
    // === 撤离成功后保存仓库持久化到 localStorage
    saveStash();
}

function pushStash(item) {
    const def = item.def;
    if (!def) return;
    // 合并同类（弹药/消耗品）
    if (def.kind === 'ammo' || def.kind === 'consumable' || def.kind === 'loot') {
        const existing = STASH.items.find(s => s.key === item.key);
        if (existing) {
            existing.qty += item.qty;
            return;
        }
    }
    if (STASH.items.length >= STASH.capacity) return;  // 仓库满
    STASH.items.push({
        key: item.key,
        qty: item.qty,
        label: def.label,
        color: def.color,
        weight: def.weight,
        value: def.value,
        kind: def.kind,
        weaponKey: def.weaponKey,
        reduction: def.reduction
    });
}

// 结算页：注入"角色 + 装备 + 仓库"小面板
function injectEndMiniPanel(success) {
    const box = document.querySelector('#end-overlay .menu-box');
    if (!box) return;
    // 移除旧的小面板（如果存在）
    const old = box.querySelector('.inv-mini');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.className = 'inv-mini';
    const p = G.player || createPlayer();
    const armorStr = p.armor ? `${Math.round(p.armor.reduction * 100)}%` : '无';
    const w0 = p.weapons[0] ? p.weapons[0].name : '—';
    const w1 = p.weapons[1] ? p.weapons[1].name : '—';
    const ctxText = success
        ? '撤离成功 · 物资已入库'
        : '任务失败 · 物资已遗失';
    wrap.innerHTML = `
        <canvas id="end-mini-canvas" width="180" height="240"></canvas>
        <div>
            <div class="inv-mini-stat"><b>${ctxText}</b></div>
            <div class="inv-mini-stat">生命 <b>${p.hp}/${p.maxHp}</b></div>
            <div class="inv-mini-stat">护甲 <b>${armorStr}</b></div>
            <div class="inv-mini-stat">负重 <b>${p.weight.toFixed(1)}/${p.maxWeight.toFixed(1)}</b> kg</div>
            <div class="inv-mini-stat">主武器 <b>${w0}</b> · 副武器 <b>${w1}</b></div>
            <div class="inv-mini-stat">仓库 <b class="amber">${STASH.items.length}</b> / ${STASH.capacity} 项</div>
            <div class="inv-mini-stat">总价值 <b class="amber">${STASH.items.reduce((s, x) => s + x.value * x.qty, 0)}</b> 点</div>
        </div>
    `;
    // 插到 stats 前面
    const stats = box.querySelector('#end-stats');
    if (stats) box.insertBefore(wrap, stats);
    else box.appendChild(wrap);
    // 画小人物
    drawMiniCharacter(wrap.querySelector('canvas'), p);
}

// 仓库 → 拿回玩家（用在：开始界面 / 结算之后 / 战局中点"装备"时）
function withdrawFromStash(stashIdx, qty = 1) {
    if (G.inventoryContext === 'raid') return;  // 战局中不能从仓库拿（兜底）
    const it = STASH.items[stashIdx];
    if (!it) return;
    const def = ITEM_TYPES[it.key];
    if (!def) return;
    // 弹药/消耗品：直接加到 inventory
    if (def.kind === 'ammo' || def.kind === 'consumable' || def.kind === 'loot') {
        G.player.inventory[it.key] = (G.player.inventory[it.key] || 0) + it.qty;
        STASH.items.splice(stashIdx, 1);
    } else {
        // 武器/护甲：直接装备（占一个空槽）
        const slot = def.kind === 'weapon' ? 'primary' : 'body';
        // 已在装备上的先卸下
        if (G.player.equipment[slot]) {
            const old = G.player.equipment[slot];
            pushStash({ key: old.key, qty: 1, def: ITEM_TYPES[old.key] });
        }
        G.player.equipment[slot] = { key: it.key };
        STASH.items.splice(stashIdx, 1);
        if (def.kind === 'weapon') {
            // 装填主武器槽（替换）
            const newW = createWeapon(def.weaponKey);
            if (G.player.weapons.length >= 2) {
                G.player.weapons[0] = newW;
            } else {
                G.player.weapons[0] = newW;
            }
            G.player.currentWeapon = 0;
        } else if (def.kind === 'armor') {
            G.player.armor = { type: it.key, reduction: def.reduction, value: def.value };
        }
    }
    recomputeWeight();
    saveStash();
}

// 玩家本局背包 → 仓库（仅在 endsuccess / base 上下文允许）
function depositBagToStash(itemKey, qty) {
    if (G.inventoryContext === 'raid' || G.inventoryContext === 'endfail') return false;
    if ((G.player.inventory[itemKey] || 0) < qty) return false;
    const def = ITEM_TYPES[itemKey];
    if (!def) return false;
    G.player.inventory[itemKey] -= qty;
    if (G.player.inventory[itemKey] === 0) delete G.player.inventory[itemKey];
    pushStash({ key: itemKey, qty, def });
    recomputeWeight();
    saveStash();
    return true;
}

// 卸下装备 → 回到本局背包
function unequipToBag(slot) {
    const p = G.player;
    const e = p.equipment[slot];
    if (!e) return;
    const def = ITEM_TYPES[e.key];
    if (!def) return;
    // 武器/护甲：放回本局背包
    p.inventory[e.key] = (p.inventory[e.key] || 0) + 1;
    p.equipment[slot] = null;
    // 同步 weapons / armor
    if (slot === 'body') p.armor = null;
    if (slot === 'primary' || slot === 'secondary') {
        // 把对应武器槽设为 knife
        const idx = slot === 'primary' ? 0 : 1;
        if (!p.weapons[idx] || p.weapons[idx].key !== 'knife') {
            p.weapons[idx] = createWeapon('pistol');
        }
        p.currentWeapon = 0;
    }
    recomputeWeight();
}

// 从本局背包装备到槽
function equipFromBag(itemKey, slot) {
    if ((G.player.inventory[itemKey] || 0) <= 0) return false;
    const def = ITEM_TYPES[itemKey];
    if (!def) return false;
    // 槽位匹配检查
    const slotMap = {
        head: ['armor'],  // 头盔（v1：把护甲类放头/身均可）
        body: ['armor'],
        primary: ['weapon'],
        secondary: ['weapon'],
        melee: ['weapon'],
        backpack: ['loot', 'consumable', 'ammo']  // 简化：背包 = 任意
    };
    if (!slotMap[slot].includes(def.kind)) return false;
    // 已占用：先卸下旧的
    if (G.player.equipment[slot]) {
        const old = G.player.equipment[slot];
        G.player.inventory[old.key] = (G.player.inventory[old.key] || 0) + 1;
    }
    G.player.inventory[itemKey] -= 1;
    if (G.player.inventory[itemKey] === 0) delete G.player.inventory[itemKey];
    G.player.equipment[slot] = { key: itemKey };
    // 同步武器/护甲运行时数据
    if (def.kind === 'weapon') {
        const newW = createWeapon(def.weaponKey);
        const idx = slot === 'primary' ? 0 : (slot === 'secondary' ? 1 : 0);
        G.player.weapons[idx] = newW;
        G.player.currentWeapon = idx;
    } else if (def.kind === 'armor' && slot === 'body') {
        G.player.armor = { type: itemKey, reduction: def.reduction, value: def.value };
    }
    recomputeWeight();
    return true;
}

// 重新计算负重
function recomputeWeight() {
    const p = G.player;
    let w = 0;
    for (const k of Object.keys(p.inventory)) {
        const def = ITEM_TYPES[k];
        if (def) w += def.weight * (p.inventory[k] || 0);
    }
    for (const slot of Object.keys(p.equipment)) {
        const e = p.equipment[slot];
        if (e) {
            const def = ITEM_TYPES[e.key];
            if (def) w += def.weight;
        }
    }
    p.weight = w;
}

// 开始界面的角色 + 仓库轻量预览
function refreshStartMiniPanel() {
    const stashCount = document.getElementById('start-stash-count');
    const stashVal = document.getElementById('start-stash-value');
    const levelEl = document.getElementById('start-player-level');
    const xpEl = document.getElementById('start-player-xp');
    if (stashCount) stashCount.textContent = STASH.items.length;
    if (stashVal) stashVal.textContent = STASH.items.reduce((s, x) => s + x.value * x.qty, 0);
    if (levelEl) levelEl.textContent = PLAYER_PROGRESS.level;
    if (xpEl) xpEl.textContent = `${PLAYER_PROGRESS.xp}/${PLAYER_PROGRESS.xpToNext}`;
    // 画人物 — 从 STASH 推断当前装备
    const canvas = document.getElementById('start-mini-canvas');
    if (canvas) {
        // 临时构造一个 player-like 对象用于绘制
        const fake = {
            armor: null,
            weapons: [createWeapon('pistol')]
        };
        // 找仓库里的护甲
        for (const it of STASH.items) {
            const def = ITEM_TYPES[it.key];
            if (def && def.kind === 'armor' && !fake.armor) {
                fake.armor = { type: it.key, reduction: def.reduction };
            }
            // 找武器
            if (def && def.kind === 'weapon' && fake.weapons[0].key === 'pistol') {
                fake.weapons[0] = createWeapon(def.weaponKey);
            }
        }
        drawMiniCharacter(canvas, fake);
    }
}

function startGame() {
    document.getElementById('menu-overlay').classList.add('hidden');
    document.getElementById('end-overlay').classList.add('hidden');
    document.getElementById('inventory-overlay').classList.add('hidden');
    loadProgress();
    loadStash();
    loadAchievements();
    initWorld();
    Sound.init();
    Sound.resume();
    // === 启动自适应背景音乐 ===
    Music.init();
    Music.start();
    G.running = true;
    G.ended = false;
    G.inventoryContext = 'raid';
    G.startedAt = performance.now();
    G.time = 0;
    lastTime = performance.now();
    // === 重置本局统计 ===
    ACHIEVEMENT_STATE.lastRunNoDamage = true;  // 默认假设无伤，未被攻击时保持
    ACHIEVEMENT_STATE.lastRunAllKills = false;
    ACHIEVEMENT_STATE.lastRunRare = 0;
    ACHIEVEMENT_STATE.lastRunMaxWeight = 0;
    ACHIEVEMENT_STATE.lastExtractTime = 0;
    ACHIEVEMENT_STATE.lastExtractLoot = 0;
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
// 在任何用户交互时恢复音频上下文（浏览器自动播放策略）
document.addEventListener('pointerdown', () => { Sound.init(); Sound.resume(); }, { once: true });
document.getElementById('open-inventory-btn').addEventListener('click', () => {
    // 关闭结算界面，切换到 base 上下文，打开库存
    document.getElementById('end-overlay').classList.add('hidden');
    G.inventoryContext = 'endsuccess';
    openInventory();
});
document.getElementById('open-inventory-hotbar').addEventListener('click', () => {
    if (G.running) {
        G.inventoryContext = 'raid';
        openInventory();
    }
});

// ====================================================
//  库存 / 装备管理页（按 TAB 打开 / 关闭）
// ====================================================

// 物品像素图标（28x28 简化版本 — 复用 drawGroundItem 的逻辑）
function drawItemIcon(canvas, itemKey, size) {
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const def = ITEM_TYPES[itemKey];
    if (!def) return;
    // 阴影
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath();
    c.ellipse(cx, cy + 7, size * 0.35, size * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    // 复用现有 drawGroundItem 的画法（缩放版本）
    c.save();
    c.translate(cx, cy);
    const s = size / 28;  // 28 = 原尺寸
    c.scale(s, s);
    // === 按类型画 ===
    if (def.kind === 'weapon') {
        // 像素小枪
        c.fillStyle = '#3a2a20';
        c.fillRect(-4, -1.5, 3, 3);
        c.fillStyle = '#5a4030';
        c.fillRect(-3, -1.5, 1, 3);
        c.fillStyle = '#1a1a1a';
        c.fillRect(-1, -1, 6, 2);
        c.fillStyle = '#5a6a7a';
        c.fillRect(-1, -1, 6, 1);
        c.fillStyle = '#0a0a0a';
        c.fillRect(5, -0.5, 2, 1);
        c.fillStyle = '#c0d0e0';
        c.fillRect(1, -0.5, 1, 0.5);
    } else if (def.kind === 'armor') {
        c.fillStyle = '#6a7888';
        c.fillRect(-4, -3, 8, 6);
        c.fillStyle = '#9aa8b8';
        c.fillRect(-4, -3, 8, 1);
        c.fillStyle = '#3a4858';
        c.fillRect(-0.5, -2, 1, 5);
        c.fillStyle = '#c0d0e0';
        c.fillRect(-3, -2, 1, 4);
        c.fillRect(2, -2, 1, 4);
    } else if (def.kind === 'ammo') {
        c.fillStyle = '#1a1612';
        c.fillRect(-3, -2, 6, 4);
        c.fillStyle = '#4a3a2a';
        c.fillRect(-3, -2, 6, 1);
        c.fillStyle = '#5a4a30';
        c.fillRect(-2, -1, 5, 1);
        c.fillStyle = def.color;
        c.fillRect(-2, -2, 4, 0.5);
    } else if (def.kind === 'consumable') {
        c.fillStyle = def.color;
        c.fillRect(-3, -2, 6, 4);
        c.fillStyle = 'rgba(255,255,255,0.3)';
        c.fillRect(-3, -2, 6, 1);
        if (itemKey === 'med') {
            c.fillStyle = '#ffffff';
            c.fillRect(-0.5, -1.5, 1, 3);
            c.fillRect(-1.5, -0.5, 3, 1);
        } else {
            c.fillStyle = '#5a3a1a';
            c.fillRect(-2, -0.5, 4, 1);
        }
    } else {
        // loot
        c.fillStyle = def.color;
        c.fillRect(-3, -3, 6, 6);
        c.fillStyle = 'rgba(255,255,255,0.3)';
        c.fillRect(-3, -3, 6, 1);
        if (itemKey === 'chip') {
            c.fillStyle = '#ffffff';
            c.fillRect(-2, -2, 1, 1); c.fillRect(1, -2, 1, 1);
            c.fillRect(-2, 1, 1, 1);  c.fillRect(1, 1, 1, 1);
            c.fillRect(-0.5, -0.5, 1, 1);
        } else if (itemKey === 'battery') {
            c.fillStyle = '#ffffff';
            c.fillRect(-0.5, -2, 1, 2);
            c.fillRect(-1, 0, 2, 1);
        } else if (itemKey === 'rare') {
            c.fillStyle = '#ffffff';
            c.fillRect(-2, -2, 4, 1);
            c.fillRect(-1, -1, 2, 1);
            c.fillRect(0, 0, 1, 1);
        }
    }
    c.restore();
}

// 画迷你人物（用于库存中央的"装备"栏和结算页的轻量面板）
function drawMiniCharacter(canvas, p) {
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, canvas.width, canvas.height);
    // 缩放原 drawPlayer：从 22x28 → 约 7x 放大
    const scale = 6;
    const off = document.createElement('canvas');
    off.width = 22 * scale;
    off.height = 30 * scale;
    const oc = off.getContext('2d');
    oc.imageSmoothingEnabled = false;
    // 临时把 ctx 指向 off，再调 drawPlayer
    const realCtx = window.__ctxRef || null;
    // 用更直接的方式：渲染到 off
    // 切到 oc，调 drawPlayer（drawPlayer 用的是外层 ctx）
    const origCanvas = canvas;
    // 借用主 ctx 的逻辑画小人物
    // 简化方案：自己画一个静态大像素人物
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 4;
    c.save();
    c.translate(cx, cy);
    const s = 5;
    c.scale(s, s);
    // === 复用 drawPlayer 配色 ===
    const C2 = {
        cloak: '#1a2530', cloakLight: '#2a3a4a', cloakEdge: '#5ec8e0',
        suit: '#2c3a4a', suitLight: '#3a4a5a',
        skin: '#c8a888', skinLight: '#e0c8a8',
        hair: '#2a1a18', hairLight: '#4a2a28',
        vest: '#1a2028', vestLight: '#2a3540',
        gun: '#0a0a0a', gunLight: '#5a6a7a',
        shoes: '#0a0a0a'
    };
    const ox = -11, oy = -14;
    // 阴影
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.ellipse(0, 14, 9, 3, 0, 0, Math.PI * 2);
    c.fill();
    // 斗篷
    c.fillStyle = C2.cloak;
    c.fillRect(ox + 3, oy + 19, 16, 8);
    c.fillStyle = C2.cloakLight;
    c.fillRect(ox + 3, oy + 19, 1, 8);
    c.fillRect(ox + 18, oy + 19, 1, 8);
    c.fillStyle = 'rgba(94,200,224,0.5)';
    c.fillRect(ox + 3, oy + 25, 16, 1);
    // 腿
    c.fillStyle = C2.suit;
    c.fillRect(ox + 6, oy + 23, 4, 5);
    c.fillRect(ox + 12, oy + 23, 4, 5);
    c.fillStyle = C2.suitLight;
    c.fillRect(ox + 6, oy + 23, 1, 5);
    c.fillRect(ox + 12, oy + 23, 1, 5);
    c.fillStyle = C2.shoes;
    c.fillRect(ox + 6, oy + 27, 4, 2);
    c.fillRect(ox + 12, oy + 27, 4, 2);
    // 护甲背心
    c.fillStyle = C2.vest;
    c.fillRect(ox + 5, oy + 12, 12, 12);
    c.fillStyle = C2.vestLight;
    c.fillRect(ox + 5, oy + 12, 12, 1);
    c.fillRect(ox + 5, oy + 23, 12, 1);
    c.fillStyle = '#5ec8e0';
    c.fillRect(ox + 10, oy + 14, 2, 2);
    // 持枪（朝向正右）
    c.fillStyle = C2.vest;
    c.fillRect(1, -1, 9, 3);
    c.fillStyle = C2.vestLight;
    c.fillRect(1, -1, 9, 1);
    c.fillStyle = C2.skin;
    c.beginPath(); c.arc(1, 0, 2.5, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(10, 0);
    c.fillStyle = C2.gun;
    c.fillRect(-2, -1.2, 7, 2.4);
    c.fillStyle = C2.gunLight;
    c.fillRect(2, -1.2, 2, 2.4);
    c.fillStyle = '#c8d8e8';
    c.fillRect(4, -0.5, 1, 1);
    c.restore();
    // 头
    c.fillStyle = C2.skin;
    c.fillRect(ox + 7, oy + 3, 8, 9);
    c.fillStyle = C2.skinLight;
    c.fillRect(ox + 7, oy + 3, 8, 1);
    c.fillStyle = C2.hair;
    c.fillRect(ox + 6, oy + 1, 10, 5);
    c.fillRect(ox + 7, oy + 0, 8, 2);
    c.fillRect(ox + 5, oy + 3, 2, 3);
    c.fillRect(ox + 15, oy + 3, 2, 3);
    c.fillStyle = C2.hairLight;
    c.fillRect(ox + 7, oy + 0, 1, 1);
    // 护目镜
    c.fillStyle = '#0a1a28';
    c.fillRect(ox + 7, oy + 4, 8, 1);
    c.fillStyle = 'rgba(94,200,224,0.7)';
    c.fillRect(ox + 8, oy + 5, 6, 1);
    // 眼睛
    c.fillStyle = '#1a1a1a';
    c.fillRect(ox + 9, oy + 6, 1, 2);
    c.fillRect(ox + 12, oy + 6, 1, 2);
    c.fillStyle = '#5ec8e0';
    c.fillRect(ox + 9, oy + 6, 1, 1);
    // 护甲指示
    if (p && p.armor) {
        const ap = 0.4 + 0.2 * Math.sin(G.time * 2);
        c.fillStyle = `rgba(180,200,220,${ap})`;
        c.fillRect(ox + 6, oy + 13, 2, 10);
        c.fillRect(ox + 14, oy + 13, 2, 10);
    }
    c.restore();
}

// 装备物品的种类（用于筛选）
function kindToTag(key) {
    const def = ITEM_TYPES[key];
    if (!def) return '';
    if (def.kind === 'weapon') return '武器';
    if (def.kind === 'armor') return '护甲';
    if (def.kind === 'ammo') return '弹药';
    if (def.kind === 'consumable') return '消耗';
    return '战利';
}

// 渲染整张库存页
function renderInventory() {
    if (!G.inventoryOpen) return;
    let p = G.player;
    // 没有 G.player 时（例如回到基地），用 STASH 内容合成一个预览玩家
    if (!p) {
        p = {
            weight: 0, maxWeight: 8.0, hp: 100, maxHp: 100, armor: null,
            weapons: [createWeapon('pistol')], equipment: {
                head: null, body: null, primary: null, secondary: null, melee: null, backpack: null
            },
            inventory: {}
        };
        // 从 STASH 推断装备
        for (const it of STASH.items) {
            const def = ITEM_TYPES[it.key];
            if (!def) continue;
            if (def.kind === 'armor' && !p.equipment.body) {
                p.equipment.body = { key: it.key };
                p.armor = { type: it.key, reduction: def.reduction };
            } else if (def.kind === 'weapon' && p.weapons[0].key === 'pistol') {
                p.weapons[0] = createWeapon(def.weaponKey);
                p.equipment.primary = { key: it.key };
            }
        }
    }

    // === 状态条 ===
    document.getElementById('inv-weight').textContent = p.weight.toFixed(1);
    document.getElementById('inv-weight-max').textContent = p.maxWeight.toFixed(1);
    const totalVal = computeRaidValue() + (G.inventoryContext === 'raid' ? 0 : STASH.items.reduce((s, x) => s + x.value * x.qty, 0));
    document.getElementById('inv-value').textContent = totalVal;
    const ctxLabel = document.getElementById('inv-context-label');
    if (G.inventoryContext === 'raid') {
        ctxLabel.textContent = '战局中 · 拾取后无法放回仓库';
        ctxLabel.className = '';
    } else if (G.inventoryContext === 'endsuccess') {
        ctxLabel.textContent = '撤离成功 · 物资已入仓库';
        ctxLabel.className = 'base';
    } else if (G.inventoryContext === 'endfail') {
        ctxLabel.textContent = '任务失败 · 物资已遗失';
        ctxLabel.className = 'endfail';
    } else {
        ctxLabel.textContent = '基地 · 整理仓库与装备';
        ctxLabel.className = 'base';
    }

    // === 仓库列 ===
    const stashGrid = document.getElementById('inv-stash-grid');
    stashGrid.innerHTML = '';
    const stashDisabled = (G.inventoryContext === 'raid' || G.inventoryContext === 'endfail');
    if (STASH.items.length === 0) {
        for (let i = 0; i < 8; i++) {
            const cell = document.createElement('div');
            cell.className = 'inv-cell empty';
            stashGrid.appendChild(cell);
        }
    } else {
        for (let i = 0; i < STASH.items.length; i++) {
            const it = STASH.items[i];
            stashGrid.appendChild(makeItemCell({
                source: 'stash', stashIdx: i, key: it.key, qty: it.qty,
                kind: it.kind, disabled: stashDisabled
            }));
        }
        // 补空位（视觉）
        for (let i = STASH.items.length; i < Math.max(8, ((STASH.items.length / 4) | 0 + 1) * 4); i++) {
            const cell = document.createElement('div');
            cell.className = 'inv-cell empty';
            stashGrid.appendChild(cell);
        }
    }
    document.getElementById('inv-stash-count').textContent = `${STASH.items.length} 项`;

    // === 本局背包列 ===
    const bagGrid = document.getElementById('inv-bag-grid');
    bagGrid.innerHTML = '';
    const bagKeys = Object.keys(p.inventory).filter(k => (p.inventory[k] || 0) > 0);
    if (bagKeys.length === 0) {
        for (let i = 0; i < 8; i++) {
            const cell = document.createElement('div');
            cell.className = 'inv-cell empty';
            bagGrid.appendChild(cell);
        }
    } else {
        for (const k of bagKeys) {
            const def = ITEM_TYPES[k];
            bagGrid.appendChild(makeItemCell({
                source: 'bag', key: k, qty: p.inventory[k],
                kind: def ? def.kind : 'loot',
                disabled: false
            }));
        }
    }
    document.getElementById('inv-bag-count').textContent = `${bagKeys.length} 项`;

    // === 装备槽 ===
    const slotLabels = { head: '头盔', body: '护甲', primary: '主武', secondary: '副武', melee: '近战', backpack: '背包' };
    for (const slot of Object.keys(p.equipment)) {
        const slotEl = document.querySelector(`.inv-equip-slot[data-slot="${slot}"]`);
        if (!slotEl) continue;
        const content = slotEl.querySelector('.inv-slot-content');
        const e = p.equipment[slot];
        slotEl.classList.toggle('filled', !!e);
        if (!e) {
            content.innerHTML = `<span style="color:var(--text-dim); font-style:italic">${slotLabels[slot]}（空）</span>`;
        } else {
            const def = ITEM_TYPES[e.key];
            content.innerHTML = `<b>${def ? def.label : e.key}</b>`;
        }
    }

    // === 中央人物 ===
    const charCanvas = document.getElementById('inv-character');
    if (charCanvas) drawMiniCharacter(charCanvas, p);

    // === 详情面板 ===
    updateInvDetail();
}

function makeItemCell(opts) {
    const cell = document.createElement('div');
    const def = ITEM_TYPES[opts.key];
    cell.className = 'inv-cell';
    if (def) {
        if (def.kind === 'weapon') cell.classList.add('weapon');
        if (def.kind === 'armor') cell.classList.add('armor');
        if (opts.key === 'rare') cell.classList.add('rare');
    }
    if (opts.disabled) cell.classList.add('disabled');
    if (G.selectedItem && G.selectedItem.key === opts.key
        && G.selectedItem.source === opts.source
        && (opts.source !== 'stash' || G.selectedItem.stashIdx === opts.stashIdx)) {
        cell.classList.add('selected');
    }
    // 物品图标
    const icon = document.createElement('canvas');
    icon.className = 'inv-icon';
    icon.width = 28; icon.height = 28;
    cell.appendChild(icon);
    drawItemIcon(icon, opts.key, 28);
    // 数量
    if (opts.qty > 1) {
        const q = document.createElement('div');
        q.className = 'inv-qty';
        q.textContent = '×' + opts.qty;
        cell.appendChild(q);
    }
    // 标签（武器/弹药/装备）
    const tag = document.createElement('div');
    tag.className = 'inv-tag';
    tag.textContent = kindToTag(opts.key);
    cell.appendChild(tag);
    // 事件
    cell.addEventListener('mouseenter', () => {
        G.selectedItem = { source: opts.source, key: opts.key, qty: opts.qty, stashIdx: opts.stashIdx };
        updateInvDetail();
        // 重新高亮选中
        document.querySelectorAll('.inv-cell.selected').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
    });
    cell.addEventListener('dblclick', () => {
        handleInvDoubleClick(opts);
    });
    cell.addEventListener('click', () => {
        G.selectedItem = { source: opts.source, key: opts.key, qty: opts.qty, stashIdx: opts.stashIdx };
        updateInvDetail();
        document.querySelectorAll('.inv-cell.selected').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
    });
    return cell;
}

function handleInvDoubleClick(opts) {
    if (opts.disabled) return;
    // 双击逻辑：自动装备 / 入库
    if (opts.source === 'bag') {
        const def = ITEM_TYPES[opts.key];
        if (!def) return;
        if (def.kind === 'weapon') {
            // 找空武器槽
            if (!G.player.equipment.primary) equipFromBag(opts.key, 'primary');
            else if (!G.player.equipment.secondary) equipFromBag(opts.key, 'secondary');
            else equipFromBag(opts.key, 'primary');
        } else if (def.kind === 'armor') {
            if (!G.player.equipment.body) equipFromBag(opts.key, 'body');
            else equipFromBag(opts.key, 'body');
        } else {
            // 弹药/消耗/loot：可入库
            if (depositBagToStash(opts.key, opts.qty)) { /* ok */ }
        }
    } else if (opts.source === 'stash') {
        withdrawFromStash(opts.stashIdx, opts.qty);
    }
    renderInventory();
}

// 装备槽位点击：卸下 → 回到本局背包
function bindEquipSlotClicks() {
    document.querySelectorAll('.inv-equip-slot').forEach(slot => {
        slot.addEventListener('click', () => {
            const slotName = slot.dataset.slot;
            if (G.player.equipment[slotName]) {
                unequipToBag(slotName);
                renderInventory();
            }
        });
    });
}

// 物品详情
function updateInvDetail() {
    const el = document.getElementById('inv-detail');
    if (!el) return;
    const sel = G.selectedItem;
    if (!sel) {
        el.className = 'inv-detail empty';
        el.innerHTML = '悬停物品查看详情 · 双击装备 · 单击装备槽卸下';
        return;
    }
    const def = ITEM_TYPES[sel.key];
    if (!def) {
        el.className = 'inv-detail empty';
        el.textContent = '未知物品';
        return;
    }
    el.className = 'inv-detail';
    // 详情
    const icon = document.createElement('canvas');
    icon.className = 'inv-detail-icon';
    icon.width = 36; icon.height = 36;
    drawItemIcon(icon, sel.key, 36);
    el.innerHTML = '';
    el.appendChild(icon);
    const info = document.createElement('div');
    info.className = 'inv-detail-info';
    let meta = `重量 ${def.weight} kg · 价值 ${def.value} 点`;
    if (def.kind === 'armor') meta += ` · 减伤 ${Math.round(def.reduction * 100)}%`;
    if (def.kind === 'weapon') {
        const wdef = WEAPONS[def.weaponKey];
        if (wdef) meta += ` · 伤害 ${wdef.dmg} · 弹匣 ${wdef.maxMag}`;
    }
    info.innerHTML = `
        <div class="inv-detail-name">${def.label}${sel.qty > 1 ? ' ×' + sel.qty : ''}</div>
        <div class="inv-detail-meta">${meta}</div>
        <div class="inv-detail-desc">${getItemDesc(sel.key)}</div>
        <div class="inv-detail-hint">${getInvHint(sel)}</div>
    `;
    el.appendChild(info);
}

function getItemDesc(key) {
    const descs = {
        '9mm': '手枪通用弹药。常见、稳定、易获取。',
        'rifle': '5.45mm 步枪弹。穿透力中等。',
        'shotgun': '12 号霰弹。近距离范围杀伤。',
        'med': '医疗包。立即恢复 35 点生命。',
        'food': '压缩口粮。略微恢复体力（v1 占位）。',
        'chip': '电路板 · 价值较高的可交易物。',
        'battery': '能量电池 · 高价值可交易物。',
        'rare': '稀有元件 · 顶级战利品。',
        'w_pistol': '一把半自动手枪。',
        'w_rifle': '全自动步枪。中远距离主力。',
        'w_shotgun': '近距离霰弹。范围伤害。',
        'armor_t1': '战术护甲。轻便，覆盖躯干。',
        'armor_t2': '重型护甲。重，减伤高。'
    };
    return descs[key] || '未知物品';
}

function getInvHint(sel) {
    if (sel.source === 'stash') {
        if (G.inventoryContext === 'raid') return '战局中：仓库无法取用';
        if (G.inventoryContext === 'endfail') return '任务失败：仓库无法取用';
        return '双击：拿回玩家（武器/护甲会装备，弹药/消耗会进背包）';
    }
    if (sel.source === 'bag') {
        const def = ITEM_TYPES[sel.key];
        if (def.kind === 'weapon') return '双击：装备到主武器槽（占用则替换）';
        if (def.kind === 'armor') return '双击：装备到护甲槽（占用则替换）';
        return '双击：存到仓库（仅在非战局时可用）';
    }
    return '';
}

function computeRaidValue() {
    const p = G.player;
    if (!p) return 0;
    let v = 0;
    for (const k of Object.keys(p.inventory)) {
        const def = ITEM_TYPES[k];
        if (def) v += def.value * (p.inventory[k] || 0);
    }
    for (const slot of Object.keys(p.equipment)) {
        const e = p.equipment[slot];
        if (e) {
            const def = ITEM_TYPES[e.key];
            if (def) v += def.value;
        }
    }
    return v;
}

// 打开 / 关闭 库存页
function openInventory() {
    if (G.ended) return;
    if (!G.running && G.inventoryContext === 'raid') return;  // 仅阻止"战局中"在玩家不存在时打开
    // 战局中、基地（end 后回到菜单时可用 base 上下文）
    G.inventoryOpen = true;
    document.getElementById('inventory-overlay').classList.remove('hidden');
    if (G.player) recomputeWeight();
    bindEquipSlotClicks();
    renderInventory();
}
function closeInventory() {
    G.inventoryOpen = false;
    document.getElementById('inventory-overlay').classList.add('hidden');
    G.selectedItem = null;
}
function toggleInventory() {
    if (G.inventoryOpen) closeInventory();
    else openInventory();
}

// 键盘：TAB
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        toggleInventory();
    }
});

// 初始：从 localStorage 加载仓库存档
loadStash();
// 初始：刷新开始界面的仓库预览（让用户看到"你有一个手无寸铁的拾荒者"）
refreshStartMiniPanel();

function loop(now) {
    update(now);
    render();
    requestAnimationFrame(loop);
}

requestAnimationFrame((t) => {
    lastTime = t;
    loop(t);
});

})();
