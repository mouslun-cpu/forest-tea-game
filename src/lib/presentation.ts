import type { Feature, Phase } from './types';
export const featureInfo: Record<Feature, { label: string; question: string; yes: string; no: string; icon: string }> = {
  afternoon: { label: '下午茶', question: '是下午茶時段嗎？', yes: '下午茶時段', no: '其他時段', icon: '☀️' },
  company: { label: '同行人數', question: '有人一起買嗎？', yes: '結伴來買', no: '一個人來', icon: '👫' },
  discount: { label: '套餐優惠', question: '有套餐折扣嗎？', yes: '有套餐折扣', no: '沒有折扣', icon: '🎟️' },
  takeaway: { label: '內用外帶', question: '要外帶嗎？', yes: '外帶回家', no: '留在店裡', icon: '🛍️' },
};
export const features = Object.keys(featureInfo) as Feature[];
export const avatars = ['🐻', '🐰', '🦊', '🐼', '🐨', '🐸'];
export const stages: {phase: Phase; name: string; english: string; subtitle: string; icon: string; note: string}[] = [
  { phase: 'tree', name: '店長的第一棵樹', english: 'DECISION TREE', subtitle: '挑幾個問題，找到你的判斷方式。', icon: '🌱', note: '請學生觀察過去訂單，用最多兩層問題建立規則。新客人必須沿著規則走，不能臨時憑直覺改答案。' },
  { phase: 'bagging', name: '訂單袋大集合', english: 'BAGGING', subtitle: '分頭學習，讓不同的判斷一起發聲。', icon: '🧺', note: '訂單有放回抽樣：同一張可能出現很多次，也可能沒抽到。各自訓練，最後才投票；未提交的人不算反對票。' },
  { phase: 'forest', name: '一起長成森林', english: 'RANDOM FOREST', subtitle: '抽不同線索，種出不一樣的樹。', icon: '🌳', note: '沿用各人的訂單袋，每次分岔重新抽兩個候選線索。這是人手選問題的體驗版；實際模型會依分裂準則自動選擇。' },
  { phase: 'boosting', name: '錯題接力班', english: 'BOOSTING · ADABOOST', subtitle: '上一輪的盲點，成為下一輪的重點。', icon: '⚡', note: '每輪所有人都提案。系統依加權錯誤最少選模型，不依人氣。錯題增加關注籌碼，正確題仍保留；最後合併各輪模型。' },
];
export const phaseName = (phase: Phase) => stages.find(s => s.phase === phase)?.name ?? ({waiting:'準備開店',final:'新客人挑戰',reflection:'店長畢業考',ended:'今日圓滿打烊'} as Partial<Record<Phase,string>>)[phase] ?? phase;
export const questions = [
  { text: '把同一棵樹複製 20 次，就一定會更準嗎？', options: ['會，票多力量大', '不會，錯誤也一起複製了'], answer: 1, explanation: '大家用完全相同的規則，就會在同一個地方犯錯。' },
  { text: '哪種方法，要等前一輪結果才能調整學習重點？', options: ['Bagging：分頭學習', 'Boosting：循序糾錯'], answer: 1, explanation: 'Boosting 的後一輪會根據前面的結果，補上新的模型。' },
  { text: '隨機森林，究竟隨機在哪裡？', options: ['抽訂單，以及每次分岔考慮的線索', '每位客人的答案隨便猜'], answer: 0, explanation: '抽樣是隨機的，判斷仍然要根據資料。' },
];
