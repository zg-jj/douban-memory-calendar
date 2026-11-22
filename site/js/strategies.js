export class RecommendationStrategy {
  recommend() { throw new Error('子类应实现 recommend'); }
}
const preferences = ['成长', '女性', '自然', '温暖', '青春'];
export class TagRecommendationStrategy extends RecommendationStrategy {
  recommend(items, records) {
    const done = new Set(records.filter(r => r.status === 'done').map(r => r.itemId));
    const liked = records.filter(r => r.status === 'done' && r.rating >= 4);
    const profile = new Map();
    for (const record of liked) {
      const item = items.find(item => item.id === record.itemId);
      for (const tag of item?.tags || []) {
        profile.set(tag, (profile.get(tag) || 0) + record.rating - 3);
      }
    }
    const cold = profile.size === 0;
    if (cold) for (const tag of preferences) profile.set(tag, 1);
    return items.filter(item => !done.has(item.id)).map(item => {
      const matches = item.tags.filter(tag => profile.has(tag));
      const score = matches.reduce((sum, tag) => sum + profile.get(tag), 0) * 10;
      const reasons = [
        cold ? '初次相遇：固定偏好标签起点' : '来自你评为 4 星及以上的已体验作品',
        matches.length ? `共同标签：${matches.join('、')}` : '尝试拓宽一种新的题材'
      ];
      return {item, score, reasons};
    }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  }
}
export class DiverseRecommendationStrategy extends RecommendationStrategy {
  recommend(items, records) {
    const done = new Set(records.filter(r => r.status === 'done').map(r => r.itemId));
    const groups = ['movie', 'book', 'music'].map(type =>
      items.filter(item => item.type === type && !done.has(item.id)));
    const result = [];
    let round = 0;
    while (groups.some(group => group.length)) {
      for (const group of groups) {
        const item = group.shift();
        if (item) result.push({item, score: 100 - round, reasons: [
          '书、影、音交替推荐，拓宽相遇的范围', '同类按固定作品目录顺序相遇'
        ]});
      }
      round++;
    }
    return result;
  }
}
export class RecommendationService {
  constructor(strategy) { this.setStrategy(strategy); }
  setStrategy(strategy) {
    if (!strategy || typeof strategy.recommend !== 'function') {
      throw new Error('推荐策略无效');
    }
    this.strategy = strategy;
  }
  recommend(items, records) { return this.strategy.recommend(items, records); }
}
