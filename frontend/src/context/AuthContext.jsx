import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axiosClient from '../api/axiosClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('idol_mgmt_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const syncProfile = useCallback(async () => {
    const token = localStorage.getItem('idol_mgmt_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await axiosClient.get('/auth/me');
      setUser(res.data);
      localStorage.setItem('idol_mgmt_user', JSON.stringify(res.data));
    } catch {
      localStorage.removeItem('idol_mgmt_token');
      localStorage.removeItem('idol_mgmt_user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    syncProfile();
  }, [syncProfile]);

  const login = async (username, password) => {
    const res = await axiosClient.post('/auth/login', { username, password });
    const { token, user: loggedUser } = res.data;
    localStorage.setItem('idol_mgmt_token', token);
    localStorage.setItem('idol_mgmt_user', JSON.stringify(loggedUser));
    setUser(loggedUser);
    return loggedUser;
  };

  const logout = () => {
    localStorage.removeItem('idol_mgmt_token');
    localStorage.removeItem('idol_mgmt_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, syncProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);