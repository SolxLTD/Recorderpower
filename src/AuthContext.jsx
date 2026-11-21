import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);
const API_URL = "http://localhost:5000";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("skul-session")); } catch { return null; }
  });
  const [checking, setChecking] = useState(Boolean(session?.token));

  useEffect(() => {
    if (!session?.token) return setChecking(false);
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setSession((current) => ({ ...current, user: data.user })))
      .catch(() => { localStorage.removeItem("skul-session"); setSession(null); })
      .finally(() => setChecking(false));
  }, []);

  const signIn = async (username, password) => {
    const response = await fetch(`${API_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Unable to sign in.");
    const next = { token: data.token, user: data.user };
    localStorage.setItem("skul-session", JSON.stringify(next));
    setSession(next);
    return next.user;
  };
  const signOut = () => { localStorage.removeItem("skul-session"); setSession(null); };
  const signUp = async (payload) => {
    const response = await fetch(`${API_URL}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Unable to create account.");
    const next = { token: data.token, user: data.user };
    localStorage.setItem("skul-session", JSON.stringify(next));
    setSession(next);
    return next.user;
  };
  const changePassword = async (currentPassword, newPassword) => {
    const response = await apiFetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Unable to change password.");
    const next = { token: data.token, user: data.user };
    localStorage.setItem("skul-session", JSON.stringify(next));
    setSession(next);
    return next.user;
  };
  return <AuthContext.Provider value={{ session, user: session?.user, checking, signIn, signUp, signOut, changePassword }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
export const apiFetch = (path, options = {}) => {
  const saved = JSON.parse(localStorage.getItem("skul-session") || "null");
  return fetch(`${API_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}), ...(saved?.token ? { Authorization: `Bearer ${saved.token}` } : {}) } });
};
