import { motion, AnimatePresence } from 'motion/react';
import { Smile, Meh, Frown } from 'lucide-react';
import { Candidate, FeedbackRecord, FeedbackType } from '../../types/naming';
import { CANDIDATE_REASONS } from '../../constants/tags';
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference';

interface CandidateCardProps {
  candidate: Candidate;
  feedback?: FeedbackRecord;
  canSelectLike: boolean;
  onFeedback: (type: FeedbackType, reason: string | null) => void;
}

export function CandidateCard({ candidate, feedback, canSelectLike, onFeedback }: CandidateCardProps) {
  const prefersReducedMotion = useReducedMotionPreference();
  const currentType = feedback?.type || null;
  const currentReason = feedback?.reason || null;

  const handleTypeClick = (type: FeedbackType) => {
    // Toggle off if same, otherwise set new. If type is 'like', clear the reason.
    const newType = currentType === type ? null : type;
    onFeedback(newType, newType === 'like' || !newType ? null : currentReason);
  };

  const handleReasonClick = (reason: string) => {
    // Toggle off reason if same
    const newReason = currentReason === reason ? null : reason;
    onFeedback(currentType, newReason);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-5 bg-white flex flex-col justify-between h-full">
      <div>
        <h3 className="text-2xl font-medium tracking-tight mb-3">
          {candidate.name}
        </h3>
        <ul className="space-y-1.5 text-sm md:text-base text-gray-600 mb-6 font-sans">
          <li>• {candidate.meaning}</li>
          <li>• {candidate.origin}</li>
        </ul>
      </div>

      <div>
        <hr className="border-gray-100 mb-4" />
        <div className="flex items-center gap-2 mb-3">
          <button 
            onClick={() => handleTypeClick('like')}
            disabled={currentType !== 'like' && !canSelectLike}
            aria-pressed={currentType === 'like'}
            title={currentType !== 'like' && !canSelectLike ? '短名单最多保留 3 个喜欢的名字' : undefined}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer
              ${currentType === 'like' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Smile className={`w-4 h-4 ${currentType === 'like' ? 'text-green-700' : 'text-green-500'}`} /> 喜欢
          </button>
          <button 
            onClick={() => handleTypeClick('neutral')}
            aria-pressed={currentType === 'neutral'}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer
              ${currentType === 'neutral' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Meh className={`w-4 h-4 ${currentType === 'neutral' ? 'text-orange-700' : 'text-orange-400'}`} /> 一般
          </button>
          <button 
            onClick={() => handleTypeClick('dislike')}
            aria-pressed={currentType === 'dislike'}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer
              ${currentType === 'dislike' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Frown className={`w-4 h-4 ${currentType === 'dislike' ? 'text-red-700' : 'text-red-500'}`} /> 不喜欢
          </button>
        </div>

        <AnimatePresence>
          {(currentType === 'neutral' || currentType === 'dislike') && (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : undefined}
              className="overflow-hidden"
            >
              <div className="pt-1 flex flex-wrap gap-2">
                {CANDIDATE_REASONS.map(r => (
                  <button
                    key={r}
                    onClick={() => handleReasonClick(r)}
                    aria-pressed={currentReason === r}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer
                      ${currentReason === r ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
