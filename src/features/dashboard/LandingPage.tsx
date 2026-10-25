import { Link } from "react-router-dom";
import heroImage from "@/assets/puzzle-liquid-hero.png";
import styles from "./LandingPage.module.css";

export function LandingPage(): JSX.Element {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span>✈</span> Telegram bilan birga</span>
          <h1>Bir ekran. <em>Bir jamoa.</em><br />Mingta bo&apos;lak.</h1>
          <p className={styles.heroSubtitle}>
            Qo&apos;ng&apos;iroqda qoling va bir xil pazlni real vaqtda yig&apos;ing.
            Har bir harakat hamma uchun shu zahoti ko&apos;rinadi.
          </p>
          <div className={styles.heroActions}>
            <Link to="/create" className="btn btn-primary">
              Pazl yaratish <span aria-hidden="true">→</span>
            </Link>
            <Link to="/join" className="btn btn-secondary">
              Xonaga qo&apos;shilish
            </Link>
          </div>
          <p className={styles.demoLink}>
            <Link to="/demo">Avval demo taxtani sinab ko&apos;ring <span>↗</span></Link>
          </p>
        </div>
        <div className={styles.heroVisual}>
          <img src={heroImage} alt="Yaltiragan ko'k pazl bo'laklari" />
          <div className={styles.livePill}><i /> 3 do&apos;stingiz onlayn</div>
          <div className={styles.messageBubble}><span>✈</span> Keling, boshlaymiz!</div>
        </div>
      </section>

      <section className={styles.section} id="how-it-works" aria-labelledby="how-it-works-title">
        <p className={styles.sectionLabel}>Juda oddiy</p>
        <h2 id="how-it-works-title">Birga yig&apos;ish — to&apos;rt qadamda.</h2>
        <ol className={styles.steps}>
          <li>
            <span className={styles.stepNumber}>01</span><strong>Kiring.</strong> Telegram orqali bir marta kirib ro&apos;yxatdan
            o&apos;ting — parol kerak emas.
          </li>
          <li>
            <span className={styles.stepNumber}>02</span><strong>Xona yarating yoki qo&apos;shiling.</strong> Rasm, bo&apos;laklar
            sonini tanlang va havolani do&apos;stlaringizga yuboring.
          </li>
          <li>
            <span className={styles.stepNumber}>03</span><strong>Birgalikda yig&apos;ing.</strong> Har kim o&apos;z qurilmasidan
            bo&apos;laklarni harakatlantiradi; holat barcha uchun bir xil bo&apos;lib
            qoladi.
          </li>
          <li>
            <span className={styles.stepNumber}>04</span><strong>Telegram orqali gaplashing.</strong> Ovozli yoki video
            qo&apos;ng&apos;iroqni Telegram&apos;ning o&apos;zida boshlang — bu sayt
            faqat taxtani taqdim etadi.
          </li>
        </ol>
      </section>

      <section className={styles.section} id="modes" aria-labelledby="modes-title">
        <p className={styles.sectionLabel}>Sizning uslubingiz</p>
        <h2 id="modes-title">Ikki xil o&apos;yin kayfiyati.</h2>
        <div className={styles.modeGrid}>
          <div className={`card ${styles.modeCard}`}>
            <span className={styles.modeIcon}>⌘</span>
            <h3>Erkin rejim</h3>
            <p>
              Bo&apos;laklarni istalgan tarzda joylashtiring, aylantiring va
              guruhlang — asl tasvir koordinatalariga qattiq rioya qilish shart emas.
            </p>
          </div>
          <div className={`card ${styles.modeCard}`}>
            <span className={styles.modeIcon}>✦</span>
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
