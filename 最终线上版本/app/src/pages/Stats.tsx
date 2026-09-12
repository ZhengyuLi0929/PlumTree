import { QUESTIONS, DIM_META } from '@/data/questions'
import { TYPES } from '@/data/types'
import { trpc } from '@/providers/trpc'

const DIM_NAME: Record<string, string> = Object.fromEntries(DIM_META.map(d => [d.key, d.title]))
const QUESTION_TEXT: Record<number, string> = Object.fromEntries(QUESTIONS.map(q => [q.id, q.text]))

export default function Stats() {
  const { data, isLoading, error } = trpc.responses.stats.useQuery(undefined, { refetchInterval: 30000 })
  const exportQuery = trpc.responses.export.useQuery(undefined, { enabled: false })

  const downloadCsv = async () => {
    const res = await exportQuery.refetch()
    if (!res.data) return
    const qids = QUESTIONS.map(q => q.id)
    const rankIds = ['rank1', 'rank2', 'rank3']
    const header = ['id', 'name', 'wechat', 'phone', 'gender', 'birth_year', 'city', 'grad_class',
      'mbti', 'height', 'intro', 'expectation', 'value', 'type_code', 'created_at',
      ...qids.map(id => `q${id}`),
      ...rankIds.flatMap(r => [1, 2, 3, 4, 5].map(i => `${r}_${i}`))]
    const lines = [header.join(',')]
    for (const row of res.data) {
      const cells: (string | number | null)[] = [
        row.id, row.name, row.wechat, row.phone, row.gender, row.birthYear, row.city, row.gradClass,
        row.mbti, row.height, row.intro, row.expectation, row.value, row.typeCode,
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

  return (
    <Shell>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-3xl" style={{ color: '#121212' }}>答题数据后台（旧题 v1）</h1>
        <div className="flex items-center gap-3">
          <a href="/stats-v2" className="font-display text-sm px-5 py-2.5 rounded-full transition-all hover:scale-105"
            style={{ background: '#F3ECD2', color: '#F97028', border: '2px solid #F97028' }}>
            新题 v2 统计 →
          </a>
          <button onClick={downloadCsv}
            className="font-display text-sm px-5 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95"
            style={{ background: '#121212', color: '#F3ECD2' }}>
            导出全部明细 CSV ↓
          </button>
        </div>
      </div>
      <p className="text-sm mb-8" style={{ color: '#7a7060' }}>
        共 <b style={{ color: '#F97028' }}>{data.total}</b> 份测试作答 · <b style={{ color: '#F97028' }}>{data.registered}</b> 人报名约会计划 · 按标准差衡量分歧度：越大代表大家回答差别越大
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
                <p className="text-[11px]" style={{ color: '#a3988a' }}>{DIM_NAME[QUESTIONS.find(q => q.id === r.qid)?.dim ?? ''] ?? ''}</p>
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

      {/* 类型分布 */}
      <Card title="16 型分布">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {typeRows.map(([code, n]) => (
            <div key={code} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: '#FBF3E3' }}>
              {TYPES[code] && <img src={TYPES[code].avatar} alt={TYPES[code].animal} className="w-12 h-12 rounded-xl object-cover" />}
              <div>
                <p className="font-display text-sm" style={{ color: '#121212' }}>{TYPES[code]?.animal ?? code}</p>
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
