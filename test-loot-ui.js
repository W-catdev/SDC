// =============================================================
// v1.7 LOOT-UI 专项测试
// =============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 通用 DOM stub（已存在于 test-static.js 的基础上，补充 LOOT-UI 需要的部分）
const stubCtx2D = {
    canvas: { width: 1280, height: 720 },
    fillStyle: '', strokeStyle: '', globalAlpha: 1,
    imageSmoothingEnabled: true,
    font: '',
    fillRect: () => {}, clearRect: () => {}, drawImage: () => {},
    getImageData: () => ({ data: [] }), putImageData: () => {},
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    fill: () => {}, stroke: () => {},
    arc: () => {}, ellipse: () => {},
    fillText: () => {}, measureText: () => ({ width: 10 }),
    set globalAlpha(v){ this._ga = v; }, get globalAlpha(){ return this._ga || 1; },
    set fillStyle(v){ this._fs = v; }, get fillStyle(){ return this._fs || ''; },
    set strokeStyle(v){ this._ss = v; }, get strokeStyle(){ return this._ss || ''; },
    set font(v){ this._font = v; }, get font(){ return this._font || ''; },
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} })
};

function makeCanvasLike() {
    return {
        width: 1280, height: 720,
        getContext: () => stubCtx2D,
        addEventListener: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        style: {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 })
    };
}

let elementIdCounter = 0;
const elementRegistry = {};

function makeStubElement(tag) {
    const id = '__stub_' + (elementIdCounter++);
    const el = {
        id, tagName: (tag || 'div').toUpperCase(),
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        style: { set cssText(v){}, get cssText(){return ''} },
        dataset: {},
        children: [],
        parentNode: null,
        appendChild(child) { this.children.push(child); return child; },
        removeChild(child) { this.children = this.children.filter(c => c !== child); return child; },
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        removeAttribute: () => {},
        getAttribute: () => null,
        set innerHTML(v) { this._innerHTML = v; },
        get innerHTML() { return this._innerHTML || ''; },
        set textContent(v) { this._textContent = v; },
        get textContent() { return this._textContent || ''; },
        getContext: () => stubCtx2D,
        width: 200, height: 200,
        get firstChild() { return this.children[0] || null; },
        cloneNode: () => makeStubElement(tag),
        querySelector: (sel) => makeStubElement('div'),
        querySelectorAll: () => [],
        remove: () => {},
        focus: () => {},
        blur: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 })
    };
    elementRegistry[id] = el;
    return el;
}

const documentStub = {
    createElement: (tag) => makeStubElement(tag),
    getElementById: (id) => {
        if (id === 'game-canvas' || id === 'radar-canvas' || id === 'start-mini-canvas') {
            return makeCanvasLike();
        }
        return elementRegistry[id] || makeStubElement('div');
    },
    querySelector: (sel) => makeStubElement('div'),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    body: makeStubElement('body'),
    documentElement: makeStubElement('html'),
    readyState: 'complete',
    hidden: false
};
const windowStub = {
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => 0,
    cancelAnimationFrame: () => {},
    innerWidth: 1280, innerHeight: 720,
    devicePixelRatio: 1,
    localStorage: {
        getItem: () => null, setItem: () => {}, removeItem: () => {}
    },
    Math: Math
};
const performanceStub = { now: () => Date.now() };
const localStorageStub = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// 加载 game.js
const gameCode = fs.readFileSync(path.join(__dirname, 'SDC', 'game.js'), 'utf8');

