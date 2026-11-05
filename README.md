# 残局拆弹手 / Last Round Defuse

原创港口仓库第一人称爆破回合原型，**v0.1.1**。Vite + Three.js + TypeScript。

**在线游玩：https://Tina2088.github.io/last-round-defuse/**

需要桌面浏览器、WebGL 2、键盘与鼠标。点击「进入港口」锁定指针；Esc 暂停。所有场景、人物和武器均为原创程序化灰盒，音效由 Web Audio 合成，无第三方游戏资产。

## 本地运行

Node.js 22.12+（验证环境：Node 24.19.0）。

```powershell
cd D:\tinacode\last-round-defuse
npm ci
npm run dev
```

打开 http://127.0.0.1:5173/last-round-defuse/ 。

```powershell
npm test
npm run build
npm run preview
```

预览地址 http://127.0.0.1:4173/last-round-defuse/ 。

浏览器回归需要本机 Google Chrome，先在另一终端启动开发服务器，再运行 `npm run test:browser`。`npm run test:public` 检查公开 Pages 的生产界面。截图与 JSON 结果写到仓库内 `test-results/`；交付证据选存于 `docs/qa/`。生产构建不包含开发测试状态入口。

## 操作

| 操作 | 输入 |
| --- | --- |
| 移动 / 静步 / 蹲 / 跳 | WASD / Shift / Ctrl / 空格 |
| 瞄准 / 射击 | 鼠标 / 左键 |
| 换弹 / 步枪、手枪、刀 | R / 1、2、3 |
| 下包 / 拆包 | 包点 / 炸弹附近按住 E |
| 暂停 | Esc，切换标签页也自动暂停 |
| 中英切换 | 局内按 L（含观战），或暂停菜单右上角语言按钮 |
| 重开整场 | 暂停或结算后 R，也可点击菜单按钮 |

## 规则

- 无买枪经济；每回合固定步枪、手枪、刀，生命 100，爆头伤害 ×2。
- 最多 8 回合，第 4 回合结束换边；先赢 5 回合获胜，4:4 平局。比分跟随队伍。
- 回合 105 秒；未下包时超时守方胜，任一方全灭则另一方胜。
- 中性黄环 A/B 点内按住 E 3 秒下包；拆包需 5 秒，无拆弹器。松手、受伤、离开范围会清零。
- 下包后改为独立 40 秒倒计时；只以拆除或爆炸结算，攻方全灭不会终止倒计时。
- 1v1、2v2、3v3；玩家占我方一个名额，其余均为 AI。简单 / 普通两档。
- 攻方橙色躯干、尖顶头盔与三角肩标；守方青色躯干、方形头盔与矩形肩标。阵亡后观战队友，没有存活队友时显示俯瞰视角。

## 部署

`vite.config.ts` 固定 `base: '/last-round-defuse/'`。登录有仓库写入权限的 GitHub 账号后运行 `npm run deploy`，构建并将 **dist 的内容**发布到 `gh-pages` 分支。GitHub Pages 的来源设置为该分支根目录。源代码保存在 `main` 分支。

设计约束见 [DEV-TASK-002](docs/DEV-TASK-002.md)，验收证据及已知问题见 [DEV-REPORT](docs/DEV-REPORT.md)。
