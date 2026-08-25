# Job Collector cho n8n

API lấy và chuẩn hóa việc làm từ **ITviec, TopCV, VietnamWorks và TopDev**. Kết quả có description, requirements, kỹ năng, lương và số năm kinh nghiệm đã suy luận. Một nguồn lỗi không làm hỏng dữ liệu của nguồn còn lại.

## Chạy bằng Docker

```bash
docker compose up -d --build
curl http://localhost:3000/health
```

API mặc định:

```bash
curl "http://localhost:3000/jobs?keyword=java&location=ha-noi&sources=itviec,topcv,vietnamworks,topdev&pages=1&limit=20"
```

Hoặc POST (thuận tiện cho n8n):

```bash
curl -X POST http://localhost:3000/collect \
  -H 'Content-Type: application/json' \
  -d '{"keyword":"java","location":"ha-noi","sources":["itviec","topcv","vietnamworks","topdev"],"pages":1,"limit":20}'
```

`limit` là tổng số job tối đa và collector lấy xen kẽ giữa các nguồn. `candidateExperienceYears` là tùy chọn; nên để node filter/ranking chung trong n8n xử lý nếu bạn còn ghép dữ liệu Apify.

## Schema chung của một job

Mọi phần tử trong `jobs` luôn có cùng bộ field:

```json
{
  "id": "topdev:2127529",
  "source": "topdev",
  "title": "Java Developer",
  "company": "Example Company",
  "location": "Hà Nội",
  "salary": "30 - 50 triệu VND",
  "salaryMin": 30000000,
  "salaryMax": 50000000,
  "salaryCurrency": "VND",
  "employmentType": "Fulltime",
  "workModel": "Trực tiếp",
  "level": "Middle, Senior",
  "postedAt": "2026-08-25",
  "expiresAt": "2026-09-25",
  "skills": ["Java", "Spring Boot"],
  "description": "Nội dung công việc...",
  "requirements": "Yêu cầu ứng viên...",
  "benefits": "Quyền lợi...",
  "experience": {
    "raw": "từ 3 năm",
    "minYears": 3,
    "maxYears": null
  },
  "numberOfRecruits": null,
  "url": "https://..."
}
```

Field website không cung cấp sẽ là `null`, chuỗi rỗng hoặc mảng rỗng theo đúng kiểu dữ liệu trên; không bị đổi tên giữa các nguồn.

## Dùng trong n8n

Luồng phù hợp khi đã có một nhánh Apify:

```text
Schedule Trigger
├─ HTTP Request (Collector) → Split Out jobs ─┐
└─ Apify → Code: Normalize Apify ─────────────┤
                                              └→ Merge (Append) → Filter/Rank → Email
```

Trong HTTP Request:

- Method: `POST`
- URL khi n8n chạy trong compose này: `http://collector:3000/collect`
- Send Body: JSON
- Body: `{"keyword":"java","location":"ha-noi","sources":["itviec","topcv","vietnamworks","topdev"],"pages":1,"limit":20}`

Ở node **Split Out**, chọn field `jobs`. Cấu hình node **Merge** là `Append` để mỗi job của hai nhánh vẫn là một n8n item riêng trước khi đi qua filter.

Ví dụ Code node chuẩn hóa output Facebook/Apify giống ảnh của bạn:

```javascript
const inputItems = $input.all();

const clean = (value = '') => String(value)
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .trim();

const cleanMarkdown = (value = '') => clean(value)
  .replace(/[*#_`]/g, '')
  .replace(/^[\s📌🔥💻🎯🔹•-]+/u, '')
  .trim();

function extractTitle(text) {
  const lines = text.split('\n').map(cleanMarkdown).filter(Boolean);
  const recruitingLine = lines.find(line =>
    /tuyển|hiring|chiêu mộ|open|cần tuyển|cần gấp/i.test(line)
    && /java|backend|fullstack|developer|engineer|consultant|qa|tester/i.test(line)
  );
  return cleanMarkdown(recruitingLine || lines[0] || 'Facebook job post').slice(0, 180);
}

