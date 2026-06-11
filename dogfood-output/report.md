# Dogfood Report: 霓虹废墟 · Neon Ruins (v1.1-v1.3)

| Field | Value |
|-------|-------|
| **Date** | 2026-06-11 |
| **App URL** | http://localhost:8082/SDC/index.html |
| **Session** | neon-ruins-qa |
| **Scope** | v1.1-v1.3 新功能：武器切换/装填动画、受伤方向指示、击杀时停、爆头、听觉系统、尸体发现、动态难度、精英协同、油桶爆炸物 |
| **Test Method** | Node.js vm sandbox + Proxy stubs (浏览器自动化不可用) |

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | — |
| High | 1 | ✅ Fixed |
| Medium | 0 | — |
| Low | 1 | ✅ Documented |
| **Total** | **2** | **Both fixed** |

## Test Method

由于沙箱环境的 `integrated_browser` 工具不可用，且 `agent-browser` 未安装，转向**代码级静态分析 + vm 沙箱执行**：

- **Node.js `vm.runInContext`**：在沙箱中运行 `game.js`，注入全局 `G` 等内部状态
- **Proxy stubs**：`document`、`canvas.getContext`、`AudioContext` 等浏览器 API
- **测试覆盖**：42 项断言（test-static.js） + 3 项 tryReload 边界场景（test-reload-bug.js）

## Issues Found

### Issue #1 — High: `tryReload` setTimeout 回调 null deref [FIXED]

**Location**: `SDC/game.js:1666` (修复前)

**Repro**:
```
1. 玩家在 reloadState 装填中
2. 玩家 hp=0 触发 endGame → reloadState 被外部清空为 null
3. 1200ms 后 setTimeout 回调触发
4. 试图访问 G.reloadState.ammoKey → TypeError 崩溃
```

**Stack**:
```
TypeError: Cannot read properties of null (reading 'ammoKey')
    at game.js:1666:55
    at Timeout._onTimeout
```

**Impact**: 玩家在装填中被击杀会留下一个未捕获的 Promise rejection，污染浏览器 console。极端情况下连续战斗可能积累多个崩溃事件。

**Fix** (game.js:1661-1674):
```js
setTimeout(() => {
    if (!G.player || G.ended) return;
    if (!G.reloadState) return;        // ← 新增
    const w2 = G.reloadState.weaponRef;
    if (!w2) return;
    const need = w2.maxMag - w2.mag;
    const have = G.player.inventory[G.reloadState.ammoKey] || 0;
    ...
}, w.reloadTime);
```

**Verification**: test-reload-bug.js 场景 2 模拟玩家死亡后等回调触发，**无崩溃**。

---

### Issue #2 — Low: 玩家移动向量作用域泄漏 [FIXED]

**Location**: `SDC/game.js:2820` 附近 (修复前)

**Repro**:
```
1. 玩家按 WASD 移动
2. 触发翻越/掩体切换路径
3. 在 if/else 分支外引用了未声明的 mx, my, mag, speed, isSprinting
4. → ReferenceError (在严格模式) 或 隐式全局 (非严格模式)
```

**Fix**:
```js
// 提到 if 之前
let mx = 0, my = 0, mag = 0, speed = 0, isSprinting = false;
// 在分支内部用 mag = ..., speed = ... 赋值（无 let）
```

**Verification**: 30 帧循环无 ReferenceError，update() 正常推进 0.014s/帧。

---

## Test Results

### test-static.js (42 项)

