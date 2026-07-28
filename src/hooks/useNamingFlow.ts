import { useState, useMemo, useEffect, useRef } from 'react';
import { AppState, FeedbackRecord, FeedbackType, Candidate, RefinedCandidate } from '../types/naming';

/** fetch 超时包装：30s 后自动 abort */
const FETCH_TIMEOUT_MS = 60_000; // 匹配 Vercel maxDuration: 60s
function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null);
  if (response.status === 429) {
    return new Error('请求过于频繁，请稍后再试');
  }
  if (response.status === 413) {
    return new Error('输入内容过长，请精简后重试');
  }
  if (body?.error === 'NO_MORE_CANDIDATES') {
    return new Error('当前条件下没有更多候选名字了，试试调整微调方向吧');
  }
  if (response.status === 400) {
    return new Error(body?.message ? `输入内容不符合要求：${body.message}` : '输入内容不符合要求，请检查后重试');
  }
  return new Error(fallback);
}

function degradationNotice(data: {
  degraded?: boolean;
  source?: 'ai' | 'mixed' | 'fallback';
  degradationReason?: string;
}): string | null {
  if (!data.degraded) return null;
  if (data.degradationReason === 'AI_NOT_CONFIGURED') {
    return '当前未配置 AI 服务，展示的是内置演示候选。';
  }
  if (data.source === 'mixed') {
    return 'AI 返回的有效候选不足，已使用备用候选补足本轮结果。';
  }
  return 'AI 服务暂时不可用，本轮展示的是备用候选。';
}

const STORAGE_KEY = 'naming_saved_candidates';

function candidateKey(candidate: Pick<RefinedCandidate, 'name'>): string {
  return candidate.name.normalize('NFC').trim();
}

function isSavedCandidate(value: unknown): value is RefinedCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['id', 'name', 'meaning', 'origin', 'coreMeaning', 'fitReason', 'tip']
    .every((key) => typeof candidate[key] === 'string');
}

/** 从 localStorage 读取收藏的候选名字 */
function loadSavedCandidates(): RefinedCandidate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, RefinedCandidate>();
    parsed.filter(isSavedCandidate).forEach((candidate) => {
      unique.set(candidateKey(candidate), candidate);
    });
    return [...unique.values()];
  } catch {
    return [];
  }
}

