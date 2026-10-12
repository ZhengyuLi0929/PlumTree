import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  shuffledRankings, getTypeCode, DIM_META, LOVE_LANGUAGES, RANKINGS,
} from '@/data/questions'
import {
  FINAL_QUESTIONS, buildQuizOrderFinal, computeScoresFinal,
} from '@/data/questions-final'
import type { Question, RankingQuestion, LangKey, Scores } from '@/data/questions'
import { TYPES, getMeme, getAvatar } from '@/data/types'
import { trpc } from '@/providers/trpc'
import { MatchIntro, type EnrollPayload } from '@/components/MatchEnroll'
import { SiteFooter } from '@/components/SiteFooter'
import { ProfileForm } from '@/pages/Profile'

type Phase = 'welcome' | 'gender' | 'quiz' | 'rankIntro' | 'rank' | 'result' | 'profile'
type Gender = '男' | '女'

// 16personalities 风格：两端大、中间小的圆圈
const CIRCLE_SIZES = [56, 48, 40, 30, 40, 48, 56]
const CIRCLE_ROW_FULL = CIRCLE_SIZES.reduce((a, b) => a + b, 0) + 6 * 12 // 圆圈 + gap-3

function useWindowWidth(enabled: boolean) {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setW(window.innerWidth))
    }
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
    }
  }, [enabled])
  return w
}

// ?demo=1 直接进入结果页预览（不写入数据库）
// ?demo=1&type=IGRH 可预览指定人格类型的结果页；?demo=1&type=ISPH&gender=f 预览女性花名
const DEMO_PARAMS = new URLSearchParams(window.location.search)
const IS_DEMO = DEMO_PARAMS.has('demo')
const DEMO_TYPE = (() => {
  const t = DEMO_PARAMS.get('type')?.toUpperCase()
  return t && t in TYPES ? t : null
})()
const DEMO_GENDER: Gender = DEMO_PARAMS.get('gender') === 'f' ? '女' : '男'

