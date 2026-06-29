import { motion } from 'motion/react';
import { ShortlistCard } from '../cards/ShortlistCard';
import { RefinedCandidate, AppState } from '../../types/naming';
import { Loader2, Bookmark, Copy, Check } from 'lucide-react';
import copy from 'copy-to-clipboard';
import { useState } from 'react';

interface Props {
  appState?: AppState;
  surname?: string;
  candidates: RefinedCandidate[];
  bookmarkedIds: Set<string>;
  savedCandidates: RefinedCandidate[];
  onBookmark: (id: string) => void;
  onEdit: () => void;
  onSwapGroup: () => void;
  onRefineMore: () => void;
}

export function ShortlistSection({ 
  appState, surname, candidates, bookmarkedIds, savedCandidates,
  onBookmark, onEdit, onSwapGroup, onRefineMore
}: Props) {
  const isGenerating = appState === 'generating_shortlist';
  const [copied, setCopied] = useState(false);

  /** 将候选名字格式化为纯文本，复制到剪贴板 */
  const handleCopy = () => {
    const text = candidates.map((c, i) => {
      const parts = [`${i + 1}. ${c.name}`];
      if (c.coreMeaning) parts.push(`   核心寓意：${c.coreMeaning}`);
      if (c.meaning) parts.push(`   寓意：${c.meaning}`);
      if (c.origin) parts.push(`   出处：${c.origin}`);
      if (c.fitReason) parts.push(`   契合理由：${c.fitReason}`);
      if (c.tip) parts.push(`   读音与笔画：${c.tip}`);
      return parts.join('\n');
    }).join('\n\n');

    copy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.section
      id="shortlist-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-6 !mt-12"
    >
      <div className="flex items-center gap-4">
        <div className="h-px bg-gray-300 flex-1"></div>
        <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-500">精细推荐结果</h2>
        <div className="h-px bg-gray-300 flex-1"></div>
      </div>

      {isGenerating ? (
        <div className="min-h-[700px] flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-gray-500 font-medium animate-pulse">正在进行深度重筛与匹配，请稍候...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {candidates.map((candidate, i) => (
              <motion.div 
                key={candidate.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.15, type: "spring", stiffness: 200, damping: 20 }}
                className="h-full"
              >
                <ShortlistCard 
                  candidate={candidate} 
                  isBookmarked={bookmarkedIds.has(candidate.id)}
                  onBookmark={() => onBookmark(candidate.id)}
                  onEdit={onEdit}
                />
              </motion.div>
            ))}
          </div>

          <div className="pt-8 flex flex-col items-center gap-4">
            {savedCandidates.length > 0 && (
              <div className="w-full max-w-2xl bg-amber-50/60 rounded-xl p-4 border border-amber-100/60">
                <div className="flex items-center gap-2 mb-2">
                  <Bookmark className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">已收藏 {savedCandidates.length} 个名字</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {savedCandidates.map(c => (
                    <span key={c.id} className="px-3 py-1 bg-white rounded-full text-sm text-gray-700 border border-amber-200">
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col md:flex-row justify-center gap-4 w-full">
              <button 
                onClick={onSwapGroup}
                className="px-8 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
              >
                再换一组
              </button>
              <button 
                onClick={handleCopy}
                className="px-8 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? '已复制' : '复制候选名字'}
              </button>
              <button 
                onClick={onRefineMore}
                className="px-8 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all cursor-pointer"
              >
                继续微调
              </button>
            </div>
          </div>
        </>
      )}
    </motion.section>
  );
}
