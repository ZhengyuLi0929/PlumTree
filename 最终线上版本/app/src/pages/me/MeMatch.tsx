// 本周同桌的TA：推荐语 + 资料名片 + 约会安排 + 约会回访（/me/match）
import { MatchmakerTab } from "./matchmaker";
import { BetaOnly, useMe } from "./ctx";

export default function MeMatch() {
  const { data, preview } = useMe();
  return (
    <BetaOnly>
      <MatchmakerTab preview={preview} name={data.profile.name} view="card" />
    </BetaOnly>
  );
}
