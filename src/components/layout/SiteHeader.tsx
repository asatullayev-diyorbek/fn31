import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import styles from "./SiteHeader.module.css";

export function SiteHeader(): JSX.Element {
  const { user } = useAuth();
  const location = useLocation();
  const isDashboard = location.pathname.startsWith("/dashboard");

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="PuzzleTogether bosh sahifasi">
        <img src="/logo.png" alt="PuzzleTogether" className={styles.logoImg} />
        <span>Puzzle<span className={styles.brandAccent}>Together</span></span>
      </Link>
      <nav className={styles.nav} aria-label="Asosiy navigatsiya">
        <ul className={styles.navLinks}>
          <li>
            <a href="#how-it-works">Qanday ishlaydi</a>
          </li>
          <li>
            <a href="#modes">Rejimlar</a>
          </li>
        </ul>
        {user ? (
          <Link
            to="/dashboard"
            className={`${styles.navDashboardBtn} ${isDashboard ? styles.activeDashboardBtn : ""}`}
          >
            Boshqaruv paneli
          </Link>
        ) : (
          <Link to="/login" className="btn btn-primary">
            <span aria-hidden="true">✈</span> Telegram orqali kirish
          </Link>
        )}
      </nav>
    </header>
  );
}
