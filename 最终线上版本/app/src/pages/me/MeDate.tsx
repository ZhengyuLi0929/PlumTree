// 本周约会倾向：我的资料卡片预览 + 照片 + 个人信息 + 约会倾向（/me/date）
import MatchCardEmbed from "@/components/MatchCardEmbed";
import { DatePrefsCard, PhotoWall, ProfileCard } from "./_shared";
import { BetaOnly, useMe } from "./ctx";

export default function MeDate() {
  const { data, preview } = useMe();
  const p = data.profile;
  return (
    <BetaOnly>
      {/* 资料卡片预览：改完信息保存后，这里就是自己名片的样子 */}
      <div className="rounded-3xl p-5 mb-4" style={{ background: "#FFFDF6" }}>
        <h2 className="font-display text-lg mb-1" style={{ color: "#121212" }}>我的资料卡片</h2>
        <p className="text-xs mb-3" style={{ color: "#a3988a" }}>这就是 TA 眼里你的名片。改完下面的信息记得保存，这里会跟着更新。</p>
        <MatchCardEmbed
          person={{
            name: p.name,
            gender: p.gender,
            birthYear: p.birthYear,
            city: p.city,
            job: p.job,
            height: p.height,
            mbti: p.mbti,
            intro: p.intro,
            expectation: p.expectation,
            value: p.value,
            typeCode: data.quiz?.typeCode ?? null,
            photos: data.photos ?? [],
          }}
        />
      </div>
      <PhotoWall photos={data.photos ?? []} preview={preview} />
      <ProfileCard p={p} preview={preview} />
      <DatePrefsCard raw={p.datePrefs} participate={p.participate === true} preview={preview} />
    </BetaOnly>
  );
}
