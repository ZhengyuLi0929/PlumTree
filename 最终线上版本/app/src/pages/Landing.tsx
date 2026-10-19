// 主页：同桌的TA 的产品门面——主区是每周约会匹配，爱情人格测试是其中一个 section。
// 设计语言与测试欢迎页一致：奶油渐变底 + 漂浮色块 + ZCOOL KuaiLe + 橙粉主色 + floaty 动画。
import { useState } from 'react'
import { Link } from 'react-router'
import { TYPES, getMeme } from '@/data/types'
import { SiteFooter } from '@/components/SiteFooter'

const WEEK_FLOW = [
  { emoji: '📝', when: '周一 · 周二', title: '报名 & 回访', text: '打开「参加本周约会」开关，填好想去的地点、活动和有空的时间。' },
  { emoji: '💌', when: '周三晚上', title: '配对空投', text: '丘比特给你介绍本周的同桌，附上一段只给你听的悄悄话。' },
  { emoji: '✈️', when: '周三 → 周五', title: '递小纸条', text: '每天一张小纸条，先说点有趣的。照片和介绍周五才解锁。' },
  { emoji: '🤝', when: '周五', title: '见面确认', text: '想见、犹豫、不见，三种答案都体面。双方都点头才安排。' },
  { emoji: '🌷', when: '周末', title: '赴约', text: '按你俩共同的口味推荐商家和时间，定好了就去见面吧。' },
  { emoji: '⭐', when: '下周一', title: '回访', text: '给约会评个星、说说感受，下周丘比特给你配得更准。' },
]

export default function Landing() {
  const preview = ['IGRH', 'IGRC', 'FSRC', 'ISRC']
  const [notice, setNotice] = useState(false)

  return (
    <div className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #F3ECD2 0%, #F9E3C8 55%, #F9D9DC 100%)' }}>
      <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-40" style={{ background: '#F0BB0D' }} />
      <div className="absolute -bottom-24 -right-16 w-72 h-72 rounded-full opacity-30" style={{ background: '#F489A3' }} />

      <div className="relative z-10 max-w-2xl mx-auto px-5 py-12 md:py-16">
        {/* ============ Hero：每周约会匹配 ============ */}
        <section className="text-center mb-14">
          <div className="flex justify-center mb-5">
            <img
              src="/cupid/preview-b09934.png"
              alt="丘比特"
              className="w-24 h-24 md:w-28 md:h-28 rounded-3xl object-cover animate-floaty"
              style={{ boxShadow: '0 10px 28px rgba(249,112,40,0.30)' }}
            />
          </div>
          <p className="font-display text-xs md:text-sm tracking-widest mb-2" style={{ color: '#F97028' }}>
            人大附中校友 · 每周一次的约会实验
          </p>
          <h1 className="font-display text-5xl md:text-6xl leading-tight mb-4" style={{ color: '#121212' }}>
            同桌的<span style={{ color: '#F97028' }}>TA</span>
          </h1>
          <p className="text-base md:text-lg font-medium mb-2" style={{ color: '#5a5347' }}>
            每周三晚上，丘比特给你空投一位「同桌」。
          </p>
          <p className="text-sm md:text-base mb-8 leading-relaxed" style={{ color: '#7a7060' }}>
            聊三天小纸条，周五决定见不见，周末就去约会。<br />
            不刷照片、不内耗，一周只认识一个认真的人。
          </p>
          <div className="flex gap-3 justify-center flex-wrap items-center">
            <Link
              to="/me"
              className="font-display text-xl px-12 py-4 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: '#F97028', color: '#FFFDF6', boxShadow: '0 8px 24px rgba(249,112,40,0.4)' }}
            >
              进入我的约会周 →
            </Link>
            <a
              href="#quiz"
              className="font-display text-base px-8 py-3.5 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: '#FFFDF6', color: '#F97028', border: '2px solid #F97028' }}
            >
              先做爱情人格测试
            </a>
          </div>
          <p className="mt-5 text-xs" style={{ color: '#a3988a' }}>
            已报名的同学直接登录；新同学先测人格，再报名排队
          </p>
        </section>

        {/* ============ 一周的流程 ============ */}
        <section className="mb-14">
          <h2 className="font-display text-2xl md:text-3xl text-center mb-2" style={{ color: '#121212' }}>
            这一周会发生什么
          </h2>
          <p className="text-sm text-center mb-7" style={{ color: '#7a7060' }}>每一步都有丘比特在信箱里提醒你</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {WEEK_FLOW.map((s, i) => (
              <div
                key={s.when}
                className="rounded-3xl p-4 md:p-5 text-left animate-pop"
                style={{ background: '#FFFDF6', boxShadow: '0 6px 24px rgba(18,18,18,0.06)', animationDelay: `${i * 0.08}s` }}
              >
                <div className="text-2xl mb-2">{s.emoji}</div>
                <p className="font-display text-xs mb-1" style={{ color: '#F97028' }}>{s.when}</p>
                <p className="font-display text-base mb-1.5" style={{ color: '#121212' }}>{s.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: '#7a7060' }}>{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ============ 爱情人格测试 section ============ */}
        <section id="quiz" className="rounded-3xl p-6 md:p-8 text-center mb-8"
          style={{ background: '#FFFDF6', boxShadow: '0 8px 30px rgba(18,18,18,0.08)' }}>
          <div className="flex justify-center gap-3 mb-5">
            {preview.map((c, i) => (
              <img key={c} src={TYPES[c].avatar} alt={getMeme(TYPES[c])}
                className="w-14 h-14 md:w-16 md:h-16 rounded-2xl object-cover animate-floaty"
                style={{ animationDelay: `${i * 0.35}s`, boxShadow: '0 6px 20px rgba(18,18,18,0.12)' }} />
            ))}
          </div>
          <h2 className="font-display text-2xl md:text-3xl mb-2" style={{ color: '#121212' }}>
            先认识你自己，再遇见 TA
          </h2>
          <p className="text-sm md:text-base mb-6 leading-relaxed" style={{ color: '#7a7060' }}>
            51 道题，5 分钟，领取你在 16 种恋爱人格里的专属花名。<br />
            你的结果，是丘比特每周配对时最重要的参考。
          </p>
          <Link
            to="/quiz"
            className="inline-block font-display text-lg px-10 py-3.5 rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: '#F97028', color: '#FFFDF6', boxShadow: '0 8px 24px rgba(249,112,40,0.35)' }}
          >
            开始爱情人格测试 →
          </Link>
          <p className="mt-4 text-xs" style={{ color: '#a3988a' }}>
            凭直觉作答，所有题目都没有对错 · 结果仅供自我觉察与娱乐
          </p>
        </section>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setNotice(true)}
            className="text-xs underline underline-offset-4"
            style={{ color: '#7a7060' }}
          >
            活动说明与个人信息声明
          </button>
        </div>
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
