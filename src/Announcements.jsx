import { useEffect, useState } from "react";
import { Megaphone, Plus, X } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { apiFetch } from "./AuthContext";

const audienceNames = { all: "Everyone", student: "Students", teacher: "Teachers", parent: "Parents", admin: "Administrators" };

function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState({ title: "", message: "", audience: "all" });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try {
      const response = await apiFetch("/api/admin/announcements");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load announcements.");
      setAnnouncements(data.announcements || []);
    } catch (cause) { setError(cause.message); }
  };
  useEffect(() => { load(); }, []);
  const publish = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await apiFetch("/api/admin/announcements", { method: "POST", body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to publish announcement.");
      setAnnouncements((current) => [data.announcement, ...current]);
      setForm({ title: "", message: "", audience: "all" });
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  return <AdminLayout title="Announcements" breadcrumb="SKUL / Announcements">
    <div className="module-header"><div><h2>Announcements</h2><p>Publish updates to the selected school community.</p></div></div>
    <div className="announcement-layout">
      <section className="dashboard-card"><div className="card-header"><div className="card-title"><div className="card-icon"><Megaphone size={21}/></div><div><h3>Create Announcement</h3><p>Audience members will see this in their portal.</p></div></div></div>
        <form className="announcement-form" onSubmit={publish}>
          <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Announcement title" required /></label>
          <label>Message<textarea rows="6" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Write announcement..." required /></label>
          <label>Audience<select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })}><option value="all">Everyone</option><option value="student">Students</option><option value="teacher">Teachers</option><option value="parent">Parents</option><option value="admin">Administrators</option></select></label>
          {error && <div className="alert alert-danger">{error}</div>}
          <button className="primary-button" disabled={saving}><Plus size={17}/>{saving ? "Publishing..." : "Publish Announcement"}</button>
        </form>
      </section>
      <section className="dashboard-card"><div className="card-header"><div className="card-title"><div className="card-icon"><Megaphone size={21}/></div><div><h3>Published Announcements</h3><p>{announcements.length} total</p></div></div></div>
        {announcements.length ? <div className="announcement-list">{announcements.map((item) => <button className="announcement-card announcement-card-button" key={item.id} onClick={() => setSelected(item)}><span className="announcement-meta">{audienceNames[item.audience]} · {new Date(item.created_at).toLocaleString()}</span><h3>{item.title}</h3><p>{item.message}</p></button>)}</div> : <div className="empty-module-small">No announcements published yet.</div>}
      </section>
    </div>
    {selected && <div className="modal-overlay" onClick={() => setSelected(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="announcement-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><h2 id="announcement-title">{selected.title}</h2><p>{audienceNames[selected.audience]} · {new Date(selected.created_at).toLocaleString()}</p></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X size={20}/></button></div><div className="modal-body"><p>{selected.message}</p></div></section></div>}
  </AdminLayout>;
}

export default Announcements;