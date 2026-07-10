import { useState } from 'react';
import { AppShell, type TabKey } from './ui-nr/AppShell';
import { HomePage } from './pages/HomePage';
import { DetailPage } from './pages/DetailPage';
import { SearchPage } from './pages/SearchPage';
import { SchedulePage } from './pages/SchedulePage';
import { AccountPage } from './pages/AccountPage';
import { BARS } from './data/mock';

export default function App() {
  const [tab, setTab] = useState<TabKey>('home');
  const [detailId, setDetailId] = useState<string>(() => BARS[0]?.id ?? '');

  const openDetail = (id: string) => { setDetailId(id); setTab('detail'); };

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
