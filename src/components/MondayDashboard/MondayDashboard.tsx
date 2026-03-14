'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';

const BG = '#0f1117';
const CARD_BG = '#13161f';
const BORDER = '#1e2130';

const STATUS_COLORS: Record<string, string> = {
  'N/A': '#9B9B9B',
  'Not touched': '#C4C4C4',
  'Rejected': '#E2445C',
  'Processing': '#00C875',
  'Follow up': '#FDAB3D',
  'Hired': '#00C875',
  'Not valid lead': '#FF7575',
  'Started load': '#579BFC',
  'Not called': '#C4C4C4',
};

function getColorForLabel(label: string): string {
  return STATUS_COLORS[label] || '#6b7280';
}

export interface MondayData {
  totalLeads: number;
  notCalled: number;
  followUp: number;
  hired: number;
  startedLoad: number;
  na: number;
  rejected: number;
  notValidLead: number;
  notOnTimeCall: number;
  firstTouchStatus: Record<string, number>;
  secondTouchStatus: Record<string, number>;
  boardBreakdown: { boardId: string; boardName: string; count: number }[];
  boardCount: number;
}

function formatAgo(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  if (min < 1) return 'Just now';
  if (min === 1) return '1m ago';
  return `${min}m ago`;
}

type DatePreset = 'this_month' | 'last_month' | 'all';

const CHART_CACHE_TTL = 5 * 60 * 1000;

