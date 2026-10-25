import { useState } from "react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/puzzle-liquid-hero.png";
import styles from "./LandingPage.module.css";

interface GalleryCategoryPreview {
  id: string;
  label: string;
  icon: string;
  count: number;
  description: string;
  sampleName: string;
}

const CATEGORIES: GalleryCategoryPreview[] = [
  {
    id: "mushuklar",
    label: "Mushuklar",
    icon: "🐱",
    count: 10,
    description: "Yoqimtoy zangori ko'zli, o'ynoqi va momiq mushukchalar",
    sampleName: "Zangori Mushuk, Quyoshdagi Malla",
  },
  {
    id: "tabiat",
    label: "Tabiat",
    icon: "🌲",
    count: 10,
    description: "Alp cho'qqilari, oltin kuz o'rmonlari va Yosemite vodiysi",
    sampleName: "Alp Cho'qqisi, Lavanda Dalalari",
  },
  {
    id: "daryolar",
    label: "Daryolar",
    icon: "🌊",
    count: 10,
    description: "Shovullagan sharsharalar, zumrad kanyonlar va tog' ko'llari",
    sampleName: "O'rmon Sharsharasi, Muzlik Ko'li",
  },
  {
    id: "shahar",
    label: "Shahar",
    icon: "🏙",
    count: 10,
    description: "Tokio neon tunlari, Parij Eyfel minorasi va Venetsiya",
    sampleName: "Tokio Neon Tuni, London Big Ben",
  },
  {
    id: "hayvonlar",
    label: "Hayvonlar",
    icon: "🦁",
    count: 10,
    description: "Sher, yo'lbars, panda, savanna fillari va qutb ayiqlari",
    sampleName: "Sher Qirol, Katta Panda",
  },
];

