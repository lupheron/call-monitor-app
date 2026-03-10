'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Card,
  CardContent,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { useGlobalContext } from './GlobalContext';
import { differenceInDays } from 'date-fns';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'placeholder-client-id';

interface UserStats {
  userId: number;
  name: string;
  totalCalls: number;
  talkTime: number;
  outbound: number;
  inbound: number;
  missed: number;
  voicemail: number;
  hangups: number;
  under20s: number;
  avgDuration: number;
}

function Section2ContentInner() {
  const { users, rawCalls } = useGlobalContext();
  const [fromDate, setFromDate] = useState<Date | null>(new Date());
  const [toDate, setToDate] = useState<Date | null>(new Date());
  const [isFetching, setIsFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState('');
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const handleFetch = async () => {
    if (!fromDate || !toDate) return;

    setIsFetching(true);
    setFetchProgress('Starting fetch...');
    setUserStats([]);

    try {
      const stats: UserStats[] = [];
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        setFetchProgress(`Fetching ${user.name}... (${i + 1}/${users.length})`);
        await new Promise(r => setTimeout(r, 1000));

        const userCalls = rawCalls[user.id] || [];
        const filteredCalls = userCalls.filter(call => {
          const callDate = new Date(call.startTime).toISOString().split('T')[0];
          return callDate >= fromDate.toISOString().split('T')[0] && callDate <= toDate.toISOString().split('T')[0];
        });

        const totalCalls = filteredCalls.length;
        const talkTime = filteredCalls.reduce((sum, call) => sum + call.duration, 0);
        const outbound = filteredCalls.filter(call => call.direction === 'Outbound').length;
        const inbound = filteredCalls.filter(call => call.direction === 'Inbound').length;
        const missed = filteredCalls.filter(call => call.result === 'Missed').length;
        const voicemail = filteredCalls.filter(call => call.result === 'Voicemail').length;
        const hangups = filteredCalls.filter(call => call.result === 'HungUp').length;
        const under20s = filteredCalls.filter(call => call.duration < 20).length;
        const avgDuration = totalCalls > 0 ? talkTime / totalCalls : 0;

        stats.push({
          userId: user.id,
          name: user.name,
          totalCalls,
          talkTime,
          outbound,
          inbound,
          missed,
          voicemail,
          hangups,
          under20s,
          avgDuration,
        });
      }

      setUserStats(stats);
    } catch (error) {
      console.error('Fetch failed:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const response = await fetch('/api/export/sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: userStats, accessToken: tokenResponse.access_token }),
        });

        if (response.ok) {
          const data = await response.json();
          setSnackbar({ open: true, message: 'Report exported successfully!', severity: 'success' });
          window.open(data.sheetUrl, '_blank');
        } else {
          throw new Error('Export failed');
        }
      } catch (error) {
        setSnackbar({ open: true, message: 'Export failed. Please try again.', severity: 'error' });
      }
    },
    onError: () => {
      setSnackbar({ open: true, message: 'Google login failed.', severity: 'error' });
    },
    scope: 'https://www.googleapis.com/auth/spreadsheets',
  });

  const isDateRangeValid = fromDate && toDate && differenceInDays(toDate, fromDate) <= 31;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
          <DatePicker
            label="From"
            value={fromDate}
            onChange={setFromDate}
            slotProps={{ textField: { size: 'small' } }}
          />
          <DatePicker
            label="To"
            value={toDate}
            onChange={setToDate}
            slotProps={{ textField: { size: 'small' } }}
          />
          <Button
            variant="contained"
            onClick={handleFetch}
            disabled={!isDateRangeValid || isFetching}
          >
            Start Fetching
          </Button>
          {isFetching && (
            <Button variant="outlined" color="error">
              Cancel
            </Button>
          )}
        </Box>

        {!isDateRangeValid && fromDate && toDate && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Date range cannot exceed 1 month.
          </Alert>
        )}

        {isFetching && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress />
            <Typography sx={{ mt: 1 }}>{fetchProgress}</Typography>
          </Box>
        )}

        {userStats.length > 0 && (
          <>
            <Box sx={{ mb: 2 }}>
              <Button
                variant="contained"
                onClick={() => login()}
                sx={{ backgroundColor: '#34A853', '&:hover': { backgroundColor: '#2e7d32' } }}
              >
                Export to Google Sheets
              </Button>
            </Box>
            <Tabs value={0} sx={{ mb: 2 }}>
              <Tab label="All Users Summary" />
              {users.map((user, index) => (
                <Tab key={user.id} label={user.name} />
              ))}
            </Tabs>
            <Card sx={{ backgroundColor: '#141720', border: '1px solid #1e2436' }}>
              <CardContent>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#8892b0' }}>Name</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Total Calls</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Talk Time</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Outbound</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Inbound</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Missed</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Voicemail</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Hangups</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Under 20s</TableCell>
                      <TableCell sx={{ color: '#8892b0' }}>Avg Duration</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {userStats.map((stat) => (
                      <TableRow key={stat.userId}>
                        <TableCell sx={{ color: '#dde2f0' }}>{stat.name}</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{stat.totalCalls}</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{Math.floor(stat.talkTime / 3600)}h {Math.floor((stat.talkTime % 3600) / 60)}m</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{stat.outbound}</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{stat.inbound}</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{stat.missed}</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{stat.voicemail}</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{stat.hangups}</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{stat.under20s}</TableCell>
                        <TableCell sx={{ color: '#dde2f0' }}>{Math.round(stat.avgDuration)}s</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </LocalizationProvider>
  );
}

export function Section2Content() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Section2ContentInner />
    </GoogleOAuthProvider>
  );
}