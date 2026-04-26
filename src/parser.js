const COMMAND_PATTERNS = [
  {
    command: "balance",
    aliases: ["saldo", "cek saldo", "lihat saldo", "balance", "uangku", "sisa uang"],
  },
  {
    command: "today_report",
    aliases: [
      "hari ini",
      "laporan hari ini",
      "rekap hari ini",
      "today",
      "pengeluaran hari ini",
      "pemasukan hari ini",
    ],
  },
  {
    command: "week_report",
    aliases: ["minggu ini", "laporan minggu ini", "rekap minggu ini", "pekan ini"],
  },
  {
    command: "month_report",
    aliases: ["bulan ini", "laporan bulan ini", "rekap bulan ini", "pengeluaran bulan ini"],
  },
  {
    command: "year_report",
    aliases: ["tahun ini", "laporan tahun ini", "rekap tahun ini"],
  },
  {
    command: "history",
    aliases: ["riwayat", "history", "transaksi terakhir", "list transaksi"],
  },
  {
    command: "category_report",
    aliases: ["kategori", "laporan kategori", "rekap kategori", "category"],
  },
  {
    command: "insight",
    aliases: ["/insight", "insight", "ai insight", "analisis", "analisa"],
  },
  {
    command: "delete_last",
    aliases: ["hapus terakhir", "hapus transaksi terakhir", "hapus yang terakhir"],
  },
  {
    command: "undo_delete",
    aliases: ["undo", "undo hapus", "batalkan hapus", "kembalikan terakhir"],
  },
  {
    command: "export",
    aliases: ["export", "ekspor", "download", "csv", "export csv"],
  },
  {
    command: "reset_data",
    aliases: ["reset", "reset data", "hapus semua", "clear all", "reset transaksi"],
  },
  {
    command: "help",
    aliases: ["help", "bantuan", "format", "cara pakai", "panduan"],
  },
];

const FILLER_WORDS = [
  "catat",
  "tambah",
  "tambahkan",
  "input",
  "masukin",
  "record",
  "transaksi",
  "uang",
  "buat",
  "untuk",
  "ke",
  "dari",
  "di",
  "pakai",
  "pake",
  "via",
  "dengan",
];

const CATEGORY_RULES = [
  {
    category: "food",
    keywords: [
      "makan",
      "minum",
      "kopi",
      "sarapan",
      "lunch",
      "dinner",
      "warteg",
      "bakso",
      "mie",
      "nasi",
      "ayam",
      "roti",
      "jajan",
      "snack",
    ],
  },
  {
    category: "transport",
    keywords: [
      "bensin",
      "pertalite",
      "pertamax",
      "solar",
      "parkir",
      "tol",
      "gojek",
      "grab",
      "ojek",
      "bus",
      "kereta",
      "angkot",
      "taxi",
      "taksi",
    ],
  },
  {
    category: "groceries",
    keywords: [
      "alfamart",
      "alfamidi",
      "minimarket",
      "indomaret",
      "superindo",
      "hypermart",
      "belanja bulanan",
      "beras",
      "telur",
      "minyak",
      "gula",
      "sayur",
    ],
  },
  {
    category: "bills",
    keywords: [
      "listrik",
      "air",
      "pdam",
      "wifi",
      "internet",
      "pulsa",
      "kuota",
      "tagihan",
      "bpjs",
      "pajak",
      "cicilan",
    ],
  },
  {
    category: "health",
    keywords: ["obat", "dokter", "klinik", "rs", "rumah sakit", "vitamin", "apotek"],
  },
  {
    category: "education",
    keywords: ["kuliah", "kampus", "buku", "kelas", "kursus", "print", "fotocopy", "fotokopi"],
  },
  {
    category: "shopping",
    keywords: ["shopee", "tokopedia", "lazada", "baju", "sepatu", "celana", "tas", "skincare"],
  },
  {
    category: "entertainment",
    keywords: ["bioskop", "netflix", "spotify", "game", "steam", "nongkrong", "liburan"],
  },
  {
    category: "housing",
    keywords: ["kos", "kost", "kontrakan", "sewa", "rumah", "laundry"],
  },
  {
    category: "family",
    keywords: ["ibu", "ayah", "adik", "kakak", "keluarga", "orang tua"],
  },
  {
    category: "donation",
    keywords: ["donasi", "sedekah", "zakat", "infaq", "infak"],
  },
  {
    category: "debt",
    keywords: ["hutang", "utang", "pinjam", "cicilan", "bayar utang"],
  },
  {
    category: "income",
    keywords: ["gaji", "bonus", "freelance", "fee", "refund", "cashback", "jual", "jualan"],
  },
];

