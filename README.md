# เลือกดี — Affiliate Content Lab

ระบบทดลองคอนเทนต์ affiliate สำหรับ **Shopee**, **TikTok Shop** และ **Facebook**  
โหมด MVP ใช้ข้อมูล manual (ใส่สินค้า/ลิงก์เอง) สร้างแคปชัน–สคริปต์–ตารางโพสต์ และเรียนรู้จากผลลัพธ์จริง

> ไม่มีการรับประกันรายได้ · ไม่โพสต์อัตโนมัติ · ทุกโพสต์ต้องมี disclosure และผ่านการอนุมัติก่อน

## คุณสมบัติหลัก

- เพิ่มสินค้า affiliate (ลิงก์, ราคา, ค่าคอม, หมวด, จุดขาย, pain point, กลุ่มเป้าหมาย)
- จัดอันดับสินค้าน่าโปรโมตจากคะแนนทดลอง (commission, impulse price, pain clarity, video ease, seasonal)
- สร้าง content pack: TikTok script 15–30 วิ, Facebook caption, Reels caption, hooks×5, CTA×3, hashtags ไทย/อังกฤษ
- Scheduler แนะนำวันละ 2–3 โพสต์ในสถานะ **draft** เท่านั้น
- Approve ก่อนนำไปโพสต์จริง (คัดลอกเอง) — ระบบไม่ยิงโพสต์ให้อัตโนมัติ
- บันทึก views / clicks / orders / commission แบบ manual แล้ววิเคราะห์เย็น
- Export CSV / JSON
- Adapter stub พร้อมต่อ Shopee / TikTok Shop / Meta API ภายหลัง

## เริ่มใช้งาน

ต้องการ Node.js 18+ (แนะนำ 20/22)

```bash
npm install
npm run seed              # ใส่สินค้าตัวอย่าง 6 รายการ
npm run workflow:morning  # คัด top 5 + สร้าง content + draft ตารางวันนี้
npm run dev               # เปิดแดชบอร์ด http://localhost:3000
```

ตอนเย็น หลังกรอกผลลัพธ์ในหน้า **ผลลัพธ์**:

```bash
npm run workflow:evening
```

หรือกดปุ่ม workflow จากหน้าแรกของเว็บ

### คำสั่งอื่น

| คำสั่ง | ความหมาย |
| --- | --- |
| `npm run build` | ビルド production |
| `npm run start` | รัน production server |
| `npm run lint` | ESLint |
| `npm run test:unit` | เทส scoring |
| `npm run workflow:morning -- 2026-07-25` | ระบุวันที่ |
| `npm run workflow:evening -- 2026-07-25` | ระบุวันที่ |

Export:

- JSON: `http://localhost:3000/api/export?type=json`
- Products CSV: `/api/export?type=products.csv`
- Schedule CSV: `/api/export?type=schedule.csv`
- Metrics CSV: `/api/export?type=metrics.csv`

## Workflow รายวัน

### เช้า
1. จัดอันดับสินค้า top 5
2. สร้าง content pack ต่อสินค้า
3. สร้าง posting calendar วันนี้ (draft 2–3 ชิ้น)
4. สรุปว่าควรถ่ายวิดีโอแบบไหนก่อน

### ระหว่างวัน
1. เปิดหน้า **ตารางโพสต์** → ตรวจแคปชัน → กด **อนุมัติ**
2. คัดลอกไปโพสต์เองบน TikTok / Facebook
3. กด **ฉันโพสต์แล้ว** เมื่อเผยแพร่จริง

### เย็น
1. กรอก views, clicks, orders, commission
2. รัน evening workflow เพื่อดูโพสต์ที่เวิร์กและมุมขายวันถัดไป

## กติกาคอนเทนต์

- มี disclosure: “ลิงก์นี้เป็นลิงก์ affiliate ผู้เขียนอาจได้รับค่าคอมมิชชัน…”
- น้ำเสียงไทย ช่วยเลือกของ ไม่ขายแข็ง
- ห้ามสแปม / ห้ามคำหลอกลวง / ห้ามเคลมรายได้แน่นอน
- ไม่มี auto-post จนกว่าจะมี approval + (อนาคต) adapter ที่ปลอดภัย

## โครงสร้าง

```
src/lib/           # scoring, content, schedule, analytics, db, adapters
src/app/           # Dashboard + API routes
scripts/           # seed, morning, evening CLI
data/db.json       # ฐานข้อมูลไฟล์ JSON (สร้างหลัง seed)
```

ข้อมูลเก็บใน `data/db.json` (gitignore) — เหมาะกับ MVP ในเครื่อง ไม่ต้องมี database server

## API adapters (อนาคต)

ตั้งค่า env เมื่อพร้อม (ตอนนี้ยังเป็น stub):

```bash
SHOPEE_AFFILIATE_APP_ID=
TIKTOK_SHOP_AFFILIATE_TOKEN=
META_PAGE_ACCESS_TOKEN=
```

แม้มี token แล้ว การโพสต์จริงยังต้องผ่านสถานะ `approved` เสมอ

## สแต็ก

Next.js (App Router) · TypeScript · Tailwind CSS v4 · JSON file store · `tsx` scripts
