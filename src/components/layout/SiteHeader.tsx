import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTheme } from "@/features/theme/ThemeProvider";
import { ADMIN_UID } from "@/features/admin/adminApi";
import styles from "./SiteHeader.module.css";

export function SiteHeader(): JSX.Element {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const isDashboard = location.pathname.startsWith("/dashboard");
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="PuzzleTogether bosh sahifasi">
        <img src="/logo.png" alt="PuzzleTogether" className={styles.logoImg} />
        <span>Puzzle<span className={styles.brandAccent}>Together</span></span>
      </Link>
      <nav className={styles.nav} aria-label="Asosiy navigatsiya">
        <button
          type="button"
          className={styles.themeToggleBtn}
          onClick={toggleTheme}
          title={theme === "dark" ? "Kunduzgi rejim (Light mode)" : "Tungi rejim (Dark mode)"}
          aria-label={theme === "dark" ? "Kunduzgi rejimga o'tish" : "Tungi rejimga o'tish"}
        >
          {theme === "dark" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        {user ? (
          <div className={styles.userNavGroup}>
            <Link
              to="/dashboard"
              className={`${styles.navDashboardBtn} ${isDashboard ? styles.activeDashboardBtn : ""}`}
            >
              Boshqaruv paneli
            </Link>
            {user.uid === ADMIN_UID && (
              <Link
                to="/admin"
                className={`${styles.navDashboardBtn} ${isAdmin ? styles.activeDashboardBtn : ""}`}
              >
                Admin
              </Link>
            )}
            <div className={styles.navAvatar} title={user.displayName} aria-label={user.displayName}>
              <span className={styles.navAvatarInitial}>
                {user.displayName.charAt(0).toUpperCase()}
              </span>
              <span className={styles.navAvatarDot} />
            </div>
          </div>
        ) : (
          <Link to="/login" className="btn btn-primary">
            <span aria-hidden="true">✈</span> Telegram orqali kirish
          </Link>
        )}
      </nav>
    </header>
  );
}
