// 我的信箱：小纸条 + 丘比特对话（/me/chat；系统通知也落在丘比特聊天里）
import { MatchmakerTab } from "./matchmaker";
import { BetaOnly, useMe } from "./ctx";

export default function MeChat() {
  const { data, preview } = useMe();
  return (
    <BetaOnly>
      <MatchmakerTab preview={preview} name={data.profile.name} view="chat" />
    </BetaOnly>
  );
}
