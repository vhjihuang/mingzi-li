import { motion } from 'motion/react';
import { ShortlistCard } from '../cards/ShortlistCard';
import { RefinedCandidate, AppState } from '../../types/naming';
import { Bookmark, Copy, Check } from 'lucide-react';
import copy from 'copy-to-clipboard';
import { useState } from 'react';
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference';

interface Props {
  appState?: AppState;
  surname?: string;
  candidates: RefinedCandidate[];
  bookmarkedNames: Set<string>;
  savedCandidates: RefinedCandidate[];
  onBookmark: (id: string) => void;
  onEdit: () => void;
  onSwapGroup: () => void;
  onRefineMore: () => void;
}

export function ShortlistSection({ 
  appState, surname, candidates, bookmarkedNames, savedCandidates,
  onBookmark, onEdit, onSwapGroup, onRefineMore
}: Props) {
  const isGenerating = appState === 'generating_shortlist';
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const prefersReducedMotion = useReducedMotionPreference();

  /** 将候选名字格式化为纯文本，复制到剪贴板 */
  const handleCopy = () => {
    const text = candidates.map((c, i) => {
      const parts = [`${i + 1}. ${c.name}`];
      if (c.coreMeaning) parts.push(`   核心寓意：${c.coreMeaning}`);
      if (c.meaning) parts.push(`   寓意：${c.meaning}`);
      if (c.origin) parts.push(`   取意说明：${c.origin}`);
      if (c.fitReason) parts.push(`   契合理由：${c.fitReason}`);
      if (c.tip) parts.push(`   读音与笔画：${c.tip}`);
      return parts.join('\n');
    }).join('\n\n');

    const copied = copy(text);
    setCopyStatus(copied ? 'success' : 'error');
    setTimeout(() => setCopyStatus('idle'), 2000);
  };

  return (
    <motion.section
      id="shortlist-section"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6 }}
      className="space-y-6"
      aria-busy={isGenerating}
    >
      <div className="flex items-center gap-4">
        <div className="h-px bg-gray-300 flex-1"></div>
        <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-500">精细推荐结果</h2>
        <div className="h-px bg-gray-300 flex-1"></div>
      </div>

      {isGenerating ? (
        <div role="status" aria-live="polite" className="space-y-4">
          <p className="text-center text-gray-500 font-medium animate-pulse">正在进行深度重筛与匹配，请稍候...</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded-lg border border-gray-200 bg-white p-6 animate-pulse">
                <div className="mb-4 h-8 w-28 rounded bg-gray-200" />
                <div className="mb-2 h-4 w-full rounded bg-gray-100" />
                <div className="mb-2 h-4 w-5/6 rounded bg-gray-100" />
                <div className="mb-6 h-4 w-4/5 rounded bg-gray-100" />
                <div className="h-16 w-full rounded-lg bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {candidates.map((candidate, i) => (
              <motion.div
                key={candidate.id}
                data-candidate-card
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={prefersReducedMotion ? { duration: 0 } : { delay: i * 0.15, type: "spring", stiffness: 200, damping: 20 }}
                className="h-full"
              >
                <ShortlistCard 
                  candidate={candidate} 
                  isBookmarked={bookmarkedNames.has(candidate.name.normalize('NFC').trim())}
                  onBookmark={() => onBookmark(candidate.id)}
                  onEdit={onEdit}
                />
              </motion.div>
            ))}
          </div>

          <div className="pt-8 flex flex-col items-center gap-4">
            <div className="flex flex-col md:flex-row justify-center gap-4 w-full">
              <button
                onClick={onSwapGroup}
                className="px-8 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all cursor-pointer"
              >
                再换一组
              </button>
              <button
                onClick={handleCopy}
                aria-label="复制候选名字到剪贴板"
                className="px-8 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {copyStatus === 'success' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制候选名字'}
              </button>
              <button
                onClick={onRefineMore}
                className="px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-all cursor-pointer"
              >
                继续微调
              </button>
            </div>
            {savedCandidates.length > 0 && (
              <div className="w-full max-w-2xl bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Bookmark className="w-4 h-4 text-brand-600" />
                  <span className="text-sm font-medium text-gray-800">已收藏 {savedCandidates.length} 个名字</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {savedCandidates.map(c => (
                    <span key={c.id} className="px-3 py-1 bg-white rounded-full text-sm text-gray-700 border border-gray-200">
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {copyStatus === 'success' ? '候选名字已复制到剪贴板' : copyStatus === 'error' ? '复制失败，请手动选择文本复制' : ''}
          </span>
        </>
      )}
    </motion.section>
  );
}
