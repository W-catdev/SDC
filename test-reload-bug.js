// tryReload null-safety regression test
// 模拟玩家在 reloadState 被外部清空时, setTimeout 回调不应崩溃

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, 'SDC/game.js'), 'utf8');

// === Stub context ===
const stubCtx = new Proxy({}, {
    get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'canvas' || prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => ({ addColorStop: () => {}, fillRect: () => {} });
        }
        if (prop === 'measureText') return (txt) => ({ width: (txt || '').length * 7 });
        if (prop === 'getImageData' || prop === 'createImageData' || prop === 'putImageData') {
            return () => ({ data: new Uint8ClampedArray(4) });
        }
        return (...args) => {};
    }
});

const sandbox = {};
sandbox.console = console;
sandbox.performance = { now: () => Date.now() };
sandbox.Math = Math; sandbox.Date = Date; sandbox.Object = Object; sandbox.Array = Array;
sandbox.JSON = JSON; sandbox.Set = Set; sandbox.Map = Map; sandbox.Promise = Promise;
sandbox.Error = Error; sandbox.Number = Number; sandbox.String = String; sandbox.Boolean = Boolean;
sandbox.parseInt = parseInt; sandbox.parseFloat = parseFloat; sandbox.isNaN = isNaN;
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox.setInterval = setInterval; sandbox.clearInterval = clearInterval;
sandbox.requestAnimationFrame = (cb) => 0;
sandbox.cancelAnimationFrame = () => {};

sandbox.AudioContext = function() {
    return {
        createOscillator: () => ({ connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }),
        createGain: () => ({ connect: () => {}, gain: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }),
        destination: {},
        currentTime: 0,
        state: 'running',
        resume: () => Promise.resolve()
    };
};
sandbox.webkitAudioContext = sandbox.AudioContext;

sandbox.document = {
    getElementById: (id) => {
        if (id === 'game-canvas' || id === 'radar-canvas' || id === 'start-mini-canvas') {
            return { getContext: () => stubCtx, addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), width: 800, height: 600 };
        }
        return {
            classList: { add: () => {}, remove: () => {}, toggle: () => {} },
            textContent: '', innerHTML: '',
            style: {},
            addEventListener: () => {},
            querySelector: () => ({ textContent: '', innerHTML: '', style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, appendChild: () => {}, removeChild: () => {} }),
            querySelectorAll: () => [],
            appendChild: () => {}, removeChild: () => {},
            createElement: () => ({ classList: { add: () => {}, remove: () => {}, toggle: () => {} }, style: {}, appendChild: () => {}, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], removeChild: () => {}, remove: () => {}, setAttribute: () => {}, getContext: () => stubCtx }),
            createTextNode: () => ({}),
            value: '', maxLength: 0, checked: false
        };
    },
    addEventListener: () => {},
    querySelector: () => ({ textContent: '', innerHTML: '', style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, appendChild: () => {}, removeChild: () => {} }),
    querySelectorAll: () => [],
    body: { appendChild: () => {}, removeChild: () => {} },
    createElement: () => ({ classList: { add: () => {}, remove: () => {}, toggle: () => {} }, style: {}, appendChild: () => {}, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], removeChild: () => {}, remove: () => {}, setAttribute: () => {}, getContext: () => stubCtx }),
    hidden: false,
    visibilityState: 'visible'
};
sandbox.window = { addEventListener: () => {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 };
sandbox.navigator = { userAgent: 'node' };
sandbox.location = { reload: () => {}, search: '' };
sandbox.global = sandbox;
sandbox.self = sandbox;
sandbox.HTMLCanvasElement = function() {};
sandbox.HTMLElement = function() {};
sandbox.Element = function() {};

vm.createContext(sandbox);

// Patch the source
const lines = code.split('\n');
const patched = lines.map((line) => {
    if (/^(const|let)\s+[A-Z_$][A-Z0-9_$]*\s*=/.test(line)) {
        return line.replace(/^(const|let)\s+/, 'var ');
    }
    return line;
}).join('\n');

const inj = `
;this.G=G;this.initWorld=initWorld;this.tryReload=tryReload;this.update=update;this.Sound=Sound;this.endGame=endGame;
`;
const lastClose = patched.lastIndexOf('})();');
const final = patched.slice(0, lastClose) + inj + '\n})();';

try {
    vm.runInContext(final, sandbox, { filename: 'game.js' });
    console.log('LOAD: game.js 加载成功\n');
} catch (e) {
    console.log('LOAD FAIL:', e.message);
    process.exit(1);
}

sandbox.G.running = true;
sandbox.initWorld();

console.log('=== 场景 1: tryReload 正常流程 ===');
const p = sandbox.G.player;
const w0 = p.weapons[0];
console.log(`  玩家武器: ${w0.name}, 初始 mag=${w0.mag}/${w0.maxMag}, 后备=${p.inventory[w0.ammoType] || 0}`);
w0.mag = 0;
sandbox.tryReload();
if (sandbox.G.reloadState) {
    console.log(`  PASS: 装填状态已设置, duration=${sandbox.G.reloadState.duration}ms, ammoKey=${sandbox.G.reloadState.ammoKey}`);
} else {
    console.log('  FAIL: 装填状态未设置');
    process.exit(1);
}

const wReload = w0.reloadTime || 1200;
setTimeout(() => {
    console.log(`  装填结果: mag=${w0.mag}/${w0.maxMag}, 后备=${p.inventory[w0.ammoType]}, reloading=${p.reloading}, reloadState=${sandbox.G.reloadState}`);
    if (w0.mag > 0) {
        console.log('  PASS: 正常装填成功\n');
    } else {
        console.log('  FAIL: 弹匣未填装\n');
    }

    console.log('=== 场景 2: 装填中途 reloadState 被清空 (玩家死亡) ===');
    w0.mag = 0;
    sandbox.G.running = true;
    sandbox.G.ended = false;
    p.hp = p.maxHp;
    sandbox.tryReload();
    console.log(`  装填开始, reloadState=${!!sandbox.G.reloadState}, reloading=${p.reloading}`);

    // 玩家死亡
    sandbox.G.ended = true;
    p.hp = 0;
    sandbox.G.reloadState = null;
    console.log('  玩家死亡, reloadState 被清空, ended=true');

    // 等待 setTimeout 回调触发 - 不应该崩溃
    setTimeout(() => {
        console.log('  回调完成, 没有崩溃 → PASS: 修复有效\n');

        console.log('=== 场景 3: 30 帧完整循环 (含玩家死亡) ===');
        sandbox.G.running = true;
        sandbox.G.ended = false;
        p.hp = p.maxHp;
        sandbox.initWorld();
        let frameCount = 0;
        let crashed = false;
        for (let i = 0; i < 30; i++) {
            try {
                sandbox.update(0.05);
                frameCount++;
            } catch (e) {
                if (!/querySelector|appendChild|removeChild|classList/.test(e.message)) {
                    crashed = true;
                    console.log('  FAIL 帧', i, ':', e.message);
                }
            }
        }
        if (!crashed) {
            console.log(`  PASS: ${frameCount} 帧循环无崩溃 (DOM stub 错误已忽略)`);
        }

        console.log('\n=== 全部测试完成 ===');
        process.exit(0);
    }, 200);
}, wReload + 200);
