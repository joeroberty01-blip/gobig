import type { Locale } from "./dictionaries";

// About and Help pages (owner's reference design, 2026-10-01). Server-rendered only, so these
// strings stay out of the client dictionary. Every statement here describes what the app really
// does today; no invented numbers, partners or support promises.

const en = {
  about: {
    title: "About Go Big",
    lead: "Go Big connects people in Dar es Salaam with local service businesses: repairs, cleaning, beauty, vehicles, construction and more, plus rides and deliveries.",
    howTitle: "How it works",
    steps: [
      { title: "Search or ask", body: "Search by service and area, or tell Go Big AI what you need in your own words, in English or Swahili." },
      { title: "Compare", body: "See each business's services, the prices they set, opening hours, verification and reviews from real customers." },
      { title: "Get it done", body: "Send a request, chat, agree on a time, and get the job done." },
      { title: "Review", body: "After the job, leave a review so the next customer can choose well." },
    ],
    principlesTitle: "What we promise",
    principles: [
      { title: "Real information only", body: "Businesses write their own profiles and prices. Reviews come only from customers." },
      { title: "Paid is always labelled", body: "Promoted spots are marked Sponsored and never change trust ranking or reviews." },
      { title: "Your location stays private", body: "We show distance and area, not your exact position." },
    ],
    businessTitle: "Run a business?",
    businessBody: "List your business free, get found by customers nearby, and manage requests from your phone.",
    businessCta: "List your business",
    askCta: "Try Go Big AI",
  },
  help: {
    title: "Help",
    lead: "Answers to common questions. Can't find yours? Ask Go Big AI or send a request and the business will reply.",
    faqTitle: "Common questions",
    faqs: [
      { q: "How do I find a provider?", a: "Use the search on the home page, pick a category, or describe the job to Go Big AI. Choose an area or share your location for closer results." },
      { q: "What is Go Big AI?", a: "It reads your question, works out the service and area you mean, and recommends real businesses listed on Go Big, with the reasons for each match. It never makes up prices, ratings or availability." },
      { q: "How do I contact a business?", a: "Open the business's page and send a request or a message. Signing in keeps your requests and chats in one place." },
      { q: "How do bookings work?", a: "Inside a request, you or the business propose a date and time; once the other side confirms, you both get a reminder before it starts." },
      { q: "Are the reviews real?", a: "Reviews can only be left by customers. Businesses can reply, but they can't edit or delete them." },
      { q: "What does Verified mean?", a: "The business has shown documents to our team, and the badge shows its level. Verification is reviewed again every 12 months." },
      { q: "Something went wrong with a business", a: "Use Report on the business's page. Our team looks at every report." },
      { q: "How do I change notifications or language?", a: "Go to Settings: you can choose language, theme, which notifications you get and quiet hours." },
    ],
    stillTitle: "Still need help?",
    stillBody: "Ask Go Big AI in your own words, or browse all services.",
    askCta: "Ask Go Big AI",
    browseCta: "Browse services",
  },
};

const sw: typeof en = {
  about: {
    title: "Kuhusu Go Big",
    lead: "Go Big inaunganisha watu wa Dar es Salaam na biashara za huduma za karibu: matengenezo, usafi, urembo, magari, ujenzi na zaidi, pamoja na usafiri na usafirishaji wa mizigo.",
    howTitle: "Inavyofanya kazi",
    steps: [
      { title: "Tafuta au uliza", body: "Tafuta kwa huduma na eneo, au mwambie Go Big AI unachohitaji kwa maneno yako, kwa Kiswahili au Kiingereza." },
      { title: "Linganisha", body: "Ona huduma za kila biashara, bei walizoweka wenyewe, saa za kazi, uthibitisho na maoni ya wateja halisi." },
      { title: "Kamilisha kazi", body: "Tuma ombi, ongea nao, kubalianeni muda, na kazi ifanyike." },
      { title: "Toa maoni", body: "Baada ya kazi, acha maoni ili mteja anayefuata achague vizuri." },
    ],
    principlesTitle: "Ahadi zetu",
    principles: [
      { title: "Taarifa halisi tu", body: "Biashara huandika wasifu na bei zao wenyewe. Maoni hutoka kwa wateja pekee." },
      { title: "Kulipiwa huonyeshwa wazi", body: "Nafasi zilizolipiwa huandikwa Sponsored na haziathiri nafasi ya uaminifu wala maoni." },
      { title: "Mahali ulipo ni siri", body: "Tunaonyesha umbali na eneo, si mahali halisi ulipo." },
    ],
    businessTitle: "Una biashara?",
    businessBody: "Orodhesha biashara yako bure, upatikane na wateja walio karibu, na usimamie maombi kwa simu yako.",
    businessCta: "Orodhesha biashara",
    askCta: "Jaribu Go Big AI",
  },
  help: {
    title: "Msaada",
    lead: "Majibu ya maswali ya kawaida. Hukupata jibu lako? Uliza Go Big AI au tuma ombi na biashara itakujibu.",
    faqTitle: "Maswali ya kawaida",
    faqs: [
      { q: "Nampataje mtoa huduma?", a: "Tumia utafutaji kwenye ukurasa wa mwanzo, chagua kundi, au mweleze Go Big AI kazi yako. Chagua eneo au shiriki mahali ulipo upate walio karibu zaidi." },
      { q: "Go Big AI ni nini?", a: "Inasoma swali lako, inaelewa huduma na eneo unalomaanisha, na inapendekeza biashara halisi zilizopo Go Big, pamoja na sababu za kila pendekezo. Haibuni bei, alama wala upatikanaji." },
      { q: "Nawasilianaje na biashara?", a: "Fungua ukurasa wa biashara kisha tuma ombi au ujumbe. Ukiingia kwenye akaunti, maombi na mazungumzo yako yanakaa sehemu moja." },
      { q: "Miadi inafanyaje kazi?", a: "Ndani ya ombi, wewe au biashara mnapendekeza tarehe na saa; upande mwingine ukithibitisha, wote mnapata ukumbusho kabla ya muda." },
      { q: "Maoni ni ya kweli?", a: "Maoni yanaweza kuachwa na wateja tu. Biashara zinaweza kujibu, lakini haziwezi kuyabadilisha wala kuyafuta." },
      { q: "Verified ina maana gani?", a: "Biashara imeonyesha nyaraka kwa timu yetu, na beji inaonyesha kiwango chake. Uthibitisho hukaguliwa upya kila miezi 12." },
      { q: "Kuna tatizo na biashara", a: "Tumia Ripoti kwenye ukurasa wa biashara. Timu yetu inaangalia kila ripoti." },
      { q: "Nabadilishaje arifa au lugha?", a: "Nenda kwenye Mipangilio: unaweza kuchagua lugha, mandhari, arifa unazopokea na saa za utulivu." },
    ],
    stillTitle: "Bado unahitaji msaada?",
    stillBody: "Uliza Go Big AI kwa maneno yako, au angalia huduma zote.",
    askCta: "Uliza Go Big AI",
    browseCta: "Angalia huduma",
  },
};

export const infoText = (locale: Locale) => (locale === "sw" ? sw : en);
