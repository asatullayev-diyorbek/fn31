import fs from "node:fs/promises";
import path from "node:path";

const IMAGES = [
  // Mushuklar (Cats) - 10
  { category: "mushuklar", slug: "zangori-mushuk", unsplashId: "photo-1514888286974-6c03e2ca1dba", title: "Zangori Mushuk" },
  { category: "mushuklar", slug: "oynoqi-mushuk", unsplashId: "photo-1573865526739-10659fec78a5", title: "Oynoqi Mushuk" },
  { category: "mushuklar", slug: "kuzoynakli-mushuk", unsplashId: "photo-1533738363-b7f9aef128ce", title: "Ko'zoynakli Mushuk" },
  { category: "mushuklar", slug: "yoqimtoy-mushukcha", unsplashId: "photo-1543852786-1cf6624b9987", title: "Yoqimtoy Mushukcha" },
  { category: "mushuklar", slug: "uy-mushugi", unsplashId: "photo-1495360010541-f48722b34f7d", title: "Uy Mushugi" },
  { category: "mushuklar", slug: "quyoshdagi-mushuk", unsplashId: "photo-1518791841217-8f162f1e1131", title: "Quyoshdagi Mushuk" },
  { category: "mushuklar", slug: "oq-qora-mushuk", unsplashId: "photo-1561948955-570b270e7c36", title: "Oq Qora Mushuk" },
  { category: "mushuklar", slug: "uyqudagi-mushuk", unsplashId: "photo-1592194996308-7b43878e84a6", title: "Uyqudagi Mushuk" },
  { category: "mushuklar", slug: "oq-momiq-mushuk", unsplashId: "photo-1574158622682-e40e69881006", title: "Oq Momiq Mushuk" },
  { category: "mushuklar", slug: "kapalak-va-mushukcha", unsplashId: "photo-1526336024174-e58f5cdd8e13", title: "Kapalak va Mushukcha" },

  // Tabiat (Nature) - 10
  { category: "tabiat", slug: "alp-toglari-choqqisi", unsplashId: "photo-1464822759023-fed622ff2c3b", title: "Alp Tog'lari Cho'qqisi" },
  { category: "tabiat", slug: "tropik-orol-sohili", unsplashId: "photo-1507525428034-b723cf961d3e", title: "Tropik Orol Sohili" },
  { category: "tabiat", slug: "kuzgi-urmon-koli", unsplashId: "photo-1447752875215-b2761acb3c5d", title: "Kuzgi O'rmon Ko'li" },
  { category: "tabiat", slug: "katta-kanyon-qoyalari", unsplashId: "photo-1426604966848-d7adac402bff", title: "Katta Kanyon Qoyalari" },
  { category: "tabiat", slug: "oltin-kuz-urmoni", unsplashId: "photo-1473448912268-2022ce9509d8", title: "Oltin Kuz O'rmoni" },
  { category: "tabiat", slug: "yosemite-milliy-parki", unsplashId: "photo-1506744038136-46273834b3fb", title: "Yosemite Milliy Parki" },
  { category: "tabiat", slug: "yulduzli-tun-osmoni", unsplashId: "photo-1519681393784-d120267933ba", title: "Yulduzli Tun Osmoni" },
  { category: "tabiat", slug: "lavanda-dalalari", unsplashId: "photo-1500534314209-a25ddb2bd429", title: "Lavanda Dalalari" },
  { category: "tabiat", slug: "yashil-tepaliklar", unsplashId: "photo-1472214103451-9374bd1c798e", title: "Yashil Tepaliklar" },
  { category: "tabiat", slug: "tumanli-vodiy", unsplashId: "photo-1470071459604-3b5ec3a7fe05", title: "Tumanli Vodiy" },

  // Daryolar (Rivers) - 10
  { category: "daryolar", slug: "urmondagi-sharshara", unsplashId: "photo-1432405972618-c60b0225b8f9", title: "O'rmondagi Sharshara" },
  { category: "daryolar", slug: "tog-daryosi-oqimi", unsplashId: "photo-1470240731273-7821a6eeb6bd", title: "Tog' Daryosi Oqimi" },
  { category: "daryolar", slug: "zumrad-kanyon-daryosi", unsplashId: "photo-1501785888041-af3ef285b470", title: "Zumrad Kanyon Daryosi" },
  { category: "daryolar", slug: "muzlik-tog-koli", unsplashId: "photo-1498855926480-d98e83099315", title: "Muzlik Tog' Ko'li" },
  { category: "daryolar", slug: "quyoshli-daryo-oqimi", unsplashId: "photo-1441974231531-c6227db76b6e", title: "Quyoshli Daryo Oqimi" },
  { category: "daryolar", slug: "qayiq-va-tog-koli", unsplashId: "photo-1476514525535-07fb3b4ae5f1", title: "Qayiq va Tog' Daryosi" },
  { category: "daryolar", slug: "qishki-muzlagan-daryo", unsplashId: "photo-1513836279014-a89f7a76ae86", title: "Qishki Muzlagan Daryo" },
  { category: "daryolar", slug: "shom-payti-daryo-aks", unsplashId: "photo-1469474968028-56623f02e42e", title: "Shom Payti Daryo Aksi" },
  { category: "daryolar", slug: "kamalakli-katta-sharshara", unsplashId: "photo-1546587348-d12660c30c50", title: "Kamalakli Katta Sharshara" },
  { category: "daryolar", slug: "chukur-dara-daryosi", unsplashId: "photo-1448375240586-882707db888b", title: "Chuqur Dara Daryosi" },

  // Shahar (Cities) - 10
  { category: "shahar", slug: "tokio-neon-tun", unsplashId: "photo-1514565131-fce0801e5785", title: "Tokio Neon Tuni" },
  { category: "shahar", slug: "parij-eyfel-minorasi", unsplashId: "photo-1502602898657-3e91760cbb34", title: "Parij Eyfel Minorasi" },
  { category: "shahar", slug: "santorini-oq-uylari", unsplashId: "photo-1534447677768-be436bb09401", title: "Santorini Oq Uylari" },
  { category: "shahar", slug: "london-big-ben", unsplashId: "photo-1513635269975-59663e0ac1ad", title: "London Big Ben" },
  { category: "shahar", slug: "sidney-opera-teatri", unsplashId: "photo-1506973035872-a4ec16b8e8d9", title: "Sidney Opera Teatri" },
  { category: "shahar", slug: "singapur-marina-bay", unsplashId: "photo-1496568816309-51d7c20e3b21", title: "Singapur Marina Bay" },
  { category: "shahar", slug: "italiya-cinque-terre", unsplashId: "photo-1516483638261-f4dbaf036963", title: "Italiya Cinque Terre" },
  { category: "shahar", slug: "dubay-osmono'par-binolari", unsplashId: "photo-1520250497591-112f2f40a3f4", title: "Dubay Osmono'par Binolari" },
  { category: "shahar", slug: "venetsiya-suv-kanallari", unsplashId: "photo-1518684079-3c830dcef090", title: "Venetsiya Suv Kanallari" },
  { category: "shahar", slug: "manxetten-kopriklari", unsplashId: "photo-1480714378408-67cf0d13bc1b", title: "Manxetten Ko'priklari" },

  // Hayvonlar (Animals) - 10
  { category: "hayvonlar", slug: "sher-qirol", unsplashId: "photo-1546182990-dffeafbe841d", title: "Sher Qirol" },
  { category: "hayvonlar", slug: "katta-panda", unsplashId: "photo-1564349683136-77e08dba1ef7", title: "Katta Panda" },
  { category: "hayvonlar", slug: "yulbars-nigohi", unsplashId: "photo-1534188753412-3e26d0d618d6", title: "Yo'lbars Nigohi" },
  { category: "hayvonlar", slug: "savannadagi-fillar", unsplashId: "photo-1557050543-4d5f4e07ef46", title: "Savannadagi Fillar" },
  { category: "hayvonlar", slug: "chaqqon-gepard", unsplashId: "photo-1456926631375-92c8ce872def", title: "Chaqqon Gepard" },
  { category: "hayvonlar", slug: "rang-barang-totiqush", unsplashId: "photo-1555169062-013468b47731", title: "Rang-barang To'tiqush" },
  { category: "hayvonlar", slug: "zebra-suruvi", unsplashId: "photo-1575550959106-5a7defe28b56", title: "Zebra Suruvi" },
  { category: "hayvonlar", slug: "oq-qutb-ayigi", unsplashId: "photo-1505148230895-d9a785a555fa", title: "Oq Qutb Ayig'i" },
  { category: "hayvonlar", slug: "sahrodagi-jirafa", unsplashId: "photo-1518709268805-4e9042af9f23", title: "Sahrodagi Jirafa" },
  { category: "hayvonlar", slug: "qongir-baliqchi-ayiq", unsplashId: "photo-1535083783855-76ae62b2914e", title: "Qo'ng'ir Baliqchi Ayiq" },
];

