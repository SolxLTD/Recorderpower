import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  UserRoundCog,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  CreditCard,
  Megaphone,
  Settings,
  LockKeyhole,
  LogOut,
  KeyRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiFetch, useAuth } from "./AuthContext";

const navigation = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "/",
  },
  {
    label: "Student Records",
    icon: Users,
    path: "/records",
  },
  {
    label: "Staff Records",
    icon: UserRoundCog,
    path: "/staff",
  },
  {
    label: "Classes & Subjects",
    icon: BookOpen,
    path: "/classes",
  },
  {
    label: "Attendance",
    icon: ClipboardCheck,
    path: "/attendance",
  },
  {
    label: "Results & Performance",
    icon: GraduationCap,
    path: "/results",
  },
  {
    label: "Fees & Payments",
    icon: CreditCard,
    path: "/fees",
  },
  {
    label: "Announcements",
    icon: Megaphone,
    path: "/announcements",
  },
  {
    label: "Accounts & Access",
    icon: KeyRound,
    path: "/accounts",
  },
  {
    label: "Student & Parent Access",
    icon: UserRoundPlus,
    path: "/learner-accounts",
  },
];

function AdminLayout({ children, title, breadcrumb }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  useEffect(() => {
    const load = () => apiFetch("/api/announcements").then((response) => response.json()).then((data) => setAnnouncements(data.announcements || [])).catch(() => {});
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const isActive = (path) => {
    if (path === "/") {
      return location.pathname === "/";
    }

    return location.pathname.startsWith(path);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <LayoutDashboard size={23} />
          </div>

          <div>
            <h2>SKUL</h2>
            <span>School Intelligence</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">MAIN</div>

          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                className={`nav-item ${
                  isActive(item.path) ? "active" : ""
                }`}
                onClick={() => navigate(item.path)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="nav-section-title settings-title">
            SYSTEM
          </div>

          <button
            className={`nav-item ${
              isActive("/settings") ? "active" : ""
            }`}
            onClick={() => navigate("/settings")}
          >
            <Settings size={19} />
            <span>Settings</span>
          </button>
          <button
            className={`nav-item ${
              isActive("/change-password") ? "active" : ""
            }`}
            onClick={() => navigate("/change-password")}
          >
            <LockKeyhole size={19} />
            <span>Change password</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <span>SKUL Intelligence</span>
          <small>School Management System</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              {breadcrumb || `SKUL / ${title}`}
            </div>

            <h1>{title}</h1>
          </div>

          <div className="admin-profile">
            <div className="admin-avatar">{user?.display_name?.[0] || "A"}</div>

            <div>
              <strong>{user?.display_name || "School Admin"}</strong>
              <small>{user?.role === "principal" ? "Principal" : "Administrator"}</small>
            </div>
            <button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={17} /></button>
          </div>
        </header>

        <section className="dashboard-content">
          {announcements.length > 0 && <div className="portal-announcement" aria-label="School announcements"><span className="portal-announcement-label">ANNOUNCEMENT</span><button className="portal-announcement-track" onClick={() => setSelectedAnnouncement(announcements[0])}><span className="portal-announcement-title">{announcements[0].title}</span><span className="portal-announcement-message">{announcements[0].message}</span><span className="portal-announcement-open">Open</span></button></div>}
          {children}
        </section>
      </main>
      {selectedAnnouncement && <div className="modal-overlay" onClick={() => setSelectedAnnouncement(null)}><section className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><h2>{selectedAnnouncement.title}</h2><p>{new Date(selectedAnnouncement.created_at).toLocaleString()}</p></div><button className="modal-close" onClick={() => setSelectedAnnouncement(null)} aria-label="Close"><X size={20}/></button></div><div className="modal-body"><p>{selectedAnnouncement.message}</p></div></section></div>}
    </div>
  );
}

export default AdminLayout;
