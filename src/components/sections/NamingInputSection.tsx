import { EXPECTATION_TAGS, EXPECTATION_TAGS_POOL } from '../../constants/tags';
import { AppState } from '../../types/naming';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';

const TAG_COUNT = 6;

interface Props {
  appState: AppState;
  editable?: boolean;
  surname: string;
  setSurname: (s: string) => void;
  selectedTraits: string[];
  toggleTrait: (t: string) => void;
  additionalInput: string;
  setAdditionalInput: (s: string) => void;
  onGenerate: () => void;
}

export function NamingInputSection({
  appState, editable = true, surname, setSurname, selectedTraits, toggleTrait,
  additionalInput, setAdditionalInput, onGenerate
}: Props) {
  const isGenerating = appState === 'generating_batch1';
  const isSurnameValid = /^\p{Script=Han}{1,2}$/u.test(surname.trim());
  const isLocked = appState !== 'input' || !editable;
  const isDisabled = !isSurnameValid || selectedTraits.length === 0 || isLocked;
  const [showAdditional, setShowAdditional] = useState(false);

  const [displayedTags, setDisplayedTags] = useState(EXPECTATION_TAGS.slice(0, TAG_COUNT));

  // restart 后 selectedTraits 清空时，重置标签展示为初始集
  useEffect(() => {
    if (selectedTraits.length === 0) {
      setDisplayedTags(EXPECTATION_TAGS.slice(0, TAG_COUNT));
    }
  }, [selectedTraits.length]);

  const handleRefreshTags = () => {
    const availablePool = EXPECTATION_TAGS_POOL.filter(tag => !selectedTraits.includes(tag));
    const shuffled = [...availablePool].sort(() => Math.random() - 0.5);
    const tagsNeeded = Math.max(0, TAG_COUNT - selectedTraits.length);
    const newTags = shuffled.slice(0, tagsNeeded);
    setDisplayedTags([...selectedTraits, ...newTags]);
  };

  return (
    <section className="bg-white p-6 md:p-8 rounded-lg border border-gray-200">
      <div className="space-y-6 md:space-y-8">
        <div>
          <label htmlFor="surname" className="block text-sm font-medium text-gray-700 mb-2">姓氏</label>
          <input
            id="surname"
            type="text"
            placeholder="请输入姓氏，例如：林"
            value={surname}
            onChange={e => setSurname(e.target.value)}
            disabled={isLocked}
            inputMode="text"
            aria-describedby="surname-help"
            className="w-full md:w-64 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all disabled:opacity-50"
          />
          <p id="surname-help" className="mt-2 text-xs text-gray-500">
            {surname && !isSurnameValid ? '请输入 1–2 个汉字的姓氏。' : '支持单姓和复姓。'}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              你最希望名字传达什么？
              {selectedTraits.length === 0 && (
                <span className="text-gray-400 font-normal ml-2">(可选 1~3 项)</span>
              )}
            </label>
            <button
              onClick={handleRefreshTags}
              disabled={isLocked}
              aria-label="换一批期待标签"
              className="text-xs text-gray-600 underline underline-offset-4 decoration-gray-300 hover:text-gray-900 flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
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
                disabled={isLocked}
                aria-pressed={selectedTraits.includes(tag)}
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
          <button
            type="button"
            onClick={() => setShowAdditional(prev => !prev)}
            disabled={isLocked}
            aria-expanded={showAdditional}
            aria-controls="additional-note-wrap"
            className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>还有什么特别在意的？</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAdditional ? 'rotate-180' : ''}`} />
          </button>
          {showAdditional && (
            <div id="additional-note-wrap" className="mt-2">
              <input
                id="additional-note"
                type="text"
                placeholder="例如：想有一点书卷气、不要太热门..."
                value={additionalInput}
                onChange={e => setAdditionalInput(e.target.value)}
                disabled={isLocked}
                aria-label="还有什么特别在意的？"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all disabled:opacity-50"
              />
            </div>
          )}
        </div>

        <div className="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-6 max-md:-mb-6 max-md:rounded-b-lg max-md:border-t max-md:border-gray-100 max-md:bg-white/95 max-md:px-6 max-md:pt-3 max-md:pb-4 max-md:backdrop-blur-sm max-md:shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.3)]">
          <button
            onClick={onGenerate}
            disabled={isDisabled}
            className="w-full md:w-auto px-8 py-3.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isGenerating && <Loader2 className="w-5 h-5 animate-spin" />}
            {isGenerating ? '生成中...' : '先看看名字'}
          </button>
        </div>
      </div>
    </section>
  );
}
