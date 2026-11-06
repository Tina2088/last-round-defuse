# DEV-TASK-006 · v0.1.2.1 开局选阵营 + 简单难度下调

工作目录：D:\tinacode\last-round-defuse
公开地址：https://tina2088.github.io/last-round-defuse/
页面版本号改为 **v0.1.2.1**

## 1. 开局选阵营（方案 A，制作人已定）
开始菜单加「进攻方 / 防守方」选择（橙/青大按钮或清晰选项），默认可选防守。
选定后：本场前 4 回合玩家固定为该阵营；第 4 回合后仍按定稿换边。
实现建议：`Game` 增加 `startSide: 'attack' | 'defend'`（或 `playerStartTeam`），改 `side()`：
- 若 startSide==='attack'：round<=4 时 team0=attack（现状）
- 若 startSide==='defend'：round<=4 时 team0=defend，round>4 时 team0=attack
出生点、yaw、HUD 阵营色、小地图立刻对上。
持久化可选：localStorage 记住上次选择。
中英文 i18n。

## 2. 简单难度下调（临时值，待策划定稿可再改）
在 `bot()` 中降低 easy：
- 反应阈值：0.8 → **1.35**
- 命中率：0.15 → **0.06**
- 爆头率：0.08 → **0.02**（仅 easy）
第一回合开局 3 秒内 AI 不主动开火（grace），避免一出门被秒。
代码里用常量并注释「v0.1.2.1 临时；等策划数值替换」。

## 3. 测试
- 选防守开局：玩家出生在守方点（z≈-23），能接近炸弹点按 E 拆包（需攻方先下包或用测试）。
- 选进攻开局：行为与现网一致。
- 第 4→5 回合换边正确，比分跟随队伍。
- 原有 npm test 全过；补阵营选择与 easy 参数单测。

## 交付
npm test、build、deploy Pages；更新 DEV-REPORT；群可见版本 v0.1.2.1。
不要做高精度枪模（那是后续版本）。
