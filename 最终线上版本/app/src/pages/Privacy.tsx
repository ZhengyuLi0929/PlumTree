const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "一、我们收集哪些信息",
    body: [
      "1. 测评信息：你在「恋爱人格测试」中的作答、排序题选择与每题作答时长（仅用于统计与题库迭代）。",
      "2. 报名信息：姓名、微信号、性别、出生年份、所在城市、毕业届别和班级，以及你选填的 MBTI、身高、职业、自我介绍、择偶偏好（含对对方的身高/年龄/异地要求）等。",
      "3. 访问信息：页面访问时间与来源渠道（用于统计活动效果，不追踪个人行为）。",
    ],
  },
  {
    title: "二、信息用来做什么",
    body: [
      "1. 仅用于本次人大附中校友恋爱匹配活动：人工/智能配对、活动联络（微信月老机器人）、活动效果统计。",
      "2. 你的择偶偏好、自我介绍等属于敏感个人信息，仅用于匹配目的，不会公开展示，不会用于任何商业推广。",
      "3. 测评结果仅供自我觉察与娱乐，不构成任何专业建议。",
    ],
  },
  {
    title: "三、信息如何存储与保护",
    body: [
      "1. 数据存储于活动组织者管理的数据库中，采取账号密码、访问控制等安全措施。",
      "2. 本站不以营利为目的，不会出售、出租你的任何个人信息。",
      "3. 【占位：存储期限，如「活动结束后 30 天内删除」】",
    ],
  },
  {
    title: "四、你的权利",
    body: [
      "1. 你可以随时联系组织者查询、更正或删除你的报名信息。",
      "2. 删除后你将退出匹配池，不再参与后续配对。",
      "3. 【占位：撤回同意的方式与处理时限】",
    ],
  },
  {
    title: "五、联系我们",
    body: ["【占位：组织者联系方式（微信号/邮箱）】", "本政策更新时会在本页面公布。"],
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen py-10 px-5" style={{ background: "#F3ECD2" }}>
      <div className="max-w-xl mx-auto">
        <a href="/" className="text-sm font-semibold" style={{ color: "#121212" }}>← 返回首页</a>
        <div
          className="rounded-3xl p-6 md:p-8 mt-4 animate-pop"
          style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}
        >
          <h1 className="font-display text-3xl mb-1" style={{ color: "#121212" }}>隐私政策</h1>
          <p className="text-xs mb-6" style={{ color: "#a3988a" }}>
            「同桌的TA」校友恋爱匹配活动 · 最近更新：2026 年 9 月
          </p>
          {SECTIONS.map((s) => (
            <div key={s.title} className="mb-5">
              <h2 className="font-display text-lg mb-2" style={{ color: "#121212" }}>{s.title}</h2>
              <div className="text-sm leading-relaxed space-y-1.5" style={{ color: "#5a5347" }}>
                {s.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
