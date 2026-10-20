import styles from "./SiteFooter.module.css";

export function SiteFooter(): JSX.Element {
  return (
    <footer className={styles.footer}>
      <p>© {new Date().getFullYear()} PuzzleTogether. Barcha huquqlar himoyalangan.</p>
      <p className={styles.note}>
        Ovozli va videoqo&apos;ng&apos;iroqlar Telegram orqali amalga oshiriladi — bu
        ilova faqat umumiy pazl taxtasini taqdim etadi.
      </p>
    </footer>
  );
}
