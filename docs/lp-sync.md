# LP Sync

Night Radar のLPは、アプリ本体とは別に制作したLPプロジェクトを正本として扱います。

- Source thread: `019f1c54-3f89-7581-bf75-70a31cf270c5`
- Source project: `/Users/home/Desktop/work/night-radar-lp`
- Target app: `/Users/home/Desktop/work/night-radar`

反映対象:

- `src/components/night-radar-landing.tsx`
- `src/components/night-radar-landing.module.css`
- `src/components/night-radar-motion.tsx`
- `public/lp/`

アプリ側では、CTAのリンクだけ本番運用に合わせて調整します。

- `β版を試す`: `/signup`
- `ログイン`: `/login`
- `NEXT_PUBLIC_APP_URL` または `NEXT_PUBLIC_SITE_URL` がある場合は、そのURLをベースにします。
