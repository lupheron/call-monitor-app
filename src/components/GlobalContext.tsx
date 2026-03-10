'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { RCUser, UserCalls, CallRecord } from '@/types';

interface GlobalDateFilter {
  preset: 'today' | 'week' | 'month' | 'custom';
  from: string;
  to: string;
}

export interface WaitingUserStat {
  name: string;
  calls: WaitingCallRecord[];
  totalCalls: number;
  talkTime: number;
  outbound: number;
  inbound: number;
  missed: number;
  voicemail: number;
  hangup: number;
  connected: number;
}

export interface WaitingCallRecord {
  id: string;
  direction: string;
  duration: number;
  startTime: string;
  result: string;
  from: { phoneNumber?: string; name?: string };
  to: { phoneNumber?: string; name?: string };
}

interface WaitingFetchState {
  isFetching: boolean;
  progress: string;
  error: string | null;
  hasFetched: boolean;
}

interface GlobalContextType {
  accessToken: string | null;
  users: RCUser[];
  allCalls: UserCalls;
  rawCalls: UserCalls;
  selectedUser: RCUser | null;
  globalDateFilter: GlobalDateFilter;
  isBootstrapping: boolean;
  bootstrapProgress: string;
  credentials: { clientId: string; clientSecret: string; jwt: string };
  waitingStats: WaitingUserStat[];
  waitingFetchState: WaitingFetchState;
  setAccessToken: (token: string | null) => void;
  setUsers: (users: RCUser[]) => void;
  setAllCalls: (calls: UserCalls) => void;
  setRawCalls: (calls: UserCalls) => void;
  setSelectedUser: (user: RCUser | null) => void;
  setGlobalDateFilter: (filter: GlobalDateFilter) => void;
  setIsBootstrapping: (bootstrapping: boolean) => void;
  setBootstrapProgress: (progress: string) => void;
  setCredentials: (credentials: { clientId: string; clientSecret: string; jwt: string }) => void;
  runWaitingFetch: (fromDate: Date, toDate: Date) => Promise<void>;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export function useGlobalContext() {
  const context = useContext(GlobalContext);
  if (!context) {
    throw new Error('useGlobalContext must be used within a GlobalProvider');
  }
  return context;
}

const WHITELIST = ['Charles White', 'Ethan Parker', 'Tony Royce'];

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 5): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    await sleep(1200);
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const wait = retryAfter ? parseInt(retryAfter) * 1000 : 60000 * (attempt + 1);
      console.log(`429 hit, waiting ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }
  throw new Error('Max retries exceeded');
}

interface GlobalProviderProps {
  children: ReactNode;
}

export function GlobalProvider({ children }: GlobalProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [users, setUsers] = useState<RCUser[]>([]);
  const [allCalls, setAllCalls] = useState<UserCalls>({});
  const [rawCalls, setRawCalls] = useState<UserCalls>({});
  const [selectedUser, setSelectedUser] = useState<RCUser | null>(null);
  const [globalDateFilter, setGlobalDateFilter] = useState<GlobalDateFilter>({
    preset: 'today',
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapProgress, setBootstrapProgress] = useState('');
  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
    jwt: '',
  });

  // Waiting dashboard state
  const [waitingStats, setWaitingStats] = useState<WaitingUserStat[]>([]);
  const [waitingFetchState, setWaitingFetchState] = useState<WaitingFetchState>({
    isFetching: false,
    progress: '',
    error: null,
    hasFetched: false,
  });

  const runWaitingFetch = async (fromDate: Date, toDate: Date) => {
    setWaitingFetchState({ isFetching: true, progress: 'Authenticating...', error: null, hasFetched: false });
    setWaitingStats([]);

    try {
      const saved = localStorage.getItem('rc_credentials');
      if (!saved) throw new Error('Not logged in. Please log in first.');
      const creds = JSON.parse(saved);

      const tokenRes = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error || 'Auth failed');
      const token = tokenData.access_token;

      setWaitingFetchState(prev => ({ ...prev, progress: 'Fetching users...' }));
      await sleep(1200);

      const usersRes = await fetch(
        '/api/rc/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1',
        { headers: { 'x-rc-auth': token } }
      );
      const usersData = await usersRes.json();
      const allUsers = usersData.records || [];
      const targetUsers = allUsers.filter((u: any) => WHITELIST.includes(u.name));

      const dateFrom = fromDate.toISOString().split('T')[0];
      const dateTo = toDate.toISOString().split('T')[0];

      const results: WaitingUserStat[] = [];

      for (let i = 0; i < targetUsers.length; i++) {
        const user = targetUsers[i];
        setWaitingFetchState(prev => ({
          ...prev,
          progress: `Fetching calls for ${user.name} (${i + 1}/${targetUsers.length})...`
        }));

        const calls: WaitingCallRecord[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const url = `/api/rc/v1.0/account/~/extension/${user.id}/call-log?view=Detailed&type=Voice&dateFrom=${dateFrom}&dateTo=${dateTo}&page=${page}&perPage=100`;
          const data = await fetchWithRetry(url, { 'x-rc-auth': token });
          const records = data.records || [];

          records.forEach((call: any) => {
            calls.push({
              id: call.id,
              direction: call.direction,
              duration: call.duration,
              startTime: call.startTime,
              result: call.result,
              from: call.from,
              to: call.to,
            });
          });

          hasMore = records.length === 100;
          page++;
          if (page > 20) break;
        }

        results.push({
          name: user.name,
          calls,
          totalCalls: calls.length,
          talkTime: calls.reduce((acc, c) => acc + c.duration, 0),
          outbound: calls.filter(c => c.direction === 'Outbound').length,
          inbound: calls.filter(c => c.direction === 'Inbound').length,
          missed: calls.filter(c => c.result === 'Missed').length,
          voicemail: calls.filter(c => c.result === 'Voicemail').length,
          hangup: calls.filter(c => c.result === 'HungUp' || c.result === 'Declined').length,
          connected: calls.filter(c => c.result === 'Accepted' || c.result === 'Call connected').length,
        });
      }

      setWaitingStats(results);
      setWaitingFetchState({ isFetching: false, progress: '', error: null, hasFetched: true });

    } catch (err: any) {
      setWaitingFetchState({ isFetching: false, progress: '', error: err.message, hasFetched: false });
    }
  };

  return (
    <GlobalContext.Provider
      value={{
        accessToken,
        users,
        allCalls,
        rawCalls,
        selectedUser,
        globalDateFilter,
        isBootstrapping,
        bootstrapProgress,
        credentials,
        waitingStats,
        waitingFetchState,
        setAccessToken,
        setUsers,
        setAllCalls,
        setRawCalls,
        setSelectedUser,
        setGlobalDateFilter,
        setIsBootstrapping,
        setBootstrapProgress,
        setCredentials,
        runWaitingFetch,
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
}