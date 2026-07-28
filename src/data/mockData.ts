import type { Candidate, RefinedCandidate } from '../types/naming.ts';

export const mockBatch1: Candidate[] = [
  { id: '1', name: '林清和', meaning: '温和有分寸，整体气质清润平和。', origin: '取意于清雅与和顺的意象。' },
  { id: '2', name: '林知远', meaning: '偏向有志向、看得长远，风格端正明朗。', origin: '取意于志远与修身的意象。' },
  { id: '3', name: '林若谷', meaning: '谦虚包容，有稳重感。', origin: '取意于“虚怀若谷”的谦逊包容之意。' },
  { id: '4', name: '林溪晏', meaning: '自在开阔，带着一点书卷清气。', origin: '取意于清溪明朗宁静的意象。' },
  { id: '5', name: '林修齐', meaning: '正直有原则，带有古典的端正意味。', origin: '取意于“修身齐家”的自我修养之意。' },
  { id: '6', name: '林景初', meaning: '有朝气，但不锋芒毕露。', origin: '取意于初升太阳与新生希望的意象。' },
  { id: '7', name: '林风叙', meaning: '沟通顺畅，性格温和外向。', origin: '取意于和风徐徐展开的意象。' },
  { id: '8', name: '林度微', meaning: '有分寸感，做事细致谦和。', origin: '取意于体察入微、进退有度的意象。' },
];

// tip 字段留空，后端 applyObjectiveTip() 会用 cnchar 自动填充拼音和笔画信息
export const mockShortlists: RefinedCandidate[][] = [
  [
    {
      id: 's1',
      name: '林修远',
      meaning: '有志向、懂节制，兼具书卷气与广度。',
      origin: '取意于修身致远的古典意象。',
      coreMeaning: '修养自身，目光深远',
      fitReason: '“修远”呼应了你想要“更稳一点”的期许，也回应了初选时对“有志向”的偏好。它兼具文化底蕴，并传达出沉得住气的人生态度。',
      tip: '',
    },
    {
      id: 's2',
      name: '林以忱',
      meaning: '真诚待人，有原则但依然温润。',
      origin: '取意于“忱”字真诚、情意真切之义。',
      coreMeaning: '至诚至真，品格端庄',
      fitReason: '避开了上榜频次极高的古风字，用"忱"字（意为情意真切）替代了常见的表意字，成功平衡了"不落俗套"与"平易近人"。',
      tip: '',
    },
    {
      id: 's3',
      name: '林景行',
      meaning: '光明正直，让人心生敬意却又觉得亲近。',
      origin: '取意于端正光明、令人敬重的意象。',
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
      origin: '取意于砚台与清秋的文雅意象。',
      coreMeaning: '文气浸润，澄洁清秋',
      fitReason: '较好地回应了“更有书卷气”的需求。避开“轩/宇/博”等常见用字，以“砚”的具体意象建立文气，搭配“秋”字，整体清净通透。',
      tip: '',
    },
    {
      id: 's5',
      name: '林归远',
      meaning: '心胸开阔，不随波逐流。',
      origin: '取意于远行与归山的开阔意象。',
      coreMeaning: '返璞归真，志趣高远',
      fitReason: '与“更有志向感”和“更自然一点”的方向相呼应。意境开阔，传递的不是名利场的进取，而是更重视精神境界的志趣。',
      tip: '',
    },
    {
      id: 's6',
      name: '林初霁',
      meaning: '干净明朗，像雨后初晴一样令人舒畅。',
      origin: '取“雨后初霁”的清朗意象。',
      coreMeaning: '雨后天晴，明朗开阔',
      fitReason: '你提到"不要太柔"，初霁虽然属于自然景象，但"霁"字带有扫除阴霾的果断，给人一种爽利和坦荡的感觉，柔中带刚。',
      tip: '',
    }
  ]
];
