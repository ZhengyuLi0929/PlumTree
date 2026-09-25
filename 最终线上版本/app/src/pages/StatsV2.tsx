import { ALL_QUESTIONS_V2 } from '@/data/questions-v2'
import { DIM_META, RANKINGS, LOVE_LANGUAGES } from '@/data/questions'
import type { LangKey } from '@/data/questions'
import { TYPES, getMeme } from '@/data/types'
import { trpc } from '@/providers/trpc'

const DIM_NAME: Record<string, string> = Object.fromEntries(DIM_META.map(d => [d.key, d.title]))
const QUESTION_TEXT: Record<number, string> = Object.fromEntries(ALL_QUESTIONS_V2.map(q => [q.id, q.text]))
const QUESTION_DIM: Record<number, string> = Object.fromEntries(ALL_QUESTIONS_V2.map(q => [q.id, q.dim]))

export default function StatsV2() {
  const { data, isLoading, error } = trpc.responses.statsV2.useQuery(undefined, { refetchInterval: 30000 })
  const exportQuery = trpc.responses.export.useQuery(undefined, { enabled: false })

  const downloadCsv = async () => {
    const res = await exportQuery.refetch()
    if (!res.data) return
    const qids = Array.from({ length: 100 }, (_, i) => i + 1)
    const rankIds = ['rank1', 'rank2', 'rank3']
    const header = ['id', 'name', 'wechat', 'phone', 'gender', 'birth_year', 'city', 'grad_class',
      'mbti', 'height', 'job', 'pref_min_height', 'pref_birth_from', 'pref_birth_to', 'accept_distance',
      'intro', 'expectation', 'value', 'quiz_version', 'type_code', 'created_at',
      ...qids.map(id => `q${id}`),
      ...rankIds.flatMap(r => [1, 2, 3, 4, 5].map(i => `${r}_${i}`))]
    const lines = [header.join(',')]
    for (const row of res.data) {
      const cells: (string | number | null)[] = [
        row.id, row.name, row.wechat, row.phone, row.gender, row.birthYear, row.city, row.gradClass,
        row.mbti, row.height, row.job, row.prefMinHeight, row.prefBirthFrom, row.prefBirthTo, row.acceptDistance,
        row.intro, row.expectation, row.value, row.quizVersion, row.typeCode,
        row.createdAt ? new Date(row.createdAt).toISOString() : '',
        ...qids.map(id => row.answers[String(id)] ?? ''),
        ...rankIds.flatMap(rid => [0, 1, 2, 3, 4].map(i => row.rankings[rid]?.[i] ?? '')),
      ]
      lines.push(cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `校友约会报名_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (isLoading) {
    return <Shell><p className="text-center py-20 font-display" style={{ color: '#a3988a' }}>加载中…</p></Shell>
  }
  if (error || !data) {
    return (
      <Shell>
        <p className="text-center py-20 text-sm" style={{ color: '#a3988a' }}>
          暂无数据（统计页需要数据库连接正常）
        </p>
      </Shell>
    )
  }

  const rows = Object.entries(data.perQuestion)
    .map(([qid, s]) => ({ qid: Number(qid), ...s }))
    .sort((a, b) => b.stdDev - a.stdDev)
  const high = rows.filter(r => r.stdDev >= 1.8)
  const low = rows.filter(r => r.stdDev < 1.2)
  const typeRows = Object.entries(data.typeDist).sort((a, b) => b[1] - a[1])
  const genderRows = Object.entries(data.genderDist ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <Shell>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-3xl" style={{ color: '#121212' }}>答题数据后台（新题 v2 · 100 题）</h1>
        <div className="flex items-center gap-3">
          <a href="/stats" className="font-display text-sm px-5 py-2.5 rounded-full transition-all hover:scale-105"
            style={{ background: '#F3ECD2', color: '#7a7060', border: '2px solid #E8DCC0' }}>
            ← 旧题 v1 统计
          </a>
          <a href="/stats-v3" className="font-display text-sm px-5 py-2.5 rounded-full transition-all hover:scale-105"
            style={{ background: '#F3ECD2', color: '#F97028', border: '2px solid #F97028' }}>
            最终版 v3 统计 →
          </a>
          <button onClick={downloadCsv}
            className="font-display text-sm px-5 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95"
            style={{ background: '#121212', color: '#F3ECD2' }}>
            导出全部明细 CSV ↓
          </button>
        </div>
      </div>
      <p className="text-sm mb-8" style={{ color: '#7a7060' }}>
        共 <b style={{ color: '#F97028' }}>{data.total}</b> 份 v2 测试作答
        （{genderRows.map(([g, n]) => `${g} ${n}`).join(' · ') || '暂无性别数据'}）
        · <b style={{ color: '#F97028' }}>{data.registered}</b> 人报名约会计划
        · 按标准差衡量分歧度：越大代表大家回答差别越大
      </p>

      {/* 概览 */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Card title={`🔥 高分歧题（stdDev ≥ 1.8）· ${high.length} 道`}>
          {high.length === 0 ? <Empty text="数据还太少，暂无明显分歧题" /> : high.map(r => <Row key={r.qid} r={r} accent="#F97028" />)}
        </Card>
        <Card title={`🤝 高共识题（stdDev < 1.2）· ${low.length} 道`}>
          {low.length === 0 ? <Empty text="数据还太少，暂无明显共识题" /> : low.map(r => <Row key={r.qid} r={r} accent="#F489A3" />)}
        </Card>
      </div>

      {/* 全部题目 */}
      <Card title="全部选择题（按分歧度排序）">
        <div className="overflow-x-auto">
        <div className="flex flex-col gap-1 min-w-[560px]">
          <div className="grid grid-cols-[3rem_1fr_4rem_4rem_1fr] gap-2 text-xs font-semibold px-2 py-1" style={{ color: '#a3988a' }}>
            <span>#</span><span>题目</span><span>均值</span><span>标准差</span><span>1–7 分布</span>
          </div>
          {rows.map(r => (
            <div key={r.qid} className="grid grid-cols-[3rem_1fr_4rem_4rem_1fr] gap-2 items-center px-2 py-2 rounded-xl"
              style={{ background: r.stdDev >= 1.8 ? '#FFF1E8' : r.stdDev < 1.2 ? '#FBEDF1' : 'transparent' }}>
              <span className="font-display text-sm" style={{ color: '#F97028' }}>{r.qid}</span>
              <div>
                <p className="text-[13px] leading-snug" style={{ color: '#3d3830' }}>{QUESTION_TEXT[r.qid] ?? ''}</p>
                <p className="text-[11px]" style={{ color: '#a3988a' }}>{DIM_NAME[QUESTION_DIM[r.qid] ?? ''] ?? ''}</p>
              </div>
              <span className="text-sm font-semibold" style={{ color: '#3d3830' }}>{r.mean}</span>
              <span className="text-sm font-semibold" style={{ color: r.stdDev >= 1.8 ? '#F97028' : r.stdDev < 1.2 ? '#F489A3' : '#3d3830' }}>{r.stdDev}</span>
              <div className="flex items-end gap-[3px] h-8">
                {r.dist.map((c, i) => (
                  <div key={i} className="flex-1 rounded-sm" title={`${i + 1} 分: ${c} 人`}
                    style={{
                      height: `${r.count ? Math.max(8, (c / r.count) * 100) : 8}%`,
                      background: i < 3 ? '#F489A3' : i === 3 ? '#E8DCC0' : '#F97028',
                    }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        </div>
      </Card>

      {/* 彩蛋题（排序题）分布 */}
      <Card title="🎁 彩蛋题分布（排序题）">
        {RANKINGS.map(rk => {
          const stat = data.rankingStats?.[rk.id] ?? {}
          const totalAnswers = Math.max(1, ...Object.values(stat).map(c => c.reduce((a, b) => a + b, 0)), 0)
          return (
            <div key={rk.id} className="mb-6 last:mb-0">
              <p className="font-display text-sm mb-1" style={{ color: '#121212' }}>{rk.title}</p>
              <p className="text-[11px] mb-3" style={{ color: '#a3988a' }}>每个选项被排在第 1–5 位的人数分布（柱越靠左越受偏爱）</p>
              <div className="flex flex-col gap-2">
                {rk.options.map(opt => {
                  const counts = stat[opt.key] ?? [0, 0, 0, 0, 0]
                  const max = Math.max(...counts, 1)
                  const avgPos = counts.reduce((s, c, i) => s + c * (i + 1), 0) / (counts.reduce((a, b) => a + b, 0) || 1)
                  return (
                    <div key={opt.key} className="rounded-xl p-2.5" style={{ background: '#FBF3E3' }}>
                      <div className="flex justify-between items-baseline gap-2 mb-1.5">
                        <p className="text-[12px] leading-snug flex-1" style={{ color: '#3d3830' }}>{opt.text}</p>
                        <span className="text-[11px] font-semibold shrink-0" style={{ color: '#F97028' }}>平均位次 {avgPos.toFixed(1)}</span>
                      </div>
                      <div className="flex items-end gap-1 h-7">
                        {counts.map((c, i) => (
                          <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`第${i + 1}位: ${c} 人`}>
                            <div className="rounded-sm" style={{
                              height: `${(c / max) * 100}%`, minHeight: c ? 4 : 2,
                              background: ['#F97028', '#F99A5C', '#F0BB0D', '#E8DCC0', '#B4A788'][i],
                            }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {Object.keys(stat).length === 0 && <Empty text="还没有人完成彩蛋题" />}
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: '#a3988a' }}>共 {totalAnswers} 份作答包含此题</p>
            </div>
          )
        })}
      </Card>

      {/* 爱的语言总积分 */}
      <Card title="💗 爱的语言总积分（第 1 位 = 5 分 … 第 5 位 = 1 分，跨 3 道彩蛋题累计）">
        {(() => {
          const points: Record<string, number> = { words: 0, time: 0, gifts: 0, acts: 0, touch: 0 }
          for (const opt of Object.values(data.rankingStats ?? {})) {
            for (const [key, counts] of Object.entries(opt)) {
              points[key] = (points[key] ?? 0) + counts.reduce((s, c, i) => s + c * (5 - i), 0)
            }
          }
          const langRows = (Object.entries(points) as [LangKey, number][]).sort((a, b) => b[1] - a[1])
          const maxPts = Math.max(...langRows.map(r => r[1]), 1)
          const hasData = langRows.some(r => r[1] > 0)
          if (!hasData) return <Empty text="数据还太少，暂无积分" />
          return (
            <div className="flex flex-col gap-3">
              {langRows.map(([key, pts]) => (
                <div key={key}>
                  <div className="flex justify-between text-sm font-semibold mb-1">
                    <span style={{ color: '#3d3830' }}>{LOVE_LANGUAGES[key]?.name ?? key}</span>
                    <span style={{ color: '#F97028' }}>{pts} 分</span>
                  </div>
                  <div className="h-3.5 rounded-full overflow-hidden" style={{ background: '#E8DCC0' }}>
                    <div className="h-full rounded-full animate-bar" style={{ width: `${(pts / maxPts) * 100}%`, background: 'linear-gradient(90deg, #F97028, #F489A3)' }} />
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </Card>

      {/* 类型分布 */}
      <Card title="16 型分布">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {typeRows.map(([code, n]) => (
            <div key={code} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: '#FBF3E3' }}>
              {TYPES[code] && <img src={TYPES[code].avatar} alt={getMeme(TYPES[code])} className="w-12 h-12 rounded-xl object-cover" />}
              <div>
                <p className="font-display text-sm" style={{ color: '#121212' }}>{TYPES[code] ? getMeme(TYPES[code]) : code}</p>
                <p className="text-xs" style={{ color: '#a3988a' }}>{code} · {n} 人{data.total ? `（${Math.round((n / data.total) * 100)}%）` : ''}</p>
              </div>
            </div>
          ))}
          {typeRows.length === 0 && <Empty text="还没有人完成测试" />}
        </div>
      </Card>
    </Shell>
  )
}

function Row({ r, accent }: { r: { qid: number; mean: number; stdDev: number }; accent: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="font-display text-xs w-8 shrink-0 pt-0.5" style={{ color: accent }}>#{r.qid}</span>
      <p className="text-[13px] leading-snug flex-1" style={{ color: '#3d3830' }}>{QUESTION_TEXT[r.qid] ?? ''}</p>
      <span className="text-xs font-semibold shrink-0 pt-0.5" style={{ color: accent }}>{r.stdDev}</span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-5 md:p-6 mb-4" style={{ background: '#FFFDF6', boxShadow: '0 6px 24px rgba(18,18,18,0.06)' }}>
      <h3 className="font-display text-base mb-3" style={{ color: '#121212' }}>{title}</h3>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm py-4" style={{ color: '#a3988a' }}>{text}</p>
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen py-10 px-5" style={{ background: '#F3ECD2' }}>
      <div className="max-w-3xl mx-auto">{children}</div>
    </div>
  )
}
