/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { RotateCcw, AlertCircle, RefreshCw } from 'lucide-react';

import { useNamingFlow } from './hooks/useNamingFlow';

import { NamingInputSection } from './components/sections/NamingInputSection';
import { CandidateBatchSection } from './components/sections/CandidateBatchSection';
import { RefinementSection } from './components/sections/RefinementSection';
import { ShortlistSection } from './components/sections/ShortlistSection';

export default function App() {
  const flow = useNamingFlow();

  const toggleTrait = (tag: string) => {
    flow.setSelectedTraits(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : 
      prev.length < 3 ? [...prev, tag] : prev
    );
  };

  const toggleRefinement = (tag: string) => {
    flow.setSelectedRefinements(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // 依赖状态自动滚动引导视线
  useEffect(() => {
    // 出错时滚动到顶部，确保用户看到错误提示
    if (flow.errorMessage) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (flow.appState === 'batch1_ready') {
      setTimeout(() => {
        document.getElementById('batch-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (flow.appState === 'generating_shortlist') {
      setTimeout(() => {
        document.getElementById('shortlist-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (flow.appState === 'shortlist_ready') {
      setTimeout(() => {
        document.getElementById('shortlist-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [flow.appState, flow.errorMessage]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-gray-200">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-20 flex flex-col gap-12">
        
        <header className="mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-sm font-semibold tracking-widest uppercase text-gray-400 mb-2 block">中文起名决策辅助系统</span>
              <h1 className="text-3xl md:text-5xl font-medium tracking-tight mb-4">把你的期待，<br className="max-md:hidden"/>变成一个真正讲得通的名字</h1>
              <p className="text-gray-500 md:text-lg">先说说你希望名字传达什么，我们先给你一批候选。</p>
            </div>
            {flow.appState !== 'input' && (
              <button
                onClick={flow.restart}
                className="flex-shrink-0 text-sm text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1.5 cursor-pointer mt-1"
              >
                <RotateCcw className="w-4 h-4" />
                重新开始
              </button>
            )}
          </div>
          
          {flow.errorMessage && (
            <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-medium">出了点问题：</span>{flow.errorMessage}
              </div>
              {flow.lastFailedAction && (
                <button
                  onClick={flow.lastFailedAction}
                  className="flex-shrink-0 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  重试
                </button>
              )}
            </div>
          )}
        </header>

        <NamingInputSection 
          appState={flow.appState}
          surname={flow.surname}
          setSurname={flow.setSurname}
          selectedTraits={flow.selectedTraits}
          toggleTrait={toggleTrait}
          additionalInput={flow.additionalInput}
          setAdditionalInput={flow.setAdditionalInput}
          onGenerate={flow.generateBatch1}
        />

        <AnimatePresence>
          {flow.appState !== 'input' && (
            <CandidateBatchSection 
              appState={flow.appState}
              surname={flow.surname}
              candidates={flow.batch1Candidates}
              feedbacks={flow.feedbacks}
              onFeedback={flow.handleFeedback}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(flow.appState === 'batch1_ready' || flow.appState === 'generating_shortlist' || flow.appState === 'shortlist_ready') && (
            <RefinementSection 
              appState={flow.appState}
              hasFeedbacks={flow.hasFeedbacks}
              selectedRefinements={flow.selectedRefinements}
              toggleRefinement={toggleRefinement}
              refinementInput={flow.refinementInput}
              setRefinementInput={flow.setRefinementInput}
              onGenerateShortlist={flow.generateShortlist}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(flow.appState === 'shortlist_ready' || flow.appState === 'generating_shortlist') && (
            <ShortlistSection 
              appState={flow.appState}
              surname={flow.surname}
              candidates={flow.shortlistCandidates}
              bookmarkedIds={flow.bookmarkedIds}
              savedCandidates={flow.savedCandidates}
              onBookmark={flow.toggleBookmark}
              onEdit={flow.scrollToRefinement}
              onSwapGroup={flow.swapShortlist}
              onRefineMore={flow.scrollToRefinement}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
