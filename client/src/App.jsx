import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Navbar from './components/Layout/Navbar';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import AuctionRoom from './pages/auction/AuctionRoom';
import MyAuctionSquad from './pages/contestA/MyAuctionSquad';
import ContestALeaderboard from './pages/contestA/ContestALeaderboard';
import MatchList from './pages/contestB/MatchList';
import TeamPicker from './pages/contestB/TeamPicker';
import ContestBLeaderboard from './pages/contestB/ContestBLeaderboard';
import AdminPanel from './pages/admin/AdminPanel';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-primary-900">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-gold-300 font-medium animate-pulse">Loading...</p>
      </div>
    </div>
  );
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-primary-900">
      {user && <Navbar />}
      <main className={user ? 'pt-16' : ''}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/auction" element={<ProtectedRoute><AuctionRoom /></ProtectedRoute>} />
          <Route path="/my-squad" element={<ProtectedRoute><MyAuctionSquad /></ProtectedRoute>} />
          <Route path="/contest-a/leaderboard" element={<ProtectedRoute><ContestALeaderboard /></ProtectedRoute>} />
          <Route path="/matches" element={<ProtectedRoute><MatchList /></ProtectedRoute>} />
          <Route path="/match/:matchId/pick" element={<ProtectedRoute><TeamPicker /></ProtectedRoute>} />
          <Route path="/contest-b/leaderboard" element={<ProtectedRoute><ContestBLeaderboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
