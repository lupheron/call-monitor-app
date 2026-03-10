'use client';

import { Box, Typography, Avatar, ToggleButtonGroup, ToggleButton, TextField } from '@mui/material';
import { RCUser, CallRecord } from '@/types';
import { getInitials, getColor } from '@/utils/helpers';
import { useState, useMemo } from 'react';
import MiniCharts from '../MiniCharts/MiniCharts';
import CallTable from '../CallTable/CallTable';
import { useGlobalContext } from '@/components/GlobalContext';

export default function UserDetail({
  user,
  calls,
  userIndex,
  syncPhase
}: {
  user: RCUser;
  calls: CallRecord[];
  userIndex: number;
  syncPhase: 'idle' | 'syncing' | 'done';
}) {
  const [activeFilter, setActiveFilter] = useState<'All' | 'Outbound' | 'Inbound' | 'Missed'>('All');
  const { globalDateFilter } = useGlobalContext();
  const timeRange = globalDateFilter.preset === 'today' ? 'Daily'
    : globalDateFilter.preset === 'week' ? 'Weekly'
    : globalDateFilter.preset === 'month' ? 'Monthly'
    : globalDateFilter.preset === 'custom' ? 'Custom'
    : 'Yearly';
  const customDateFrom = globalDateFilter.preset === 'custom' ? globalDateFilter.from : '';
  const customDateTo = globalDateFilter.preset === 'custom' ? globalDateFilter.to : '';

  const historyReady = syncPhase === 'done';

  const filteredCalls = useMemo(() => {
    let result = calls;
    if (activeFilter === 'Missed') result = result.filter(c => c.result === 'Missed');
    else if (activeFilter !== 'All') result = result.filter(c => c.direction === activeFilter);

    const now = new Date();
    const cutoff = new Date(now);
    if (timeRange === 'Daily') {
      cutoff.setDate(now.getDate() - 1);
      result = result.filter(c => new Date(c.startTime) >= cutoff);
    } else if (timeRange === 'Weekly') {
      cutoff.setDate(now.getDate() - 7);
      result = result.filter(c => new Date(c.startTime) >= cutoff);
    } else if (timeRange === 'Monthly') {
      cutoff.setMonth(now.getMonth() - 1);
      result = result.filter(c => new Date(c.startTime) >= cutoff);
    } else if (timeRange === 'Yearly') {
      cutoff.setFullYear(now.getFullYear() - 1);
      result = result.filter(c => new Date(c.startTime) >= cutoff);
    } else if (timeRange === 'Custom') {
      if (customDateFrom) result = result.filter(c => new Date(c.startTime) >= new Date(customDateFrom));
      if (customDateTo) {
        const to = new Date(customDateTo);
        to.setHours(23, 59, 59, 999);
        result = result.filter(c => new Date(c.startTime) <= to);
      }
    }

    return result;
  }, [calls, activeFilter, timeRange, customDateFrom, customDateTo]);

  const maxDuration = useMemo(() => {
    if (!filteredCalls.length) return 1;
    return Math.max(...filteredCalls.map(c => c.duration));
  }, [filteredCalls]);

  const handleFilterChange = (event: React.MouseEvent<HTMLElement>, newFilter: typeof activeFilter) => {
    if (newFilter !== null) setActiveFilter(newFilter);
  };

  const phoneNumbersString = user.phoneNumbers
      ? user.phoneNumbers.map(n => n.phoneNumber).filter(Boolean).join(', ')
      : 'No direct number';

  const userColor = getColor(userIndex);

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <Avatar sx={{ bgcolor: userColor, width: 64, height: 64, borderRadius: 3, fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
            {getInitials(user.name)}
          </Avatar>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text)', mb: 0.5 }}>
              {user.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text2)' }}>
                {phoneNumbersString}
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', color: 'var(--text3)' }}>
                Ext {user.extensionNumber} &middot; {user.contact?.department || 'Unknown Dept'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <ToggleButtonGroup
          value={activeFilter}
          exclusive
          onChange={handleFilterChange}
          color="primary"
          size="small"
          sx={{
            backgroundColor: 'var(--surface2)',
            '& .MuiToggleButton-root': {
              color: 'var(--text2)',
              border: '1px solid var(--border2)',
              textTransform: 'none',
              fontWeight: 600,
              px: 2,
              '&.Mui-selected': {
                color: '#fff',
                backgroundColor: activeFilter === 'Outbound' ? 'var(--accent)' 
                               : activeFilter === 'Inbound' ? 'var(--purple)' 
                               : activeFilter === 'Missed' ? 'var(--red)' 
                               : 'var(--accent)',
              }
            }
          }}
        >
          <ToggleButton value="All">All</ToggleButton>
          <ToggleButton value="Outbound">Outbound</ToggleButton>
          <ToggleButton value="Inbound">Inbound</ToggleButton>
          <ToggleButton value="Missed">Missed</ToggleButton>
        </ToggleButtonGroup>
        </Box>
      </Box>

      <MiniCharts user={user} calls={filteredCalls} userIndex={userIndex} color={userColor} />

      <CallTable calls={filteredCalls} maxDuration={maxDuration} />
    </Box>
  );
}
