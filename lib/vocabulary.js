//TUGMA VOCAB
// Different words for the same thing, mapped to one standard English word.
export const SYNONYMS = {
  // phones
  phone: "phone", cellphone: "phone", mobile: "phone", cp: "phone", telepono: "phone", selpon: "phone", smartphone: "phone",
  samsung: "phone", vivo: "phone", iphone: "phone", infinix: "phone", 
  // wallets and bags
  wallet: "wallet", purse: "wallet", billfold: "wallet", pitaka: "wallet", coinpurse: "wallet",
  bag: "bag", backpack: "bag", bagpack: "bag", handbag: "bag", sling: "bag",
  // keys, cards, documents
  key: "key", keys: "key", susi: "key", keychain: "key",
  id: "card", card: "card", license: "card", lisensya: "card", atm: "card",
  // everyday things
  umbrella: "umbrella", payong: "umbrella",
  eyeglasses: "eyeglasses", glasses: "eyeglasses", specs: "eyeglasses", salamin: "eyeglasses",
  watch: "watch", relo: "watch", orasan: "watch",
  earphone: "earphone", earphones: "earphone", earbud: "earphone", earbuds: "earphone", headphone: "earphone", headphones: "earphone", headset: "earphone",
  bottle: "bottle", bote: "bottle", botelya: "bottle", tumbler: "bottle",
  lunchbox: "lunchbox", baunan: "lunchbox",
  // jewelry
  necklace: "necklace", kwintas: "necklace", kuwintas: "necklace",
  ring: "ring", singsing: "ring",
  earring: "earring", earrings: "earring", hikaw: "earring",
  bracelet: "bracelet", pulsera: "bracelet", pulseras: "bracelet",
  // clothing
  shoe: "shoe", shoes: "shoe", sapatos: "shoe",
  slippers: "slippers", slipper: "slippers", tsinelas: "slippers", flipflops: "slippers",
  hat: "hat", sumbrero: "hat", sombrero: "hat",
  shirt: "shirt", tshirt: "shirt", kamiseta: "shirt",
  pants: "pants", jeans: "pants", pantalon: "pants", maong: "pants",
  jacket: "jacket", dyaket: "jacket",
  uniform: "uniform", uniporme: "uniform",
  clothes: "clothes", damit: "clothes",
  // school things
  book: "book", libro: "book",
  notebook: "notebook", kuwaderno: "notebook", kwaderno: "notebook",
  pen: "pen", bolpen: "pen", ballpen: "pen", ballpoint: "pen",
  pencil: "pencil", lapis: "pencil",
  // money
  money: "money", pera: "money", cash: "money", salapi: "money",
  coin: "coin", coins: "coin", barya: "coin",
  // vehicles
  bicycle: "bicycle", bike: "bicycle", bisikleta: "bicycle",
  motorcycle: "motorcycle", motorsiklo: "motorcycle", motor: "motorcycle",
  // more everyday things (Filipino and English)
  fan: "fan", pamaypay: "fan", abaniko: "fan",
  belt: "belt", sinturon: "belt", handkerchief: "handkerchief", panyo: "handkerchief", towel: "towel", tuwalya: "towel",
  jug: "jug", pitsel: "jug", container: "container", lalagyan: "container", garapon: "container", tupperware: "container",
  spoon: "spoon", kutsara: "spoon", fork: "fork", tinidor: "fork", plate: "plate", plato: "plate", cup: "cup", tasa: "cup", baso: "cup",
  passport: "passport", pasaporte: "passport", certificate: "certificate", sertipiko: "certificate", receipt: "receipt", resibo: "receipt",
  paper: "paper", papel: "paper", folder: "folder", envelope: "envelope", sobre: "envelope",
  crayon: "crayon", krayola: "crayon", ruler: "ruler", regla: "ruler", calculator: "calculator", kalkulator: "calculator",
  laptop: "laptop", computer: "computer", kompyuter: "computer", tablet: "tablet", ipad: "tablet",
  charger: "charger", adapter: "charger", adaptor: "charger", cable: "cable", kable: "cable", wire: "cable", kawad: "cable",
  powerbank: "powerbank", battery: "battery", baterya: "battery", camera: "camera", kamera: "camera",
  speaker: "speaker", flashlight: "flashlight", ilaw: "flashlight", tali: "rope", rope: "rope", lubid: "rope",
  hoodie: "jacket", sweater: "jacket", cardigan: "jacket", kapote: "raincoat", raincoat: "raincoat",
  cap: "hat", bonnet: "hat", bonet: "hat",
  sandals: "slippers", sandalyas: "slippers", sneakers: "shoe", rubbershoes: "shoe", gomang: "rubber", goma: "rubber",
  helmet: "helmet", bayong: "bag", supot: "bag", plastic: "plastic", tote: "bag", pouch: "bag", lunchbag: "bag",
  toy: "toy", laruan: "toy", doll: "toy", manika: "toy", ball: "ball", bola: "ball",
  medicine: "medicine", gamot: "medicine", mask: "mask",
  // shapes, damage and parts (every word points to ONE standard English word)
  tear: "torn", tears: "torn", punit: "torn", ripped: "torn", rip: "torn",
  edge: "edge", gilid: "edge", dulo: "end",
  handle: "handle", handles: "handle", hawakan: "handle", hawak: "handle",
  wrinkled: "wrinkled", lukot: "wrinkled", kulubot: "wrinkled", dent: "dent", dented: "dent", yupi: "dent", baku: "dent",
  stain: "stain", stained: "stain", mantsa: "stain",
  zipper: "zipper", zip: "zipper", siper: "zipper", strap: "strap", butones: "button", button: "button",
  sticker: "sticker", logo: "logo", name: "name", pangalan: "name", tag: "tag", label: "tag",
  // people and pets (Filipino)
  aso: "dog", dog: "dog", pusa: "cat", cat: "cat",
  // more condition and size words
  sirang: "broken", dumi: "dirty", marumi: "dirty", malinis: "clean", mahaba: "long", maikli: "short", long: "long", short: "short",
  makapal: "thick", manipis: "thin", thick: "thick", thin: "thin", metal: "metal", bakal: "metal", kahoy: "wood", wooden: "wood", wood: "wood",
  tela: "cloth", cloth: "cloth", fabric: "cloth", rubber: "rubber",
  // Filipino color forms with "-ng" ("puting", "pulang")
  puting: "white", pulang: "red", berdeng: "green", kayumangging: "brown", lilang: "purple", abuhin: "gray",
  // condition words
  old: "old", luma: "old",
  new: "new", bago: "new",
  big: "big", malaki: "big",
  small: "small", maliit: "small",
  crack: "crack", cracked: "crack", cracks: "crack", basag: "crack",
  broken: "broken", sirang: "broken",
  scratch: "scratch", scratched: "scratch", scratches: "scratch", gasgas: "scratch",
  torn: "torn", punit: "torn",
  leather: "leather", balat: "leather",
  // colors (Filipino to English)
  itim: "black", puti: "white", pula: "red", asul: "blue", bughaw: "blue", berde: "green", luntian: "green",
  dilaw: "yellow", kayumanggi: "brown", abo: "gray", lila: "purple", rosas: "pink", kahel: "orange",
  ginto: "gold", pilak: "silver",
};