const PAYMENT_METHODS = [
  { method: "cash", keywords: ["cash", "tunai", "uang tunai"] },
  { method: "qris", keywords: ["qris", "qr"] },
  { method: "debit", keywords: ["debit", "kartu debit"] },
  { method: "credit_card", keywords: ["kartu kredit", "cc", "credit card"] },
  { method: "bank_transfer", keywords: ["transfer", "tf", "bca", "bni", "bri", "mandiri", "seabank"] },
  { method: "ewallet", keywords: ["gopay", "ovo", "dana", "shopeepay", "linkaja"] },
];

const MONTHS = new Map([
  ["jan", "01"],
  ["januari", "01"],
  ["feb", "02"],
  ["februari", "02"],
  ["mar", "03"],
  ["maret", "03"],
  ["apr", "04"],
  ["april", "04"],
  ["mei", "05"],
  ["jun", "06"],
  ["juni", "06"],
  ["jul", "07"],
  ["juli", "07"],
  ["agu", "08"],
  ["agustus", "08"],
  ["sep", "09"],
  ["sept", "09"],
  ["september", "09"],
  ["okt", "10"],
  ["oktober", "10"],
  ["nov", "11"],
  ["november", "11"],
  ["des", "12"],
  ["desember", "12"],
]);

const AMOUNT_PATTERN =
  /(?:^|\s)(?:rp\.?\s*)?(\d+(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)\s*(?:(ribu|rebu|rb|r|k|juta|jt|mio|m)\b)?(?:\s*,-)?/i;

const REQUIRED_SIGN_MESSAGE =
  "Tipe transaksi belum jelas. Pilih /pemasukan atau /pengeluaran.";

export function parseInput(input, options = {}) {
  const message = normalizeWhitespace(input);

  if (!message) {
    return errorResult("Pesan kosong. Ketik 'help' untuk melihat format.");
  }

  const command = parseCommand(message);
  if (command) {
    return command;
  }

  if (options.commandsOnly) {
    return errorResult("Command belum dikenali.", input);
  }

  const lines = splitTransactionLines(input);
  const parsedLines = lines.map((line) => parseTransactionLine(line, options));

  if (parsedLines.length > 1 && parsedLines.every((result) => result.ok)) {
    return {
      ok: true,
      kind: "batch",
      transactions: parsedLines.map((result) => result.transaction),
      count: parsedLines.length,
      totalIncome: sumByType(parsedLines, "income"),
      totalExpense: sumByType(parsedLines, "expense"),
      net: sumByType(parsedLines, "income") - sumByType(parsedLines, "expense"),
      original: input,
    };
  }

  if (parsedLines.length === 1) {
    return parsedLines[0];
  }

  const firstError = parsedLines.find((result) => !result.ok);
  return firstError ?? errorResult("Format pesan belum dikenali.", input);
}

export function parseCommand(input) {
  const original = String(input ?? "");
  const message = normalizeCommand(original);

  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.aliases.some((alias) => normalizeCommand(alias) === message)) {
      return {
        ok: true,
        kind: "command",
        command: pattern.command,
        original,
      };
    }
  }

  return null;
}

export function parseTransactionLine(input, options = {}) {
  const original = String(input ?? "");
  const normalized = normalizeTransactionLine(original);

  if (!normalized) {
    return errorResult("Baris transaksi kosong.", original);
  }

  const content = normalized;
  if (!content) {
    return errorResult("Tulis nominal dan catatan transaksi.", original);
  }

  const amountMatch = content.match(AMOUNT_PATTERN);
  if (!amountMatch) {
    return errorResult(
      "Nominal belum ditemukan. Contoh: 20k bensin atau 500k gaji.",
      original,
    );
  }

  const amount = parseAmount(amountMatch[1], amountMatch[2]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return errorResult("Nominal harus lebih besar dari 0.", original);
  }

  const rawAmount = amountMatch[0].trim();
  const beforeAmount = content.slice(0, amountMatch.index).trim();
  const afterAmount = content.slice(amountMatch.index + amountMatch[0].length).trim();
  const combinedNote = [beforeAmount, afterAmount].filter(Boolean).join(" ");
  const metadata = extractMetadata(combinedNote);
  const note = cleanNote(metadata.note);
  const type = detectTransactionType({
    defaultType: options.defaultType,
  });

  if (!type) {
    return errorResult(REQUIRED_SIGN_MESSAGE, original);
  }

  const category = metadata.category ?? detectCategory(note, type);

  return {
    ok: true,
    kind: "transaction",
    transaction: {
      type,
      amount,
      note: note || defaultNote(type),
      category,
      wallet: metadata.wallet,
      paymentMethod: metadata.paymentMethod,
      date: metadata.date,
      tags: metadata.tags,
      rawAmount,
      original,
      confidence: calculateConfidence({ note, category, date: metadata.date, paymentMethod: metadata.paymentMethod }),
    },
  };
}

