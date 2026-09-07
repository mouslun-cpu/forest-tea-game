import type { Order } from './types';

// 教學模擬資料 v1，僅由伺服器 API 匯入。封存題不能送入尚未揭曉的回應。
// 合成規則：下午茶、同行、折扣三項至少兩項成立時加點心；外帶是干擾線索。
// 練習集完整覆蓋三項線索的八種組合，各三次，方便手算單層樹的錯題。
function makeOrder(prefix: string, index: number, combination: number, takeaway: boolean): Order {
  const afternoon = Boolean(combination & 1);
  const company = Boolean(combination & 2);
  const discount = Boolean(combination & 4);
  return { id: `${prefix}-${String(index + 1).padStart(2, '0')}`, name: `${prefix === 'train' ? '練習' : prefix === 'observe' ? '觀察' : '新客'}訂單 ${index + 1}`,
    features: { afternoon, company, discount, takeaway }, label: Number(afternoon) + Number(company) + Number(discount) >= 2 ? 1 : 0 };
}

export const TRAIN_ORDERS: Order[] = Array.from({ length: 24 }, (_, i) => makeOrder('train', i, i % 8, Math.floor(i / 8) % 2 === 1));
export const OBSERVATION_ORDERS: Order[] = [1, 6, 2, 5, 3, 4].map((n, i) => makeOrder('observe', i, n, i % 2 === 0));
export const TEST_ORDERS: Order[] = [0, 1, 2, 3, 4, 5, 6, 7, 0, 3, 4, 7].map((n, i) => makeOrder('test', i, n, i % 2 === 1));
