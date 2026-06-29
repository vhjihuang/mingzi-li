import { REFINEMENT_TAGS, REFINEMENT_TAGS_POOL } from '../../constants/tags';
import { AppState } from '../../types/naming';
import { Loader2, Lock, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';

interface Props {
  appState: AppState;
  hasFeedbacks: boolean;
  selectedRefinements: string[];
  toggleRefinement: (t: string) => void;
  refinementInput: string;
  setRefinementInput: (s: string) => void;
  onGenerateShortlist: () => void;
}

export function RefinementSection({
  appState, hasFeedbacks, selectedRefinements, toggleRefinement,
  refinementInput, setRefinementInput, onGenerateShortlist
}: Props) {
  const isGenerating = appState === 'generating_shortlist';
  const disabled = isGenerating || !hasFeedbacks;

  const [displayedTags, setDisplayedTags] = useState(REFINEMENT_TAGS);

  // restart 后 selectedRefinements 清空时，重置标签展示为初始集
  useEffect(() => {
    if (selectedRefinements.length === 0) {
      setDisplayedTags(REFINEMENT_TAGS);
    }
  }, [selectedRefinements.length]);

  const handleRefreshTags = () => {
    const availablePool = REFINEMENT_TAGS_POOL.filter(tag => !selectedRefinements.includes(tag));
    const shuffled = [...availablePool].sort(() => Math.random() - 0.5);
    const tagsNeeded = Math.max(0, 7 - selectedRefinements.length);
    const newTags = shuffled.slice(0, tagsNeeded);
    setDisplayedTags([...selectedRefinements, ...newTags]);
  };

  return (
    <motion.section
      id="refinement-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className={`bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200 mt-4 transition-all duration-300 ${!hasFeedbacks ? 'opacity-80 bg-gray-50 border-dashed' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-xl font-medium tracking-tight ${!hasFeedbacks ? 'text-gray-400' : 'text-gray-900'}`}>
          再收窄一点，我们会重新帮你筛一轮。
        </h2>
        {!hasFeedbacks && <Lock className="w-5 h-5 text-gray-300" />}
      </div>
      
      {!hasFeedbacks && (
        <p className="text-sm text-gray-500 mb-6 flex items-center gap-2">
          (需要您先在上方对至少一个名字完成“喜欢 / 一般 / 不喜欢”的评价，以解锁深度微调)
        </p>
      )}
      
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">快速选择微调方向：</span>
            <button 
              onClick={handleRefreshTags}
              disabled={disabled}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              换一批选项
            </button>
          </div>
          <div className="flex flex-wrap gap-2 md:gap-3">
            {displayedTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleRefinement(tag)}
                disabled={disabled}
                className={`px-4 py-2.5 rounded-full border text-sm transition-all duration-200 cursor-pointer
                  ${selectedRefinements.includes(tag) 
                    ? 'bg-gray-900 text-white border-gray-900 shadow-md' 
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <input
            type="text"
            placeholder="补充一句，例如：想保留温和感，但别太软..."
            value={refinementInput}
            onChange={e => setRefinementInput(e.target.value)}
            disabled={disabled}
            maxLength={100}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>

        <div>
          <button 
            onClick={onGenerateShortlist}
            disabled={disabled}
            className="w-full md:w-auto px-8 py-3.5 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isGenerating && <Loader2 className="w-5 h-5 animate-spin" />}
            {isGenerating ? '精细筛选中...' : '基于我的反馈重新筛一轮'}
          </button>
        </div>
      </div>
    </motion.section>
  );
}