function mockAnswers(): Record<number, number> {
  const a: Record<number, number> = {}
  for (const q of FINAL_QUESTIONS) a[q.id] = 1 + Math.floor(Math.random() * 7)
  return a
}
function mockTimings(): Record<number, number> {
  const t: Record<number, number> = {}
  for (const q of FINAL_QUESTIONS) t[q.id] = 800 + Math.floor(Math.random() * 5200)
  return t
}
function mockRankings(): Record<string, LangKey[]> {
  const r: Record<string, LangKey[]> = {}
  for (const rk of RANKINGS) r[rk.id] = rk.options.map(o => o.key)
  return r
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>(IS_DEMO ? 'result' : 'welcome')
  const [gender, setGender] = useState<Gender | null>(IS_DEMO ? DEMO_GENDER : null)
  const [idx, setIdx] = useState(0)
  const [rankIdx, setRankIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>(() => IS_DEMO ? mockAnswers() : {})
  const [timings, setTimings] = useState<Record<number, number>>(() => IS_DEMO ? mockTimings() : {})
  const shownAt = useRef(Date.now())
  const [rankings, setRankings] = useState<Record<string, LangKey[]>>(() => IS_DEMO ? mockRankings() : {})
  const [popKey, setPopKey] = useState(0)
  const [enroll, setEnroll] = useState<EnrollPayload | null>(null)
  const [profileDone, setProfileDone] = useState(false)
  const winW = useWindowWidth(phase === 'quiz')
  const advancing = useRef(false)

  const order = useMemo(() => buildQuizOrderFinal(), [])
  const ranks = useMemo(() => shuffledRankings(), [])
  const sessionId = useMemo(() => crypto.randomUUID(), [])

  // 每道题展示时打点（仅后台计时，不向用户展示）
  useEffect(() => { shownAt.current = Date.now(); advancing.current = false }, [idx, phase])

  const total = order.length
  const current: Question | undefined = order[idx]

  const answer = (v: number) => {
    if (!current || advancing.current) return
    advancing.current = true
    const ms = Date.now() - shownAt.current
    setAnswers(prev => ({ ...prev, [current.id]: v }))
    setTimings(prev => ({ ...prev, [current.id]: ms }))
    if (idx + 1 >= total) {
      setPhase('rankIntro')
      return
    }
    setIdx(i => i + 1)
    setPopKey(k => k + 1)
  }

  const answerRanking = (ordered: LangKey[]) => {
    const rid = ranks[rankIdx].id
    setRankings(prev => ({ ...prev, [rid]: ordered }))
    if (rankIdx + 1 >= ranks.length) setPhase('result')
    else { setRankIdx(i => i + 1); setPopKey(k => k + 1) }
  }

  const restart = () => window.location.reload()

  if (phase === 'welcome') return <Welcome onStart={() => setPhase('gender')} />
  if (phase === 'gender') {
    return (
      <GenderScreen
        onPick={(g) => { setGender(g); setPhase('quiz') }}
        onBack={() => setPhase('welcome')}
      />
    )
  }
  if (phase === 'rankIntro') return <RankIntro onContinue={() => setPhase('rank')} />
  if (phase === 'rank') {
    return (
      <RankScreen
        key={popKey}
        q={ranks[rankIdx]}
        step={rankIdx + 1}
        total={ranks.length}
        onDone={answerRanking}
      />
    )
  }
  if (phase === 'profile' && enroll) {
    return (
      <ProfileForm
        sessionId={sessionId}
        gender={gender ?? '男'}
        wechat={enroll.wechat}
        token={enroll.token}
        onBack={() => setPhase('result')}
        onDone={() => { setProfileDone(true); setPhase('result') }}
      />
    )
  }
  if (phase === 'result') {
    return (
      <Result
        answers={answers}
        rankings={rankings}
        timings={timings}
        gender={gender ?? '男'}
        sessionId={sessionId}
        onRestart={restart}
        forcedCode={IS_DEMO ? DEMO_TYPE : null}
        enrolled={Boolean(enroll)}
        profileDone={profileDone}
        onEnrolled={(payload) => { setEnroll(payload); setPhase('profile') }}
        onContinueProfile={() => setPhase('profile')}
      />
    )
  }

  if (!current) return <RankIntro onContinue={() => setPhase('rank')} />

  const progress = Math.round((idx / total) * 100)
  const answered = answers[current.id]

  // 手机端：量表整体按可用宽度等比缩小，保证不溢出
  const labelW = winW < 640 ? 40 * 2 : 64 * 2
  const scale = Math.min(1, (winW - 40 - labelW - 8) / CIRCLE_ROW_FULL)
  const gap = winW < 640 ? 6 : 12

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #F3ECD2 0%, #F7E8D0 100%)' }}>
      {/* 顶部进度 */}
      <div className="w-full max-w-2xl mx-auto px-5 pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-sm" style={{ color: '#F97028' }}>第 {idx + 1} / {total} 题</span>
          <span className="text-xs font-semibold text-neutral-500">{progress}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: '#E8DCC0' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #F97028, #F489A3)' }} />
        </div>
      </div>

      {/* 题目 */}
      <div className="flex-1 flex items-center justify-center px-5 py-8">
        <div key={popKey} className="animate-pop w-full max-w-2xl text-center">
          {current.spicy && (
            <span className="inline-block font-display text-xs px-3 py-1 rounded-full mb-5"
              style={{ background: '#F97028', color: '#FFFDF6' }}>
              🔥 话题题 · 欢迎对号入座
            </span>
          )}
          <h2 className="font-display text-xl md:text-[1.7rem] leading-relaxed mb-10" style={{ color: '#121212' }}>
            {current.text}
          </h2>

          {/* 7 级圆圈量表 */}
          <div className="flex items-center justify-between max-w-xl mx-auto">
            <span className="font-display text-xs md:text-base text-right shrink-0" style={{ color: '#F489A3', width: winW < 640 ? 40 : 64 }}>不同意</span>
            <div className="flex items-center" style={{ gap }}>
              {[1, 2, 3, 4, 5, 6, 7].map(v => {
                const size = Math.max(20, Math.round(CIRCLE_SIZES[v - 1] * scale))
                const active = answered === v
                const base = v === 4 ? '#B4A788' : v > 4 ? '#F97028' : '#F489A3'
                return (
                  <button
                    key={v}
                    onClick={() => answer(v)}
                    aria-label={`${v}`}
                    className="rounded-full transition-all duration-150 hover:scale-110 active:scale-95"
                    style={{
                      width: size, height: size,
                      border: `${winW < 640 ? 2 : 3}px solid ${base}`,
                      background: active ? base : 'transparent',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = base + '33' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? base : 'transparent' }}
                  />
                )
              })}
            </div>
            <span className="font-display text-xs md:text-base shrink-0" style={{ color: '#F97028', width: winW < 640 ? 40 : 64 }}>同意</span>
          </div>

          <div className="mt-8 flex justify-between items-center max-w-xl mx-auto">
            <button onClick={() => { if (idx > 0) { setIdx(i => i - 1); setPopKey(k => k + 1) } else setPhase('gender') }}
              className="text-sm font-semibold px-4 py-2 rounded-full transition-all hover:scale-105"
              style={{ color: '#121212' }}>
              ← {idx === 0 ? '重选性别' : '上一题'}
            </button>
            <span className="text-xs text-neutral-500">凭直觉作答，没有对错</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================= 欢迎页 ================= */
function Welcome({ onStart }: { onStart: () => void }) {
  const preview = ['IGRH', 'IGRC', 'FSRC', 'ISRC']
  const [notice, setNotice] = useState(false)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #F3ECD2 0%, #F9E3C8 55%, #F9D9DC 100%)' }}>
      <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-40" style={{ background: '#F0BB0D' }} />
      <div className="absolute -bottom-24 -right-16 w-72 h-72 rounded-full opacity-30" style={{ background: '#F489A3' }} />

      <div className="relative z-10 max-w-xl w-full text-center">
        <div className="flex justify-center gap-3 mb-6">
          {preview.map((c, i) => (
            <img key={c} src={TYPES[c].avatar} alt={getMeme(TYPES[c])}
              className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-cover animate-floaty"
              style={{ animationDelay: `${i * 0.35}s`, boxShadow: '0 6px 20px rgba(18,18,18,0.12)' }} />
          ))}
        </div>

        <h1 className="font-display text-4xl md:text-5xl leading-tight mb-3" style={{ color: '#121212' }}>
          恋爱<span style={{ color: '#F97028' }}>人格</span>测试
        </h1>
        <p className="text-base md:text-lg font-medium mb-2" style={{ color: '#5a5347' }}>
          你的恋爱人格，对应哪个网络热词？
        </p>
        <p className="text-sm md:text-base mb-8 leading-relaxed" style={{ color: '#7a7060' }}>
          测测你在爱情里的底层设定：要黏还是要空间？信火花还是信养成？<br />
          浪漫派还是务实派？热吵派还是冷处理派？<br />
          最后，领取你在 16 种恋爱人格里的专属花名。
        </p>

        <div className="flex gap-3 justify-center flex-wrap items-center">
          <button onClick={onStart}
            className="font-display text-xl px-12 py-4 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: '#F97028', color: '#FFFDF6', boxShadow: '0 8px 24px rgba(249,112,40,0.4)' }}>
            开始测试 →
          </button>
          <div className="flex flex-col items-center gap-1.5">
            <Link to="/me"
              className="font-display text-base px-8 py-3.5 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: '#FFFDF6', color: '#F97028', border: '2px solid #F97028' }}>
              我已报名，登录查看
            </Link>
            <span className="text-xs" style={{ color: '#a3988a' }}>用报名时填的姓名 + 手机号登录</span>
          </div>
        </div>

        <p className="mt-6 text-xs" style={{ color: '#a3988a' }}>
          凭直觉作答，所有题目都没有对错 · 结果仅供自我觉察与娱乐
        </p>
        <button
          type="button"
          onClick={() => setNotice(true)}
          className="mt-3 text-xs underline underline-offset-4"
          style={{ color: '#7a7060' }}
        >
          活动说明与个人信息声明
        </button>
        <SiteFooter />
      </div>

      {notice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(18,18,18,0.45)' }}
          onClick={() => setNotice(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl p-6 text-left animate-pop max-h-[85vh] overflow-auto"
            style={{ background: '#FFFDF6', boxShadow: '0 12px 40px rgba(18,18,18,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl mb-3" style={{ color: '#121212' }}>活动说明与个人信息声明</h3>
            <div className="text-sm leading-relaxed space-y-3" style={{ color: '#5a5347' }}>
              <p>本网站「同桌的TA」仅供中国人民大学附属中学（人大附中）校友恋爱匹配活动使用，由同学自发组织，不以营利为目的，不收取任何费用。</p>
              <p>你在本站填写的微信号、邀请码、个人资料以及测评结果，仅用于本次非营利匹配活动的联络与人工配对，不会出售、出租，也不会用于商业推广。</p>
              <p>组织者会妥善保管这些信息，并只在匹配所需范围内使用。测评结果仅供自我觉察与娱乐，不构成任何专业建议。</p>
            </div>
            <button
              type="button"
              onClick={() => setNotice(false)}
              className="mt-5 font-display text-base w-full py-3 rounded-full"
              style={{ background: '#F97028', color: '#FFFDF6' }}
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================= 性别选择（第 1 题） ================= */
function GenderScreen({ onPick, onBack }: { onPick: (g: Gender) => void; onBack: () => void }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #F3ECD2 0%, #F7E8D0 100%)' }}>
      <div className="w-full max-w-2xl mx-auto px-5 pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-sm" style={{ color: '#F97028' }}>开始之前</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: '#E8DCC0' }}>
          <div className="h-full rounded-full" style={{ width: '3%', background: 'linear-gradient(90deg, #F97028, #F489A3)' }} />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="animate-pop w-full max-w-2xl text-center">
          <h2 className="font-display text-2xl md:text-[1.7rem] leading-relaxed mb-3" style={{ color: '#121212' }}>
            先确认一下，你是——
          </h2>
          <p className="text-sm mb-10" style={{ color: '#a3988a' }}>
            部分人格花名会按性别给你更贴切的版本（比如「大男主 / 大女主」）
          </p>

          <div className="flex gap-4 max-w-md mx-auto">
            <button onClick={() => onPick('男')}
              className="flex-1 py-8 rounded-3xl font-display text-2xl transition-all duration-200 hover:scale-[1.04] active:scale-95"
              style={{ background: '#FFFDF6', color: '#F97028', border: '3px solid #F97028', boxShadow: '0 8px 24px rgba(18,18,18,0.08)' }}>
              男生
            </button>
            <button onClick={() => onPick('女')}
              className="flex-1 py-8 rounded-3xl font-display text-2xl transition-all duration-200 hover:scale-[1.04] active:scale-95"
              style={{ background: '#FFFDF6', color: '#F489A3', border: '3px solid #F489A3', boxShadow: '0 8px 24px rgba(18,18,18,0.08)' }}>
              女生
            </button>
          </div>

          <div className="mt-8 max-w-xl mx-auto text-left">
            <button onClick={onBack}
              className="text-sm font-semibold px-4 py-2 rounded-full transition-all hover:scale-105"
              style={{ color: '#121212' }}>
              ← 返回首页
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================= 排序题过渡页 ================= */
function RankIntro({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center"
      style={{ background: 'linear-gradient(160deg, #F3ECD2 0%, #F9D9DC 100%)' }}>
      <div className="max-w-md">
        <div className="text-6xl mb-6">🎁</div>
        <h2 className="font-display text-3xl mb-4" style={{ color: '#121212' }}>最后 3 道彩蛋题</h2>
        <p className="text-base leading-relaxed mb-8" style={{ color: '#5a5347' }}>
          选择题部分完成！接下来是 <b style={{ color: '#F97028' }}>3 道排序题</b>，<br />
          会解锁你的「爱的语言」隐藏报告。<br />
          别纠结，凭第一直觉排。
        </p>
        <button onClick={onContinue}
          className="font-display text-lg px-10 py-4 rounded-full"
          style={{ background: '#F489A3', color: '#FFFDF6' }}>
          解锁彩蛋 →
        </button>
      </div>
    </div>
  )
}

/* ================= 排序题 ================= */
function RankScreen({ q, step, total, onDone }: {
  q: RankingQuestion; step: number; total: number; onDone: (ordered: LangKey[]) => void
}) {
  const [picked, setPicked] = useState<LangKey[]>([])
  const done = picked.length === q.options.length

  const pick = (key: LangKey) => {
    if (picked.includes(key)) return
    const next = [...picked, key]
    setPicked(next)
    if (next.length === q.options.length) onDone(next)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #F3ECD2 0%, #F7E8D0 100%)' }}>
      <div className="w-full max-w-2xl mx-auto px-5 pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-sm" style={{ color: '#F489A3' }}>🎁 彩蛋题 {step} / {total}</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: '#E8DCC0' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(step / total) * 100}%`, background: 'linear-gradient(90deg, #F489A3, #F0BB0D)' }} />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="animate-pop w-full max-w-2xl">
          <h2 className="font-display text-2xl md:text-[1.7rem] leading-relaxed mb-2 text-center" style={{ color: '#121212' }}>
            {q.title}
          </h2>
          <p className="text-sm text-center mb-8" style={{ color: '#a3988a' }}>{q.hint}</p>

          <div className="flex flex-col gap-3">
            {q.options.map(opt => {
              const rank = picked.indexOf(opt.key)
              const isPicked = rank !== -1
              return (
                <button key={opt.key} onClick={() => pick(opt.key)}
                  className="w-full text-left px-5 py-4 rounded-2xl text-[15px] leading-relaxed flex items-center gap-4"
                  style={{
                    background: isPicked ? '#F97028' : '#FFFDF6',
                    color: isPicked ? '#FFFDF6' : '#121212',
                    boxShadow: '0 4px 16px rgba(18,18,18,0.07)',
                    opacity: isPicked ? 0.9 : 1,
                  }}>
                  <span
                    className="font-display w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm"
                    style={{
                      background: isPicked ? '#FFFDF6' : '#F3ECD2',
                      color: isPicked ? '#F97028' : '#a3988a',
                    }}>
                    {isPicked ? rank + 1 : '·'}
                  </span>
                  {opt.text}
                </button>
              )
            })}
          </div>

          {picked.length > 0 && !done && (
            <div className="text-center mt-6">
              <button onClick={() => setPicked([])} className="text-sm font-semibold hover:scale-105 transition-all" style={{ color: '#F489A3' }}>
                ↺ 重新排序
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DimBarList({
  keys,
  dimValues,
}: {
  keys: Array<(typeof DIM_META)[number]['key']>
  dimValues: Record<string, { left: number; right: number }>
}) {
  return (
    <div className="flex flex-col gap-5">
      {keys.map((key) => {
        const d = DIM_META.find(m => m.key === key)
        const v = dimValues[key]
        if (!d || !v) return null
        const leftWin = v.left >= v.right
        return (
          <div key={d.key}>
            <div className="flex justify-between text-sm font-semibold mb-1.5">
              <span style={{ color: leftWin ? '#F97028' : '#a3988a' }}>
                {d.leftName}<span className="font-normal text-xs">（{d.leftEn}/{d.left}）</span> {v.left}%
              </span>
              <span className="text-xs font-normal" style={{ color: '#a3988a' }}>{d.title}</span>
              <span style={{ color: !leftWin ? '#F489A3' : '#a3988a' }}>
                {v.right}% {d.rightName}<span className="font-normal text-xs">（{d.rightEn}/{d.right}）</span>
              </span>
            </div>
            <div className="h-3.5 rounded-full overflow-hidden flex" style={{ background: '#E8DCC0' }}>
              <div className="h-full animate-bar" style={{ width: `${v.left}%`, background: leftWin ? '#F97028' : '#E8DCC0' }} />
              <div className="h-full animate-bar flex-1" style={{ background: !leftWin ? '#F489A3' : 'transparent' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ================= 结果页 ================= */
function Result({ answers, rankings, timings, gender, sessionId, onRestart, forcedCode, enrolled, profileDone, onEnrolled, onContinueProfile }: {
  answers: Record<number, number>
  rankings: Record<string, LangKey[]>
  timings: Record<number, number>
  gender: Gender
  sessionId: string
  onRestart: () => void
  forcedCode?: string | null
  enrolled: boolean
  profileDone: boolean
  onEnrolled: (payload: EnrollPayload) => void
  onContinueProfile: () => void
}) {
  const scores: Scores = useMemo(() => computeScoresFinal(answers, rankings, timings), [answers, rankings, timings])
  const code = forcedCode ?? getTypeCode(scores)
  const t = TYPES[code]
  const match = TYPES[t.matchCode]
  const meme = getMeme(t, gender)
  const matchMeme = getMeme(match, gender === '男' ? '女' : '男')
  const matchAvatar = getAvatar(match, gender === '男' ? '女' : '男')

  const submit = trpc.responses.submitV3.useMutation()
  const doSubmit = () => submit.mutate({ sessionId, typeCode: code, gender, answers, rankings, timings })
  useEffect(() => {
    if (IS_DEMO) return // 演示模式不写入数据库
    doSubmit()
    // 只在进入结果页时提交一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const topLanguage = (Object.entries(scores.LL) as [LangKey, number][]).sort((a, b) => b[1] - a[1])[0][0]
  const lang = LOVE_LANGUAGES[topLanguage]

  const pct = (a: number, b: number) => Math.round((a / ((a + b) || 1)) * 100)
  const dimValues: Record<string, { left: number; right: number }> = {
    FI: { left: pct(scores.FI.F, scores.FI.I), right: 100 - pct(scores.FI.F, scores.FI.I) },
    SG: { left: pct(scores.SG.S, scores.SG.G), right: 100 - pct(scores.SG.S, scores.SG.G) },
    RP: { left: pct(scores.RP.R, scores.RP.P), right: 100 - pct(scores.RP.R, scores.RP.P) },
    HC: { left: pct(scores.HC.H, scores.HC.C), right: 100 - pct(scores.HC.H, scores.HC.C) },
    TM: { left: pct(scores.TM.T, scores.TM.M), right: 100 - pct(scores.TM.T, scores.TM.M) },
  }

  return (
    <div className="min-h-screen pb-16" style={{ background: 'linear-gradient(180deg, #F3ECD2 0%, #F9E3C8 60%, #F3ECD2 100%)' }}>
      <div className="max-w-xl mx-auto px-5 pt-10">
        {/* 头部 */}
        <div className="text-center animate-pop">
          <p className="font-display text-sm tracking-widest mb-3" style={{ color: '#F97028' }}>你的恋爱人格是</p>
          <div className="flex justify-center mb-5">
            <img src={getAvatar(t, gender)} alt={meme}
              className="w-52 h-52 md:w-64 md:h-64 rounded-[2rem] object-cover animate-floaty"
              style={{ boxShadow: '0 12px 40px rgba(18,18,18,0.15)' }} />
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-1" style={{ color: '#121212' }}>{code}（{meme}）</h1>
          <p className="font-display text-xl mb-2" style={{ color: '#F97028' }}>「{t.alias}」</p>
          <div className="flex justify-center gap-2 mb-3">
            {code.split('').map((ch, i) => (
              <span key={i}
                className="font-display text-lg w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: ['#F97028', '#F489A3', '#F0BB0D', '#8ecfc0'][i], color: '#FFFDF6' }}>
                {ch}
              </span>
            ))}
          </div>
          <p className="text-xs px-4 leading-relaxed" style={{ color: '#a3988a' }}>{t.decode}</p>

          {/* 作答保存状态（demo 模式不显示） */}
          {!IS_DEMO && (
            <div className="mt-4">
              {submit.isPending && (
                <span className="text-xs font-semibold px-4 py-2 rounded-full inline-block" style={{ background: '#FBF3E3', color: '#a3988a' }}>
                  正在保存你的作答…
                </span>
              )}
              {submit.isSuccess && submit.data?.stored !== false && (
                <span className="text-xs font-semibold px-4 py-2 rounded-full inline-block" style={{ background: '#EAF5EE', color: '#3a7d5c' }}>
                  ✓ 作答已保存，你的数据已进入统计
                </span>
              )}
              {submit.isError && (
                <button onClick={doSubmit}
                  className="text-xs font-semibold px-4 py-2 rounded-full inline-block transition-all hover:scale-105"
                  style={{ background: '#FDEAE0', color: '#F97028' }}>
                  ⚠ 作答保存失败（未写入数据库），点此重试
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          <MatchIntro
            sessionId={sessionId}
            profileDone={profileDone}
            enrolled={enrolled}
            onEnrolled={onEnrolled}
            onContinueProfile={onContinueProfile}
          />
        </div>

        <Section title="你的四维配比">
          <DimBarList keys={['FI', 'SG', 'RP', 'HC']} dimValues={dimValues} />
        </Section>

        <Section title="性别角色光谱">
          <p className="text-xs leading-relaxed mb-4" style={{ color: '#7a7060' }}>
            附加维度，不进入四字母人格代码。偏向传统或现代都只是分工偏好，没有高下。
          </p>
          <DimBarList keys={['TM']} dimValues={dimValues} />
        </Section>

        {/* 人设 */}
        <Section title="这样的你">
          <p className="leading-loose text-[15px]" style={{ color: '#3d3830' }}>{t.persona}</p>
        </Section>

        {/* 优势 / 盲区 */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <Section title="恋爱优势" tight>
            <ul className="flex flex-col gap-2.5">
              {t.strengths.map((s, i) => (
                <li key={i} className="text-sm leading-relaxed flex gap-2" style={{ color: '#3d3830' }}>
                  <span style={{ color: '#F97028' }}>✦</span>{s}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="恋爱盲区" tight>
            <ul className="flex flex-col gap-2.5">
              {t.blindspots.map((s, i) => (
                <li key={i} className="text-sm leading-relaxed flex gap-2" style={{ color: '#3d3830' }}>
                  <span style={{ color: '#F489A3' }}>✧</span>{s}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* 官配 */}
        <Section title="官配 CP">
          <div className="flex items-center gap-4">
            <img src={matchAvatar} alt={matchMeme}
              className="w-20 h-20 rounded-2xl object-cover animate-floaty"
              style={{ boxShadow: '0 6px 18px rgba(18,18,18,0.12)' }} />
            <p className="text-sm leading-relaxed flex-1" style={{ color: '#3d3830' }}>{t.matchLine}</p>
          </div>
        </Section>

        <Section title="🎁 彩蛋报告">
          <div className="rounded-2xl p-4" style={{ background: '#FBF3E3' }}>
            <p className="font-display text-base mb-1" style={{ color: '#F97028' }}>你的爱的语言：{lang.name}</p>
            <p className="text-sm leading-relaxed" style={{ color: '#3d3830' }}>{lang.desc}</p>
          </div>
        </Section>

        {/* 分享 */}
        <ShareSection code={code} meme={meme} alias={t.alias} />

        <div className="text-center mt-8">
          <button onClick={onRestart}
            className="font-display text-base px-10 py-3.5 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: '#121212', color: '#F3ECD2' }}>
            再测一次 ↺
          </button>
          <p className="mt-4 text-xs" style={{ color: '#a3988a' }}>结果仅供自我觉察与娱乐 · 爱情是实践，不是判词</p>
        </div>
        <SiteFooter />
      </div>
    </div>
  )
}

function Section({ title, children, tight }: { title: string; children: ReactNode; tight?: boolean }) {
  return (
    <div className={`rounded-3xl ${tight ? 'p-5' : 'p-6 md:p-7'} mb-4 animate-pop`}
      style={{ background: '#FFFDF6', boxShadow: '0 6px 24px rgba(18,18,18,0.06)' }}>
      <h3 className="font-display text-lg mb-4" style={{ color: '#121212' }}>{title}</h3>
      {children}
    </div>
  )
}

/* ================= 分享 ================= */
function ShareSection({ code, meme, alias }: { code: string; meme: string; alias: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const text = `我的恋爱人格是 ${code}（${meme}）「${alias}」！来测测你是哪个花名 → ${window.location.origin}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-3xl p-6 md:p-7 mb-4 text-center animate-pop"
      style={{ background: 'linear-gradient(135deg, #F97028, #F489A3)', boxShadow: '0 8px 28px rgba(249,112,40,0.3)' }}>
      <p className="font-display text-lg mb-1" style={{ color: '#FFFDF6' }}>测完了？分享给朋友一起玩</p>
      <p className="text-xs mb-4" style={{ color: 'rgba(255,253,246,0.8)' }}>截图本页发朋友圈，或复制分享文案</p>
      <button onClick={share}
        className="font-display text-base px-8 py-3 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
        style={{ background: '#FFFDF6', color: '#F97028' }}>
        {copied ? '✓ 已复制，去粘贴吧' : '复制分享文案'}
      </button>
    </div>
  )
}
