import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LoginScreen } from './components/screens/LoginScreen';
import { CentralLayout } from './components/layout/CentralLayout';
import { ReviewQueuePage } from './components/screens/ReviewQueuePage';
import { CaseDetailPage } from './components/screens/CaseDetailPage';
import { DashboardPage } from './components/screens/DashboardPage';
import { ReferralTrackerPage } from './components/screens/ReferralTrackerPage';
import { PhcHealthPage } from './components/screens/PhcHealthPage';

const RoleRouter = () => {
  const [role, setRole] = useState(null); // 'ophthalmologist' or 'admin'
  const navigate = useNavigate();

  const handleLogin = (selectedRole) => {
    setRole(selectedRole);
    if (selectedRole === 'ophthalmologist') {
      navigate('/ophth/queue');
    } else {
      navigate('/admin/dashboard');
    }
  };

  const handleLogout = () => {
    setRole(null);
    navigate('/');
  };

  return (
    <Routes>
      <Route path="/" element={<LoginScreen onLogin={handleLogin} />} />
      
      {/* Ophthalmologist Routes */}
      <Route path="/ophth" element={
        role === 'ophthalmologist' ? <CentralLayout role={role} onLogout={handleLogout} /> : <Navigate to="/" replace />
      }>
        <Route index element={<Navigate to="queue" replace />} />
        <Route path="queue" element={<ReviewQueuePage />} />
        <Route path="case/:caseId" element={<CaseDetailPage />} />
      </Route>

      {/* Admin Routes */}
      <Route path="/admin" element={
        role === 'admin' ? <CentralLayout role={role} onLogout={handleLogout} /> : <Navigate to="/" replace />
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="referrals" element={<ReferralTrackerPage />} />
        <Route path="phc-health" element={<PhcHealthPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <RoleRouter />
    </BrowserRouter>
  );
}

export default App;
