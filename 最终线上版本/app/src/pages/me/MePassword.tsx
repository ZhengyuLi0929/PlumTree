// 修改密码（/me/password；预览模式不展示）
import { ChangePasswordCard } from "./_shared";
import { BetaOnly, useMe } from "./ctx";

export default function MePassword() {
  const { preview } = useMe();
  if (preview) return null;
  return (
    <BetaOnly>
      <ChangePasswordCard />
    </BetaOnly>
  );
}
