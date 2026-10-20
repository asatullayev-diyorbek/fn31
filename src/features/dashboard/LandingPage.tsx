import { Link } from "react-router-dom";
import styles from "./LandingPage.module.css";

export function LandingPage(): JSX.Element {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1>Pazlni birgalikda, real vaqtda yig&apos;ing</h1>
        <p className={styles.heroSubtitle}>
          Telegram orqali qo&apos;ng&apos;iroqda gaplashayotganingizda, bir xil pazlni
          bir nechta qurilmadan birgalikda yig&apos;ing. Har bir bo&apos;lak harakati
          barcha ishtirokchilarga zudlik bilan ko&apos;rinadi.
        </p>
        <div className={styles.heroActions}>
          <Link to="/create" className="btn btn-primary">
            Pazl yaratish
          </Link>
          <Link to="/join" className="btn btn-secondary">
            Xonaga qo&apos;shilish
          </Link>
        </div>
        <p className={styles.demoLink}>
          <Link to="/demo">Mexanikani (bitta foydalanuvchi, tarmoqsiz) sinab ko&apos;rish →</Link>
        </p>
      </section>

      <section className={styles.section} id="how-it-works" aria-labelledby="how-it-works-title">
        <h2 id="how-it-works-title">Qanday ishlaydi</h2>
        <ol className={styles.steps}>
          <li>
            <strong>1. Kiring.</strong> Telegram orqali bir marta kirib ro&apos;yxatdan
            o&apos;ting — parol kerak emas.
          </li>
          <li>
            <strong>2. Xona yarating yoki qo&apos;shiling.</strong> Rasm, bo&apos;laklar
            sonini tanlang va havolani do&apos;stlaringizga yuboring.
          </li>
          <li>
            <strong>3. Birgalikda yig&apos;ing.</strong> Har kim o&apos;z qurilmasidan
            bo&apos;laklarni harakatlantiradi; holat barcha uchun bir xil bo&apos;lib
            qoladi.
          </li>
          <li>
            <strong>4. Telegram orqali gaplashing.</strong> Ovozli yoki video
            qo&apos;ng&apos;iroqni Telegram&apos;ning o&apos;zida boshlang — bu sayt
            faqat taxtani taqdim etadi.
          </li>
        </ol>
      </section>

      <section className={styles.section} id="modes" aria-labelledby="modes-title">
        <h2 id="modes-title">Ikki rejim</h2>
        <div className={styles.modeGrid}>
          <div className="card">
            <h3>Erkin rejim</h3>
            <p>
              Bo&apos;laklarni istalgan tarzda joylashtiring, aylantiring va
              guruhlang — asl tasvir koordinatalariga qattiq rioya qilish shart emas.
            </p>
          </div>
          <div className="card">
            <h3>Klassik rejim</h3>
            <p>
              Interlocking (bir-biriga ilashgan) bo&apos;laklardan asl tasvirni to&apos;liq
              tiklang; to&apos;g&apos;ri joyga mos kelganda bo&apos;lak avtomatik
              o&apos;rnashadi.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="custom-title">
        <h2 id="custom-title">Shaxsiy rasmlar va moslashtiriladigan qiyinlik</h2>
        <p>
          Tayyor galeriyadan rasm tanlang yoki o&apos;zingiznikini yuklang. Bo&apos;laklar
          sonini 25 tadan 500 tagacha sozlang — ilova sizning qurilmangiz uchun
          mos qiyinlik darajasini tanlashga yordam beradi.
        </p>
      </section>
    </div>
  );
}