function extractSection(text, startPattern, endPattern) {
  const start = text.search(startPattern);
  if (start < 0) return '';
  const remaining = text.slice(start);
  const headingEnd = remaining.indexOf('\n');
  const content = headingEnd >= 0 ? remaining.slice(headingEnd + 1) : remaining;
  const end = content.search(endPattern);
  return clean(end >= 0 ? content.slice(0, end) : content)
    .replace(/[\s📌🔥💻🎯🔹*#_]+$/u, '')
    .trim();
}

function extractExperience(text) {
  if (/không yêu cầu kinh nghiệm|no experience required|fresher/i.test(text)) {
    return { raw: 'Không yêu cầu kinh nghiệm', minYears: 0, maxYears: 0 };
  }

  const range = text.match(/(?:min(?:imum)?\s*)?(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(?:năm|years?|yrs?|yoe|exp|kn)\b/i);
  if (range) {
    return {
      raw: cleanMarkdown(range[0]),
      minYears: Number(range[1].replace(',', '.')),
      maxYears: Number(range[2].replace(',', '.'))
    };
  }

  const patterns = [
    /(?:từ|tối thiểu|ít nhất|min(?:imum)?|at least)\s*\**(\d+(?:[.,]\d+)?)\s*(?:\+\s*)?(?:năm|years?|yrs?|yoe|exp|kn)\b/i,
    /(\d+(?:[.,]\d+)?)\s*\+\s*(?:năm|years?|yrs?|yoe|exp|kn)\b/i,
    /(\d+(?:[.,]\d+)?)\s*(?:years?|yrs?|yoe|exp|kn)\s*\+/i,
    /(\d+(?:[.,]\d+)?)\s*(?:năm|years?)\s+(?:kinh nghiệm|experience)/i,
    /(\d+(?:[.,]\d+)?)\s*y\+/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        raw: cleanMarkdown(match[0]),
        minYears: Number(match[1].replace(',', '.')),
        maxYears: null
      };
    }
  }
  return { raw: null, minYears: null, maxYears: null };
}

function extractSalary(text) {
  let match = text.match(/\$\s*(\d+(?:[.,]\d+)?)\s*[-–]\s*\$?\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*(?:hour|hr|month))?/i);
  if (match) {
    return { raw: cleanMarkdown(match[0]), min: Number(match[1]), max: Number(match[2]), currency: 'USD' };
  }

  match = text.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(M|mil|triệu|tr)\b/i);
  if (match) {
    return {
      raw: cleanMarkdown(match[0]),
      min: Number(match[1].replace(',', '.')) * 1_000_000,
      max: Number(match[2].replace(',', '.')) * 1_000_000,
      currency: 'VND'
    };
  }

  match = text.match(/(?:up\s*to|upto|lên\s*tới|tới|offer)\s*\**(\d+(?:[.,]\d+)?)\s*(M|mil|triệu|tr)\b/i)
    || text.match(/(\d+(?:[.,]\d+)?)\s*(M|mil|triệu|tr)\s*(?:gross|net)\b/i);
  if (match) {
    const amount = Number(match[1].replace(',', '.')) * 1_000_000;
    return { raw: cleanMarkdown(match[0]), min: null, max: amount, currency: 'VND' };
  }
  return { raw: null, min: null, max: null, currency: null };
}

function extractLocation(text) {
  const locations = [];
  if (/hà nội|\bHN\b|cầu giấy|hoàn kiếm|times city/i.test(text)) locations.push('Hà Nội');
  if (/hồ chí minh|\bHCM\b|sài gòn|\bSG\b/i.test(text)) locations.push('Hồ Chí Minh');
  if (/đà nẵng|\bĐN\b/i.test(text)) locations.push('Đà Nẵng');
  if (/\bremote\b|làm việc từ xa/i.test(text)) locations.push('Remote');
  return [...new Set(locations)].join(' | ');
}