export function parseAmount(numberPart, unitPart = "") {
  const unit = normalizeUnit(unitPart);
  const normalizedNumber = normalizeNumber(numberPart);

  if (!Number.isFinite(normalizedNumber)) {
    return NaN;
  }

  return Math.round(Math.abs(normalizedNumber) * unitMultiplier(unit));
}

function splitTransactionLines(input) {
  return String(input ?? "")
    .split(/\r?\n|;/)
    .map((line) => normalizeTransactionLine(line))
    .filter(Boolean);
}

function normalizeTransactionLine(input) {
  return normalizeWhitespace(input)
    .replace(/^[\s>*-]*\d+[\).]\s*/, "")
    .replace(/^[\s>]+/, "")
    .trim();
}

function extractMetadata(note) {
  let clean = normalizeWhitespace(note);
  const tags = extractTags(clean);
  clean = removeHashTags(clean);

  const explicitCategory = extractExplicitCategory(clean);
  if (explicitCategory) {
    clean = explicitCategory.remaining;
  }

  const explicitWallet = extractExplicitWallet(clean);
  if (explicitWallet) {
    clean = explicitWallet.remaining;
  }

  const paymentMethod = detectPaymentMethod(clean);
  clean = removePaymentMethodWords(clean);

  const date = extractDateHint(clean);
  if (date) {
    clean = removeDateText(clean, date.text);
  }

  return {
    note: clean,
    category: explicitCategory?.category,
    wallet: explicitWallet?.wallet,
    paymentMethod,
    date,
    tags,
  };
}

function extractTags(note) {
  const matches = note.match(/#[a-zA-Z0-9_-]+/g) ?? [];
  return matches.map((tag) => tag.slice(1).toLowerCase());
}

function removeHashTags(note) {
  return normalizeWhitespace(note.replace(/#[a-zA-Z0-9_-]+/g, " "));
}

function extractExplicitCategory(note) {
  const match = note.match(/\b(?:kategori|category|cat)\s*[:=]?\s*([a-zA-Z0-9_-]+)\b/i);
  if (!match) {
    return null;
  }

  return {
    category: normalizeCategory(match[1]),
    remaining: normalizeWhitespace(note.replace(match[0], " ")),
  };
}

function detectPaymentMethod(note) {
  const lowerNote = note.toLowerCase();

  for (const item of PAYMENT_METHODS) {
    if (containsKeyword(lowerNote, item.keywords)) {
      return item.method;
    }
  }

  return null;
}

function removePaymentMethodWords(note) {
  let clean = note;
  const paymentWords = PAYMENT_METHODS.flatMap((item) => item.keywords);

  for (const word of paymentWords) {
    clean = clean.replace(new RegExp(`\\b(?:pakai|pake|via|dengan)?\\s*${escapeRegExp(word)}\\b`, "gi"), " ");
  }

  return normalizeWhitespace(clean);
}

function extractDateHint(note) {
  const lowerNote = note.toLowerCase();

  const relativeDates = [
    { value: "today", words: ["hari ini", "tadi", "tadi pagi", "tadi siang", "tadi sore", "tadi malam"] },
    { value: "yesterday", words: ["kemarin", "kmrn", "yesterday"] },
    { value: "tomorrow", words: ["besok", "tomorrow"] },
  ];

  for (const item of relativeDates) {
    const found = item.words.find((word) => containsKeyword(lowerNote, [word]));
    if (found) {
      return { kind: "relative", value: item.value, text: found };
    }
  }

  const isoMatch = note.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    return {
      kind: "date",
      value: `${isoMatch[1]}-${pad2(isoMatch[2])}-${pad2(isoMatch[3])}`,
      text: isoMatch[0],
    };
  }

  const numericMatch = note.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](20\d{2}))?\b/);
  if (numericMatch) {
    return {
      kind: "date",
      value: numericMatch[3]
        ? `${numericMatch[3]}-${pad2(numericMatch[2])}-${pad2(numericMatch[1])}`
        : `--${pad2(numericMatch[2])}-${pad2(numericMatch[1])}`,
      text: numericMatch[0],
    };
  }

  const monthMatch = lowerNote.match(/\b(\d{1,2})\s+([a-z]+)(?:\s+(20\d{2}))?\b/i);
  if (monthMatch && MONTHS.has(monthMatch[2])) {
    const month = MONTHS.get(monthMatch[2]);
    return {
      kind: "date",
      value: monthMatch[3] ? `${monthMatch[3]}-${month}-${pad2(monthMatch[1])}` : `--${month}-${pad2(monthMatch[1])}`,
      text: monthMatch[0],
    };
  }

  return null;
}

