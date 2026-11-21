import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./Dashboard";
import StudentRecords from "./StudentRecords";
import StaffRecords from "./StaffRecords";
import ClassesSubjects from "./ClassesSubjects";
import Attendance from "./Attendance";
import ResultsPerformance from "./ResultsPerformance";
import FeesPayments from "./FeesPayments";
import Announcements from "./Announcements";
import Settings from "./Settings";
import Login from "./Login";
import SignUp from "./SignUp";
import ForgotPassword from "./ForgotPassword";
import AccountsAccess from "./AccountsAccess";
import RolePortal from "./RolePortal";
import LearnerAccounts from "./LearnerAccounts";
import ChangePassword from "./ChangePassword";
import { AuthProvider, useAuth } from "./AuthContext";

function Protected({ children, adminOnly = false }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <div className="loading-state">Loading secure workspace...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && location.pathname !== "/change-password") return <Navigate to="/change-password" replace />;
  if (adminOnly && !["principal", "admin"].includes(user.role)) return <Navigate to="/portal" replace />;
  return children;
}

function Home() {
  const { user, checking } = useAuth();
  if (checking) return <div className="loading-state">Loading secure workspace...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  return ["principal", "admin"].includes(user.role) ? <Dashboard /> : <Navigate to="/portal" replace />;
}

function App() {
  const admin = (Component) => <Protected adminOnly><Component /></Protected>;
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<SignUp />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />
    <Route path="/" element={<Home />} />
    <Route path="/portal" element={<Protected><RolePortal /></Protected>} />
    <Route path="/records" element={admin(StudentRecords)} />
    <Route path="/staff" element={admin(StaffRecords)} />
    <Route path="/classes" element={admin(ClassesSubjects)} />
    <Route path="/attendance" element={admin(Attendance)} />
    <Route path="/results" element={admin(ResultsPerformance)} />
    <Route path="/fees" element={admin(FeesPayments)} />
    <Route path="/announcements" element={admin(Announcements)} />
    <Route path="/settings" element={admin(Settings)} />
    <Route path="/accounts" element={admin(AccountsAccess)} />
    <Route path="/learner-accounts" element={admin(LearnerAccounts)} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter></AuthProvider>;
}

export default App;