// Words that carry no meaning and are ignored in descriptions.
export const STOP_WORDS = [
  // English
  "a", "an", "the", "in", "on", "at", "with", "near", "found", "lost", "my", "and", "or", "is", "of", "some", "inside",
  // Filipino
  "na", "ang", "ng", "sa", "ko", "ay", "mga", "may", "mayroon", "yung", "yong", "iyong", "si", "ni", "kay", "po", "opo",
  "nito", "ito", "ka", "mo", "niya", "namin", "natin", "lang", "din", "rin", "ba", "loob", "kulay",
  "nawala", "nakita", "nahulog", "naiwan", "natagpuan", "nakalimutan",
  // counting and filler words that do not describe the item
  "one", "isa", "isang", "medyo", "very", "masyado", "talaga", "pa", "kasi", "dito", "doon", "siya", "sya", "yun", "yan", "ung", "yng",
];

// Colors. Words listed here are scored in the Color field, so they are ignored in the description.
export const BASE_COLORS = [
  "black", "white", "red", "blue", "green", "yellow", "brown", "gray", "purple", "orange", "pink", "multicolor", "colorful",
];
// Shades grouped into a family: "navy" counts as "blue".
export const COLOR_FAMILIES = {
  navy: "blue", teal: "green", maroon: "red", crimson: "red", grey: "gray", silver: "gray",
  gold: "yellow", beige: "brown", tan: "brown", khaki: "brown", violet: "purple", magenta: "pink", cream: "white",
};
// Words that only describe a shade, ignored when comparing colors: "dark blue" = "blue".
export const COLOR_MODIFIERS = ["dark", "light", "deep", "bright", "pale", "royal", "sky", "baby"];

// Places. Add the puroks, streets and landmarks of YOUR barangay and the other
// names people use for them. Example: "gym" and "covered" both mean the covered court.
export const LOCATION_ALIASES = {
  chapel: "church", simbahan: "church", kapilya: "church",
  palengke: "market",
  paaralan: "school", eskwelahan: "school", eskwela: "school",
  kalsada: "road", daan: "road", kanto: "corner", bahay: "house", ospital: "hospital",
  tulay: "bridge", parke: "park", tindahan: "store",
  gym: "court", basketball: "court", covered: "court",
  plaza: "park", playground: "park", dyip: "jeepney", jeep: "jeepney", terminal: "terminal", sakayan: "terminal", traysikel: "tricycle",
};
// Words ignored when comparing places.
export const LOCATION_STOP_WORDS = [
  "barangay", "baranggay", "barangai", "brgy", "brg", "sta", "rita", "front", "beside", "infront", "behind", "area",
  "malapit", "harap", "tabi", "likod",
];