export function useNamingFlow() {
  const [appState, setAppState] = useState<AppState>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  
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

  // 累积所有已展示名字，跨轮去重（不依赖 server 端 session，serverless 无状态）
  const [shownNames, setShownNames] = useState<string[]>([]);

  // 收藏的候选名字（跨 swap 保留完整对象，跨会话持久化到 localStorage）
  const [savedCandidates, setSavedCandidates] = useState<RefinedCandidate[]>(loadSavedCandidates);
  const bookmarkedNames: Set<string> = useMemo(
    () => new Set(savedCandidates.map(candidateKey)),
    [savedCandidates],
  );

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
    const key = candidateKey(candidate);
    setSavedCandidates(prev =>
      prev.some(c => candidateKey(c) === key)
        ? prev.filter(c => candidateKey(c) !== key)
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
    const normalizedSurname = surname.trim();
    if (!/^\p{Script=Han}{1,2}$/u.test(normalizedSurname)) {
      setErrorMessage('请输入 1–2 个汉字的姓氏后再生成');
      return;
    }
    if (selectedTraits.length === 0) return;
    if (requestInFlight.current || appState === 'generating_batch1') return;
    requestInFlight.current = true;
    setAppState('generating_batch1');
    setErrorMessage(null);
    setNoticeMessage(null);
    setLastFailedAction(null);
    try {
      const res = await fetchWithTimeout('/api/naming/batch-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surname: normalizedSurname,
          expectations: selectedTraits,
          additionalNote: additionalInput,
        }),
      });
      if (!res.ok) throw await responseError(res, '请求第一批名字时出错，请稍后重试');
      
      const data = await res.json();
      const names = (data.candidates || []).map((c: Candidate) => c.name);
      setBatch1RequestId(data.requestId);
      setBatch1Candidates(data.candidates || []);
      setShownNames(names);
      setNoticeMessage(degradationNotice(data));
      setAppState('batch1_ready');
    } catch (err: any) {
      setErrorMessage(classifyFetchError(err, '生成候选名字失败，请稍后重试'));
      setLastFailedAction(() => generateBatch1);
      setAppState('input');
    } finally {
      requestInFlight.current = false;
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
    if (requestInFlight.current || appState === 'generating_shortlist') return;
    requestInFlight.current = true;
    setAppState('generating_shortlist');
    setErrorMessage(null);
    setNoticeMessage(null);
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
          excludeNames: shownNames, // batch1 已展示名字，避免 shortlist 重复
        }),
      });
      if (!res.ok) throw await responseError(res, '请求精细筛选时出错，请稍候重试');
      
      const data = await res.json();
      const names = (data.candidates || []).map((c: RefinedCandidate) => c.name);
      setShortlistRequestId(data.shortlistRequestId || data.requestId);
      setShortlistCandidates(data.candidates || []);
      setShownNames(prev => [...new Set([...prev, ...names])]);
      setNoticeMessage(degradationNotice(data));
      setAppState('shortlist_ready');
    } catch (err: any) {
      setErrorMessage(classifyFetchError(err, '请求精细筛选时出错，请稍候重试'));
      setLastFailedAction(() => generateShortlist);
      setAppState('batch1_ready');
    } finally {
      requestInFlight.current = false;
    }
  };

  const swapShortlist = async () => {
    if (requestInFlight.current || appState === 'generating_shortlist') return;
    requestInFlight.current = true;
    setAppState('generating_shortlist');
    setErrorMessage(null);
    setNoticeMessage(null);
    setLastFailedAction(null);
    try {
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
          excludeCandidateNames: shownNames, // 累积全部已展示名字，不只当前轮
        }),
      });
      if (!res.ok) throw await responseError(res, '请求换一组时出错，请稍候重试');
      
      const data = await res.json();
      const names = (data.candidates || []).map((c: RefinedCandidate) => c.name);
      setShortlistRequestId(data.shortlistRequestId || shortlistRequestId);
      setShortlistCandidates(data.candidates || []);
      setShownNames(prev => [...new Set([...prev, ...names])]);
      setNoticeMessage(degradationNotice(data));
      setAppState('shortlist_ready');
    } catch (err: any) {
      setErrorMessage(classifyFetchError(err, '请求换一组时出错，请稍候重试'));
      setLastFailedAction(() => swapShortlist);
      setAppState('shortlist_ready');
    } finally {
      requestInFlight.current = false;
    }
  };

  // 不切换状态，仅滚动到微调区域，保持 shortlist 可见
  const scrollToRefinement = () => {
    setTimeout(() => {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      document.getElementById('refinement-section')?.scrollIntoView({ behavior });
    }, 100);
  };

  // 重置全部状态，回到输入阶段
  const restart = () => {
    setAppState('input');
    setErrorMessage(null);
    setNoticeMessage(null);
    setSurname('');
    setSelectedTraits([]);
    setAdditionalInput('');
    setBatch1RequestId(undefined);
    setShortlistRequestId(undefined);
    setBatch1Candidates([]);
    setShortlistCandidates([]);
    setShownNames([]);
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
    appState, errorMessage, noticeMessage, lastFailedAction,
    surname, setSurname,
    selectedTraits, setSelectedTraits,
    additionalInput, setAdditionalInput,
    batch1RequestId, batch1Candidates,
    shortlistRequestId, shortlistCandidates,
    feedbacks, handleFeedback, hasFeedbacks,
    selectedRefinements, setSelectedRefinements,
    refinementInput, setRefinementInput,
    bookmarkedNames, savedCandidates, toggleBookmark,
    generateBatch1, generateShortlist, swapShortlist, scrollToRefinement, restart
  };
}
