# 出包魔法師 Online final_v5

## 執行
```bash
npm.cmd install
npm.cmd start
```
開啟 http://localhost:3000

## 素材
- `public/assets/board/board.png`：中央法術板
- `public/assets/spells/1.png` ~ `8.png`：法術圖
- `public/assets/characters/11.png` `22.png` `33.png` `44.png` `55.png`：角色圖
- `public/assets/ui/0.png`：石板背面

## 音效檔名
放到 `public/assets/sounds/`：
- `dragon.mp3`
- `ghost.mp3`
- `sleep.mp3`
- `owl.mp3`
- `thunder.mp3`
- `blizzard.mp3`
- `fireball.mp3`
- `slime.mp3`
- `fail.mp3`
- `death.mp3`
- `victory.mp3`
- `start_game.mp3`
- `countdown.mp3`

沒有對應音效檔時，成功施法不跑長動畫，避免拖節奏。

## 已合併規則重點
- 2~5 人。
- 角色與顏色不可重複。
- 房主開始前要所有真人玩家按「我已就緒」。
- Demo 可一人預覽。
- 自己只看得到石板背面，其他玩家牌看得到。
- 中央 4 顆貓頭鷹預備石；偷看後暫時少 1 顆，玩家面前出現蓋著情報；一輪結束後情報 +1 分並回到中央。
- 回合順序永遠順時針：5 人時為「你 → 翠襄 → 翔翔 → 鼎竣 → 琇琇 → 你」。
- 左手邊 = 下家 = 順時針下一位；右手邊 = 上家 = 順時針上一位。
- 1：成功骰 1~3，其他所有玩家扣骰點；失敗自己骰並扣骰點。
- 2：其他所有玩家 -1，自己只 +1。
- 3：骰 1~3，自己回骰點生命。
- 4：貓頭鷹情報。
- 5：左手邊 -1，右手邊 -1。
- 6：左手邊 -1。
- 7：右手邊 -1。
- 8：自己 +1 生命。
- 喊中才播放該法術大動畫和音效；喊錯只扣血、失敗音效。
- 有人死亡或清空手牌就本局結束；分數未達 8 可按下一局重洗重發、血量回 6、分數保留。
- 分數 >= 8 顯示「恭喜 XXX 成為巨屌大魔術師」，按鈕變重新開始。