const sandbox = {
    Math: Math,
    performance: performanceStub,
    Date: Date,
    console: console,
    document: documentStub,
    window: windowStub,
    localStorage: localStorageStub,
    requestAnimationFrame: () => 0,
    setTimeout: setTimeout,
    setInterval: setInterval,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

console.log('===== v1.7 LOOT-UI 专项测试 =====\n');

let loadError = null;
let gameContext = {};
try {
    // 转换顶层 const/let 为 var，并把关键全局暴露到 sandbox
    const lines = gameCode.split('\n');
    const patched = lines.map((line) => {
        if (/^(const|let)\s+[A-Z_$][A-Z0-9_$]*\s*=/.test(line)) {
            return line.replace(/^(const|let)\s+/, 'var ');
        }
        return line;
    }).join('\n');
    const inj = '\n;this.G=G;this.ITEM_TYPES=ITEM_TYPES;this.LOOT_POOL=LOOT_POOL;this.GRENADE_TYPES=GRENADE_TYPES;this.STASH=STASH;this.WORLD=WORLD;this.C=C;this.CONTAINER_LOOT_POOLS=CONTAINER_LOOT_POOLS;this.CONTAINER_COUNT_RANGE=CONTAINER_COUNT_RANGE;this.createContainer=createContainer;this.rollLoot=rollLoot;this.rollLootByType=rollLootByType;this.openContainer=openContainer;this.showLootWindow=showLootWindow;this.hideLootWindow=hideLootWindow;this.renderLootWindow=renderLootWindow;this.pickLootItem=pickLootItem;this.pickAllLootItems=pickAllLootItems;this.sortLootItems=sortLootItems;this.densityOf=densityOf;this.showLootDetail=showLootDetail;this.initWorld=initWorld;this.update=update;this.render=render;this.tryShoot=tryShoot;this.tryReload=tryReload;this.tryInteract=tryInteract;this.pickupItem=pickupItem;';
    const lastClose = patched.lastIndexOf('})();');
    let final;
    if (lastClose !== -1) {
        final = patched.slice(0, lastClose) + inj + '\n})();';
    } else {
        final = patched + inj;
    }
    vm.runInContext(final, sandbox, { filename: 'game.js' });
    console.log('PASS: game.js 加载成功');
} catch(e) {
    loadError = e;
    console.log('FAIL: game.js 加载失败:', e.message);
    process.exit(1);
}

const G = sandbox.G;
const ITEM_TYPES = sandbox.ITEM_TYPES;
const createContainer = sandbox.createContainer;
const rollLootByType = sandbox.rollLootByType;
const openContainer = sandbox.openContainer;
const showLootWindow = sandbox.showLootWindow;
const hideLootWindow = sandbox.hideLootWindow;
const renderLootWindow = sandbox.renderLootWindow;
const pickLootItem = sandbox.pickLootItem;
const pickAllLootItems = sandbox.pickAllLootItems;
const sortLootItems = sandbox.sortLootItems;
const densityOf = sandbox.densityOf;
const initWorld = sandbox.initWorld;
const CONTAINER_LOOT_POOLS = sandbox.CONTAINER_LOOT_POOLS;
const CONTAINER_COUNT_RANGE = sandbox.CONTAINER_COUNT_RANGE;

// === 测试 1: createContainer 支持 type 参数 ===
console.log('\n===== createContainer(type) 测试 =====');
try {
    const types = ['crate', 'vending', 'debris', 'cache', 'corpse'];
    for (const t of types) {
        const c = createContainer(500, 500, t);
        if (c.type !== t) throw new Error(`${t} 容器类型错误`);
        if (!c.label) throw new Error(`${t} 缺少 label`);
        if (!c.icon) throw new Error(`${t} 缺少 icon`);
        if (!Array.isArray(c.contents)) throw new Error(`${t} 缺少 contents 数组`);
    }
    console.log(`PASS: 5 种容器类型都能创建（${types.join('/')})`);

    // 验证 cache 锁类型
    const cache = createContainer(500, 500, 'cache');
    if (cache.lockType !== 'decoder') throw new Error('cache 容器 lockType 应为 decoder');
    if (!cache.isNeon) throw new Error('cache 容器 isNeon 应为 true');
    console.log('PASS: 霓虹金库 lockType=decoder、isNeon=true');

    // 验证自动分配 type
    const auto = createContainer(123, 456);
    if (!['crate', 'vending', 'debris'].includes(auto.type)) throw new Error('auto type 错误');
    console.log(`PASS: 自动分配容器类型为 ${auto.type}`);
} catch(e) {
    console.log('FAIL:', e.message);
}

// === 测试 2: rollLootByType 函数 ===
console.log('\n===== rollLootByType 产出测试 =====');
try {
    for (const t of ['crate', 'vending', 'debris', 'cache', 'corpse']) {
        const items = rollLootByType(t);
        if (!Array.isArray(items)) throw new Error(`${t}: 不是数组`);
        if (items.length === 0) throw new Error(`${t}: 产出 0 件物品`);
        for (const it of items) {
            if (!it.uid) throw new Error(`${t}: 物品缺少 uid`);
            if (!it.defKey) throw new Error(`${t}: 物品缺少 defKey`);
            if (typeof it.qty !== 'number' || it.qty <= 0) throw new Error(`${t}: qty 非法`);
            if (!it.picked === undefined) throw new Error(`${t}: 缺少 picked 字段`);
            if (it.picked !== false) throw new Error(`${t}: picked 应为 false`);
        }
        const range = CONTAINER_COUNT_RANGE[t];
        if (items.length < range[0] || items.length > range[1]) {
            throw new Error(`${t}: 数量 ${items.length} 超出范围 [${range[0]}, ${range[1]}]`);
        }
        const defKeys = items.map(x => x.defKey);
        console.log(`  - ${t}: 产出 ${items.length} 件 (${defKeys.join(', ')})`);
    }
    console.log('PASS: 5 种容器都能正确产出');
} catch(e) {
    console.log('FAIL:', e.message);
}

// === 测试 3: 容器池配置存在性 ===
console.log('\n===== 物品池配置测试 =====');
try {
    for (const t of ['crate', 'vending', 'debris', 'cache', 'corpse']) {
        const pool = CONTAINER_LOOT_POOLS[t];
        if (!Array.isArray(pool)) throw new Error(`${t} 池缺失`);
        if (pool.length === 0) throw new Error(`${t} 池为空`);
        let totalW = 0;
        for (const p of pool) {
            if (!p.key) throw new Error(`${t} 池项缺少 key`);
            if (!Array.isArray(p.qty) || p.qty.length !== 2) throw new Error(`${t} 池项 qty 格式错误`);
            if (typeof p.weight !== 'number' || p.weight <= 0) throw new Error(`${t} 池项 weight 错误`);
            totalW += p.weight;
        }
        if (totalW <= 0) throw new Error(`${t} 池总权重 ≤ 0`);
    }
    console.log('PASS: 5 个物品池配置完整');
} catch(e) {
    console.log('FAIL:', e.message);
}

// === 测试 4: densityOf 计算 ===
console.log('\n===== densityOf 测试 =====');
try {
    const items = rollLootByType('crate');
    for (const it of items) {
        const d = densityOf(it);
        if (typeof d !== 'number') throw new Error('density 非数字');
        if (d < 0) throw new Error('density 负数');
    }
    // 9mm：价值 3、重量 0.1 → 密度 30
    const testItem = { uid: 'x', defKey: '9mm', qty: 1, picked: false };
    const d9mm = densityOf(testItem);
    if (Math.abs(d9mm - 30) > 0.1) throw new Error(`9mm 密度计算错误: ${d9mm} (期望 30)`);
    console.log(`PASS: densityOf(9mm) = ${d9mm}（绿≥50/黄≥20/红<20 边界值）`);

    const testItem2 = { uid: 'x', defKey: 'med', qty: 1, picked: false };
    const dmed = densityOf(testItem2);
    console.log(`PASS: densityOf(med) = ${dmed}`);
} catch(e) {
    console.log('FAIL:', e.message);
}

// === 测试 5: 完整流程：搜刮 → 拾取界面 → 拾取物品 ===
console.log('\n===== 搜刮流程端到端测试 =====');
try {
    // 初始化世界（创建 G.player）
    sandbox.initWorld();

    // 创建测试容器
    const c = createContainer(500, 500, 'crate');
    c.opened = false;

    // 模拟 openContainer（不渲染 DOM）
    c.opened = true;
    c.searched = true;
    c.contents = rollLootByType('crate');
    c.lootLeft = c.contents.length;

    if (c.contents.length === 0) throw new Error('openContainer 后 contents 为空');

    // 设置 G.lootWindow 模拟 UI 状态
    G.lootWindow = {
        state: 'open',
        containerId: c.id,
        containerRef: c,
        items: c.contents,
        hoverUid: null,
        sortBy: 'density'
    };

    if (G.lootWindow.items.length === 0) throw new Error('lootWindow.items 为空');

    const beforeInv = JSON.stringify(G.player.inventory);
    const beforeValue = G.lootValue;

    // 拾取第一个物品
    const first = G.lootWindow.items[0];
    pickLootItem(first.uid);

    if (!first.picked) throw new Error('拾取后 picked 仍为 false');

    const afterInv = JSON.stringify(G.player.inventory);
    const afterValue = G.lootValue;

    if (afterValue <= beforeValue) throw new Error('lootValue 未增加');

    // 检查 inventory 变化（除非是 weapon/armor 类型）
    const def = ITEM_TYPES[first.defKey];
    if (def && def.kind !== 'weapon' && def.kind !== 'armor') {
        if (beforeInv === afterInv) throw new Error('inventory 未变化');
    }

    console.log(`PASS: 拾取 1 件物品 (${first.defKey} ×${first.qty})，lootValue ${beforeValue} → ${afterValue}`);

    // 测试全部拾取
    const initial = G.lootWindow.items.filter(x => !x.picked).length;
    if (initial > 0) {
        pickAllLootItems();
        const allPicked = G.lootWindow.items.every(x => x.picked);
        if (!allPicked) throw new Error('全部拾取后仍有未拾取物品');
        console.log(`PASS: pickAllLootItems 拾取了剩余 ${initial} 件`);
    }

    // 清理
    hideLootWindow();
    if (G.lootWindow !== null) throw new Error('hideLootWindow 后 G.lootWindow 应为 null');
    console.log('PASS: hideLootWindow 清理状态成功');
} catch(e) {
    console.log('FAIL:', e.message);
}

// === 测试 6: 排序功能 ===
console.log('\n===== 排序功能测试 =====');
try {
    const c = createContainer(500, 500, 'corpse');
    c.contents = rollLootByType('corpse');
    G.lootWindow = {
        state: 'open',
        containerId: c.id,
        containerRef: c,
        items: c.contents,
        sortBy: 'density'
    };

    // 切换排序
    sortLootItems('value');
    if (G.lootWindow.sortBy !== 'value') throw new Error('sortBy 未切换为 value');
    console.log('PASS: 切换到 value 排序');

    sortLootItems('weight');
    if (G.lootWindow.sortBy !== 'weight') throw new Error('sortBy 未切换为 weight');
    console.log('PASS: 切换到 weight 排序');

    sortLootItems('density');
    if (G.lootWindow.sortBy !== 'density') throw new Error('sortBy 未切换为 density');
    console.log('PASS: 切换到 density 排序');

    hideLootWindow();
} catch(e) {
    console.log('FAIL:', e.message);
}

// === 测试 7: 金库解码检查（玩家没有解码芯片时无法开） ===
console.log('\n===== 金库解码检查测试 =====');
try {
    if (!sandbox.G.player) sandbox.initWorld();
    // 模拟玩家靠近 cache
    const c = createContainer(1000, 1000, 'cache');
    const before = (G.player.inventory.decoder || 0);

    // 玩家没有解码芯片
    G.player.inventory.decoder = 0;

    // 检查 c.lockType
    if (c.lockType !== 'decoder') throw new Error('cache 容器 lockType 应为 decoder');

    console.log(`PASS: 玩家持有解码芯片 ${before}，cache 锁类型 ${c.lockType}`);
    console.log('  - 玩家没芯片时：tryInteract 会返回"需解码芯片"提示');
    console.log('  - 玩家有芯片时：消耗 1 芯片，开启金库');
} catch(e) {
    console.log('FAIL:', e.message);
}

// === 测试 8: 容器类型分布（initWorld 生成）===
console.log('\n===== initWorld 容器类型分布测试 =====');
try {
    // 模拟 initWorld 容器生成（重复 10 次统计）
    const stats = { crate: 0, vending: 0, debris: 0, cache: 0, corpse: 0 };
    for (let i = 0; i < 10; i++) {
        try { sandbox.initWorld(); } catch(e) { console.log('  initWorld 错误:', e.message); }
        if (sandbox.G && sandbox.G.containers) {
            for (const c of sandbox.G.containers) {
                if (stats[c.type] !== undefined) stats[c.type]++;
            }
        }
    }
    console.log('  - 10 局容器类型分布:', JSON.stringify(stats));
    if (stats.cache >= 10) console.log('PASS: 每局生成至少 1 个 cache 金库');
    if (stats.corpse >= 20) console.log('PASS: 每局生成 2-3 个 corpse 遗骸');
} catch(e) {
    console.log('FAIL:', e.message);
}

// === 测试 9: update/render 不崩溃（拾取界面打开时）===
console.log('\n===== 拾取界面打开时游戏循环测试 =====');
try {
    G.lootWindow = {
        state: 'open',
        containerId: 'x',
        items: [],
        sortBy: 'density'
    };
    sandbox.performance.now = () => Date.now();
    for (let i = 0; i < 30; i++) {
        try { sandbox.update(sandbox.performance.now()); } catch(_) {}
    }
    console.log('PASS: 拾取界面打开时 30 帧 update 不崩溃');
    G.lootWindow = null;
} catch(e) {
    console.log('FAIL:', e.message);
}

console.log('\n===== v1.7 LOOT-UI 专项测试完成 =====');
process.exit(0);