async function downloadPng(url, destPath) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 10000) throw new Error("Image too small");
      await fs.writeFile(destPath, buffer);
      return buffer.length;
    } catch (e) {
      if (attempt === 3) {
        console.error(`Failed ${url}: ${e.message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

async function cleanOldJpg(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await cleanOldJpg(fullPath);
      } else if (ent.name.endsWith(".jpg") || ent.name.endsWith(".jpeg")) {
        await fs.unlink(fullPath);
      }
    }
  } catch {}
}

async function main() {
  const rootDir = "/Users/w/Desktop/Projects/puzzle";
  const puzzleImagesDir = path.join(rootDir, "puzzle_images");
  const backendGalleryDir = path.join(rootDir, "fn31/backend/gallery");

  console.log("Removing old JPG files...");
  await cleanOldJpg(puzzleImagesDir);
  await cleanOldJpg(backendGalleryDir);

  const categories = ["mushuklar", "tabiat", "daryolar", "shahar", "hayvonlar"];
  for (const cat of categories) {
    await fs.mkdir(path.join(puzzleImagesDir, cat), { recursive: true });
    await fs.mkdir(path.join(backendGalleryDir, cat), { recursive: true });
  }

  console.log(`Starting concurrent lossless PNG download for ${IMAGES.length} puzzle images...`);
  const manifestItems = [];
  const CONCURRENCY = 5;
  let cursor = 0;
  let successCount = 0;

  async function worker() {
    while (cursor < IMAGES.length) {
      const idx = cursor++;
      const img = IMAGES[idx];
      const url = `https://images.unsplash.com/${img.unsplashId}?fm=png&w=2000&q=100`;
      const fileName = `${String(idx + 1).padStart(2, "0")}-${img.slug}.png`;
      const puzzlePath = path.join(puzzleImagesDir, img.category, fileName);
      const backendPath = path.join(backendGalleryDir, img.category, fileName);

      // Check if already downloaded and > 100KB
      let size = 0;
      try {
        const stat = await fs.stat(puzzlePath);
        if (stat.size > 100000) {
          size = stat.size;
          await fs.copyFile(puzzlePath, backendPath);
          console.log(`[${idx + 1}/${IMAGES.length}] (cached) ${img.title} (${(size / 1048576).toFixed(2)} MB)`);
        }
      } catch {}

      if (!size) {
        process.stdout.write(`[${idx + 1}/${IMAGES.length}] Downloading ${img.title}... \n`);
        size = await downloadPng(url, puzzlePath);
        if (size) {
          await fs.copyFile(puzzlePath, backendPath);
          console.log(`[${idx + 1}/${IMAGES.length}] ✓ ${img.title} (${(size / 1048576).toFixed(2)} MB PNG)`);
        } else {
          console.error(`[${idx + 1}/${IMAGES.length}] ✗ ${img.title} FAILED`);
        }
      }

      if (size) {
        successCount++;
        manifestItems.push({
          id: idx + 1,
          title: img.title,
          category: img.category,
          format: "PNG",
          filename: fileName,
          relativePath: `${img.category}/${fileName}`,
          sizeBytes: size,
          source: `https://images.unsplash.com/${img.unsplashId}`,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  manifestItems.sort((a, b) => a.id - b.id);

  // Generate README.md and manifest.json
  const titles = {
    mushuklar: "Mushuklar (Tiniq PNG)",
    tabiat: "Tabiat manzaralari (Tiniq PNG)",
    daryolar: "Daryolar va Suv havzalari (Tiniq PNG)",
    shahar: "Shahar va Arxitektura (Tiniq PNG)",
    hayvonlar: "Hayvonlar olami (Tiniq PNG)",
  };

  let md = "# Puzzle Uchun Tiniq PNG Rasmlar To'plami (50 ta rasm)\n\n";
  md += "Barcha rasmlar **yo'qotishsiz tiniq PNG (lossless)** formatida yuklangan bo'lib, puzzle bo'laklariga ajratilganda ham juda aniq va tiniq ko'rinadi.\n\n";

  for (const cat of categories) {
    const catItems = manifestItems.filter((m) => m.category === cat);
    md += `### ${titles[cat]} (${catItems.length} ta)\n\n`;
    md += "| # | Tavsif | Fayl | Format | Hajmi |\n|---|---|---|---|---|\n";
    for (const item of catItems) {
      const mb = (item.sizeBytes / (1024 * 1024)).toFixed(2);
      md += `| ${item.id} | ${item.title} | \`${item.relativePath}\` | PNG (2000px) | ${mb} MB |\n`;
    }
    md += "\n";
  }

  await fs.writeFile(path.join(puzzleImagesDir, "README.md"), md, "utf-8");
  await fs.writeFile(
    path.join(puzzleImagesDir, "manifest.json"),
    JSON.stringify({ total: successCount, format: "PNG", images: manifestItems }, null, 2),
    "utf-8"
  );

  console.log(`\nDone! Successfully saved ${successCount}/${IMAGES.length} crystal-clear PNG images.`);
}

main().catch(console.error);