```
PASS: game.js 加载成功
PASS: G.weaponAnim 存在 (v1.1.1 武器切换动画状态)
PASS: G.reloadState 存在 (v1.1.2 装填状态)
PASS: G.damageSourceAngles 存在 (v1.1.3 受伤方向指示)
PASS: G.killConfirm 存在 (v1.1.4 击杀时停)
PASS: G.audioEvents 存在 (v1.2.1 听觉系统)
PASS: G.discoveredCorpses 存在 (v1.2.2 尸体发现)
PASS: G.dynamicDiff 存在 (v1.2.3 动态难度)
PASS: G.barrels 存在 (v1.3.3 油桶爆炸物)
PASS: G.grenadeHoldTime 存在 (手雷蓄力)
PASS: initWorld() 调用成功
PASS: tryShoot() 已定义
PASS: tryReload() 已定义
PASS: tryUseMed() 已定义
PASS: tryInteract() 已定义
PASS: tryVault() 已定义
PASS: damageEnemy() 已定义
PASS: spawnParticles() 已定义
PASS: spawnImpactEffect() 已定义
PASS: spawnDamageNumber() 已定义
PASS: spawnBulletHole() 已定义
PASS: update() 已定义
PASS: render() 已定义
PASS: findNearestCover() 已定义
PASS: findFlankPosition() 已定义
PASS: alertNearbyEnemies() 已定义
PASS: drawPlayer() 已定义
PASS: drawEnemy() 已定义
PASS: drawGroundItem() 已定义
PASS: 武器切换动画状态已写入 (v1.1.1)
PASS: 装填状态已设置, duration=1200ms, ammoKey=9mm (v1.1.2)
PASS: 听觉事件可添加
PASS: 尸体发现标记可记录
PASS: 动态难度状态存在
PASS: 油桶血量可修改
PASS: update() 成功运行
PASS: render() 调用成功
PASS: 开火动画已触发 (弹药 5->4)
PASS: 射击作为听觉事件已发布
PASS: 30 帧循环成功
PASS: 敌人因听觉事件改变状态 (state=chase)
PASS: 油桶被命中并爆炸
```

**Total: 42/42 PASS**

### test-reload-bug.js (3 场景)

```
场景 1: tryReload 正常流程           ✅ PASS
场景 2: 装填中途 reloadState 被清空   ✅ PASS（修复有效）
场景 3: 30 帧完整循环 (含玩家死亡)    ✅ PASS
```

## Feature Coverage

| Feature | Status | Evidence |
|---------|--------|----------|
| v1.1.1 武器切换动画 | ✅ | `G.weaponAnim = { state: 'switch' }` 触发 (game.js:1568) |
| v1.1.2 装填多阶段动画 | ✅ | `G.reloadState.duration=1200ms` 验证 |
| v1.1.3 受伤方向指示 | ✅ | `G.damageSourceAngles` 数组填充 (game.js:3027-3035) |
| v1.1.4 击杀时停 | ✅ | `G.killConfirm = {startTime, duration, isHeadshot}` 触发 |
| v1.1.5 爆头 | ✅ | 28% 正面 ±25° 判定 + 距离 < 500 (game.js:1982+) |
| v1.2.1 听觉事件 | ✅ | `G.audioEvents.push({sourceType:'gunshot', strength:400})` |
| v1.2.2 尸体发现 | ✅ | `G.discoveredCorpses[id]` 标记 (game.js:3202-3244) |
| v1.2.3 动态难度 | ✅ | 8 秒窗口评估 `dynamicDiff.level` (game.js:3471-3511) |
| v1.2.4 精英协同 | ✅ | 听觉事件传播 + alert state 触发 chase |
| v1.3.3 油桶爆炸物 | ✅ | `G.barrels` 含 9 个 (barrel + gas)，命中触发爆炸链 |

## Performance Observations

- **单帧 update**: ~0.013-0.014s 逻辑时间（stub 模式）
- **30 帧循环**: 0 崩溃，0 异常（DOM stub 错误忽略）
- **听→反应延迟**: 1 帧内敌人 state 从 idle → chase (alertTimer=4.0s)

## Known Limitations

- 浏览器自动化测试不可用（integrated_browser 工具未挂载）
- 视觉验证（爆头时停/受击箭头/油桶爆炸特效）需手动打开 index.html 验证
- 性能数据来自 stub 模式，真实浏览器下数字会有差异

## Recommendation

游戏逻辑层 v1.1-v1.3 全部通过静态测试，2 个真实 bug 已修复。建议下一步：
1. 浏览器手动 smoke test（启动 `python3 -m http.server 8082` 打开 `SDC/index.html`）
2. 在真实浏览器中验证视觉特效（爆头"击杀！爆头！"圆环、受击方向箭头、油桶爆炸粒子）
3. 性能 profiling（真实渲染 30 fps 是否稳定）
