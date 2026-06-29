import { useState, useMemo, useEffect } from 'react';
import { AppState, FeedbackRecord, FeedbackType, Candidate, RefinedCandidate } from '../types/naming';

/** fetch 超时包装：30s 后自动 abort */
const FETCH_TIMEOUT_MS = 30_000;
function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

const STORAGE_KEY = 'naming_saved_candidates';

/** 从 localStorage 读取收藏的候选名字 */
function loadSavedCandidates(): RefinedCandidate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useNamingFlow() {
  const [appState, setAppState] = useState<AppState>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Phase 1 inputs
  const [surname, setSurname] = useState('');
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [additionalInput, setAdditionalInput] = useState('');

  // API State
  const [batch1RequestId, setBatch1RequestId] = useState<string | undefined>();
  const [shortlistRequestId, setShortlistRequestId] = useState<string | undefined>();
  const [batch1Candidates, setBatch1Candidates] = useState<Candidate[]>([]);
  const [shortlistCandidates, setShortlistCandidates] = useState<RefinedCandidate[]>([]);

  // Feedbacks State (Elevated from CandidateCard)
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackRecord>>({});

  // Phase 3 inputs (Refinement)
  const [selectedRefinements, setSelectedRefinements] = useState<string[]>([]);
  const [refinementInput, setRefinementInput] = useState('');

  // 收藏的候选名字（跨 swap 保留完整对象，跨会话持久化到 localStorage）
  const [savedCandidates, setSavedCandidates] = useState<RefinedCandidate[]>(loadSavedCandidates);
  const bookmarkedIds: Set<string> = useMemo(() => new Set(savedCandidates.map(c => c.id)), [savedCandidates]);

  // 收藏变更时自动持久化
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCandidates));
    } catch {
      // localStorage 满或隐私模式，静默失败
    }
  }, [savedCandidates]);

  // 记录上次失败的请求，供错误提示中的"重试"按钮调用
  const [lastFailedAction, setLastFailedAction] = useState<(() => void) | null>(null);

  const handleFeedback = (candidateId: string, type: FeedbackType, reason: string | null = null) => {
    setFeedbacks(prev => {
      const next = { ...prev };
      if (type === null) {
        delete next[candidateId];
      } else {
        next[candidateId] = { type, reason };
      }
      return next;
    });
  };

  const toggleBookmark = (id: string) => {
    const candidate = shortlistCandidates.find(c => c.id === id);
    if (!candidate) return;
    setSavedCandidates(prev =>
      prev.some(c => c.id === id)
        ? prev.filter(c => c.id !== id)
        : [...prev, candidate]
    );
  };

  // 统一的网络错误分类：区分"服务器未启动"和"服务器返回错误"
  const classifyFetchError = (err: any, fallbackMsg: string): string => {
    // TypeError: Failed to fetch — 浏览器层面连接失败（server 未启动 / 网络断开）
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return '无法连接到服务器，请确认服务已启动后重试';
    }
    return err?.message || fallbackMsg;
  };

  // Actions
  const generateBatch1 = async () => {
    if (!surname || selectedTraits.length === 0) return;
    if (appState === 'generating_batch1') return; // 防双击
    setAppState('generating_batch1');
    setErrorMessage(null);
    setLastFailedAction(null);
    try {
      const res = await fetchWithTimeout('/api/naming/batch-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surname,
          expectations: selectedTraits,
          additionalNote: additionalInput,
        }),
      });
      if (!res.ok) throw new Error('请求第一批名字时出错，请稍后重试');
      
      const data = await res.json();
      setBatch1RequestId(data.requestId);
      setBatch1Candidates(data.candidates || []);
      setAppState('batch1_ready');
    } catch (err: any) {
      setErrorMessage(classifyFetchError(err, '生成候选名字失败，请稍后重试'));
      setLastFailedAction(() => generateBatch1);
      setAppState('input');
    }
  };

  const getCandidateFeedbacksPayload = () => {
    return Object.entries(feedbacks).map(([candidateId, record]) => {
      const candidate = batch1Candidates.find(c => c.id === candidateId);
      return {
        candidateId,
        feedback: (record as FeedbackRecord).type,
        reason: (record as FeedbackRecord).reason,
        name: candidate?.name,
        meaning: candidate?.meaning,
        origin: candidate?.origin,
      };
    });
  };

  const generateShortlist = async () => {
    if (appState === 'generating_shortlist') return; // 防双击
    setAppState('generating_shortlist');
    setErrorMessage(null);
    setLastFailedAction(null);
    try {
      const res = await fetchWithTimeout('/api/naming/shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: batch1RequestId,
          surname,
          expectations: selectedTraits,
          additionalNote: additionalInput,
          candidateFeedbacks: getCandidateFeedbacksPayload(),
          refinements: selectedRefinements,
          refinementNote: refinementInput,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const msg = errBody?.error === 'NO_MORE_CANDIDATES'
          ? '当前条件下没有更多候选名字了，试试调整微调方向吧'
          : '请求精细筛选时出错，请稍候重试';
        throw new Error(msg);
      }
      
      const data = await res.json();
      setShortlistRequestId(data.shortlistRequestId || data.requestId);
      setShortlistCandidates(data.candidates || []);
      setAppState('shortlist_ready');
    } catch (err: any) {
      setErrorMessage(classifyFetchError(err, '请求精细筛选时出错，请稍候重试'));
      setLastFailedAction(() => generateShortlist);
      setAppState('batch1_ready');
    }
  };

  const swapShortlist = async () => {
    if (appState === 'generating_shortlist') return; // 防双击
    setAppState('generating_shortlist');
    setErrorMessage(null);
    setLastFailedAction(null);
    try {
      const excludeCandidateIds = shortlistCandidates.map(c => c.id);
      const excludeCandidateNames = shortlistCandidates.map(c => c.name);
      
      const res = await fetchWithTimeout('/api/naming/shortlist/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: batch1RequestId,
          shortlistRequestId,
          surname,
          expectations: selectedTraits,
          additionalNote: additionalInput,
          candidateFeedbacks: getCandidateFeedbacksPayload(),
          refinements: selectedRefinements,
          refinementNote: refinementInput,
          excludeCandidateIds,
          excludeCandidateNames,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const msg = errBody?.error === 'NO_MORE_CANDIDATES'
          ? '当前条件下没有更多候选名字了，试试调整微调方向吧'
          : '请求换一组时出错，请稍候重试';
        throw new Error(msg);
      }
      
      const data = await res.json();
      setShortlistRequestId(data.shortlistRequestId || shortlistRequestId);
      setShortlistCandidates(data.candidates || []);
      setAppState('shortlist_ready');
    } catch (err: any) {
      setErrorMessage(classifyFetchError(err, '请求换一组时出错，请稍候重试'));
      setLastFailedAction(() => swapShortlist);
      setAppState('shortlist_ready');
    }
  };

  // 不切换状态，仅滚动到微调区域，保持 shortlist 可见
  const scrollToRefinement = () => {
    setTimeout(() => {
      document.getElementById('refinement-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 重置全部状态，回到输入阶段
  const restart = () => {
    setAppState('input');
    setErrorMessage(null);
    setSurname('');
    setSelectedTraits([]);
    setAdditionalInput('');
    setBatch1RequestId(undefined);
    setShortlistRequestId(undefined);
    setBatch1Candidates([]);
    setShortlistCandidates([]);
    setFeedbacks({});
    setSelectedRefinements([]);
    setRefinementInput('');
    // 收藏是跨会话持久化的，restart 不清除
    setLastFailedAction(null);
  };

  // Derived logic
  // User must provide at least one feedback to be reasonably able to "refine"
  const hasFeedbacks = Object.values(feedbacks).some(f => (f as FeedbackRecord).type !== null);

  return {
    appState, errorMessage, lastFailedAction,
    surname, setSurname,
    selectedTraits, setSelectedTraits,
    additionalInput, setAdditionalInput,
    batch1RequestId, batch1Candidates,
    shortlistRequestId, shortlistCandidates,
    feedbacks, handleFeedback, hasFeedbacks,
    selectedRefinements, setSelectedRefinements,
    refinementInput, setRefinementInput,
    bookmarkedIds, savedCandidates, toggleBookmark,
    generateBatch1, generateShortlist, swapShortlist, scrollToRefinement, restart
  };
}