export default function MondayDashboard({ embedded = false, cachedData, onCacheUpdate }: {
  embedded?: boolean;
  cachedData?: { data: MondayData; ts: number } | null;
  onCacheUpdate?: (data: MondayData) => void;
}) {
  const [data, setData] = useState<MondayData | null>(cachedData?.data ?? null);
  const [loading, setLoading] = useState(!cachedData || Date.now() - cachedData.ts > CHART_CACHE_TTL);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(cachedData?.ts ?? 0);
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [filterOpen, setFilterOpen] = useState<'first' | 'second' | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (datePreset !== 'all') params.set('datePreset', datePreset);
      const res = await fetch(`/api/monday?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(json);
      setLastFetch(Date.now());
      onCacheUpdate?.(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [datePreset, onCacheUpdate]);

  useEffect(() => {
    if (cachedData && Date.now() - cachedData.ts < CHART_CACHE_TTL) {
      setData(cachedData.data);
      setLastFetch(cachedData.ts);
      setLoading(false);
      return;
    }
    fetchData();
  }, [datePreset]);

  useEffect(() => {
    const id = setInterval(fetchData, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const firstTouchData = data?.firstTouchStatus
    ? Object.entries(data.firstTouchStatus).map(([name, value]) => ({ name, value }))
    : [];
  const secondTouchData = data?.secondTouchStatus
    ? Object.entries(data.secondTouchStatus).map(([name, value]) => ({ name, value }))
    : [];

  if (loading) {
    return (
      <div style={{
        minHeight: embedded ? 200 : '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', color: '#fff'
      }}>
        Loading...
      </div>
    );
  }

  const cardHeaderSx = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap' as const,
    gap: 8,
  };

  const filterPanel = (
    <div style={{
      padding: 16,
      background: 'rgba(30, 33, 48, 0.95)',
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      marginTop: 12,
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', marginBottom: 12 }}>Date range</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['this_month', 'last_month', 'all'] as const).map((preset) => (
          <button
            key={preset}
            onClick={() => { setDatePreset(preset); setFilterOpen(null); }}
            style={{
              padding: '8px 14px',
              background: datePreset === preset ? '#579BFC' : CARD_BG,
              border: `1px solid ${datePreset === preset ? '#579BFC' : BORDER}`,
              borderRadius: 6,
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            {preset === 'this_month' ? 'This month' : preset === 'last_month' ? 'Last month' : 'All time'}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100%',
      height: '100%',
      background: BG,
      fontFamily: 'system-ui, sans-serif',
      color: '#fff',
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>This month&apos;s Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: '0.9rem' }}>
            HR Department · {data?.boardCount ?? 0} connected boards
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', background: '#00C875',
            animation: 'pulse 2s ease-in-out infinite'
          }} />
          <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            {lastFetch ? formatAgo(Date.now() - lastFetch) : '—'}
          </span>
          <button
            onClick={fetchData}
            style={{
              padding: '8px 16px', background: CARD_BG, border: `1px solid ${BORDER}`,
              borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 16, background: 'rgba(226,68,92,0.15)', border: '1px solid #E2445C',
          borderRadius: 8, marginBottom: 24
        }}>
          {error}
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* Hero card - Monday style */}
        <div style={{
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: 8 }}>Total Leads</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800 }}>{data?.totalLeads ?? 0}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshIcon sx={{ color: '#9ca3af', fontSize: 18, cursor: 'pointer' }} onClick={fetchData} />
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{lastFetch ? formatAgo(Date.now() - lastFetch) : ''}</span>
            </div>
          </div>
        </div>

        {/* 8 stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { key: 'notCalled', label: 'Not called' },
            { key: 'followUp', label: 'Follow up' },
            { key: 'hired', label: 'Hired' },
            { key: 'startedLoad', label: 'Started load' },
            { key: 'na', label: 'N/A' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'notValidLead', label: 'Not valid lead' },
            { key: 'notOnTimeCall', label: 'Not on time call' },
          ].map(({ key, label }) => (
            <div
              key={key}
              style={{
                background: CARD_BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {data ? (data as Record<string, number>)[key] ?? 0 : 0}
              </div>
            </div>
          ))}
        </div>

        {/* Two donut charts - Monday style with filter icon */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <div style={{
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 24,
          }}>
            <div style={cardHeaderSx}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Leads&apos; status at first touch
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilterListIcon
                  sx={{ color: filterOpen === 'first' ? '#579BFC' : '#9ca3af', fontSize: 20, cursor: 'pointer' }}
                  onClick={() => setFilterOpen(filterOpen === 'first' ? null : 'first')}
                />
                <RefreshIcon sx={{ color: '#9ca3af', fontSize: 18, cursor: 'pointer' }} onClick={fetchData} />
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{lastFetch ? formatAgo(Date.now() - lastFetch) : ''}</span>
              </div>
            </div>
            {filterOpen === 'first' && filterPanel}
            <div style={{ height: 260 }}>
              {firstTouchData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={firstTouchData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {firstTouchData.map((entry, i) => (
                        <Cell key={i} fill={getColorForLabel(entry.name)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}
                      formatter={(val: number) => [val, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                  No data
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              {firstTouchData.map((d) => (
                <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: getColorForLabel(d.name) }} />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </div>

          <div style={{
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 24,
          }}>
            <div style={cardHeaderSx}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Leads&apos; status after second touch
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilterListIcon
                  sx={{ color: filterOpen === 'second' ? '#579BFC' : '#9ca3af', fontSize: 20, cursor: 'pointer' }}
                  onClick={() => setFilterOpen(filterOpen === 'second' ? null : 'second')}
                />
                <RefreshIcon sx={{ color: '#9ca3af', fontSize: 18, cursor: 'pointer' }} onClick={fetchData} />
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{lastFetch ? formatAgo(Date.now() - lastFetch) : ''}</span>
              </div>
            </div>
            {filterOpen === 'second' && filterPanel}
            <div style={{ height: 260 }}>
              {secondTouchData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={secondTouchData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {secondTouchData.map((entry, i) => (
                        <Cell key={i} fill={getColorForLabel(entry.name)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}
                      formatter={(val: number) => [val, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                  No data
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              {secondTouchData.map((d) => (
                <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: getColorForLabel(d.name) }} />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Board breakdown */}
        <div style={{
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 600 }}>Board breakdown</h3>
          <div style={{ height: 300 }}>
            {data?.boardBreakdown?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.boardBreakdown} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis type="number" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis
                    dataKey="boardName"
                    type="category"
                    width={140}
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickFormatter={(v) => v.length > 20 ? v.slice(0, 18) + '…' : v}
                  />
                  <Tooltip
                    contentStyle={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}
                  />
                  <Bar dataKey="count" fill="#579BFC" radius={[0, 4, 4, 0]} name="Items" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                No boards
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
