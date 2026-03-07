'use client';

import { Box, Drawer, Typography, TextField, List, ListItemButton, Avatar, InputAdornment } from '@mui/material';
import { RCUser, UserCalls, CallRecord } from '@/types';
import { getInitials, getColor, fmtDuration } from '@/utils/helpers';
import { useState, useMemo } from 'react';
import SearchIcon from '@mui/icons-material/Search';

export default function Sidebar({
  users,
  allCalls,
  selectedUser,
  onSelect
}: {
  users: RCUser[];
  allCalls: UserCalls;
  selectedUser: RCUser | null;
  onSelect: (user: RCUser) => void;
}) {
  const [search, setSearch] = useState('');

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const query = search.toLowerCase();
      const phoneMatch = u.phoneNumbers?.some((p: any) => p.phoneNumber?.toLowerCase().includes(query));
      return u.name.toLowerCase().includes(query) || phoneMatch;
    });
  }, [users, search]);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: 300,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 300,
          boxSizing: 'border-box',
          backgroundColor: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          top: 56, // below header
          height: 'calc(100vh - 56px)',
          overflow: 'hidden'
        },
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text2)', letterSpacing: '1px' }}>
          USERS &middot; {filteredUsers.length}
        </Typography>
        <TextField
          variant="outlined"
          placeholder="Search name or phone..."
          size="small"
          fullWidth
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'var(--bg)',
              '& fieldset': { borderColor: 'var(--border2)' },
              '&:hover fieldset': { borderColor: 'var(--text3)' },
            },
            input: { color: 'var(--text)', fontSize: '0.9rem' }
          }}
          slotProps={{
            input: {
                startAdornment: (
                    <InputAdornment position="start">
                        <SearchIcon sx={{ color: 'var(--text3)', fontSize: '1.2rem' }} />
                    </InputAdornment>
                ),
            }
          }}
        />
      </Box>

      <List sx={{ p: 0, overflowY: 'auto', flex: 1, backgroundColor: 'transparent' }}>
        {filteredUsers.map((user, index) => {
          const calls = allCalls[user.id] || [];
          const talkTime = calls.reduce((acc: number, c: CallRecord) => acc + c.duration, 0);
          const isActive = selectedUser?.id === user.id;

          const phoneNumbersString = user.phoneNumbers
              ? user.phoneNumbers.map((n: any) => n.phoneNumber).filter(Boolean).join(', ')
              : '';

          return (
            <ListItemButton
              key={user.id}
              onClick={() => onSelect(user)}
              selected={isActive}
              sx={{
                py: 2,
                borderBottom: '1px solid var(--border)',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                backgroundColor: isActive ? 'rgba(0, 217, 245, 0.05)' : 'transparent',
                '&.Mui-selected': {
                  backgroundColor: 'rgba(0, 217, 245, 0.05)',
                  '&:hover': { backgroundColor: 'rgba(0, 217, 245, 0.08)' }
                },
                '&:hover': {
                  backgroundColor: 'var(--surface2)',
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                <Avatar sx={{ bgcolor: getColor(index), width: 36, height: 36, fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                  {getInitials(user.name)}
                </Avatar>
                
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9rem', color: isActive ? 'var(--text)' : 'var(--text)' }}>
                    {user.name}
                  </Typography>
                  <Typography noWrap sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text2)' }}>
                    {phoneNumbersString || 'No direct number'}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)' }}>
                    {calls.length}
                  </Typography>
                  <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text3)' }}>
                    {fmtDuration(talkTime)}
                  </Typography>
                </Box>
              </Box>
            </ListItemButton>
          );
        })}
      </List>
    </Drawer>
  );
}