function extractSkills(text) {
  const dictionary = [
    ['Java', /\bjava\b/i], ['Spring Boot', /spring\s*boot/i], ['Spring', /\bspring\b/i],
    ['Golang', /\bgolang\b|\bgo developer\b/i], ['ReactJS', /react\s*js|reactjs|\breact\b/i],
    ['Angular', /\bangular\b/i], ['VueJS', /vue\s*js|vuejs|\bvue\b/i], ['NodeJS', /node\s*js|nodejs/i],
    ['JavaScript', /javascript/i], ['TypeScript', /typescript/i], ['SQL', /\bsql\b/i],
    ['Oracle', /\boracle\b/i], ['MySQL', /mysql/i], ['PostgreSQL', /postgres(?:ql)?/i],
    ['Microservices', /microservices?/i], ['REST API', /rest(?:ful)?\s*api/i],
    ['Hibernate', /hibernate/i], ['Docker', /\bdocker\b/i], ['Kubernetes', /kubernetes|\bk8s\b/i],
    ['Kafka', /\bkafka\b/i], ['.NET', /\.net\b/i], ['C#', /c#/i]
  ];
  return dictionary.filter(([, pattern]) => pattern.test(text)).map(([skill]) => skill);
}

function extractLevel(title, text) {
  const explicitLevel = text.match(/(?:level|cấp bậc)\s*:\s*([^\n|]+)/i)?.[1] || '';
  const source = `${title} ${explicitLevel}`;
  return ['Intern', 'Fresher', 'Junior', 'Middle', 'Senior', 'Lead']
    .filter(level => new RegExp(`\\b${level}\\b`, 'i').test(source))
    .join(', ') || null;
}

return inputItems.map(({ json }) => {
  const text = clean(json.text);
  const salary = extractSalary(text);
  const title = extractTitle(text);
  const requirements = extractSection(
    text,
    /yêu cầu(?: cốt lõi)?|requirements?|required skills?/i,
    /quyền lợi|chế độ|benefits?|ứng tuyển|liên hệ|contact|email/i
  );
  const benefits = extractSection(
    text,
    /quyền lợi|chế độ|benefits?/i,
    /ứng tuyển|liên hệ|contact|email/i
  );

  return {
    json: {
      id: `apify:${json.legacyId || json.id || json.url || json.time}`,
      source: 'apify',
      title,
      company: '',
      location: extractLocation(text),
      salary: salary.raw,
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      employmentType: /part[ -]?time/i.test(text) ? 'Part-time'
        : /full[ -]?time/i.test(text) ? 'Full-time'
          : /intern(?:ship)?|thực tập/i.test(text) ? 'Internship' : null,
      workModel: /\bremote\b|từ xa/i.test(text) ? 'Remote'
        : /\bhybrid\b/i.test(text) ? 'Hybrid'
          : /\bonsite\b|trực tiếp/i.test(text) ? 'Onsite' : null,
      level: extractLevel(title, text),
      postedAt: json.time || null,
      expiresAt: null,
      skills: extractSkills(text),
      description: text,
      requirements,
      benefits,
      experience: extractExperience(requirements || text),
      numberOfRecruits: null,
      url: json.url || json.facebookUrl || null
    }
  };
});
```

Node filter/ranking sau Merge có thể đọc thống nhất: `title`, `description`, `requirements`, `skills`, `experience.minYears`, `level`, `location` và `salaryMin`/`salaryMax`.

## Cách lấy chi tiết theo nguồn

- ITviec: lấy URL từ card tìm kiếm rồi đọc `JobPosting` ở từng trang chi tiết.
- TopCV: lấy URL từ `data.html_job` rồi đọc trang chi tiết.
- VietnamWorks: search API để lấy danh sách, sau đó làm giàu bằng dữ liệu đầy đủ trong trang job; nếu trang chi tiết lỗi thì giữ bản tóm tắt từ API.
- TopDev: search API đã trả `responsibilities_original` và `requirements_original`, không cần request chi tiết lần hai.

## Lưu ý TopCV

TopCV dùng Cloudflare và có thể trả HTTP 403 cho máy chủ/Docker. Khi đó response vẫn có job ITviec và thêm lỗi TopCV vào mảng `errors`. Nếu request trên trình duyệt của bạn hoạt động, copy giá trị header `Cookie` của request TopCV vào file `.env`:

```dotenv
TOPCV_COOKIE="cookie1=value1; cookie2=value2"
```

Sau đó chạy lại `docker compose up -d --build`. Cookie là dữ liệu nhạy cảm, không commit và có thể hết hạn. Collector có delay mặc định 500 ms giữa các trang chi tiết; hãy giữ tần suất hợp lý và tuân thủ điều khoản/robots.txt của từng website.
