import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLanguage } from "../app/language";
import { BottomNav, TopBar } from "../components/ui/AppChrome";
import { InkstoneTextarea } from "../components/ui/InkstoneTextarea";
import { SealButton } from "../components/ui/SealButton";
import { getMyProfile, upsertMyProfile } from "../lib/api/client";

export function ProfilePage() {
  const { lang, setLang, tx } = useLanguage();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    calling: "",
    city: "",
    bio: "",
    interests: "",
    avatar: "",
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    setForm({
      displayName: profileQuery.data.displayName,
      calling: profileQuery.data.calling,
      city: profileQuery.data.city,
      bio: profileQuery.data.bio,
      interests: profileQuery.data.interests.join("、"),
      avatar: profileQuery.data.avatar,
    });
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: upsertMyProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(["my-profile"], data);
      setIsEditing(false);
    },
  });

  const data = profileQuery.data;

  const onPickAvatar = () => fileInputRef.current?.click();

  const onAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, avatar: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const onSave = () => {
    const interests = form.interests
      .split(/[、,，]/g)
      .map((item) => item.trim())
      .filter(Boolean);

    saveMutation.mutate({
      displayName: form.displayName,
      calling: form.calling,
      city: form.city,
      bio: form.bio,
      avatar: form.avatar,
      interests: interests.length ? interests : data?.interests ?? [],
    });
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] pb-32">
      <TopBar title={tx("我的资料", "My Profile")} />

      <main className="mx-auto max-w-2xl px-5 pb-36 pt-28 md:px-8 md:pt-32">
        <section className="mt-4 flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="h-40 w-40 overflow-hidden border border-[var(--primary)]/12 p-1">
              <img alt={tx("用户头像", "User Avatar")} className="h-full w-full object-cover" src={form.avatar || data?.avatar} />
            </div>
            <button
              className="absolute -bottom-2 -right-2 bg-[var(--primary)] p-2 text-white"
              onClick={onPickAvatar}
              type="button"
              aria-label={tx("编辑头像", "Edit Avatar")}
            >
              <span className="material-symbols-outlined text-sm">edit</span>
            </button>
            <input className="hidden" onChange={onAvatarChange} ref={fileInputRef} type="file" accept="image/*" />
          </div>
          <h2 className="font-headline text-5xl italic">{form.displayName || data?.displayName}</h2>
          <p className="mt-2 text-[10px] tracking-[0.3em] text-[var(--on-surface-variant)]/70">{form.calling || data?.calling}</p>
        </section>

        <section className="mt-10 grid grid-cols-1 gap-8">
          <article className="space-y-4">
            <div className="flex items-baseline gap-3">
              <h3 className="font-headline text-2xl text-[var(--primary)]">自述</h3>
              <div className="h-px flex-1 bg-[var(--outline-variant)]/35" />
            </div>
            <div className="bg-[var(--surface-container-low)] p-6">
              <InkstoneTextarea
                value={form.bio}
                onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
                disabled={!isEditing}
              />
            </div>
          </article>

          <article className="grid grid-cols-1 gap-4 bg-[var(--surface-container-low)] p-5">
            <label className="text-xs text-[var(--on-surface-variant)]">
              {tx("昵称", "Display Name")}
              <input
                className="mt-1 w-full border border-[var(--outline-variant)]/40 bg-[var(--surface-container-lowest)] px-3 py-2 outline-none disabled:opacity-70"
                disabled={!isEditing}
                onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
                value={form.displayName}
              />
            </label>
            <label className="text-xs text-[var(--on-surface-variant)]">
              {tx("职业 / 身份", "Calling")}
              <input
                className="mt-1 w-full border border-[var(--outline-variant)]/40 bg-[var(--surface-container-lowest)] px-3 py-2 outline-none disabled:opacity-70"
                disabled={!isEditing}
                onChange={(e) => setForm((prev) => ({ ...prev, calling: e.target.value }))}
                value={form.calling}
              />
            </label>
            <label className="text-xs text-[var(--on-surface-variant)]">
              {tx("城市", "City")}
              <input
                className="mt-1 w-full border border-[var(--outline-variant)]/40 bg-[var(--surface-container-lowest)] px-3 py-2 outline-none disabled:opacity-70"
                disabled={!isEditing}
                onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                value={form.city}
              />
            </label>
            <label className="text-xs text-[var(--on-surface-variant)]">
              {tx("兴趣（用顿号或逗号分隔）", "Interests (comma separated)")}
              <input
                className="mt-1 w-full border border-[var(--outline-variant)]/40 bg-[var(--surface-container-lowest)] px-3 py-2 outline-none disabled:opacity-70"
                disabled={!isEditing}
                onChange={(e) => setForm((prev) => ({ ...prev, interests: e.target.value }))}
                value={form.interests}
              />
            </label>
          </article>

          <article className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="bg-[var(--surface-container)] p-5">
              <h4 className="font-headline text-2xl text-[var(--primary)]">{tx("雅兴", "Interests")}</h4>
              <ul className="mt-4 space-y-2 text-sm text-[var(--on-surface-variant)]">
                {(form.interests ? form.interests.split(/[、,，]/g) : data?.interests ?? []).map((interest) => (
                  <li key={interest} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 bg-[var(--primary)]" />
                    {interest}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[var(--surface-container)] p-5 text-center">
              <h4 className="font-headline text-2xl text-[var(--primary)]">{tx("居所", "Sanctuary")}</h4>
              <p className="mt-8 font-headline text-3xl">{form.city || data?.city}</p>
            </div>
          </article>

          <article className="bg-[var(--surface-container)] p-5">
            <h4 className="font-headline text-2xl text-[var(--primary)]">{tx("语言设置", "Language")}</h4>
            <div className="mt-4 flex gap-3">
              <SealButton variant={lang === "zh" ? "primary" : "ghost"} onClick={() => setLang("zh")}>
                中文
              </SealButton>
              <SealButton variant={lang === "en" ? "primary" : "ghost"} onClick={() => setLang("en")}>
                English
              </SealButton>
            </div>
          </article>

          <div className="flex flex-wrap justify-center gap-3">
            {!isEditing ? (
              <SealButton onClick={() => setIsEditing(true)}>{tx("编辑资料", "Edit Profile")}</SealButton>
            ) : (
              <SealButton onClick={onSave} disabled={!form.bio.trim() || saveMutation.isPending}>
                {tx("保存", "Save")}
              </SealButton>
            )}
            <SealButton
              variant="ghost"
              onClick={() => {
                if (!data) return;
                setIsEditing(false);
                setForm({
                  displayName: data.displayName,
                  calling: data.calling,
                  city: data.city,
                  bio: data.bio,
                  interests: data.interests.join("、"),
                  avatar: data.avatar,
                });
              }}
            >
              {tx("取消", "Cancel")}
            </SealButton>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
