// n8n Code node
// Mode: Run Once for All Items
// Input: từng job item từ Merge (Collector Split Out + Apify Normalize)

const config = {
  // Chế độ recall cao: giữ cả job thiếu thông tin hoặc hơi vượt tiêu chí,
  // sau đó dùng điểm để đẩy chúng xuống cuối thay vì loại ngay.
  // -999 = không loại theo điểm; điểm chỉ dùng để sắp xếp.
  // Tăng lên (ví dụ 15) nếu sau này muốn cắt bớt kết quả điểm thấp.
  minScore: -999,
  targetExperienceYears: 2,
  deduplicate: true,

  hanoiKeywords: [
    'ha noi', 'hanoi', 'hn', 'cau giay', 'nam tu liem', 'bac tu liem',
    'dong da', 'thanh xuan', 'hoan kiem', 'hai ba trung', 'ba dinh',
    'tay ho', 'long bien', 'hoang mai', 'ha dong', 'my dinh',
    'trung hoa', 'yen hoa', 'times city'
  ],

  otherLocationKeywords: [
    'ho chi minh', 'hcm', 'hcmc', 'tp hcm', 'tphcm', 'sai gon',
    'da nang', 'hai phong', 'can tho', 'binh duong', 'dong nai',
    'vung tau', 'nha trang', 'bac ninh', 'hung yen', 'hai duong'
  ],

  remoteKeywords: ['remote', 'work from home', 'wfh', 'lam viec tu xa'],

  // Các level này không bị loại; chỉ bị trừ điểm để nằm cuối danh sách.
  seniorKeywords: [
    'senior', 'tech lead', 'technical lead', 'team lead', 'lead developer',
    'lead engineer', 'principal', 'architect', 'manager', 'head of'
  ],

  // Chỉ loại cứng khi keyword nằm TRONG TITLE — không check description.
  unrelatedTitleKeywords: [
    'frontend', 'front end', 'android', 'ios developer', 'mobile developer',
    'qa', 'qc', 'tester', 'consultant', 'giang vien', 'teacher', 'trainer',
    'data engineer', 'data analyst', 'devops engineer', 'network engineer',
    'embedded', 'game developer'
  ],

  // Các title gợi ý backend/java role — giữ lại dù không ghi rõ "Java".
  backendTitleKeywords: [
    'backend', 'back end', 'back-end', 'software engineer',
    'software developer', 'lap trinh vien', 'web developer',
    'fullstack', 'full stack', 'full-stack'
  ],

  // Salary threshold gợi ý junior level (VNĐ).
  juniorSalaryMaxHint: 20000000
};

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9+.#/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPhrase(text, phrase) {
  const keyword = normalize(phrase);
  if (!keyword) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(keyword)}(?=$|[^a-z0-9])`, 'i').test(text);
}

function matchedPhrases(text, phrases) {
  return phrases.filter(phrase => hasPhrase(text, phrase));
}

function getText(job) {
  return normalize([
    job.title,
    job.company,
    job.location,
    job.level,
    job.employmentType,
    job.workModel,
    ...(Array.isArray(job.skills) ? job.skills : []),
    job.description,
    job.requirements,
    job.benefits
  ].filter(Boolean).join(' '));
}

function detectHanoi(job, allText) {
  const locationText = normalize(job.location);
  const textToCheck = locationText || allText;
  const hanoiMatches = matchedPhrases(textToCheck, config.hanoiKeywords);
  const remoteMatches = matchedPhrases(textToCheck, config.remoteKeywords);
  const otherMatches = matchedPhrases(textToCheck, config.otherLocationKeywords);

  // Job nhiều địa điểm có Hà Nội vẫn được nhận.
  if (hanoiMatches.length > 0) {
    return { status: 'HANOI', via: locationText ? 'location' : 'content', keywords: hanoiMatches };
  }

  // Remote có thể làm từ Hà Nội nên giữ lại, nhưng xếp sau job ghi rõ Hà Nội.
  if (remoteMatches.length > 0) {
    return { status: 'REMOTE', via: locationText ? 'location' : 'content', keywords: remoteMatches };
  }

  // Soft penalty: không loại cứng mà trừ điểm để giữ lại cuối danh sách.
  if (otherMatches.length > 0) {
    return { status: 'OTHER', via: locationText ? 'location' : 'content', keywords: otherMatches };
  }

  // Không rõ location: giữ lại để tránh bỏ sót.
  return { status: 'UNKNOWN', via: null, keywords: [] };
}

function parseExperienceFromText(text) {
  // — Không yêu cầu kinh nghiệm / Fresher —
  if (/khong yeu cau kinh nghiem|khong can kinh nghiem|no experience required|chua can kinh nghiem/.test(text)) {
    return { raw: 'Không yêu cầu kinh nghiệm', minYears: 0, maxYears: 0, source: 'text' };
  }

  // "dưới 1 năm", "duoi 1 nam", "under 1 year"
  const under = text.match(/(?:duoi|under|less than|it hon)\s*(\d+(?:[.,]\d+)?)\s*(?:nam|years?|yrs?|yoe)/i);
  if (under) {
    return {
      raw: under[0],
      minYears: 0,
      maxYears: Number(under[1].replace(',', '.')),
      source: 'text'
    };
  }

  // "0-1 năm", "1-2 năm", "1 – 3 years"
  const range = text.match(/(?:min(?:imum)?\s*)?(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(?:nam|years?|yrs?|yoe|exp|kn)\b/i);
  if (range) {
    return {
      raw: range[0],
      minYears: Number(range[1].replace(',', '.')),
      maxYears: Number(range[2].replace(',', '.')),
      source: 'text'
    };
  }

  // "từ X-Y năm kinh nghiệm" (rất phổ biến tiếng Việt)
  const rangeVi = text.match(/(?:tu|toi thieu|it nhat)\s*(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(?:nam|years?)\s*(?:kinh nghiem|experience)?/i);
  if (rangeVi) {
    return {
      raw: rangeVi[0],
      minYears: Number(rangeVi[1].replace(',', '.')),
      maxYears: Number(rangeVi[2].replace(',', '.')),
      source: 'text'
    };
  }

  // "khoảng X năm"
  const about = text.match(/(?:khoang|around|about|approximately)\s*(\d+(?:[.,]\d+)?)\s*(?:nam|years?|yrs?)/i);
  if (about) {
    const years = Number(about[1].replace(',', '.'));
    return {
      raw: about[0],
      minYears: Math.max(0, years - 1),
      maxYears: years + 1,
      source: 'text'
    };
  }

  // "trên X năm", "tren X nam"
  const above = text.match(/(?:tren|over|more than|hon)\s*(\d+(?:[.,]\d+)?)\s*(?:nam|years?|yrs?|yoe)/i);
  if (above) {
    return {
      raw: above[0],
      minYears: Number(above[1].replace(',', '.')),
      maxYears: null,
      source: 'text'
    };
  }

  const patterns = [
    /(?:tu|toi thieu|it nhat|min(?:imum)?|at least)\s*(\d+(?:[.,]\d+)?)\s*(?:\+\s*)?(?:nam|years?|yrs?|yoe|exp|kn)\b/i,
    /(\d+(?:[.,]\d+)?)\s*\+\s*(?:nam|years?|yrs?|yoe|exp|kn)\b/i,
    /(\d+(?:[.,]\d+)?)\s*(?:years?|yrs?|yoe|exp|kn)\s*\+/i,
    /(\d+(?:[.,]\d+)?)\s*(?:nam|years?)\s*(?:kinh nghiem|experience)/i,
    /(\d+(?:[.,]\d+)?)\s*y\+/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        raw: match[0],
        minYears: Number(match[1].replace(',', '.')),
        maxYears: null,
        source: 'text'
      };
    }
  }

  // Detect fresher trong text (sau các regex cụ thể hơn)
  if (/\bfresher\b|\bfresh graduate\b|\bfresh grad\b|\bnew grad\b|\bmoi tot nghiep\b|\bmoi ra truong\b/.test(text)) {
    return { raw: 'Fresher', minYears: 0, maxYears: 0, source: 'text' };
  }

  return { raw: null, minYears: null, maxYears: null, source: null };
}

function getExperience(job, text) {
  const minYears = Number(job.experience?.minYears);
  const maxYears = Number(job.experience?.maxYears);
  const hasMin = job.experience?.minYears !== null
    && job.experience?.minYears !== undefined
    && Number.isFinite(minYears);
  const hasMax = job.experience?.maxYears !== null
    && job.experience?.maxYears !== undefined
    && Number.isFinite(maxYears);

  if (hasMin || hasMax) {
    return {
      raw: job.experience?.raw || null,
      minYears: hasMin ? minYears : null,
      maxYears: hasMax ? maxYears : null,
      source: 'structured'
    };
  }
  return parseExperienceFromText(text);
}

function hasJava(job, titleText, allText) {
  const skills = (Array.isArray(job.skills) ? job.skills : []).map(normalize);
  return {
    inTitle: hasPhrase(titleText, 'java'),
    inSkills: skills.some(skill => skill === 'java' || skill.startsWith('java ')),
    anywhere: hasPhrase(allText, 'java')
  };
}

/**
 * Kiểm tra xem title có gợi ý đây là backend/software role không.
 * Dùng khi job không ghi rõ "Java" nhưng nội dung liên quan.
 */
function isBackendRole(titleText) {
  return config.backendTitleKeywords.some(kw => hasPhrase(titleText, kw));
}

/**
 * Trích xuất salary number từ các field salary.
 * Trả về number (VNĐ) hoặc null.
 */
function parseSalaryMax(job) {
  // Ưu tiên salaryMax structured
  if (job.salaryMax !== null && job.salaryMax !== undefined) {
    const val = Number(job.salaryMax);
    if (Number.isFinite(val) && val > 0) return val;
  }
  // Thử parse từ salary string
  if (job.salary) {
    const match = String(job.salary).match(/(\d[\d.,]*)\s*(?:trieu|tr|m|million)/i);
    if (match) {
      const num = Number(match[1].replace(/[.,]/g, ''));
      // Nếu < 1000 thì giả sử đơn vị triệu
      return num < 1000 ? num * 1000000 : num;
    }
  }
  return null;
}

/**
 * Tính số ngày từ khi job được đăng.
 */
function daysSincePosted(job) {
  const posted = Date.parse(job.postedAt || job.time || '');
  if (!posted) return null;
  return Math.floor((Date.now() - posted) / (1000 * 60 * 60 * 24));
}

/**
 * Normalize title cho dedup — loại bỏ level prefix, brackets, ký tự đặc biệt.
 */
function normalizeForDedup(title) {
  let t = normalize(title);
  // Loại bỏ level prefix
  t = t.replace(/\b(intern|fresher|junior|middle|mid|senior|lead|principal|staff)\b/g, '');
  // Loại bỏ nội dung trong ngoặc
  t = t.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
  // Loại bỏ các từ filler phổ biến
  t = t.replace(/\b(tuyen|dung|tuyen dung|can tuyen|urgent|hot)\b/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

function scoreJob(job) {
  const titleText = normalize(job.title);
  const levelText = normalize(job.level);
  const allText = getText(job);

  if (!allText || !titleText) return null;

  const hanoi = detectHanoi(job, allText);

  const java = hasJava(job, titleText, allText);

  // Nếu không có "java" ở bất kỳ đâu:
  // - Nếu title là backend/software role → giữ với điểm thấp (có thể dùng Java)
  // - Nếu không → loại cứng
  if (!java.anywhere) {
    if (!isBackendRole(titleText)) return null;
    // Tiếp tục scoring nhưng sẽ có điểm Java rất thấp
  }

  // Chỉ loại cứng khi unrelated keyword nằm TRONG TITLE (không check description).
  const unrelatedInTitle = matchedPhrases(titleText, config.unrelatedTitleKeywords);
  if (unrelatedInTitle.length > 0) return null;

  const titleAndLevel = `${titleText} ${levelText}`;
  const seniorMatches = matchedPhrases(titleAndLevel, config.seniorKeywords);

  const experience = getExperience(job, allText);

  let score = 0;
  const reasons = [];

  // ——— LOCATION SCORING ———
  if (hanoi.status === 'HANOI') {
    score += 10;
    reasons.push(`+10 Hà Nội (${hanoi.via})`);
  } else if (hanoi.status === 'REMOTE') {
    score += 3;
    reasons.push('+3 Remote');
  } else if (hanoi.status === 'OTHER') {
    // Soft penalty thay vì loại cứng
    score -= 15;
    reasons.push(`-15 Location khác: ${hanoi.keywords.join(', ')}`);
  } else {
    score -= 2;
    reasons.push('-2 Không xác định location');
  }

  // ——— JAVA SCORING ———
  if (java.inTitle) {
    score += 10;
    reasons.push('+10 Java trong title');
  } else if (java.inSkills) {
    score += 7;
    reasons.push('+7 Java trong skills');
  } else if (java.anywhere) {
    score += 3;
    reasons.push('+3 Java trong nội dung');
  } else {
    // Backend role không ghi rõ Java — điểm thấp nhất
    score -= 3;
    reasons.push('-3 Backend role, không ghi rõ Java');
  }

  // ——— TITLE COMBO BONUS ———
  if (/java\s*(backend|back end|back-end)\s*(developer|dev|engineer)?/.test(titleText) ||
      /lap trinh vien\s*java/.test(titleText)) {
    score += 5;
    reasons.push('+5 Java Backend trong title');
  } else if (/java\s*(developer|dev|engineer)/.test(titleText)) {
    score += 4;
    reasons.push('+4 Java Developer trong title');
  } else if (/software\s*(engineer|developer)/.test(titleText)) {
    score += 2;
    reasons.push('+2 Software Engineer trong title');
  }

  if (/backend|back end|back-end/.test(titleText)) {
    score += 5;
    reasons.push('+5 Backend');
  }
  if (/fullstack|full stack|full-stack/.test(titleText)) {
    score += 2;
    reasons.push('+2 Fullstack');
  }

  // ——— LEVEL SCORING (tăng trọng số) ———
  if (/fresher|entry level|new graduate|moi tot nghiep|fresh grad/.test(titleAndLevel)) {
    score += 15;
    reasons.push('+15 Fresher/Entry level');
  } else if (/junior/.test(titleAndLevel)) {
    score += 14;
    reasons.push('+14 Junior');
  } else if (/intern|thuc tap/.test(titleAndLevel)) {
    score += 8;
    reasons.push('+8 Internship');
  } else if (/all level|all levels/.test(titleAndLevel)) {
    score += 6;
    reasons.push('+6 All level');
  } else if (/middle|mid level|mid-level/.test(titleAndLevel)) {
    score -= 3;
    reasons.push('-3 Middle');
  }

  if (seniorMatches.length > 0) {
    score -= 12;
    reasons.push(`-12 Senior/Lead: ${seniorMatches.join(', ')}`);
  }

  // ——— EXPERIENCE SCORING (chi tiết hơn) ———
  if (experience.minYears === 0) {
    score += 15;
    reasons.push('+15 Không yêu cầu kinh nghiệm');
  } else if (experience.minYears !== null && experience.minYears <= 1) {
    score += 13;
    reasons.push(`+13 Kinh nghiệm ${experience.minYears} năm`);
  } else if (experience.minYears !== null && experience.minYears <= config.targetExperienceYears) {
    score += 10;
    reasons.push(`+10 Kinh nghiệm ${experience.minYears} năm`);
  } else if (experience.minYears !== null && experience.minYears === 3) {
    score -= 5;
    reasons.push('-5 Yêu cầu 3 năm');
  } else if (experience.minYears !== null && experience.minYears === 4) {
    score -= 8;
    reasons.push('-8 Yêu cầu 4 năm');
  } else if (experience.minYears !== null && experience.minYears >= 5) {
    score -= 15;
    reasons.push(`-15 Yêu cầu ${experience.minYears} năm`);
  } else {
    // Không rõ KN → bonus nhẹ vì job không nêu KN thường sẵn sàng nhận fresher
    score += 2;
    reasons.push('+2 Không xác định kinh nghiệm');
  }

  // ——— Nếu có range kinh nghiệm, bonus thêm nếu maxYears thấp ———
  if (experience.maxYears !== null && experience.maxYears <= 2 && experience.minYears !== null && experience.minYears <= 1) {
    score += 3;
    reasons.push(`+3 Range KN phù hợp (${experience.minYears}-${experience.maxYears} năm)`);
  }

  // ——— TECH STACK SCORING (mở rộng) ———
  const techRules = [
    { label: 'Spring Boot', pattern: /spring boot/, points: 6 },
    { label: 'Spring', pattern: /\bspring\b/, points: 3, skipWhen: /spring boot/ },
    { label: 'REST API', pattern: /restful api|rest api/, points: 2 },
    { label: 'JPA/Hibernate', pattern: /\bjpa\b|hibernate/, points: 2 },
    { label: 'SQL', pattern: /\bsql\b/, points: 2 },
    { label: 'Database', pattern: /mysql|postgresql|oracle|mariadb/, points: 2 },
    { label: 'Git', pattern: /\bgit\b|github|gitlab/, points: 1 },
    { label: 'Docker', pattern: /\bdocker\b|container/, points: 1 },
    { label: 'Microservices', pattern: /microservices?/, points: 1 },
    { label: 'Maven/Gradle', pattern: /\bmaven\b|\bgradle\b/, points: 2 },
    { label: 'Kafka', pattern: /\bkafka\b/, points: 1 },
    { label: 'Redis', pattern: /\bredis\b/, points: 1 },
    { label: 'Jenkins/CI-CD', pattern: /\bjenkins\b|ci\/cd|ci cd/, points: 1 },
    { label: 'Cloud', pattern: /\baws\b|\bazure\b|\bgcp\b|cloud/, points: 1 },
    { label: 'Agile/Scrum', pattern: /\bagile\b|\bscrum\b/, points: 1 },
    { label: 'Tomcat', pattern: /\btomcat\b/, points: 1 },
    { label: 'Thymeleaf/JSP', pattern: /\bthymeleaf\b|\bjsp\b/, points: 1 },
    { label: 'RabbitMQ', pattern: /\brabbitmq\b/, points: 1 },
    { label: 'MongoDB', pattern: /\bmongodb\b|\bmongo\b/, points: 1 },
    { label: 'Elasticsearch', pattern: /\belasticsearch\b|\belastic\b/, points: 1 },
    { label: 'Linux', pattern: /\blinux\b/, points: 1 },
    { label: 'Kubernetes', pattern: /\bkubernetes\b|\bk8s\b/, points: 1 }
  ];

  const matchedTech = [];
  for (const rule of techRules) {
    if (rule.skipWhen?.test(allText)) continue;
    if (rule.pattern.test(allText)) {
      score += rule.points;
      matchedTech.push(rule.label);
      reasons.push(`+${rule.points} ${rule.label}`);
    }
  }

  // ——— SALARY HINT (gợi ý junior level) ———
  const salaryMax = parseSalaryMax(job);
  if (salaryMax !== null) {
    if (salaryMax <= config.juniorSalaryMaxHint) {
      score += 3;
      reasons.push('+3 Salary gợi ý junior');
    } else if (salaryMax >= 40000000) {
      score -= 2;
      reasons.push('-2 Salary cao (senior?)');
    }
  }

  // ——— RECENCY BONUS (job mới đăng) ———
  const daysOld = daysSincePosted(job);
  if (daysOld !== null) {
    if (daysOld <= 3) {
      score += 3;
      reasons.push('+3 Mới đăng (≤3 ngày)');
    } else if (daysOld <= 7) {
      score += 1;
      reasons.push('+1 Đăng gần đây (≤7 ngày)');
    } else if (daysOld >= 30) {
      score -= 2;
      reasons.push('-2 Đã đăng lâu (≥30 ngày)');
    }
  }

  // ——— SOURCE QUALITY ———
  const source = normalize(job.source);
  if (/itviec|topdev|vietnamworks/.test(source)) {
    score += 1;
    reasons.push('+1 Nguồn chính thống');
  }

  if (score < config.minScore) return null;

  return {
    ...job,
    jobScore: score,
    matchReasons: reasons,
    filterInfo: {
      locationStatus: hanoi.status,
      locationMatchedVia: hanoi.via,
      locationKeywords: hanoi.keywords,
      experience,
      java,
      matchedTech,
      salaryMax,
      daysOld
    }
  };
}

const scored = $input.all()
  .map(item => scoreJob(item.json))
  .filter(Boolean)
  .sort((a, b) => {
    if (b.jobScore !== a.jobScore) return b.jobScore - a.jobScore;
    const dateA = Date.parse(a.postedAt || a.time || '') || 0;
    const dateB = Date.parse(b.postedAt || b.time || '') || 0;
    return dateB - dateA;
  });

// ——— DEDUPLICATION NÂNG CAO ———
const seen = new Set();
const seenUrls = new Set();
const finalJobs = config.deduplicate
  ? scored.filter(job => {
      // Dedup theo URL trước
      const url = normalize(job.url);
      if (url && seenUrls.has(url)) return false;
      if (url) seenUrls.add(url);

      // Dedup theo title + company (fuzzy)
      const company = normalize(job.company);
      const dedupTitle = normalizeForDedup(job.title);
      const key = company
        ? `${dedupTitle}|${company}`
        : `${dedupTitle}|${normalize(job.description).slice(0, 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  : scored;

return finalJobs.map(job => ({ json: job }));
