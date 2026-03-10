'use client';

import { useEffect, useState } from 'react';
import { Box, LinearProgress, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import Header from '@/components/Header/Header';
import ConfigPanel from '@/components/ConfigPanel/ConfigPanel';
import Sidebar from '@/components/Sidebar/Sidebar';
import StatsRow from '@/components/StatsRow/StatsRow';
import UserDetail from '@/components/UserDetail/UserDetail';
import DashboardOverview from '@/components/DashboardOverview/DashboardOverview';
import { RCUser, UserCalls } from '@/types';
import { useGlobalContext } from '@/components/GlobalContext';

const WHITELIST = ['Alex Chester', 'Charles White', 'Ethan Parker', 'Tony Royce'];

export default function Home() {
  const { users, setUsers, allCalls, setAllCalls, selectedUser, setSelectedUser, globalDateFilter, setGlobalDateFilter } = useGlobalContext();
  const [activeView, setActiveView] = useState<'overview' | 'user'>('overview');
  const [hasMounted, setHasMounted] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<boolean | null>(null);
  const [showConfig, setShowConfig] = useState(true);
  const [syncPhase, setSyncPhase] = useState<'idle' | 'syncing' | 'done'>('idle');

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const getInitialDate = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  };
  const getToday = () => new Date().toISOString().split('T')[0];

  const [credentials, setCredentials] = useState({
    clientId: 'aFivteBC64Rd0Y09JKEB5V',
    clientSecret: 'aWIy6Ey1oONfkRk9zvMDoqYc7gMb7Y7ddeBv19TTPrCM',
    jwt: 'eyJraWQiOiI4NzYyZjU5OGQwNTk0NGRiODZiZjVjYTk3ODA0NzYwOCIsInR5cCI6IkpXVCIsImFsZyI6IlJTMjU2In0.eyJhdWQiOiJodHRwczovL3BsYXRmb3JtLnJpbmdjZW50cmFsLmNvbS9yZXN0YXBpL29hdXRoL3Rva2VuIiwic3ViIjoiOTI1MDY2MDM1IiwiaXNzIjoiaHR0cHM6Ly9wbGF0Zm9ybS5yaW5nY2VudHJhbC5jb20iLCJleHAiOjM5MjAzMTIwNTEsImlhdCI6MTc3MjgyODQwNCwianRpIjoiZWw2RHlkamNUMDZpbUNCd1dZY3JvUSJ9.difrX-VCFPqVt3dIquuoSVlgMXmwsqcdN3DAPolqUhOaCD3C88JgdXSoAGIX_AmFScVFwy0eSnvblOpXLyy5WgfEU8uXanqxlQmEhnZGT6CPhFkfLIZIuKcB7nDSlZiQh-y4D4oXWEkJwuibhWhmNgGV2W_Dbwrnsp30eMZiXiskoffkO3dInO4otwq-SvRVqOPo7BGE-yGop3VlQP-_qzqfIrcgdjRrvMpOTcqJzzvVLxtPtTksz_i3couIn2ezupKgKgPrTYr23IMUjR7CDZef6OlYP5uzbC1rorEFkPz-VpnbO3WCX3adRKiaVoMZ134296J8r2VKTM1J9IWDkA',
    dateFrom: getInitialDate(),
    dateTo: getToday()
  });

  const loadCallsFromDb = async (filteredUsers: RCUser[]) => {
    const ids = filteredUsers.map(u => u.id).join(',');
    try {
      const res = await fetch(`/api/calls?range=all&extensionIds=${ids}`);
      const data = await res.json();
      const newMap: UserCalls = {};
      filteredUsers.forEach(u => newMap[u.id] = []);
      (data.records || []).forEach((c: any) => {
        const extId = parseInt(c.extension.id);
        if (newMap[extId] === undefined) return;
        if (c.result === 'Missed') {
          newMap[extId].push(c);
          return;
        }
        if ((c.result === 'Accepted' || c.result === 'Call connected') && c.duration >= 20) {
          newMap[extId].push(c);
          return;
        }
      });
      setAllCalls(newMap);
    } catch (e) {
      console.error('Failed to load calls from DB', e);
    }
  };

  const handleCredentialChange = (field: string, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  const handleLoad = async () => {
    setIsLoading(true);
    setError(null);
    setStatusOk(null);

    try {
      setLoadingMsg('Connecting...');
      const tokenRes = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          jwt: credentials.jwt
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error || 'Authentication failed');
      const token = tokenData.access_token;
      setStatusOk(true);

      setLoadingMsg('Loading users...');
      let allFoundUsers: RCUser[] = [];
      let nextUrl = '/api/rc/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1';
      while (nextUrl) {
        const usersRes = await fetch(nextUrl, { headers: { 'x-rc-auth': token } });
        const usersData = await usersRes.json();
        if (!usersRes.ok) throw new Error(usersData.error || 'Failed to load users');
        allFoundUsers = [...allFoundUsers, ...usersData.records];
        nextUrl = usersData.navigation?.nextPage
          ? usersData.navigation.nextPage.uri.replace('https://platform.ringcentral.com/restapi', '/api/rc')
          : '';
      }
      const filteredUsers = allFoundUsers.filter(u => WHITELIST.includes(u.name));
      setUsers(filteredUsers);
      if (filteredUsers.length > 0) setSelectedUser(filteredUsers[0]);

      const ids = filteredUsers.map(u => u.id).join(',');
      const cachedRes = await fetch(`/api/calls?range=all&extensionIds=${ids}`);
      const cachedData = await cachedRes.json();
      const hasCachedData = (cachedData.records || []).length > 0;

      if (hasCachedData) {
        await loadCallsFromDb(filteredUsers);
        setShowConfig(false);
        setActiveView('overview');
        setIsLoading(false);
        setSyncPhase('done');
      } else {
        setShowConfig(false);
        setActiveView('overview');
        setIsLoading(false);
        setSyncPhase('syncing');
      }

      const extensionIds = filteredUsers.map(u => u.id);
      const syncRes = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, extensionIds })
      });

      if (syncRes.ok) {
        await loadCallsFromDb(filteredUsers);
        setSyncPhase('done');
      }

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setStatusOk(false);
      setIsLoading(false);
    }
  };

  const status = error ? 'error' : statusOk ? 'connected' : 'idle';

  if (!hasMounted) {
    return null;
  }

  const handleSelectUser = (user: RCUser) => {
    setSelectedUser(user);
    setActiveView('user');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Header status={status} />

      {syncPhase === 'syncing' && (
        <Box sx={{ px: 2, py: 0.5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 2 }}>
          <LinearProgress sx={{ flex: 1, height: 3, borderRadius: 2, '& .MuiLinearProgress-bar': { background: 'var(--accent)' } }} />
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
            Fetching call history… please wait
          </Typography>
        </Box>
      )}

      <Box sx={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
        {showConfig ? (
          <ConfigPanel
            credentials={credentials}
            onChange={handleCredentialChange}
            onLoad={handleLoad}
            isLoading={isLoading}
            loadingMsg={loadingMsg}
            error={error}
          />
        ) : (
          <>
            <Sidebar
              users={users}
              allCalls={allCalls}
              selectedUser={selectedUser}
              onSelect={handleSelectUser}
              activeView={activeView}
              onSelectDashboard={() => setActiveView('overview')}
            />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <StatsRow users={users} allCalls={allCalls} />
              <Box sx={{ px: 3, pt: 2, pb: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <ToggleButtonGroup
                  value={activeView}
                  exclusive
                  onChange={(_, v) => v && setActiveView(v)}
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
                  <ToggleButton value="overview">Dashboard</ToggleButton>
                  <ToggleButton value="user" disabled={!selectedUser}>
                    User detail
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              {activeView === 'overview' ? (
                <DashboardOverview users={users} allCalls={allCalls} />
              ) : selectedUser ? (
                <UserDetail
                  user={selectedUser}
                  calls={allCalls[selectedUser.id] || []}
                  userIndex={users.findIndex(u => u.id === selectedUser.id)}
                  syncPhase={syncPhase}
                />
              ) : null}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
