import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Calendar, TrendingUp, Search } from 'lucide-react';
import { GlassCard } from '../ui-nr/GlassCard';
import { type CalendarEventItem } from '../data/mock';
import { useNightRadarData } from '../data/runtime';
import { DigitRoll } from '../ui-nr/DigitRoll';
import { WordReveal, Stagger, StaggerItem } from '../ui-nr/Reveal';
import { useMemo, useState } from 'react';

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];
const FILTERS = ['すべて', '朝・昼', '夜', 'BINGO', '月1', '誕生日'];
const ease = [0.22, 1, 0.36, 1] as const;

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function matchesFilter(event: CalendarEventItem, filter: string) {
  if (filter === '朝・昼') return event.session === 'day';
  if (filter === '夜') return event.session === 'night';
  if (filter === 'BINGO' || filter === '月1' || filter === '誕生日') return event.tag === filter;
  return true;
}

function matchesQuery(event: CalendarEventItem, query: string) {
  const normalized = query.trim().toLocaleLowerCase('ja-JP');
  if (!normalized) return true;
  return [event.storeName, event.title, event.detail ?? '', event.tag]
    .some((value) => value.toLocaleLowerCase('ja-JP').includes(normalized));
}

export function SchedulePage() {
  const { events, meta } = useNightRadarData();
  const [visibleMonth, setVisibleMonth] = useState(meta.currentMonth);
  const [selected, setSelected] = useState<number | null>(Number(meta.todayKey.slice(-2)) || 1);
  const [filter, setFilter] = useState('すべて');
  const [query, setQuery] = useState('');
  const [year, month] = visibleMonth.split('-').map(Number);
  const firstOffset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstOffset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => i - firstOffset + 1);
  const monthLabel = visibleMonth.replace('-', '.');
  const monthEvents = useMemo(() => events.filter((event) => event.date.startsWith(visibleMonth)), [events, visibleMonth]);
  const filteredEvents = useMemo(
    () => monthEvents.filter((event) => matchesFilter(event, filter) && matchesQuery(event, query)),
    [filter, monthEvents, query],
  );
  const selectedEvents = filteredEvents.filter((event) => event.day === selected);
  const dayCount = monthEvents.filter((event) => event.session === 'day').length;
  const nightCount = monthEvents.filter((event) => event.session === 'night').length;
  const featuredCount = monthEvents.filter((event) => ['BINGO', '月1', '誕生日'].includes(event.tag)).length;
  const sourcedCount = monthEvents.filter((event) => event.sourceUrl).length;

  function moveMonth(delta: number) {
    const nextMonth = shiftMonth(visibleMonth, delta);
    const isCurrentMonth = nextMonth === meta.currentMonth;
    const firstEventDay = events.find((event) => event.date.startsWith(nextMonth))?.day;
    setVisibleMonth(nextMonth);
    setSelected(isCurrentMonth ? Number(meta.todayKey.slice(-2)) || 1 : firstEventDay ?? 1);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5 lg:gap-8 items-end pt-4">
        <div>
          <motion.div className="flex items-center gap-2 mb-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease }}>
            <span className="nr-pulse" />
            <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>月間予定 · {monthLabel}</span>
          </motion.div>
          <h1 className="nr-heading text-[34px] sm:text-[40px] leading-[1.15]" style={{ color: 'var(--nr-text-hi)' }}>
            <WordReveal text="朝・昼・夜の予定を" />
            <br />
            <WordReveal text="日付から確認する。" delay={0.35} />
          </h1>
          <motion.p className="text-[13px] mt-4 max-w-[520px] leading-relaxed"
            style={{ color: 'var(--nr-text-mid)' }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.7 }}
          >
            登録済みイベントを、朝・昼・夜、BINGO、月1、誕生日で絞り込めます。店舗名やイベント名でも検索できます。
          </motion.p>
        </div>
        <motion.div className="flex items-center gap-2 justify-start lg:justify-end"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.4 }}>
          <button type="button" className="nr-chip" onClick={() => moveMonth(-1)} aria-label="前の月"><ChevronLeft size={14} /></button>
          <div className="nr-heading flex items-center gap-2 px-3">
            <Calendar size={14} color="var(--nr-accent)" />
            <span className="text-[24px]" style={{ color: 'var(--nr-text-hi)' }}>{monthLabel}</span>
          </div>
          <button type="button" className="nr-chip" onClick={() => moveMonth(1)} aria-label="次の月"><ChevronRight size={14} /></button>
        </motion.div>
      </div>

      <Stagger delay={0.85} gap={0.07}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { l: '月間予定', v: monthEvents.length, s: '件' , sub: '登録済み' },
            { l: '朝・昼', v: dayCount, s: '件', sub: '昼営業を含む' },
            { l: '夜', v: nightCount, s: '件', sub: '夜営業' },
            { l: '指定イベント', v: featuredCount, s: '件', sub: 'BINGO・月1・誕生日' },
          ].map((item, i) => (
            <StaggerItem key={i}>
              <GlassCard className="p-4 nr-focus nr-hairline">
                <span className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>{item.l}</span>
                <div className="nr-heading text-[30px] mt-1" style={{ color: 'var(--nr-text-hi)' }}>
                  <DigitRoll value={`${item.v}${item.s}`} />
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--nr-text-low)' }}>{item.sub}</div>
              </GlassCard>
            </StaggerItem>
          ))}
        </div>
      </Stagger>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3 items-center">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="nr-mono text-[11px] mr-1" style={{ color: 'var(--nr-text-mid)' }}>時間帯・種類</span>
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className="nr-chip"
              data-active={filter === item}
              aria-pressed={filter === item}
              onClick={() => setFilter(filter === item && item !== 'すべて' ? 'すべて' : item)}
            >
              {item !== 'すべて' && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: item === '朝・昼' ? 'var(--nr-accent-soft)' : 'var(--nr-accent)' }} />}
              {item}
            </button>
          ))}
        </div>
        <label className="nr-glass rounded-xl px-3 py-2 flex items-center gap-2">
          <Search size={14} color="var(--nr-text-mid)" />
          <span className="sr-only">予定を検索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="店舗名・イベント名"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--nr-text-hi)' }}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <GlassCard className="p-3 sm:p-5 nr-hairline overflow-x-auto">
          <div className="min-w-[720px]">
          <div className="grid grid-cols-7 gap-2 mb-2">
            {DAYS.map((day) => (
              <div key={day} className="nr-mono text-[11px] text-center py-1" style={{ color: 'var(--nr-text-mid)' }}>{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {cells.map((day, index) => {
              const inMonth = day >= 1 && day <= daysInMonth;
              const events = filteredEvents.filter((event) => event.day === day);
              const isSelected = day === selected;
              return (
                <motion.button key={index}
                  type="button"
                  disabled={!inMonth}
                  aria-pressed={isSelected}
                  aria-label={inMonth ? `${month}月${day}日、予定${events.length}件` : undefined}
                  onClick={() => inMonth && setSelected(day)}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: inMonth ? 1 : 0.35, y: 0 }}
                  whileHover={inMonth ? { y: -2 } : undefined}
                  transition={{ delay: index * 0.008, duration: 0.6, ease }}
                  layout
                  className="rounded-xl p-2 min-h-[110px] flex flex-col gap-1 cursor-pointer relative text-left disabled:cursor-default"
                  style={{
                    border: '1px solid var(--nr-border)',
                    background: events.length ? 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015))' : 'transparent',
                  }}
                >
                  {isSelected && (
                    <motion.div layoutId="cal-sel"
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                      style={{
                        border: '1px solid var(--nr-accent)',
                        background: 'linear-gradient(180deg, rgba(255,106,91,0.12), rgba(255,106,91,0.03))',
                        boxShadow: '0 0 24px var(--nr-accent-glow)',
                      }}
                    />
                  )}
                  <div className="flex items-center justify-between relative">
                    <span className="nr-mono text-[12px]" style={{ color: inMonth ? 'var(--nr-text-hi)' : 'var(--nr-text-low)' }}>{inMonth ? String(day).padStart(2, '0') : ''}</span>
                    {events.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: events[0].color, boxShadow: `0 0 6px ${events[0].color}` }} />
                    )}
                  </div>
                  {events.slice(0, 2).map((event) => (
                    <div key={event.id} className="rounded-md px-1.5 py-1 relative" style={{
                      background: `${event.color}18`, border: `1px solid ${event.color}40`
                    }}>
                      <div className="nr-mono" style={{ color: event.color, fontSize: 10 }}>{event.tag} · {event.startsAt || '時刻未登録'}</div>
                      <div className="text-[10px]" style={{ color: 'var(--nr-text-hi)' }}>{event.storeName}</div>
                      <div className="text-[9px]" style={{ color: 'var(--nr-text-mid)' }}>{event.title}</div>
                    </div>
                  ))}
                  {events.length > 2 && <div className="nr-mono text-[9px] relative" style={{ color: 'var(--nr-text-low)' }}>ほか {events.length - 2}件</div>}
                </motion.button>
              );
            })}
          </div>
          </div>
        </GlassCard>

        <div className="flex flex-col gap-3">
          <GlassCard className="p-5 flex flex-col gap-3 nr-hairline overflow-hidden">
            <div className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>選択した日</div>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${visibleMonth}-${selected}`}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5, ease }}
              >
                <div className="nr-heading text-[36px]" style={{ color: 'var(--nr-text-hi)' }}>{monthLabel}.{String(selected ?? 0).padStart(2, '0')}</div>
              </motion.div>
            </AnimatePresence>
            {selectedEvents.length ? (
              <div className="flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1">
                <div className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>{selectedEvents.length}件の予定</div>
                {selectedEvents.map((event) => (
                  <div key={event.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ border: '1px solid var(--nr-border)', background: 'rgba(255,255,255,0.025)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="nr-chip w-fit" data-accent="true">{event.tag}</span>
                      <span className="nr-mono text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>{event.startsAt || '時刻未登録'}</span>
                    </div>
                    <div className="text-[13px]" style={{ color: 'var(--nr-text-mid)' }}>{event.storeName}</div>
                    <div className="text-[14px] leading-relaxed" style={{ color: 'var(--nr-text-hi)' }}>{event.title}</div>
                    {event.detail && <div className="text-[11px] leading-relaxed" style={{ color: 'var(--nr-text-low)' }}>{event.detail}</div>}
                    {event.sourceUrl ? (
                      <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="nr-chip w-fit">公式情報を見る</a>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'var(--nr-text-low)' }}>公式URL未登録</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[13px]" style={{ color: 'var(--nr-text-low)' }}>この条件で登録済みの予定はありません。</div>
            )}
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-3 nr-hairline">
            <TrendingUp size={16} color="var(--nr-accent)" />
            <div className="text-[11px]" style={{ color: 'var(--nr-text-mid)' }}>
              {monthEvents.length}件中、公式URLを確認できる予定は <span className="nr-mono" style={{ color: 'var(--nr-accent-soft)' }}>{sourcedCount}件</span> です。
            </div>
          </GlassCard>
        </div>
      </div>

      <div className="nr-mono text-[10px]" style={{ color: 'var(--nr-text-low)' }}>
        ※ 予定は登録済みの公式情報を表示します。変更や中止はリンク先で最終確認してください。
      </div>
    </div>
  );
}
