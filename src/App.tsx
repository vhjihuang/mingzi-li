/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { RotateCcw, AlertCircle, RefreshCw, PenSquare } from 'lucide-react';

import { useNamingFlow } from './hooks/useNamingFlow';
import { useReducedMotionPreference } from './hooks/useReducedMotionPreference';

import { NamingInputSection } from './components/sections/NamingInputSection';
import { CandidateBatchSection } from './components/sections/CandidateBatchSection';
import { RefinementSection } from './components/sections/RefinementSection';
import { ShortlistSection } from './components/sections/ShortlistSection';

export default function App() {
  const flow = useNamingFlow();
  const prefersReducedMotion = useReducedMotionPreference();
  const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

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

  const [isEditing, setIsEditing] = useState(false);
  const errorToastRef = useRef<HTMLDivElement>(null);

  // 生成开始后收起编辑态
  useEffect(() => {
    if (flow.appState === 'generating_batch1') {
      setIsEditing(false);
    }
  }, [flow.appState]);

  // 错误提示出现时聚焦提示，不再强制滚回顶部
  useEffect(() => {
    if (flow.errorMessage) {
      errorToastRef.current?.focus();
    }
  }, [flow.errorMessage]);

  // 仅在结果渲染后滚动到第一张卡；生成中保持当前位置
  useEffect(() => {
    if (flow.appState !== 'batch1_ready' && flow.appState !== 'shortlist_ready') return;
    const hasCandidates = flow.appState === 'batch1_ready'
      ? flow.batch1Candidates.length > 0
      : flow.shortlistCandidates.length > 0;
    if (!hasCandidates) return;

    const selector = flow.appState === 'batch1_ready'
      ? '#batch-section [data-candidate-card]'
      : '#shortlist-section [data-candidate-card]';
    const timer = window.setTimeout(() => {
      document.querySelector(selector)?.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [flow.appState, flow.batch1Candidates.length, flow.shortlistCandidates.length, scrollBehavior]);

  const statusText =
    flow.appState === 'batch1_ready' && flow.batch1Candidates.length > 0
      ? `已生成 ${flow.batch1Candidates.length} 个候选`
      : flow.appState === 'shortlist_ready' && flow.shortlistCandidates.length > 0
        ? `已生成 ${flow.shortlistCandidates.length} 个精选候选`
        : '';

  const showSummary =
    flow.appState !== 'input' &&
    flow.appState !== 'generating_batch1' &&
    !isEditing;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-gray-200">
      {flow.errorMessage && (
        <div
          ref={errorToastRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-2xl items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700 shadow-lg outline-none focus:ring-2 focus:ring-brand-600"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-medium">出了点问题：</span>{flow.errorMessage}
          </div>
          {flow.lastFailedAction && (
            <button
              onClick={flow.lastFailedAction}
              className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          )}
        </div>
      )}

      <div className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-8 md:py-20">

        <header>
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-sm font-semibold tracking-widest uppercase text-gray-400 mb-2 block">中文起名决策辅助系统</span>
              <h1 className="text-2xl md:text-5xl font-medium tracking-tight mb-4">把你的期待，<br className="max-md:hidden"/>变成一个真正讲得通的名字</h1>
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

          {flow.noticeMessage && (
            <div role="status" aria-live="polite" className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-medium">结果说明：</span>{flow.noticeMessage}
              </div>
            </div>
          )}
        </header>

        <main className="flex flex-col gap-12">
          <div role="status" aria-live="polite" className="sr-only">{statusText}</div>

          {showSummary ? (
            <section className="rounded-lg border border-gray-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label={`修改输入：${flow.surname} ${flow.selectedTraits.join('、')}`}
                className="group flex w-full cursor-pointer items-center justify-between gap-4 text-left"
              >
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-lg font-medium text-gray-900">{flow.surname}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm text-gray-500">{flow.selectedTraits.join(' · ')}</span>
                </span>
                <span className="flex-shrink-0 text-gray-400 transition-colors group-hover:text-gray-700">
                  <PenSquare className="h-4 w-4" />
                </span>
              </button>
            </section>
          ) : (
            <NamingInputSection
              appState={flow.appState}
              editable={isEditing || flow.appState === 'input'}
              surname={flow.surname}
              setSurname={flow.setSurname}
              selectedTraits={flow.selectedTraits}
              toggleTrait={toggleTrait}
              additionalInput={flow.additionalInput}
              setAdditionalInput={flow.setAdditionalInput}
              onGenerate={flow.generateBatch1}
            />
          )}

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
                bookmarkedNames={flow.bookmarkedNames}
                savedCandidates={flow.savedCandidates}
                onBookmark={flow.toggleBookmark}
                onEdit={flow.scrollToRefinement}
                onSwapGroup={flow.swapShortlist}
                onRefineMore={flow.scrollToRefinement}
              />
            )}
          </AnimatePresence>
        </main>

        <footer className="pt-4 border-t border-gray-200 text-xs leading-relaxed text-gray-400">
          候选名字及取意解析由 AI 辅助生成，仅供参考。输入内容可能发送至第三方模型服务进行处理。
        </footer>

      </div>
    </div>
  );
}
