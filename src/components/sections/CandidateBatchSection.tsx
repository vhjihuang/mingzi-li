import { motion } from 'motion/react';
import { CandidateCard } from '../cards/CandidateCard';
import { Candidate, FeedbackRecord, FeedbackType, AppState } from '../../types/naming';
import { Loader2 } from 'lucide-react';
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference';

interface Props {
  appState?: AppState;
  surname?: string;
  candidates: Candidate[];
  feedbacks: Record<string, FeedbackRecord>;
  onFeedback: (id: string, type: FeedbackType, reason: string | null) => void;
}

export function CandidateBatchSection({ appState, surname, candidates, feedbacks, onFeedback }: Props) {
  const isGenerating = appState === 'generating_batch1';
  const likedCount = Object.values(feedbacks).filter((feedback) => feedback.type === 'like').length;
  const prefersReducedMotion = useReducedMotionPreference();

  return (
    <motion.section 
      id="batch-section"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6 }}
      className="space-y-6"
      aria-busy={isGenerating}
    >
      <div className="flex items-center gap-4">
        <div className="h-px bg-gray-300 flex-1"></div>
        <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-500">第一批候选</h2>
        <div className="h-px bg-gray-300 flex-1"></div>
      </div>

      {isGenerating ? (
        <div role="status" aria-live="polite" className="min-h-[600px] flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-gray-500 font-medium animate-pulse">正在生成初版名字清单，请稍候...</p>
        </div>
      ) : (
        <>
          <div className="text-center text-sm md:text-base text-gray-500 mb-4">
            💡 至少评价一个名字即可解锁下方微调，评价越多推荐越准；最多保留 3 个“喜欢”。
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {candidates.map((candidate, i) => (
              <motion.div 
                key={candidate.id}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={prefersReducedMotion ? { duration: 0 } : { delay: i * 0.05, type: "spring", stiffness: 200, damping: 20 }}
              >
                <CandidateCard 
                  candidate={candidate} 
                  feedback={feedbacks[candidate.id]}
                  canSelectLike={feedbacks[candidate.id]?.type === 'like' || likedCount < 3}
                  onFeedback={(type, reason) => onFeedback(candidate.id, type, reason)}
                />
              </motion.div>
            ))}
          </div>
        </>
      )}
    </motion.section>
  );
}
