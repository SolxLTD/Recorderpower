import { useState } from "react";
import { GraduationCap, LockKeyhole, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await signIn(username, password);
      navigate(user.must_change_password ? "/change-password" : ["principal", "admin"].includes(user.role) ? "/" : "/portal", { replace: true });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  };
  return <main className="login-page"><section className="login-panel"><div className="login-brand"><GraduationCap size={30}/><div><strong>SKUL</strong><span>School Intelligence</span></div></div><h1>Welcome back</h1><p>Sign in to access your school workspace.</p><form onSubmit={submit} className="login-form"><label><span>Username</span><div className="input-with-icon"><User size={18}/><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username" autoComplete="username" required/></div></label><label><span>Password</span><div className="input-with-icon"><LockKeyhole size={18}/><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required/></div></label><div className="auth-links"><Link to="/forgot-password">Forgot password?</Link></div>{error && <div className="alert alert-danger">{error}</div>}<button className="primary-button login-button" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button></form><p className="auth-switch">Staff account setup: <Link to="/signup">Register with Staff ID</Link><br/>Students and parents receive login access from the principal.</p></section></main>;
}
export default Login;
