import { useState } from "react";
import { GraduationCap, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

function ChangePassword() {
  const { user, changePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const destination = ["principal", "admin"].includes(user.role) ? "/" : "/portal";

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(cause.message || "Unable to change password.");
    } finally {
      setSaving(false);
    }
  };

  return <main className="login-page"><section className="login-panel">
    <div className="login-brand"><GraduationCap size={30}/><div><strong>SKUL</strong><span>School Intelligence</span></div></div>
    <h1>Change your password</h1>
    <p>{user.must_change_password ? "Choose a new password to secure your account before continuing." : "Enter your current password and choose a new one."}</p>
    {saved ? <><div className="alert alert-success">Your password has been changed. Other active sessions have been signed out.</div><button className="primary-button login-button" onClick={() => navigate(destination, { replace: true })}>Continue to your dashboard</button></> : <form onSubmit={submit} className="login-form">
      <label><span>Current password</span><div className="input-with-icon"><LockKeyhole size={18}/><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required/></div></label>
      <label><span>New password</span><div className="input-with-icon"><LockKeyhole size={18}/><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required/></div></label>
      <label><span>Confirm new password</span><div className="input-with-icon"><LockKeyhole size={18}/><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required/></div></label>
      <small>Use 12 to 128 characters and avoid reusing your current password.</small>
      {error && <div className="alert alert-danger">{error}</div>}
      <button className="primary-button login-button" disabled={saving}>{saving ? "Updating password..." : "Update password"}</button>
    </form>}
    {!saved && <button className="secondary-button" onClick={() => { signOut(); navigate("/login", { replace: true }); }}>Sign out</button>}
  </section></main>;
}

export default ChangePassword;
