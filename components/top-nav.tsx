import Link from "next/link";
import styles from "./top-nav.module.css";

export function TopNav() {
  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.brand}>
        РусСкан VPN
      </Link>
      <div className={styles.links}>
        <Link href="/">Главная</Link>
        <Link href="/documentation">Документация</Link>
        <Link href="/ai">AI Помощник</Link>
      </div>
    </nav>
  );
}
