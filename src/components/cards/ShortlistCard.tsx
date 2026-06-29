import { RefinedCandidate } from '../../types/naming';
import { Bookmark, PenSquare, Target, BookOpen, Lightbulb } from 'lucide-react';

interface ShortlistCardProps {
  candidate: RefinedCandidate;
  isBookmarked?: boolean;
  onBookmark?: () => void;
  onEdit?: () => void;
}

export function ShortlistCard({ candidate, isBookmarked, onBookmark, onEdit }: ShortlistCardProps) {
  return (
    <div className="border hover:border-gray-300 transition-all bg-white rounded-2xl p-6 shadow-sm overflow-hidden relative h-full flex flex-col group">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-3xl font-medium tracking-tight mb-2 text-gray-900 group-hover:text-black transition-colors">
            {candidate.name}
          </h3>
          <p className="text-gray-500 text-sm font-mono tracking-tight">{candidate.coreMeaning}</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onBookmark}
            className={`p-2 border rounded-full transition-all cursor-pointer ${isBookmarked ? 'text-yellow-500 border-yellow-200 bg-yellow-50 shadow-inner' : 'text-gray-400 hover:text-gray-900 border-transparent hover:border-gray-200 hover:bg-gray-50'}`} 
            title="收藏"
          >
            <Bookmark className="w-5 h-5" fill={isBookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="space-y-4 flex-1">
        {/* Origin / Source */}
        <div className="pt-2">
          <div className="flex items-center gap-1.5 mb-1.5 text-gray-400">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold tracking-wider">典故出处</span>
          </div>
          <p className="text-gray-700 text-sm leading-relaxed">{candidate.origin}</p>
        </div>
        
        {/* Why it fits */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5 text-gray-400">
            <Target className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold tracking-wider">契合解析</span>
          </div>
          <p className="text-gray-800 text-sm leading-relaxed">{candidate.fitReason}</p>
        </div>

        {/* Tip */}
        {candidate.tip && (
          <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100/50">
            <div className="flex items-center gap-1.5 mb-1 text-amber-600">
              <Lightbulb className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold tracking-wider">读音与笔画</span>
            </div>
            <p className="text-amber-800/80 text-xs leading-relaxed">{candidate.tip}</p>
          </div>
        )}
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-100">
        <button 
           onClick={onEdit}
           className="w-full py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <PenSquare className="w-4 h-4" /> 调整微调方向
        </button>
      </div>
    </div>
  );
}
