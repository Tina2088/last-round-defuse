# DEV-TASK-005 · 规则热修 + v0.1.2 高精度武器（Blender）

工作目录：D:\tinacode\last-round-defuse
公开地址：https://tina2088.github.io/last-round-defuse/
Blender：`C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`（5.0.1）
后台无头：`blender -b -P script.py`

## A. 规则热修（必须先做，补 v0.1.1 漏项）
制作人定稿：包已下好后，防守方全灭 → 进攻方立即获胜；进攻方全灭 → 回合继续至拆包或爆炸。

改 `src/game.ts` 的 `checkElimination`：有 bomb 时，仅当守方全灭则 `end('attack','elimination')`；攻方全灭仍 return 不结算。
更新 `src/i18n.ts` 中英文 `plantedRule`。
更新 `tests/game.test.ts`：把「defenders eliminated after plant still resolves at detonation」改成立即攻方胜；保留「attackers eliminated after plant does not end round」。
热修后 bump 可见版本为 **v0.1.1** 补丁说明，或若已部署则再 deploy 一次同一地址（页面版本可标 v0.1.1+rule9 / 仍写 v0.1.1 但 DEV-REPORT 写明规则已改）。优先：版本字符串改为 **v0.1.2** 仅当武器也做完；若武器未完，先以 **v0.1.1b** 或保持 v0.1.1 并在报告写「规则第9项补丁」。建议：规则热修单独先 deploy 一次（界面仍可写 v0.1.1，报告注明补丁），再做武器。

## B. v0.1.2 高精度模型（Tina：直接用 Codex+Blender 做高精度）
范围（制作人最新）：第一人称步枪+手臂、手枪、C4。刀可暂留。不用 Valve/CS 资产。

美术规格：
- 步枪：弯弧弹匣、木质护木+枪托、金属机匣/导气管、准星座+照门；深木棕+枪铁灰+深灰弹匣；一眼像 AK；界面名仍叫「步枪」。
- 技术：枪+手 ≤8k 三角；贴图 ≤1024；枪口不盖准星中心；机匣上沿低于准星约 8–12% 屏高。
- 动画状态：idle / fire / reload / switch；射击短后坐；换弹约 2.2–2.6s。
- 手枪、C4：写实低模；贴图 ≤1024。

流程：
1. 在仓库建 `tools/blender/` 建模脚本（可复现），用 Blender 5.0.1 CLI 生成几何+简单漫反射贴图。
2. 导出 `public/models/` 或 `src/assets/models/`：`rifle_fp.glb`、`pistol.glb`、`c4.glb`（嵌入贴图）。
3. 渲染预览图到 `docs/qa/preview-rifle.png` 等；先停在「模型可用」阶段也可先接进游戏。Tina 要求直接高精度接进，所以接进 Three.js 第一人称挂载，替换占位几何。
4. 开火枪口火光 + 后坐动画；换弹/切枪可打断且回合重置时状态清零。
5. 报告首屏加载体积（gzip 前后）与简易帧率对比；体积暴涨则减面/压贴图。

## 交付
- npm test、npm run build 通过
- deploy GitHub Pages
- 更新 docs/DEV-REPORT.md：规则补丁 + 模型变更、体积、帧率、预览图路径
- 建模脚本入库

约束：同一时间只改本仓库；禁止 CS/Valve 资源；武器 UI 文案不出现 AK/CS 商标名。