export function LandingPage(): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<string>("mushuklar");

  const currentCat = CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0]!;

  return (
    <div className={styles.page}>
      {/* Background Animated Glows & Drifting Jigsaw Shapes */}
      <div className={styles.ambientBlobCyan} aria-hidden="true" />
      <div className={styles.ambientBlobPurple} aria-hidden="true" />
      <div className={styles.ambientBlobBlue} aria-hidden="true" />

      {/* Floating decorative puzzle pieces in background */}
      <div className={styles.bgFloatPiece1} aria-hidden="true">
        <svg viewBox="0 0 100 100" className={styles.svgPiece}>
          <path d="M 10 10 H 40 C 40 25, 60 25, 60 10 H 90 V 40 C 75 40, 75 60, 90 60 V 90 H 60 C 60 75, 40 75, 40 90 H 10 V 60 C 25 60, 25 40, 10 40 Z" />
        </svg>
      </div>
      <div className={styles.bgFloatPiece2} aria-hidden="true">
        <svg viewBox="0 0 100 100" className={styles.svgPiece}>
          <path d="M 10 10 H 40 C 40 -5, 60 -5, 60 10 H 90 V 40 C 105 40, 105 60, 90 60 V 90 H 60 C 60 105, 40 105, 40 90 H 10 V 60 C -5 60, -5 40, 10 40 Z" />
        </svg>
      </div>
      <div className={styles.bgFloatPiece3} aria-hidden="true">
        <svg viewBox="0 0 100 100" className={styles.svgPiece}>
          <path d="M 10 10 H 40 C 40 25, 60 25, 60 10 H 90 V 90 H 10 Z" />
        </svg>
      </div>

      {/* 1. HERO SECTION */}
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.heroEyebrow}>
            <span className={styles.pulseDot} />
            <span className={styles.eyebrowText}>Real-vaqtda birgalikda terish</span>
            <span className={styles.eyebrowTag}>✈ Telegram bilan</span>
          </div>

          <h1 className={styles.heroTitle}>
            Bir ekran. Bir jamoa.
            <span className={styles.heroTitleGradient}>Mingta his-tuyg&apos;u.</span>
          </h1>

          <p className={styles.heroSubtitle}>
            Do&apos;stlaringiz bilan xohlagan rasmingizdan jonli pazllar yarating.
            Har bir bo&apos;lak harakati hamma uchun real vaqtda bir zumda ko&apos;rinadi —
            ovozli suhbatda birga zavqlaning!
          </p>

          <div className={styles.heroActions}>
            <Link to="/create" className={styles.primaryCta}>
              <span className={styles.btnIcon}>✨</span>
              <span>Yangi pazl yaratish</span>
              <span className={styles.btnArrow}>→</span>
            </Link>
            <Link to="/join" className={styles.secondaryCta}>
              <span className={styles.btnIcon}>🔑</span>
              <span>Xonaga qo&apos;shilish</span>
            </Link>
          </div>

          <div className={styles.demoLinkBox}>
            <Link to="/demo" className={styles.demoLink}>
              <span className={styles.demoBolt}>⚡</span>
              <span>Ro&apos;yxatdan o&apos;tmasdan darhol sinab ko&apos;rish</span>
              <span className={styles.demoArrow}>↗</span>
            </Link>
          </div>
        </div>

        {/* HERO VISUAL: Live Collaborative Puzzle Stage */}
        <div className={styles.heroVisual}>
          <div className={styles.visualCard}>
            <div className={styles.visualHeader}>
              <div className={styles.windowDots}>
                <span className={styles.dotRed} />
                <span className={styles.dotYellow} />
                <span className={styles.dotGreen} />
              </div>
              <div className={styles.visualRoomTitle}>
                <span className={styles.titleLiveBadge}>ONLAYN</span>
                <span>Alp Tog&apos;lari Cho&apos;qqisi</span>
              </div>
              <div className={styles.visualRoomPieces}>40 bo&apos;lak</div>
            </div>

            {/* Puzzle Board Viewport Simulation */}
            <div className={styles.boardSimulation}>
              <img
                src={heroImage}
                alt="Pazl terish doskasi"
                className={styles.boardBackgroundImg}
              />

              {/* Grid cut overlay with glowing active seams */}
              <div className={styles.boardGridOverlay}>
                <div className={styles.gridCell} />
                <div className={styles.gridCell} />
                <div className={styles.gridCell} />
                <div className={styles.gridCell} />
                <div className={styles.gridCell} />
                <div className={styles.gridCellActive} />
                <div className={styles.gridCell} />
                <div className={styles.gridCell} />
              </div>

              {/* Animated Floating Puzzle Piece Moving into Place */}
              <div className={styles.animatedPieceBox}>
                <div className={styles.animatedPieceGlow} />
                <svg viewBox="0 0 100 100" className={styles.livePieceSvg}>
                  <path
                    d="M 10 10 H 45 C 45 -5, 55 -5, 55 10 H 90 V 45 C 105 45, 105 55, 90 55 V 90 H 55 C 55 105, 45 105, 45 90 H 10 V 55 C -5 55, -5 45, 10 45 Z"
                    fill="url(#pieceGradient)"
                    stroke="#38bdf8"
                    strokeWidth="3"
                  />
                  <defs>
                    <linearGradient id="pieceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.85" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0.85" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Virtual Collaborator Cursor Pill */}
                <div className={styles.virtualCursor}>
                  <div className={styles.cursorPointer}>▲</div>
                  <div className={styles.cursorTag}>
                    <span className={styles.cursorAvatar}>🧑‍💻</span>
                    <span>Ali (suzmoqda)</span>
                  </div>
                </div>
              </div>

              {/* Floating Live Badges on Puzzle Board */}
              <div className={styles.pillOnlineUsers}>
                <div className={styles.avatarGroup}>
                  <span className={styles.userAv1}>A</span>
                  <span className={styles.userAv2}>M</span>
                  <span className={styles.userAv3}>D</span>
                </div>
                <span>3 kishi yig&apos;moqda</span>
              </div>

              <div className={styles.pillSnapSuccess}>
                <span className={styles.snapIcon}>✓</span>
                <span>Bo&apos;lak yopishdi! (Snap)</span>
              </div>

              <div className={styles.pillProgress}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: "85%" }} />
                </div>
                <span>85% tayyor</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. STATS BAR */}
      <section className={styles.statsBar} aria-label="Ilova imkoniyatlari">
        <div className={styles.statCard}>
          <div className={styles.statNumber}>50+</div>
          <div className={styles.statLabel}>Tiniq PNG rasmlar</div>
          <div className={styles.statSub}>2000px o&apos;lchamli to&apos;plamlar</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>20–100</div>
          <div className={styles.statLabel}>Bo&apos;laklar soni</div>
          <div className={styles.statSub}>Har qanday qiyinlikda</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>0 ms</div>
          <div className={styles.statLabel}>Kechikishsiz sinxron</div>
          <div className={styles.statSub}>Real-vaqt WebSocket aloqasi</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNumber}>100%</div>
          <div className={styles.statLabel}>Parolsiz oson kirish</div>
          <div className={styles.statSub}>Faqat Telegram orqali</div>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section className={styles.section} id="how-it-works" aria-labelledby="how-title">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>Oddiy va qulay</span>
          <h2 id="how-title" className={styles.sectionTitle}>
            Birga yig&apos;ish — to&apos;rt oson qadamda
          </h2>
          <p className={styles.sectionSubtitle}>
            Hech qanday murakkab ro&apos;yxatdan o&apos;tish yoki dastur o&apos;rnatish shart emas.
          </p>
        </div>

        <div className={styles.stepsGrid}>
          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepBadge}>01</span>
              <span className={styles.stepIcon}>✈</span>
            </div>
            <h3>Telegram bilan kiring</h3>
            <p>
              Parol yoki uzun anketalar yo&apos;q. Bir marta Telegram bot orqali tasdiqlab, xavfsiz tizimga kiring.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepBadge}>02</span>
              <span className={styles.stepIcon}>🖼</span>
            </div>
            <h3>Rasm va bo&apos;laklarni tanlang</h3>
            <p>
              50 ta tayyor tiniq PNG rasmlardan tanlang yoki o&apos;z rasmingizni yuklang. Bo&apos;laklar sonini moslang (20–100).
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepBadge}>03</span>
              <span className={styles.stepIcon}>🔗</span>
            </div>
            <h3>Do&apos;stlarga havola yuboring</h3>
            <p>
              Xona havolasini Telegram guruhiga tashlang. Do&apos;stlaringiz bir marta bosish orqali xonaga qo&apos;shiladi.
            </p>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepBadge}>04</span>
              <span className={styles.stepIcon}>🧩</span>
            </div>
            <h3>Birgalikda yig&apos;ing!</h3>
            <p>
              Barcha harakatlar darhol ko&apos;rinadi. Telegram ovozli qo&apos;ng&apos;irog&apos;ida gaplashib, terishdan bahra oling!
            </p>
          </div>
        </div>
      </section>

      {/* 4. MODES SECTION */}
      <section className={styles.section} id="modes" aria-labelledby="modes-title">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>O&apos;yin uslubi</span>
          <h2 id="modes-title" className={styles.sectionTitle}>
            Ikki xil o&apos;yin kayfiyati
          </h2>
          <p className={styles.sectionSubtitle}>
            O&apos;zingizga ma&apos;qul bo&apos;lgan terish rejimini tanlang.
          </p>
        </div>

        <div className={styles.modesContainer}>
          <div className={styles.modeHighlightCard}>
            <div className={styles.modeIconPill}>✦</div>
            <div className={styles.modeBadge}>Eng ommabop</div>
            <h3>Klassik rejim (Classic)</h3>
            <p>
              Markazda maxsus ramka va rasm matosi bo&apos;ladi. Har bir bo&apos;lak o&apos;zining haqiqiy
              o&apos;rniga yaqinlashganda avtomatik yopishadi (*snap* bo&apos;ladi).
            </p>
            <ul className={styles.modeFeatures}>
              <li>✓ Doska markazida aniq chegarali ramka</li>
              <li>✓ O&apos;z joyiga avtomatik yopishish (Snap)</li>
              <li>✓ Fon sifatida yarim shaffof yordamchi rasm (Ghost)</li>
            </ul>
          </div>

          <div className={styles.modeHighlightCard}>
            <div className={styles.modeIconPill}>⌘</div>
            <div className={styles.modeBadge}>Ijodiy erkinlik</div>
            <h3>Erkin rejim (Free mode)</h3>
            <p>
              Bo&apos;laklarni markazda terish shart emas! Cheksiz doskaning istalgan chetida ikkita
              qo&apos;shni bo&apos;lakni birlashtirib, orolchalar (bloklar) hosil qiling.
            </p>
            <ul className={styles.modeFeatures}>
              <li>✓ Doskaning xohlagan burchagida birlashish</li>
              <li>✓ Bir necha kishi alohida bo&apos;laklarni yig&apos;ishi mumkin</li>
              <li>✓ Birlashgan bloklarni birga ko&apos;chirish imkoniyati</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 5. 50 CRISP PNG GALLERY SHOWCASE */}
      <section className={styles.section} aria-labelledby="gallery-title">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>50 ta tiniq rasm</span>
          <h2 id="gallery-title" className={styles.sectionTitle}>
            Pazl uchun maxsus tanlangan to&apos;plamlar
          </h2>
          <p className={styles.sectionSubtitle}>
            Rangdor, detallarga boy va 2000px yo&apos;qotishsiz PNG formatida.
          </p>
        </div>

        <div className={styles.galleryNav}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`${styles.galleryTab} ${activeCategory === cat.id ? styles.galleryTabActive : ""}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className={styles.tabCount}>{cat.count}</span>
            </button>
          ))}
        </div>

        <div className={styles.categoryShowcaseCard}>
          <div className={styles.catLeft}>
            <div className={styles.catIconLarge}>{currentCat.icon}</div>
            <div>
              <h3 className={styles.catTitle}>{currentCat.label} to&apos;plami</h3>
              <p className={styles.catDesc}>{currentCat.description}</p>
              <div className={styles.catMeta}>
                <span>📸 10 ta eng sara 2000px PNG suratlar</span>
                <span>🧩 {currentCat.sampleName}</span>
              </div>
            </div>
          </div>
          <Link to="/create" className={styles.catActionBtn}>
            Shu to&apos;plamdan boshlash →
          </Link>
        </div>
      </section>

      {/* 6. BOTTOM BANNER */}
      <section className={styles.ctaBanner}>
        <div className={styles.ctaGlow} aria-hidden="true" />
        <h2>Hozirning o&apos;zida do&apos;stlaringiz bilan boshlang</h2>
        <p>
          Bitta tugmani bosing, rasm tanlang va havolani Telegram guruhiga yuboring.
          Barchasi bepul va qulay!
        </p>
        <div className={styles.ctaButtons}>
          <Link to="/create" className={styles.primaryCta}>
            <span>+ Yangi xona ochish</span>
            <span className={styles.btnArrow}>→</span>
          </Link>
          <Link to="/join" className={styles.secondaryCta}>
            Havola orqali kirish
          </Link>
        </div>
      </section>
    </div>
  );
}