function removeDateText(note, dateText) {
  return normalizeWhitespace(note.replace(new RegExp(`\\b${escapeRegExp(dateText)}\\b`, "i"), " "));
}

function detectTransactionType({ defaultType }) {
  if (isValidDefaultType(defaultType)) {
    return defaultType;
  }

  return null;
}

function extractExplicitWallet(note) {
  const match = note.match(/\b(?:dompet|wallet|akun)\s*[:=]?\s*([a-zA-Z0-9_-]+)\b/i);
  if (!match) {
    return null;
  }

  return {
    wallet: normalizeCategory(match[1]),
    remaining: normalizeWhitespace(note.replace(match[0], " ")),
  };
}

function isValidDefaultType(type) {
  return type === "income" || type === "expense";
}

function detectCategory(note, type) {
  const lowerNote = note.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (containsKeyword(lowerNote, rule.keywords)) {
      return rule.category;
    }
  }

  return type === "income" ? "income" : "other";
}

function calculateConfidence({ note, category, date, paymentMethod }) {
  let confidence = 0.72;

  if (note) {
    confidence += 0.08;
  }

  if (category && category !== "other") {
    confidence += 0.08;
  }

  if (date) {
    confidence += 0.04;
  }

  if (paymentMethod) {
    confidence += 0.04;
  }

  return Math.min(0.96, Number(confidence.toFixed(2)));
}

function normalizeNumber(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, "");

  if (!text) {
    return NaN;
  }

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";

    return Number.parseFloat(
      text.split(thousandsSeparator).join("").replace(decimalSeparator, "."),
    );
  }

  if (hasComma) {
    const parts = text.split(",");
    if (parts.length === 2 && parts[1].length === 3) {
      return Number.parseFloat(parts.join(""));
    }

    return Number.parseFloat(text.replace(",", "."));
  }

  if (hasDot) {
    const parts = text.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      return Number.parseFloat(parts.join(""));
    }

    if (parts.length > 2) {
      return Number.parseFloat(parts.join(""));
    }

    return Number.parseFloat(text);
  }

  return Number.parseFloat(text);
}

function normalizeUnit(value) {
  return String(value ?? "").trim().toLowerCase();
}

function unitMultiplier(unit) {
  if (["k", "rb", "r", "ribu", "rebu"].includes(unit)) {
    return 1000;
  }

  if (["jt", "juta", "m", "mio"].includes(unit)) {
    return 1000000;
  }

  return 1;
}

function cleanNote(note) {
  let clean = normalizeWhitespace(note)
    .replace(/^(masuk|pemasukan|income|keluar|pengeluaran|expense|bayar|beli|belanja)\s+/i, "")
    .replace(/\s+(masuk|pemasukan|income|keluar|pengeluaran|expense)$/i, "")
    .trim();

  for (const word of FILLER_WORDS) {
    clean = clean.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi"), " ");
  }

  return normalizeWhitespace(clean);
}

function defaultNote(type) {
  return type === "income" ? "pemasukan" : "pengeluaran";
}

function normalizeCommand(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[?!.,]+$/g, "")
    .replace(/\b(dong|tolong|please|pls|ya|yah)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCategory(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function containsKeyword(value, keywords) {
  return keywords.some((keyword) => {
    const escapedKeyword = escapeRegExp(keyword);
    const pattern = new RegExp(`(^|\\s)${escapedKeyword}(\\s|$)`, "i");
    return pattern.test(value);
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sumByType(parsedLines, type) {
  return parsedLines
    .map((result) => result.transaction)
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function errorResult(message, original = "") {
  return {
    ok: false,
    kind: "error",
    error: message,
    original,
  };
}
