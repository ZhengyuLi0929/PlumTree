/** 进模型前去掉真实姓名。当前用户的名字直接抹掉，其他人的名字改成「对方」。编号不出现在对话里。 */
export function redactNames(
  text: string,
  people: { id: number; name: string | null | undefined }[],
  selfId?: number,
) {
  let out = text ?? "";
  const list = people
    .filter((person) => person.name && person.name.trim().length >= 2)
    .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0));
  for (const person of list) {
    const replacement = selfId != null && person.id === selfId ? "" : "对方";
    out = out.split(person.name!.trim()).join(replacement);
  }
  return out.replace(/U\d+/g, "对方").replace(/编号/g, "");
}
