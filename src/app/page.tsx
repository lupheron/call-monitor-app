'use client';

import { useState } from 'react';
import { Box } from '@mui/material';
import Header from '@/components/Header/Header';
import ConfigPanel from '@/components/ConfigPanel/ConfigPanel';
import Sidebar from '@/components/Sidebar/Sidebar';
import StatsRow from '@/components/StatsRow/StatsRow';
import UserDetail from '@/components/UserDetail/UserDetail';
import { RCUser, UserCalls } from '@/types';

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [users, setUsers] = useState<RCUser[]>([]);
  const [allCalls, setAllCalls] = useState<UserCalls>({});
  const [selectedUser, setSelectedUser] = useState<RCUser | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<boolean | null>(null);
  const [showConfig, setShowConfig] = useState(true);

  const getInitialDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 365); // fetch a year for local offline filtering
    return d.toISOString().split('T')[0];
  };

  const getToday = () => {
    return new Date().toISOString().split('T')[0];
  };

  const [credentials, setCredentials] = useState({
    clientId: 'aFivteBC64Rd0Y09JKEB5V',
    clientSecret: 'aWIy6Ey1oONfkRk9zvMDoqYc7gMb7Y7ddeBv19TTPrCM',
    jwt: 'eyJraWQiOiI4NzYyZjU5OGQwNTk0NGRiODZiZjVjYTk3ODA0NzYwOCIsInR5cCI6IkpXVCIsImFsZyI6IlJTMjU2In0.eyJhdWQiOiJodHRwczovL3BsYXRmb3JtLnJpbmdjZW50cmFsLmNvbS9yZXN0YXBpL29hdXRoL3Rva2VuIiwic3ViIjoiOTI1MDY2MDM1IiwiaXNzIjoiaHR0cHM6Ly9wbGF0Zm9ybS5yaW5nY2VudHJhbC5jb20iLCJleHAiOjM5MjAzMTIwNTEsImlhdCI6MTc3MjgyODQwNCwianRpIjoiZWw2RHlkamNUMDZpbUNCd1dZY3JvUSJ9.difrX-VCFPqVt3dIquuoSVlgMXmwsqcdN3DAPolqUhOaCD3C88JgdXSoAGIX_AmFScVFwy0eSnvblOpXLyy5WgfEU8uXanqxlQmEhnZGT6CPhFkfLIZIuKcB7nDSlZiQh-y4D4oXWEkJwuibhWhmNgGV2W_Dbwrnsp30eMZiXiskoffkO3dInO4otwq-SvRVqOPo7BGE-yGop3VlQP-_qzqfIrcgdjRrvMpOTcqJzzvVLxtPtTksz_i3couIn2ezupKgKgPrTYr23IMUjR7CDZef6OlYP5uzbC1rorEFkPz-VpnbO3WCX3adRKiaVoMZ134296J8r2VKTM1J9IWDkA',
    dateFrom: getInitialDate(),
    dateTo: getToday()
  });

  const handleCredentialChange = (field: string, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  const handleLoad = async () => {
    setIsLoading(true);
    setError(null);
    setStatusOk(null);

    try {
      // 1. Authenticate
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
      setAccessToken(token);
      setStatusOk(true);

      // 2. Fetch Users
      setLoadingMsg('Loading users...');
      let allFoundUsers: RCUser[] = [];
      let nextUrl = '/api/rc/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1';
      
      while (nextUrl) {
         const usersRes = await fetch(nextUrl, { headers: { 'x-rc-auth': token } });
         const usersData = await usersRes.json();
         if (!usersRes.ok) throw new Error(usersData.error || 'Failed to load users');
         
         allFoundUsers = [...allFoundUsers, ...usersData.records];
         
         if (usersData.navigation?.nextPage) {
            nextUrl = usersData.navigation.nextPage.uri.replace('https://platform.ringcentral.com/restapi', '/api/rc');
         } else {
            nextUrl = '';
         }
      }
      
      // Filter only specific users
      const whitelist = ['Alex Chester', 'Charles White', 'Ethan Parker', 'Tony Royce'];
      const filteredFoundUsers = allFoundUsers.filter(u => whitelist.includes(u.name));
      
      setUsers(filteredFoundUsers);

      // 3. Fetch Calls for each user
      const callsMap: UserCalls = {};
      
      for (let i = 0; i < filteredFoundUsers.length; i++) {
        const u = filteredFoundUsers[i];
        setLoadingMsg(`Loading calls (${i + 1}/${filteredFoundUsers.length})...`);
        
        let userCallRecords: any[] = [];
        let callPageUrl = `/api/rc/v1.0/account/~/extension/${u.id}/call-log?view=Detailed&dateFrom=${credentials.dateFrom}T00:00:00.000Z&dateTo=${credentials.dateTo}T23:59:59.000Z&perPage=100&page=1`;
        let pagesLoaded = 0;

        while (callPageUrl && pagesLoaded < 5) {
            const callsRes = await fetch(callPageUrl, { headers: { 'x-rc-auth': token } });
            if (!callsRes.ok) {
                // If specific user logging fails, just continue
                break;
            }
            const callsData = await callsRes.json();
            userCallRecords = [...userCallRecords, ...(callsData.records || [])];
            
            if (callsData.navigation?.nextPage) {
                const queryParams = new URL(callsData.navigation.nextPage.uri).search;
                callPageUrl = `/api/rc/v1.0/account/~/extension/${u.id}/call-log${queryParams}`;
            } else {
                callPageUrl = '';
            }
            pagesLoaded++;
        }
        
        callsMap[u.id] = userCallRecords;
      }

      setAllCalls(callsMap);

      if (filteredFoundUsers.length > 0) {
        setSelectedUser(filteredFoundUsers[0]);
      }
      
      setShowConfig(false);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setStatusOk(false);
    } finally {
      setIsLoading(false);
    }
  };

  const status = error ? 'error' : statusOk ? 'connected' : 'idle';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Header status={status} />
      
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
                onSelect={setSelectedUser} 
            />
            {/* Main Content Area */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <StatsRow users={users} allCalls={allCalls} />
              {selectedUser ? (
                  <UserDetail 
                      user={selectedUser} 
                      calls={allCalls[selectedUser.id] || []} 
                      userIndex={users.findIndex(u => u.id === selectedUser.id)} 
                  />
              ) : (
                  <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>No user selected</Box>
                  </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
