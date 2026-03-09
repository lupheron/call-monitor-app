'use client';

import { Box, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { Pie, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { RCUser, UserCalls, CallRecord } from '@/types';
import { fmtDuration } from '@/utils/helpers';
import { useMemo, useState } from 'react';
import { color } from 'chart.js/helpers';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

type TimeRange = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom';

export default function DashboardOverview({
  users,
  allCalls,
}: {
  users: RCUser[];
  allCalls: UserCalls;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>('Daily');

  const filteredByUser = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);

    if (timeRange === 'Daily') {
      cutoff.setDate(now.getDate() - 1);
    } else if (timeRange === 'Weekly') {
      cutoff.setDate(now.getDate() - 7);
    } else if (timeRange === 'Monthly') {
      cutoff.setMonth(now.getMonth() - 1);
    } else if (timeRange === 'Yearly') {
      cutoff.setFullYear(now.getFullYear() - 1);
    } else {
      // Custom is not wired yet; fall back to yearly window for now.
      cutoff.setFullYear(now.getFullYear() - 1);
    }

    const result: Record<number, CallRecord[]> = {};
    users.forEach((u) => {
      const calls = allCalls[u.id] || [];
      result[u.id] = calls.filter((c) => new Date(c.startTime) >= cutoff);
    });
    return result;
  }, [users, allCalls, timeRange]);

  const perUserStats = useMemo(() => {
    return users.map((u) => {
      const calls = filteredByUser[u.id] || [];
      let duration = 0;
      let outbound = 0;
      let inbound = 0;
      let missed = 0;
      let connected = 0;

      calls.forEach((c) => {
        duration += c.duration;
        if (c.direction === 'Outbound') outbound += 1;
        if (c.direction === 'Inbound') inbound += 1;
        if (c.result === 'Missed') missed += 1;
        if (c.result === 'Call connected' || c.result === 'Accepted') connected += 1;
      });

      return {
        id: u.id,
        name: u.name,
        callsCount: calls.length,
        duration,
        outbound,
        inbound,
        missed,
        connected,
      };
    });
  }, [users, filteredByUser]);

  const totalCalls = perUserStats.reduce((acc, u) => acc + u.callsCount, 0) || 1;

  const pieData = {
    labels: perUserStats.map((u) => u.name),
    datasets: [
      {
        data: perUserStats.map((u) => u.callsCount),
        backgroundColor: ['#00d9f5', '#ff4566', '#9b7dff', '#00e09a'],
        borderColor: 'rgba(0,0,0,0.2)',
        borderWidth: 1,
      },
    ],
  };

  const talkTimeBarData = {
    labels: perUserStats.map((u) => u.name),
    datasets: [
      {
        label: 'Talk time (minutes)',
        data: perUserStats.map((u) => Math.round(u.duration / 60)),
        backgroundColor: 'rgba(0,217,245,0.7)',
      },
    ],
  };

  const directionBarData = {
    labels: perUserStats.map((u) => u.name),
    datasets: [
      {
        label: 'Outbound',
        data: perUserStats.map((u) => u.outbound),
        backgroundColor: 'rgba(0,217,245,0.7)',
        stack: 'calls',
      },
      {
        label: 'Inbound',
        data: perUserStats.map((u) => u.inbound),
        backgroundColor: 'rgba(155,125,255,0.7)',
        stack: 'calls',
      },
      {
        label: 'Missed',
        data: perUserStats.map((u) => u.missed),
        backgroundColor: 'rgba(255,69,102,0.8)',
        stack: 'calls',
      },
    ],
  };

  const topCaller = perUserStats.reduce(
    (best, cur) => (cur.callsCount > best.callsCount ? cur : best),
    perUserStats[0] || {
      id: 0,
      name: '',
      callsCount: 0,
      duration: 0,
      outbound: 0,
      inbound: 0,
      missed: 0,
      connected: 0,
    }
  );

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>Team Call Overview</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
            Last {timeRange.toLowerCase()} · {totalCalls} calls · Top caller:{' '}
            {topCaller?.name || 'N/A'} ({topCaller?.callsCount || 0} calls,{' '}
            {fmtDuration(topCaller?.duration || 0)})
          </Typography>
        </Box>

        <ToggleButtonGroup
          value={timeRange}
          exclusive
          onChange={(_, v) => v && setTimeRange(v)}
          size="small"
          sx={{
            backgroundColor: 'var(--surface2)',
            '& .MuiToggleButton-root': {
              color: 'var(--text2)',
              border: '1px solid var(--border2)',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.75rem',
              px: 2,
              py: 0.5,
              '&.Mui-selected': {
                color: '#fff',
                backgroundColor: 'var(--surface3)',
              },
            },
          }}
        >
          <ToggleButton value="Daily">Today</ToggleButton>
          <ToggleButton value="Weekly">Weekly</ToggleButton>
          <ToggleButton value="Monthly">Monthly</ToggleButton>
          <ToggleButton value="Yearly">Yearly</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.8fr)', gap: 3 }}>
        <Box
          sx={{
            backgroundColor: 'var(--surface)',
            borderRadius: 3,
            border: '1px solid var(--border)',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text2)' }}>
            Calls share by user
          </Typography>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <Pie
              data={pieData}
              options={{
                plugins: {
                  legend: { labels: { color: '#ffffff', boxWidth: 16 } },
                  tooltip: {
                    bodyColor: '#ffffff',
                    titleColor: '#ffffff',
                  },
                },
              }}
            />
          </Box>
        </Box>

        <Box
          sx={{
            backgroundColor: 'var(--surface)',
            borderRadius: 3,
            border: '1px solid var(--border)',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text2)' }}>
            Talk time by user
          </Typography>
          <Bar
            data={talkTimeBarData}
            options={{
              responsive: true,
              plugins: {
                legend: { labels: { color: '#ffffff' } },
                tooltip: {
                  bodyColor: '#ffffff',
                  titleColor: '#ffffff',
                },
              },
              scales: {
                x: {
                  ticks: { color: '#ffffff' },
                  grid: { color: 'var(--border2)' },
                },
                y: {
                  ticks: { color: '#ffffff' },
                  grid: { color: 'var(--border2)' },
                },
              },
            }}
          />
        </Box>
      </Box>

      <Box
        sx={{
          backgroundColor: 'var(--surface)',
          borderRadius: 3,
          border: '1px solid var(--border)',
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text2)' }}>
          Inbound / outbound / missed by user
        </Typography>
        <Bar
          data={directionBarData}
          options={{
            responsive: true,
            plugins: {
                legend: { labels: { color: '#ffffff' } },
                tooltip: {
                  bodyColor: '#ffffff',
                  titleColor: '#ffffff',
                },
            },
            scales: {
              x: {
                stacked: true,
                  ticks: { color: '#ffffff' },
                grid: { color: 'var(--border2)' },
              },
              y: {
                stacked: true,
                  ticks: { color: '#ffffff' },
                grid: { color: 'var(--border2)' },
              },
            },
          }}
        />
      </Box>
    </Box>
  );
}

