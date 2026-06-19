import React, { createContext, useContext, useState, useEffect } from 'react';
import { usersApi } from '../services/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const list = await usersApi.list();
        setUsers(list);
        if (list.length > 0) {
          const saved = localStorage.getItem('current_user');
          if (saved) {
            const parsed = JSON.parse(saved);
            const found = list.find(u => u.id === parsed.id);
            setCurrentUser(found || list[0]);
          } else {
            setCurrentUser(list[0]);
          }
        }
      } catch (e) {
        console.error('初始化用户失败:', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const switchUser = (user) => {
    setCurrentUser(user);
    localStorage.setItem('current_user', JSON.stringify(user));
  };

  const roleMap = {
    producer: { label: '制片', color: 'blue' },
    dispatcher: { label: '调度员', color: 'purple' },
    engineer: { label: '工程师', color: 'green' }
  };

  const value = {
    currentUser,
    users,
    loading,
    switchUser,
    roleMap
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
