import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";

export function JoinRoomPage(): JSX.Element {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!code.trim()) return;
    if (!user) {
      navigate("/login", { state: { from: `/room/${code.trim()}` } });
      return;
    }
    navigate(`/room/${code.trim()}`);
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Xonaga qo&apos;shilish</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem" }}>
        <label htmlFor="join-room-code" className="visually-hidden">
          Xona kodi
        </label>
        <input
          id="join-room-code"
          type="text"
          placeholder="Xona kodi"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--color-border)" }}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          Qo&apos;shilish
        </button>
      </form>
    </div>
  );
}
