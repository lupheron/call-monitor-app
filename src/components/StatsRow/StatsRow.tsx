'use client';

import { Box, Typography } from '@mui/material';
import { RCUser, UserCalls, CallRecord } from '@/types';
import { fmtDuration } from '@/utils/helpers';
import { useEffect, useState } from 'react';

export default function StatsRow({ users, allCalls }: { users: RCUser[], allCalls: UserCalls }) {
  const [totalCalls, setTotalCalls] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [totalOutbound, setTotalOutbound] = useState(0);
  const [totalMissed, setTotalMissed] = useState(0);

  useEffect(() => {
    let callsCount = 0;
    let durationSum = 0;
    let outboundCount = 0;
    let missedCount = 0;

    Object.values(allCalls).forEach((calls: CallRecord[]) => {
      callsCount += calls.length;
      calls.forEach((c: CallRecord) => {
        durationSum += c.duration;
        if (c.direction === 'Outbound') outboundCount++;
        if (c.result === 'Missed') missedCount++;
      });
    });

    setTotalCalls(callsCount);
    setTotalDuration(durationSum);
    setTotalOutbound(outboundCount);
    setTotalMissed(missedCount);
  }, [allCalls]);

  const stats = [
    { label: 'TOTAL USERS', value: users.length.toString(), color: 'var(--accent)' },
    { label: 'TOTAL CALLS', value: totalCalls.toLocaleString(), color: 'var(--red)' },
    { label: 'TALK TIME', value: fmtDuration(totalDuration), color: 'var(--purple)' },
    { label: 'OUTBOUND', value: totalOutbound.toLocaleString(), color: 'var(--green)' },
    { label: 'MISSED', value: totalMissed.toLocaleString(), color: 'var(--yellow)' },
  ];

  return (
    <Box sx={{ 
        display: 'flex', 
        borderBottom: '1px solid var(--border)', 
        animation: 'fadeUp 0.6s ease-out forwards',
        backgroundColor: 'var(--surface)'
    }}>
      {stats.map((stat, i) => (
        <Box key={i} sx={{ 
            flex: 1, 
            p: 3, 
            borderRight: i < stats.length - 1 ? '1px solid var(--border2)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 1
        }}>
          <Typography sx={{ 
              fontSize: '0.75rem', 
              fontFamily: 'var(--font-mono)', 
              color: 'var(--text2)', 
              fontWeight: 600,
              letterSpacing: '0.5px'
          }}>
            {stat.label}
          </Typography>
          <Typography sx={{ 
              fontSize: '2rem', 
              fontWeight: 700, 
              color: stat.color,
              lineHeight: 1
          }}>
            {stat.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
