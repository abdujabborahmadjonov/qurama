/* ==========================================================================
   Placeholder archive entries.
   Nothing here is a real story — these exist only so the layout, filtering
   and card design can be reviewed. Replace this array with real, consented
   entries before the site goes live.
   ========================================================================== */

const STORIES = [
  { id: "p1", country: "kz", theme: "identity",     format: "text",  year: 2026,
    en: { title: "Placeholder — a name that changed shape",
          teaser: "Sample entry. A short account of how a name was spelled, mispronounced and eventually re-chosen." },
    uz: { title: "Namuna — shakli o‘zgargan ism",
          teaser: "Namunaviy yozuv. Bir ismning qanday yozilgani, noto‘g‘ri talaffuz qilingani va oxir-oqibat qayta tanlangani haqida." } },

  { id: "p2", country: "uz", theme: "regions",      format: "audio", year: 2026,
    en: { title: "Placeholder — from a mahalla to a mid-size city",
          teaser: "Sample entry. Recorded conversation about leaving one kind of neighbourhood for another." },
    uz: { title: "Namuna — mahalladan o‘rtacha shaharga",
          teaser: "Namunaviy yozuv. Bir turdagi mahalladan boshqasiga ko‘chish haqidagi suhbat yozuvi." } },

  { id: "p3", country: "kg", theme: "identity",     format: "video", year: 2026,
    en: { title: "Placeholder — the first winter",
          teaser: "Sample entry. Short video diary covering the first six months after arrival." },
    uz: { title: "Namuna — birinchi qish",
          teaser: "Namunaviy yozuv. Kelgandan keyingi olti oy haqidagi qisqa video kundalik." } },

  { id: "p4", country: "tj", theme: "community",    format: "text",  year: 2026,
    en: { title: "Placeholder — who actually helped",
          teaser: "Sample entry. Which services were useful, which were not, and what was missing entirely." },
    uz: { title: "Namuna — aslida kim yordam berdi",
          teaser: "Namunaviy yozuv. Qaysi xizmatlar asqotdi, qaysilari yo‘q va nima umuman yetishmadi." } },

  { id: "p5", country: "tm", theme: "identity",     format: "text",  year: 2026,
    en: { title: "Placeholder — keeping a language at home",
          teaser: "Sample entry. On raising children in a language the street does not speak." },
    uz: { title: "Namuna — tilni uyda saqlab qolish",
          teaser: "Namunaviy yozuv. Ko‘chada gapirilmaydigan tilda farzand tarbiyalash haqida." } },

  { id: "p6", country: "uz", theme: "info",         format: "info",  year: 2026,
    en: { title: "Placeholder — credentials that did not transfer",
          teaser: "Sample entry. An infographic on re-qualification: years, cost, and what people did meanwhile." },
    uz: { title: "Namuna — tan olinmagan diplomlar",
          teaser: "Namunaviy yozuv. Qayta malaka olish haqida infografika: yillar, xarajat va shu orada qilingan ishlar." } },

  { id: "p7", country: "kz", theme: "zines",        format: "zine",  year: 2026,
    en: { title: "Placeholder — zine issue one",
          teaser: "Sample entry. A visual issue made together with four contributors." },
    uz: { title: "Namuna — zinning birinchi soni",
          teaser: "Namunaviy yozuv. To‘rt ishtirokchi bilan birga tayyorlangan vizual nashr." } },

  { id: "p8", country: "kg", theme: "av",           format: "audio", year: 2026,
    en: { title: "Placeholder — three generations, one kitchen",
          teaser: "Sample entry. Oral history recorded with a grandmother, mother and daughter." },
    uz: { title: "Namuna — uch avlod, bitta oshxona",
          teaser: "Namunaviy yozuv. Buvi, ona va qiz bilan yozib olingan og‘zaki tarix." } },

  { id: "p9", country: "tj", theme: "publications", format: "text",  year: 2026,
    en: { title: "Placeholder — notes on method",
          teaser: "Sample entry. A short essay on how the interviews were designed and why." },
    uz: { title: "Namuna — uslub haqida qaydlar",
          teaser: "Namunaviy yozuv. Suhbatlar qanday va nega shunday tuzilgani haqida qisqa esse." } },
];

const RESOURCE_ORGS = [
  { id: "r1", en: { title: "Settlement service — placeholder", teaser: "Organisation name, city, what they help with, and a link." },
              uz: { title: "Joylashuv xizmati — namuna",      teaser: "Tashkilot nomi, shahri, nimaga yordam berishi va havolasi." } },
  { id: "r2", en: { title: "Diaspora association — placeholder", teaser: "Community group, the languages spoken, and how to reach them." },
              uz: { title: "Diaspora uyushmasi — namuna",        teaser: "Jamoa guruhi, muloqot tillari va bog‘lanish yo‘li." } },
  { id: "r3", en: { title: "Women’s organisation — placeholder", teaser: "Support service, whether it is free, and referral details." },
              uz: { title: "Ayollar tashkiloti — namuna",        teaser: "Yordam xizmati, bepul yoki yo‘qligi va murojaat tartibi." } },
  { id: "r4", en: { title: "Legal clinic — placeholder", teaser: "Free or low-cost legal help, and what it does not cover." },
              uz: { title: "Yuridik klinika — namuna",   teaser: "Bepul yoki arzon yuridik yordam va u qamramaydigan masalalar." } },
];

const RESOURCE_PUBS = [
  { id: "b1", en: { title: "Publication — placeholder", teaser: "Author, year, where it appeared, and a one-line summary." },
              uz: { title: "Nashr — namuna",            teaser: "Muallif, yil, qayerda chiqqani va bir qatorli mazmuni." } },
  { id: "b2", en: { title: "Essay — placeholder", teaser: "A piece written from the archive, with a link to the full text." },
              uz: { title: "Esse — namuna",      teaser: "Arxiv asosida yozilgan material va to‘liq matnga havola." } },
  { id: "b3", en: { title: "Press mention — placeholder", teaser: "Outlet, date, and what the coverage focused on." },
              uz: { title: "Matbuotdagi eslatma — namuna", teaser: "Nashr, sana va e’tibor qaratilgan mavzu." } },
];
