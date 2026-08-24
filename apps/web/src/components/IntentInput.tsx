/**
 * IntentInput —— 意图输入框（DESIGN_SYSTEM §4.1 / §8 #6，Q1 落地）
 *
 * ① 输入框内底部 3 个可点击示例 chip（点击即填入、光标移到末尾、聚焦、启用提交）；
 * ② 信息不足时最多 2 个澄清追问（内联追问卡：标题 + 进度「问题 n / 2」+
 *    选项 chips + 「其他（自由输入）」），一次只问 1 题；第 2 题答完必须停止，
 *    仍不足的按默认值理解并在确认卡标注假设；
 * ③ 意图确认卡「我理解你的意图」：意图类型图标+名称、参数 chips、
 *    将执行的动作 + 费用/风险摘要；[确认，开始]（primary）/ [修改]（secondary，
 *    回到输入并保留已填内容）/ [取消]（ghost）；**确认前绝不执行**；
 * ④ Q3 保障：输入内容草稿写入 localStorage（draftKey），刷新不丢。
 */
import { useEffect, useRef, useState } from 'react';
import { ClipboardPlus, PenLine, ShoppingCart } from 'lucide-react';
import type { ParsedIntent } from '../types';
import {
  buildFinalIntent,
  CLARIFYING_QUESTIONS,
  DEFAULT_EXAMPLES,
  MAX_CLARIFYING_QUESTIONS,
  parseIntent,
} from '../lib/intentParser';

type Phase = 'input' | 'asking' | 'confirm';

interface IntentInputProps {
  /** 输入框内底部示例 chip（默认三条产品示例） */
  examples?: string[];
  placeholder?: string;
  /** 用户点击「确认，开始」后回调（父组件据此进入 Q2 执行） */
  onConfirm: (intent: ParsedIntent) => void;
  /** 草稿持久化 key（Q3：刷新不丢） */
  draftKey?: string;
}

const INTENT_ICONS: Record<string, typeof ShoppingCart> = {
  purchase: ShoppingCart,
  commission: ClipboardPlus,
  unknown: PenLine,
};

