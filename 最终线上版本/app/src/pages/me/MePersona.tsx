// 我的人格：恋爱人格卡 + MBTI 卡（/me/persona；非 beta 的旧版单页也复用这组卡片）
import { Link } from "react-router";
import { TYPES, getAvatar, getMeme } from "@/data/types";
import { DIM_META, LOVE_LANGUAGES, type LangKey } from "@/data/questions";
import { DIM_LEAN } from "@/data/dimExplain";
import { computeScoresFinal } from "@/data/questions-final";
import { MBTI_TYPES } from "@/data/mbti";
import { ArtText, asNumberRecord, type MeData } from "./_shared";
import { BetaOnly, useMe } from "./ctx";

export function PersonaCards({ data }: { data: MeData }) {
  const p = data.profile;
  const type = data.quiz?.typeCode && TYPES[data.quiz.typeCode] ? TYPES[data.quiz.typeCode] : null;
  const scores = data.quiz
    ? computeScoresFinal(asNumberRecord(data.quiz.answers), data.quiz.rankings as Record<string, LangKey[]>, asNumberRecord(data.quiz.timings))
    : null;
  const dims = scores
    ? DIM_META.map((dim) => {
        const pair = scores[dim.key] as Record<string, number>;
        const left = Math.round((pair[dim.left] / ((pair[dim.left] + pair[dim.right]) || 1)) * 100);
        return {
          key: dim.key as string,
          title: dim.title,
          leftName: dim.leftName,
          rightName: dim.rightName,
          leftEn: dim.leftEn,
          rightEn: dim.rightEn,
          leftLetter: dim.left as string,
          rightLetter: dim.right as string,
          left,
          right: 100 - left,
        };
      })
    : [];
  const topLang = scores
    ? (Object.entries(scores.LL) as [LangKey, number][]).sort((a, b) => b[1] - a[1])[0]?.[0]
    : undefined;
  const mbtiInfo = p.mbti ? MBTI_TYPES[p.mbti.toUpperCase()] : undefined;

  return (
    <>
      {/* 人格卡 */}
      <div className="rounded-3xl p-6 md:p-8 mb-4" style={{ background: "#FFFDF6" }}>
        <div className="flex items-center gap-4">
          {type && <img src={getAvatar(type, p.gender)} alt="" className="w-20 h-20 rounded-2xl object-cover" />}
          <div>
            <h1 className="font-display text-3xl" style={{ color: "#121212" }}>{p.name}</h1>
            <p className="text-base mt-1" style={{ color: "#7a7060" }}>
              {type ? (
                <>
                  <span className="font-display text-xl" style={{ color: "#F97028" }}>{getMeme(type, p.gender)}</span>
                  {"　"}
                  <ArtText>{type.code}</ArtText>
                </>
              ) : "完成测试并报名后，这里会显示你的恋爱人格"}
            </p>
          </div>
        </div>
        {type && <p className="text-sm leading-relaxed mt-4" style={{ color: "#5a5347" }}>{type.persona}</p>}
        {topLang && <p className="text-sm mt-3" style={{ color: "#7a7060" }}>爱的语言：{LOVE_LANGUAGES[topLang].name}</p>}
        <div className="mt-4 flex flex-col gap-3">
          {dims.map((dim) => {
            const leftWin = dim.left >= dim.right;
            const lean = DIM_LEAN[dim.key]?.[leftWin ? dim.leftLetter : dim.rightLetter];
            return (
              <div key={dim.title}>
                <p className="text-xs mb-1" style={{ color: "#a3988a" }}>
                  {dim.title}：
                  <span style={{ color: leftWin ? "#F97028" : "#a3988a" }}>{dim.leftName}（{dim.leftEn}）{dim.left}%</span>
                  {" · "}
                  <span style={{ color: !leftWin ? "#F489A3" : "#a3988a" }}>{dim.rightName}（{dim.rightEn}）{dim.right}%</span>
                </p>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3ECD2" }}>
                  <div className="h-full rounded-full" style={{ width: `${dim.left}%`, background: "#F97028" }} />
                </div>
                {lean && <p className="text-xs leading-relaxed mt-1" style={{ color: "#7a7060" }}>{lean}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-5 text-center">
          <Link
            to="/"
            className="inline-block font-display text-sm px-8 py-3 rounded-full transition-all hover:scale-105"
            style={{ background: "#F3ECD2", color: "#F97028", border: "2px solid #F97028" }}
          >
            重新做一次爱情人格测试 →
          </Link>
        </div>
      </div>

      {/* MBTI 卡（独立展示，不混在人格卡里；库里查不到就不渲染） */}
      {mbtiInfo && (
        <div className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
          <div className="flex items-center gap-4">
            <img src={mbtiInfo.avatar} alt={mbtiInfo.code} className="w-20 h-20 rounded-2xl object-cover" style={{ background: "#F3ECD2" }} />
            <div>
              <ArtText size="2rem">{mbtiInfo.code}</ArtText>
              <p className="font-display text-lg" style={{ color: "#121212" }}>{mbtiInfo.name}</p>
              <p className="text-sm" style={{ color: "#5a5347" }}>{mbtiInfo.love}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** /me/persona 路由页 */
export default function MePersona() {
  const { data } = useMe();
  return (
    <BetaOnly>
      <PersonaCards data={data} />
    </BetaOnly>
  );
}
