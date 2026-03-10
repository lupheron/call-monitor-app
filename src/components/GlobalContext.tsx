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
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapProgress, setBootstrapProgress] = useState('');
  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
    jwt: '',
  });


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