'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RCUser, UserCalls, CallRecord } from '@/types';

interface GlobalDateFilter {
  preset: 'today' | 'week' | 'month' | 'custom';
  from: string;
  to: string;
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
  setAccessToken: (token: string | null) => void;
  setUsers: (users: RCUser[]) => void;
  setAllCalls: (calls: UserCalls) => void;
  setRawCalls: (calls: UserCalls) => void;
  setSelectedUser: (user: RCUser | null) => void;
  setGlobalDateFilter: (filter: GlobalDateFilter) => void;
  setIsBootstrapping: (bootstrapping: boolean) => void;
  setBootstrapProgress: (progress: string) => void;
  setCredentials: (credentials: { clientId: string; clientSecret: string; jwt: string }) => void;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export function useGlobalContext() {
  const context = useContext(GlobalContext);
  if (!context) {
    throw new Error('useGlobalContext must be used within a GlobalProvider');
  }
  return context;
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
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapProgress, setBootstrapProgress] = useState('Initializing...');
  const [credentials, setCredentials] = useState({
    clientId: process.env.NEXT_PUBLIC_RC_CLIENT_ID || '',
    clientSecret: process.env.NEXT_PUBLIC_RC_CLIENT_SECRET || '',
    jwt: process.env.NEXT_PUBLIC_RC_JWT || '',
  });

  useEffect(() => {
    const bootstrap = async () => {
      try {
        if (!credentials.clientId || !credentials.clientSecret || !credentials.jwt) {
          setBootstrapProgress('RingCentral credentials not configured');
          setUsers([]);
          setAllCalls({});
          setIsBootstrapping(false);
          return;
        }

        setBootstrapProgress('Authenticating...');
        const authResponse = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        });
        if (!authResponse.ok) {
          console.warn('Authentication failed, proceeding with empty data');
          setUsers([]);
          setAllCalls({});
          setIsBootstrapping(false);
          return;
        }
        const authData = await authResponse.json();
        setAccessToken(authData.access_token);

        setBootstrapProgress('Fetching users...');
        const usersResponse = await fetch('/api/rc/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1', {
          headers: { 'x-rc-auth': authData.access_token },
        });
        if (!usersResponse.ok) throw new Error('Failed to fetch users');
        const usersData = await usersResponse.json();
        const fetchedUsers: RCUser[] = usersData.records.map((u: any) => ({
          id: u.id,
          name: u.name,
          extensionNumber: u.extensionNumber,
          status: u.status,
          phoneNumbers: u.phoneNumbers || [],
          contact: u.contact,
        }));
        setUsers(fetchedUsers);

        const callsFiltered: UserCalls = {};
        const callsRaw: UserCalls = {};
        for (let i = 0; i < fetchedUsers.length; i++) {
          const user = fetchedUsers[i];
          setBootstrapProgress(`Fetching ${user.name}... (${i + 1}/${fetchedUsers.length})`);
          const { raw, filtered } = await fetchUserCalls(authData.access_token, user.id);
          callsFiltered[user.id] = filtered;
          callsRaw[user.id] = raw;
        }
        setAllCalls(callsFiltered);
        setRawCalls(callsRaw);
        setIsBootstrapping(false);
      } catch (error) {
        console.error('Bootstrapping failed:', error);
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, [credentials]);

  const fetchUserCalls = async (
    token: string,
    userId: number
  ): Promise<{ raw: CallRecord[]; filtered: CallRecord[] }> => {
    const raw: CallRecord[] = [];
    const filtered: CallRecord[] = [];
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 90);
    const dateTo = new Date();
    let page = 1;
    const perPage = 100;

      while (raw.length < 500) {
      const url = `/api/rc/v1.0/account/~/extension/${userId}/call-log?view=Detailed&type=Voice&dateFrom=${dateFrom
        .toISOString()
        .split('T')[0]}&dateTo=${dateTo.toISOString().split('T')[0]}&page=${page}&perPage=${perPage}`;
      const response = await fetchWithDelay(url, { 'x-rc-auth': token }, 600);
      if (!response.ok) break;
      const data = await response.json();
      const batch: CallRecord[] = data.records.map((call: any) => ({
        id: call.id,
        direction: call.direction,
        duration: call.duration,
        startTime: call.startTime,
        result: call.result,
        from: call.from,
        to: call.to,
      }));

      raw.push(...batch);

      const filteredBatch = batch.filter((call: CallRecord) => {
        if (call.result === 'Missed') return true;
        if (call.result === 'Accepted' || call.result === 'Call connected') {
          return call.duration >= 20;
        }
        return false;
      });

      filtered.push(...filteredBatch);
      if (data.records.length < perPage) break;
      page++;
      if (page > 10) break;
    }

    return {
      raw: raw.slice(0, 500),
      filtered: filtered.slice(0, 500),
    };
  };

  const fetchWithDelay = async (url: string, headers: Record<string, string>, delayMs = 600) => {
    await new Promise(r => setTimeout(r, delayMs));
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 3000));
      return fetch(url, { headers });
    }
    return res;
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
        setAccessToken,
        setUsers,
        setAllCalls,
        setRawCalls,
        setSelectedUser,
        setGlobalDateFilter,
        setIsBootstrapping,
        setBootstrapProgress,
        setCredentials,
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
}