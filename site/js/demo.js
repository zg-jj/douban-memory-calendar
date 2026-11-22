import {MediaRecord,ExperienceEvent} from './domain.js';

export function createDemoSnapshot(items){
  const ids=new Set(items.map(item=>item.id));
  const rows=[
    ['blue-gate','2026-11-01',5,'电影中的夏天让人想起成长。','示例｜一个安静的周日，留给蓝色的夏天。'],
    ['gone-wind','2026-11-03',4,'慢慢读完的一本长篇。','示例｜在书页间停留，终于读到最后一页。'],
    ['spirited','2026-11-05',5,'再次走进宫崎骏的世界。','示例｜忙碌之后，给自己一个完整的夜晚。'],
    ['enya','2026-11-06',4,'适合安静时聆听。','示例｜窗外下雨，音乐轻轻陪伴。'],
    ['puujee','2026-11-08',5,'草原上的风景与生命。','示例｜认真看完一部纪录片。'],
    ['brilliant-series','2026-11-10',5,'友谊与成长留下许多问题。','示例｜这一季结束了，仍想继续回味。'],
    ['little-prince','2026-11-12',4,'为熟悉的故事停一停。','示例｜午后的书桌边。'],
    ['enya','2026-11-12',5,'再听时注意到不同的旋律。','示例｜同一张专辑，不同的心境。'],
    ['totoro','2026-11-12',5,'温柔的陪伴。','示例｜一次共同观影。'],
    ['kikujiro-music','2026-11-12',4,'钢琴声里有夏天。','示例｜给一天留下轻快的尾声。'],
    ['whisper','2026-11-14',4,'日常也可以闪闪发光。','示例｜周末完整地看完。'],
    ['blue-gate','2026-11-16',4,'重看时看到了新的细节。','示例｜同一部作品的第二次相遇。'],
    ['spirited-music','2026-11-18',5,'熟悉的旋律再次响起。','示例｜音乐让故事继续。'],
    ['totto-chan','2026-11-22',4,'关于童年和理解。','示例｜长篇阅读之外的一次停留。'],
    ['brilliant-book','2026-11-26',5,'文字与影像有不同的节奏。','示例｜读完后又想起剧中的场景。'],
    ['enya','',0,'日期记不清，感受还在。','示例｜未知日期仍保留，不把补记时间当作体验日期。']
  ].filter(row=>ids.has(row[0]));
  const createdAt='2026-11-01T08:00:00.000Z';
  const events=rows.map(([itemId,experiencedAt,rating,comment,memory],index)=>new ExperienceEvent({
    id:`demo-event-${index+1}`,itemId,experiencedAt,rating,comment,memory,
    createdAt:new Date(Date.parse(createdAt)+index*1000).toISOString(),updatedAt:createdAt
  }));
  const records=[...new Set(rows.map(row=>row[0]))].map(itemId=>new MediaRecord({itemId,status:'done',rating:rows.find(row=>row[0]===itemId)[2],comment:'示例收藏评分，用于演示推荐；每次体验评分单独保存。'}));
  return {items,records,events};
}
