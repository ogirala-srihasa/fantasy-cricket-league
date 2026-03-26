import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const { user, league } = useAuth();

  useEffect(() => {
    const socketUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';
    const newSocket = io(socketUrl, { transports: ['websocket', 'polling'] });

    newSocket.on('connect', () => {
      setConnected(true);
      if (league?.id) {
        newSocket.emit('join_league', { leagueId: league.id });
      }
    });

    newSocket.on('disconnect', () => setConnected(false));

    setSocket(newSocket);
    return () => newSocket.close();
  }, [user?.id]);

  useEffect(() => {
    if (socket && connected && league?.id) {
      socket.emit('join_league', { leagueId: league.id });
    }
  }, [league?.id, connected]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
