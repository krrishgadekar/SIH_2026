import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PatientRegistrationForm } from './components/screens/PatientRegistrationForm';
import { CaptureScreen } from './components/screens/CaptureScreen';
import { LocalQueueTable } from './components/screens/LocalQueueTable';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/register" replace />} />
          <Route path="register" element={<PatientRegistrationForm />} />
          <Route path="capture" element={<CaptureScreen />} />
          <Route path="queue" element={<LocalQueueTable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