export function IntentInput({
  examples = DEFAULT_EXAMPLES,
  placeholder = '描述你想做的事…',
  onConfirm,
  draftKey = 'vibe.intent.draft',
}: IntentInputProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [value, setValue] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [freeInput, setFreeInput] = useState(false);
  const [freeValue, setFreeValue] = useState('');
  const [confirmedIntent, setConfirmedIntent] = useState<ParsedIntent | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const parseResultRef = useRef<ReturnType<typeof parseIntent> | null>(null);

  // Q3：草稿持久化（输入内容与追问进度）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as { value?: string; phase?: Phase; answers?: Record<string, string> };
        if (draft.value) setValue(draft.value);
        if (draft.phase === 'asking' || draft.phase === 'confirm') setPhase('input');
        if (draft.answers) setAnswers(draft.answers);
      }
    } catch {
      // 忽略损坏的草稿
    }
  }, [draftKey]);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ value, phase, answers }));
    } catch {
      // localStorage 不可用时静默降级
    }
  }, [draftKey, value, phase, answers]);

  const focusInputEnd = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      // 某些环境不支持 setSelectionRange
    }
  };

  const fillExample = (example: string) => {
    setValue(example);
    setPhase('input');
    setAnswers({});
    setFreeInput(false);
    setFreeValue('');
    setConfirmedIntent(null);
    // 填入后立即聚焦并让提交按钮可用
    requestAnimationFrame(focusInputEnd);
  };

  const startAsking = () => {
    const result = parseResultRef.current;
    if (!result || result.missing.length === 0) {
      showConfirm();
      return;
    }
    setQuestionIndex(0);
    setFreeInput(false);
    setFreeValue('');
    setPhase('asking');
  };

  const showConfirm = () => {
    const result = parseResultRef.current;
    if (!result) return;
    const { intent, assumptions: assumed } = buildFinalIntent(result, answers);
    setConfirmedIntent(intent);
    setAssumptions(assumed);
    setPhase('confirm');
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const result = parseIntent(trimmed);
    parseResultRef.current = result;

    if (result.intent.kind === 'unknown') {
      // 未识别：回到输入，追问 1 题「想买还是想发需求」帮助澄清
      setQuestionIndex(0);
      setFreeInput(false);
      setFreeValue('');
      setPhase('asking');
      return;
    }

    if (result.missing.length > 0) {
      startAsking();
    } else {
      showConfirm();
    }
  };

  const answerQuestion = (answer: string) => {
    const result = parseResultRef.current;
    if (!result) return;

    // 未识别意图：根据追问答案重新定向（购买 / 发布需求），再走追问或确认
    if (result.intent.kind === 'unknown') {
      const direction = answer.includes('购买') ? '买' : '发布需求：';
      const nextResult = parseIntent(direction);
      parseResultRef.current = nextResult;
      setAnswers({});
      if (nextResult.missing.length > 0) {
        setQuestionIndex(0);
        setFreeInput(false);
        setFreeValue('');
        setPhase('asking');
        return;
      }
      const { intent, assumptions: assumed } = buildFinalIntent(nextResult, {});
      setConfirmedIntent(intent);
      setAssumptions(assumed);
      setPhase('confirm');
      return;
    }

    const key = result.missing[questionIndex];
    const nextAnswers = { ...answers, [key]: answer };
    setAnswers(nextAnswers);

    const nextIndex = questionIndex + 1;
    if (result.missing.length > nextIndex && nextIndex < MAX_CLARIFYING_QUESTIONS) {
      // 还有缺失且追问次数未用完 → 继续下一题
      setQuestionIndex(nextIndex);
      setFreeInput(false);
      setFreeValue('');
      return;
    }
    // 第 2 题答完（或已无缺失）→ 停止追问，按已有信息确认（§4.1 ②）
    setAnswers(nextAnswers);
    const { intent, assumptions: assumed } = buildFinalIntent(result, nextAnswers);
    setConfirmedIntent(intent);
    setAssumptions(assumed);
    setPhase('confirm');
  };

  const confirmAndStart = () => {
    if (confirmedIntent) onConfirm(confirmedIntent);
  };

  const cancelFlow = () => {
    // 取消：回到输入，保留已填内容（草稿不丢，Q3）
    setPhase('input');
    setConfirmedIntent(null);
    setAssumptions([]);
    setAnswers({});
    parseResultRef.current = null;
  };

  const editAgain = () => {
    // 修改：回到输入并保留已填内容（§4.1 ③）
    setPhase('input');
    setConfirmedIntent(null);
    setAssumptions([]);
    parseResultRef.current = null;
  };

  const askingResult = parseResultRef.current;
  const askingQuestions =
    askingResult && askingResult.intent.kind !== 'unknown'
      ? CLARIFYING_QUESTIONS[askingResult.intent.kind]
      : [
          {
            id: 'intent',
            title: '你想做哪一类？',
            options: ['购买作品（逛逛 Marketplace）', '发布需求（找人接单）'],
          },
        ];
  const currentQuestion = askingQuestions[questionIndex] ?? askingQuestions[0];
  const totalQuestions = Math.min(askingQuestions.length, MAX_CLARIFYING_QUESTIONS);

  return (
    <div className="intent-input">
      {/* ① 输入区 */}
      {phase === 'input' && (
        <div className="intent-input__box">
          <input
            ref={inputRef}
            type="text"
            className="intent-input__field"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) handleSubmit();
            }}
            aria-label="描述你想做的事"
          />
          <div className="intent-input__examples" aria-label="示例（点击填入）">
            {examples.slice(0, 3).map((example) => (
              <button
                key={example}
                type="button"
                className="chip intent-input__example"
                onClick={() => fillExample(example)}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="intent-input__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!value.trim()}
            >
              下一步
            </button>
          </div>
        </div>
      )}

      {/* ② 澄清追问（内联追问卡，最多 2 题） */}
      {phase === 'asking' && currentQuestion && (
        <div className="intent-card intent-card--ask" role="group" aria-label="澄清追问">
          <p className="intent-card__heading text-body-sm">
            还需要确认 {totalQuestions} 个问题 · 问题 {Math.min(questionIndex + 1, totalQuestions)} /{' '}
            {totalQuestions}
          </p>
          <p className="intent-card__question text-body">{currentQuestion.title}</p>
          <div className="intent-card__options">
            {currentQuestion.options.map((option) => (
              <button
                key={option}
                type="button"
                className="chip"
                onClick={() => answerQuestion(option)}
              >
                {option}
              </button>
            ))}
            {currentQuestion.allowFree !== false && (
              <button
                type="button"
                className="chip"
                aria-pressed={freeInput}
                onClick={() => setFreeInput((v) => !v)}
              >
                其他（自由输入）
              </button>
            )}
          </div>
          {freeInput && (
            <div className="intent-card__free">
              <input
                type="text"
                className="intent-input__field"
                value={freeValue}
                placeholder="输入你的答案…"
                onChange={(e) => setFreeValue(e.target.value)}
                aria-label="自由输入答案"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!freeValue.trim()}
                onClick={() => answerQuestion(freeValue.trim())}
              >
                确认答案
              </button>
            </div>
          )}
        </div>
      )}

      {/* ③ 意图确认卡：确认前绝不执行 */}
      {phase === 'confirm' && confirmedIntent && (
        <div className="intent-card intent-card--confirm" role="group" aria-label="确认你的意图">
          <p className="intent-card__heading text-body">我理解你的意图</p>
          <div className="intent-card__type">
            <span className={`intent-card__type-icon intent-card__type-icon--${confirmedIntent.kind}`}>
              {(() => {
                const Icon = INTENT_ICONS[confirmedIntent.kind] ?? PenLine;
                return <Icon size={18} aria-hidden="true" />;
              })()}
            </span>
            <span className="text-body">
              意图类型：<strong>{confirmedIntent.kindLabel}</strong>
            </span>
          </div>
          {confirmedIntent.params.length > 0 && (
            <div className="intent-card__params">
              {confirmedIntent.params.map((p) => (
                <span key={p.key} className="chip chip--static">
                  {p.key}：{p.value}
                </span>
              ))}
            </div>
          )}
          <p className="intent-card__summary text-body-sm">
            <strong>将为你：</strong>
            {confirmedIntent.actionSummary}
          </p>
          {assumptions.length > 0 && (
            <ul className="intent-card__assumptions text-caption text-tertiary">
              {assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <div className="intent-card__actions">
            <button type="button" className="btn btn-primary" onClick={confirmAndStart}>
              确认，开始
            </button>
            <button type="button" className="btn btn-secondary" onClick={editAgain}>
              修改
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancelFlow}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
