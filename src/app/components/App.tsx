import { useEffect, useState } from 'react';
import { AppShell, type TabKey } from './ui-nr/AppShell';
import { HomePage } from './pages/HomePage';
import { DetailPage } from './pages/DetailPage';
import { SearchPage } from './pages/SearchPage';
import { SchedulePage } from './pages/SchedulePage';
import { AccountPage } from './pages/AccountPage';
import { useNightRadarData } from './data/runtime';

export default function App() {
  const { bars } = useNightRadarData();
  const [tab, setTab] = useState<TabKey>('home');
  const [detailId, setDetailId] = useState<string>(() => bars[0]?.id ?? '');

  const openDetail = (id: string) => {
    setDetailId(id);
    setTab('detail');
  };

  useEffect(() => {
    function notifyTodayCandidate() {
      if (!bars[0] || !('Notification' in window) || Notification.permission !== 'granted') return;
      if (window.localStorage.getItem('night-radar:candidate-notification') !== 'enabled') return;
      const dateParts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
      }).formatToParts(new Date());
      const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((item) => item.type === type)?.value ?? '';
      const dateKey = `${part('year')}-${part('month')}-${part('day')}`;
      if (Number(part('hour')) < 18 || window.localStorage.getItem('night-radar:last-candidate-notification') === dateKey) return;
      new Notification('今日の候補が更新されました', {
        body: `${bars[0].name}：当日顧客投稿 ${bars[0].postCount}件、直近3時間 ${bars[0].recentThreeHourCount}件`,
        icon: '/icons/icon-192.png',
      });
      window.localStorage.setItem('night-radar:last-candidate-notification', dateKey);
    }

    notifyTodayCandidate();
    const timer = window.setInterval(notifyTodayCandidate, 60_000);
    return () => window.clearInterval(timer);
  }, [bars]);

  return (
    <AppShell tab={tab} onTab={setTab}>
      {tab === 'home' && <HomePage onOpen={openDetail} onNavigate={setTab} />}
      {tab === 'detail' && <DetailPage id={detailId} onOpen={openDetail} />}
      {tab === 'search' && <SearchPage onOpen={openDetail} />}
      {tab === 'schedule' && <SchedulePage />}
      {tab === 'account' && <AccountPage />}
    </AppShell>
  );
}
