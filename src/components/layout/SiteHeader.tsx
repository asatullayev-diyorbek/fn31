import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import styles from "./SiteHeader.module.css";

export function SiteHeader(): JSX.Element {
  const { user } = useAuth();

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="PuzzleTogether bosh sahifasi">
        <span className={styles.logo} aria-hidden="true">
          ✦
        </span>
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
          <Link to="/dashboard" className="btn btn-secondary">
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
