import { EXPECTATION_TAGS, EXPECTATION_TAGS_POOL } from '../../constants/tags';
import { AppState } from '../../types/naming';
import { Loader2, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Props {
  appState: AppState;
  surname: string;
  setSurname: (s: string) => void;
  selectedTraits: string[];
  toggleTrait: (t: string) => void;
  additionalInput: string;
  setAdditionalInput: (s: string) => void;
  onGenerate: () => void;
}

export function NamingInputSection({
  appState, surname, setSurname, selectedTraits, toggleTrait,
  additionalInput, setAdditionalInput, onGenerate
}: Props) {
  const isGenerating = appState === 'generating_batch1';
  const isDisabled = !surname.trim() || selectedTraits.length === 0 || appState !== 'input';

  const [displayedTags, setDisplayedTags] = useState(EXPECTATION_TAGS);

  // restart 后 selectedTraits 清空时，重置标签展示为初始集
  useEffect(() => {
    if (selectedTraits.length === 0) {
      setDisplayedTags(EXPECTATION_TAGS);
    }
  }, [selectedTraits.length]);

  const handleRefreshTags = () => {
    const availablePool = EXPECTATION_TAGS_POOL.filter(tag => !selectedTraits.includes(tag));
    const shuffled = [...availablePool].sort(() => Math.random() - 0.5);
    const tagsNeeded = Math.max(0, 8 - selectedTraits.length);
    const newTags = shuffled.slice(0, tagsNeeded);
    setDisplayedTags([...selectedTraits, ...newTags]);
  };

  return (
    <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200">
      <div className="space-y-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">姓氏</label>
          <input
            type="text"
            placeholder="请输入姓氏，例如：林"
            value={surname}
            onChange={e => setSurname(e.target.value)}
            disabled={appState !== 'input'}
            maxLength={2}
            className="w-full md:w-64 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              你最希望名字传达什么？<span className="text-gray-400 font-normal ml-2">(可选 1~3 项)</span>
            </label>
            <button 
              onClick={handleRefreshTags}
              disabled={appState !== 'input'}
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
                onClick={() => toggleTrait(tag)}
                disabled={appState !== 'input'}
                className={`px-4 py-2.5 rounded-full border text-sm transition-all duration-200 cursor-pointer
                  ${selectedTraits.includes(tag) 
                    ? 'bg-gray-900 text-white border-gray-900 shadow-md' 
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                  } disabled:opacity-70 disabled:cursor-not-allowed`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            还有什么特别在意的？<span className="text-gray-400 font-normal ml-2">(可不填)</span>
          </label>
          <input
            type="text"
            placeholder="例如：想有一点书卷气、不要太热门..."
            value={additionalInput}
            onChange={e => setAdditionalInput(e.target.value)}
            disabled={appState !== 'input'}
            maxLength={100}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>

        <div>
          <button 
            onClick={onGenerate}
            disabled={isDisabled}
            className="w-full md:w-auto px-8 py-3.5 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isGenerating && <Loader2 className="w-5 h-5 animate-spin" />}
            {isGenerating ? '生成中...' : '先看看名字'}
          </button>
        </div>
      </div>
    </section>
  );
}
