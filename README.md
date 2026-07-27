# เลือกดี — Affiliate Lab

ระบบทดลอง Affiliate สำหรับ **Shopee / TikTok Shop / Facebook**  
คัดสินค้า → สร้างคอนเทนต์ภาษาไทย → จัดตารางโพสต์แบบ **draft + อนุมัติก่อนโพสต์จริง**

> ไม่การันตีรายได้ เป็นเครื่องมือทดลองและปรับปรุงจากข้อมูลจริง

## หลักการสำคัญ

- ไม่สแปม / ไม่โพสต์ซ้ำไร้คุณภาพ / ไม่ใช้คำโฆษณาเกินจริง
- ทุก caption มี disclosure: *ลิงก์นี้เป็นลิงก์ affiliate ผู้เขียนอาจได้รับค่าคอมมิชชัน*
- โหมด **manual** เป็นค่าเริ่มต้น (ใส่สินค้า/ลิงก์/ค่าคอมเอง)
- **ไม่โพสต์อัตโนมัติ** — สร้าง draft แล้วต้อง Approve ก่อนโพสต์ด้วยมือ
- Adapter สำหรับ Shopee / TikTok Shop / Meta API แยกไว้เป็น stub สำหรับต่อภายหลัง


## Production (cPanel / MySQL)

Live: [https://shopee.sogiin6868.com](https://shopee.sogiin6868.com)

- PHP + MySQL package: `deploy/php/`
- First-time setup: open `/install.php` (สร้างตาราง + แคตตาล็อกเริ่มต้น + คิววันนี้)
- Image guide: [/guide/](https://shopee.sogiin6868.com/guide/)
- Config example: `deploy/php/config.example.php` (อย่า commit รหัสผ่านจริง)

> โฮสต์ shared รัน PHP ได้ — ชุด Next.js ยังใช้สำหรับพัฒนาในเครื่อง


## เริ่มใช้งาน

```bash
npm install
npm run seed   # เคลียร์ DB ให้ว่าง (ไม่มีสินค้าตัวอย่าง)
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

**คู่มือละเอียด:** [docs/คู่มือการใช้งาน.md](./docs/คู่มือการใช้งาน.md) หรือในแอปที่ [/guide](http://localhost:3000/guide)

### หน้าแรก: ออฟฟิศ Workflow (การ์ตูน)

แดชบอร์ดใช้งานจริง (ไม่ใช่ landing) แสดงแผนผังออฟฟิศแบบการ์ตูน:

- เมนูแผนก: ขาย / การตลาด / บัญชี / คลัง / จัดซื้อ / บริการลูกค้า / ผู้บริหาร
- ตัวละครพนักงาน + การ์ดงานเคลื่อนตามขั้นตอน
- คลิกขั้น workflow หรือการ์ดงานเพื่อดูรายละเอียด
- กรองสถานะ: กำลังทำ · รออนุมัติ · เสร็จแล้ว · งานค้าง
- ค้นหา + สรุปงานวันนี้ / ค้าง / รออนุมัติ / เวลาเฉลี่ย
- ใช้ mock data เล่นได้ทันทีโดยไม่ต้องต่อ API

Affiliate dashboard เดิมอยู่ที่ `/affiliate`

### คำสั่งที่มีประโยชน์

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run seed` | เคลียร์ฐานข้อมูลให้ว่าง (ไม่ใส่ของตัวอย่าง) |
| `npm run workflow:morning` | คัด Top 5 + content pack + ตาราง draft วันนี้ |
| `npm run workflow:evening` | วิเคราะห์ผลที่กรอก + แนะนำวันถัดไป |
| `npm run test:unit` | เทสต์ scoring / content / schedule |
| `npm run build` | build production |

## หน้าเว็บ

- `/` ออฟฟิศ Workflow (แผนผังการ์ตูน)
- `/affiliate` แดชบอร์ด Affiliate + แผง Login ตอนไหน/สถานะบัญชี + workflow + Top สินค้า
- `/automation` ศูนย์อัตโนมัติ (login status, morning/evening, import CSV/JSON, bulk approve, logs)
- `/products` เพิ่มสินค้า / สร้าง content pack
- `/calendar` ตารางโพสต์วันนี้ + Approve
- `/results` กรอก views/clicks/orders/ค่าคอม + ดูวิเคราะห์
- `/guide` คู่มือการใช้งาน

### Export

- JSON: `/api/export?format=json`
- CSV สินค้า: `/api/export?format=csv&scope=products`
- CSV ตาราง: `/api/export?format=csv&scope=schedule`

## Workflow แนะนำ

**เช้า**

1. `npm run workflow:morning` (หรือกดปุ่มในแดชบอร์ด)
2. เปิด `/calendar` ตรวจ draft
3. Approve ชิ้นที่คุณภาพโอเค → โพสต์ด้วยมือบน TikTok/Facebook
4. กด “ยืนยันว่าโพสต์แล้ว”

**เย็น**

1. กรอกผลที่ `/results`
2. `npm run workflow:evening`
3. ดูคำแนะนำสินค้า/มุมขายวันถัดไป

## โครงสร้างหลัก

```
src/lib/           scoring, content, schedule, analytics, db
src/lib/adapters/  manual + API stubs (Shopee/TikTok/Facebook)
src/app/           Dashboard UI + API routes
scripts/           seed, morning, evening, unit tests
data/db.json       ฐานข้อมูลไฟล์ (JSON)
```

## คะแนนจัดอันดับสินค้า

ถ่วงน้ำหนักจาก:

1. Commission rate  
2. ราคาเหมาะ impulse buy  
3. Pain point ชัด  
4. ทำวิดีโอสั้นง่าย  
5. Seasonal / trending  
6. ผลลัพธ์ที่เคยบันทึก (boost เบา ๆ จาก CTR/orders/ค่าคอม — โหมดทดลอง)

### กันสแปมในตารางโพสต์

- วันละ 2–3 draft เท่านั้น และต้อง Approve ก่อนโพสต์จริง  
- หมุน hook/CTA และสร้าง content pack ใหม่รายวัน  
- หลีกเลี่ยงคู่สินค้า+ช่องทางที่เพิ่งใช้ใน 3 วันล่าสุด  
- กระจายช่องทางในวันเดียวกัน (ไม่ยัดช่องเดียว)  
- วันคู่สลับช่องเย็นเป็น Facebook Group (น้ำเสียงแชร์ในกลุ่ม ไม่ขายแข็ง)
- Soft-sanitize คำโฆษณาเกินจริง / เคลมรายได้แน่นอน ก่อนใส่ caption
- คะแนนฤดูกาลอิงปฏิทินไทย (เช่น สงกรานต์, 11.11, ปีใหม่) แบบ soft boost

## ข้อจำกัด MVP

- ยังไม่มี key API ภายนอก — ใช้ manual เท่านั้น
- การโพสต์จริงทำด้วยมือหลัง Approve
- ตัวเลข ROI มาจากการกรอกของผู้ใช้ ไม่ได้ดึงจากแพลตฟอร์มอัตโนมัติ
