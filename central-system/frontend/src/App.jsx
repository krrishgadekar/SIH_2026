import React, { useState, Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { LoginScreen } from './components/screens/LoginScreen';
import { CentralLayout } from './components/layout/CentralLayout';
import { ReviewQueuePage } from './components/screens/ReviewQueuePage';
import { CaseDetailPage } from './components/screens/CaseDetailPage';
import { DashboardPage } from './components/screens/DashboardPage';
import { ReferralTrackerPage } from './components/screens/ReferralTrackerPage';
import { PhcHealthPage } from './components/screens/PhcHealthPage';
import { PatientTimelinePage } from './components/screens/PatientTimelinePage';
import { ProgramHealthPage } from './components/screens/ProgramHealthPage';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', maxWidth: '600px', margin: '60px auto', background: '#FFF8F0', border: '2px solid #A82222', boxShadow: '4px 4px 0px #A82222' }}>
          <h2 style={{ color: '#A82222', margin: '0 0 16px 0', fontFamily: 'monospace' }}>APPLICATION ERROR</h2>
          <p style={{ color: '#2C1810', fontFamily: 'monospace', fontSize: '13px' }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={() => {
              localStorage.removeItem('netra_user_role');
              window.location.href = '/';
            }}
            style={{ marginTop: '20px', padding: '10px 20px', background: '#A82222', color: '#FFF', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700 }}
          >
            RETURN TO LOGIN
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const RoleRouter = () => {
  const [role, setRole] = useState(() => {
    return localStorage.getItem('netra_user_role') || null;
  });
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('netra_user_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    const currentRole = localStorage.getItem('netra_user_role') || 'ophthalmologist';
    const isDoc = currentRole === 'ophthalmologist';
    return {
      username: 'krrish',
      fullName: isDoc ? 'Dr. Krrish Gadekar' : 'Krrish Gadekar',
      phone: '+91 98230 44821',
      location: isDoc ? 'District Civil Hospital, Pune' : 'Pune District Health Office',
      email: 'krrishgadekar@gmail.com',
      designation: isDoc ? 'Chief Retina Specialist / Lead Ophthalmologist' : 'District Health Officer (DHO)',
      officerId: 'DHO-MH-PUN-042',
      district: 'Pune District (Rural & Peri-Urban Zone)',
      role: currentRole
    };
  });
  const navigate = useNavigate();

  const handleLogin = (selectedRole, username) => {
    localStorage.setItem('netra_user_role', selectedRole);
    setRole(selectedRole);
    const isDoc = selectedRole === 'ophthalmologist';
    const cleanUser = username && username.trim() ? username.trim() : 'krrish';
    const isKrrish = cleanUser.toLowerCase().includes('krrish') || cleanUser.toLowerCase() === 'doctor' || cleanUser.toLowerCase() === 'admin';
    const formattedName = isKrrish 
      ? (isDoc ? 'Dr. Krrish Gadekar' : 'Krrish Gadekar')
      : cleanUser;

    const profile = {
      username: cleanUser,
      fullName: formattedName,
      phone: '+91 98230 44821',
      location: isDoc ? 'District Civil Hospital, Pune' : 'Pune District Health Office',
      email: 'krrishgadekar@gmail.com',
      designation: isDoc ? 'Chief Retina Specialist / Lead Ophthalmologist' : 'District Health Officer (DHO)',
      officerId: 'DHO-MH-PUN-042',
      district: 'Pune District (Rural & Peri-Urban Zone)',
      role: selectedRole
    };
    localStorage.setItem('netra_user_profile', JSON.stringify(profile));
    setUserProfile(profile);
    if (selectedRole === 'ophthalmologist') {
      navigate('/ophth/queue');
    } else {
      navigate('/admin/dashboard');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('netra_user_role');
    setRole(null);
    navigate('/');
  };

  const handleUpdateProfile = (newProfile) => {
    const merged = { ...userProfile, ...newProfile };
    localStorage.setItem('netra_user_profile', JSON.stringify(merged));
    setUserProfile(merged);
  };

  return (
    <Routes>
      <Route path="/" element={<LoginScreen onLogin={handleLogin} />} />
      
      {/* Ophthalmologist Routes */}
      <Route path="/ophth" element={
        role === 'ophthalmologist' ? <CentralLayout role={role} userProfile={userProfile} onUpdateProfile={handleUpdateProfile} onLogout={handleLogout} /> : <Navigate to="/" replace />
      }>
        <Route index element={<Navigate to="queue" replace />} />
        <Route path="queue" element={<ReviewQueuePage />} />
        <Route path="case/:caseId" element={<CaseDetailPage />} />
        <Route path="timeline" element={<PatientTimelinePage />} />
        <Route path="health" element={<ProgramHealthPage />} />
      </Route>

      {/* Admin Routes */}
      <Route path="/admin" element={
        role === 'admin' ? <CentralLayout role={role} userProfile={userProfile} onUpdateProfile={handleUpdateProfile} onLogout={handleLogout} /> : <Navigate to="/" replace />
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
    <ErrorBoundary>
      <BrowserRouter>
        <RoleRouter />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
