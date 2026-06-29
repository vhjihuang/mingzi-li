import type { Candidate, RefinedCandidate } from '../types/naming.ts';

export const mockBatch1: Candidate[] = [
  { id: '1', name: '林清和', meaning: '温和有分寸，整体气质清润平和。', origin: '意象偏向清雅与和顺。' },
  { id: '2', name: '林知远', meaning: '偏向有志向、看得长远，风格端正明朗。', origin: '意象偏向志远与修身。' },
  { id: '3', name: '林若谷', meaning: '谦虚包容，有稳重感。', origin: '出自"虚怀若谷"。' },
  { id: '4', name: '林溪晏', meaning: '自在开阔，带着一点书卷清气。', origin: '意境如清溪般明朗、宁静。' },
  { id: '5', name: '林修齐', meaning: '正直有原则，带有古典的端正意味。', origin: '出自"修身齐家"。' },
  { id: '6', name: '林景初', meaning: '有朝气，但不锋芒毕露。', origin: '意为初升的太阳、新的希望。' },
  { id: '7', name: '林风叙', meaning: '沟通顺畅，性格温和外向。', origin: '如和风徐徐展开。' },
  { id: '8', name: '林度微', meaning: '有分寸感，做事细致谦和。', origin: '体察入微，进退有度。' },
];

// tip 字段留空，后端 applyObjectiveTip() 会用 cnchar 自动填充拼音和笔画信息
export const mockShortlists: RefinedCandidate[][] = [
  [
    {
      id: 's1',
      name: '林修远',
      meaning: '有志向、懂节制，兼具书卷气与广度。',
      origin: '出自《楚辞》"路漫漫其修远兮"。',
      coreMeaning: '修养自身，目光深远',
      fitReason: '"修远"完美契合了你想要的"更稳一点"的期许，同时回应了你在初选时对"有志向"的偏好。它不仅有深厚的底蕴，还能传达出一种沉得住气的人生态度。',
      tip: '',
    },
    {
      id: 's2',
      name: '林以忱',
      meaning: '真诚待人，有原则但依然温润。',
      origin: '"忱"字意为真诚、情真意切。',
      coreMeaning: '至诚至真，品格端庄',
      fitReason: '避开了上榜频次极高的古风字，用"忱"字（意为情意真切）替代了常见的表意字，成功平衡了"不落俗套"与"平易近人"。',
      tip: '',
    },
    {
      id: 's3',
      name: '林景行',
      meaning: '光明正直，让人心生敬意却又觉得亲近。',
      origin: '出自《诗经》"高山仰止，景行行止"。',
      coreMeaning: '行事光明，德高望重',
      fitReason: '你特意提到"别太软"，这组名字带有明确的骨架和大气感，行事光明端正，给人一种非常可靠的第一印象。',
      tip: '',
    }
  ],
  [
    {
      id: 's4',
      name: '林砚秋',
      meaning: '文雅端庄，带有一丝清冷的秋意。',
      origin: '"砚"指笔墨纸砚，代表文气；"秋"带来清爽纯净的感受。',
      coreMeaning: '文气浸润，澄洁清秋',
      fitReason: '完美满足了你想要的"更有书卷气"的需求。我们避开了"轩/宇/博"等常规套路，用"砚"这个具体意象直接拉满了文化质感，搭配"秋"字，清净通透。',
      tip: '',
    },
    {
      id: 's5',
      name: '林归远',
      meaning: '心胸开阔，不随波逐流。',
      origin: '出自刘长卿"荷笠带斜阳，青山独归远"。',
      coreMeaning: '返璞归真，志趣高远',
      fitReason: '完美契合"更有志向感"和"更自然一点"的要求。意境极其宽阔，传递的不是名利场的进取，而是精神境界的超越。',
      tip: '',
    },
    {
      id: 's6',
      name: '林初霁',
      meaning: '干净明朗，像雨后初晴一样令人舒畅。',
      origin: '出自"雨后初霁"。',
      coreMeaning: '雨后天晴，明朗开阔',
      fitReason: '你提到"不要太柔"，初霁虽然属于自然景象，但"霁"字带有扫除阴霾的果断，给人一种爽利和坦荡的感觉，柔中带刚。',
      tip: '',
    }
  ]
];
