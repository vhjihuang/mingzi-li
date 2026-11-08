import { motion } from 'motion/react';
import { CandidateCard } from '../cards/CandidateCard';
import { Candidate, FeedbackRecord, FeedbackType, AppState } from '../../types/naming';
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
        <div role="status" aria-live="polite" className="space-y-4">
          <p className="text-center text-gray-500 font-medium animate-pulse">正在生成初版名字清单，请稍候...</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded-lg border border-gray-200 bg-white p-5 animate-pulse">
                <div className="mb-4 h-7 w-24 rounded bg-gray-200" />
                <div className="mb-2 h-4 w-full rounded bg-gray-100" />
                <div className="mb-6 h-4 w-5/6 rounded bg-gray-100" />
                <div className="h-10 w-full rounded-lg bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="text-center text-sm md:text-base text-gray-500 mb-4">
            评价越多，推荐越准；最多选 3 个「喜欢」。
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {candidates.map((candidate, i) => (
              <motion.div
                key={candidate.id}
                data-candidate-card
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
