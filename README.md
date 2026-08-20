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
- พักสินค้าที่ไม่ต้องการโปรโมตชั่วคราว (ไม่เข้า Morning ranking)
- ตั้งเป้า draft 2 หรือ 3 ชิ้น/วันได้ที่ `/automation`
- ตั้ง **cooldown กันสแปม** (2–7 วัน) และ **ข้าม draft ค้าง** อัตโนมัติตอน Morning
- Content pack มี hook 5 · CTA 3 · มุมขาย 3 · hashtag ไทย/อังกฤษ · filming checklist
- Export content pack / ตารางวันนี้ / **checklist โพสต์ที่อนุมัติแล้ว** เป็น Markdown
- Evening บันทึก **Learning** (ช่องทาง/hook/CTA/สินค้าที่เวิร์ก + soft penalty สินค้าอ่อน) เพื่อ bias อ่อน ๆ ใน Morning วันถัดไป
- จัดอันดับกระจายทั้งแพลตฟอร์มและ**หมวดหมู่** เพื่อลดโพสต์ซ้ำแนวเดียวกัน
- **แผนทดลอง (A/B hook)** ทุกเช้า + export Markdown ที่ `/automation`
- Soft boost **ใกล้วันแม่ (1–12 ส.ค.)** สำหรับหมวดของขวัญ/ดูแล
- Soft boost **เปิดเทอมปลายเดือน (13–31 ส.ค.)** + สะพานต้น ก.ย. สำหรับหมวดเรียน/แกเจ็ต/กระเป๋า
- วันที่ระบบใช้เขตเวลา **Asia/Bangkok** (ไม่ใช้ UTC เป็นวันปฏิทิน)
- Learning จาก Evening **ถูก persist** จริงใน `data/db.json` เพื่อ bias Morning วันถัดไป
- บันทึก **ต้นทุนโปรโมท** ได้ → คำนวณ ROI จริง `(ค่าคอม − ต้นทุน) ÷ ต้นทุน` (ไม่กรอก = ดูแค่ค่าคอม/คลิก)
- จำกัด draft รวมต่อวันแม้กด Morning ซ้ำแบบ force — กันสแปมคิว
- PHP production: ปุ่ม “ยืนยันว่าโพสต์แล้ว” ใช้ได้เฉพาะสถานะ **approved**
- Hook แยกน้ำเสียงตามแพลตฟอร์ม (Shopee / TikTok Shop / Facebook)
- ตรวจลิงก์ affiliate ซ้ำตอนเพิ่ม/นำเข้า เพื่อลดสแปม
- คัดลอกแคปชันจากตารางโพสต์ได้ทันที
- คะแนนคุณภาพแคปชัน (A–D) บนตารางโพสต์ — ช่วยตัดสินใจก่อน Approve
- จัดอันดับผสม **ค่าคอม% + ค่าคอมคาดหวัง (บาท/ชิ้น)** — ของถูกคอมสูง% ไม่กินทั้งคิว
- Morning brief อธิบายว่าทำไมสินค้าติด Top (จุดแข็ง + ค่าคอมคาดหวัง)
- Evening เรียน **ช่วงเวลาโพสต์** ที่คะแนนดีกว่า + soft penalty โพสต์วิวสูงแต่ไม่มียอดสั่ง
- **คิวถ่ายวิดีโอ** จัดลำดับถ่ายก่อนจากความง่าย × ranking × ค่าคอมคาดหวัง × คิว short/reels วันนี้
- Morning ตรวจ **compliance** (disclosure + คำโฆษณาเกินจริง) และเตือนสินค้าที่ข้อมูลไม่ครบ
- Export คิวถ่าย: `/api/export?format=md&scope=filming`
- **Posting Pack**: คัดลอกชุดโพสต์พร้อมลิงก์/แคปชัน/checklist หลัง Approve (`/api/schedule/:id/posting-pack`)
- วางลิงก์ affiliate แล้วระบบช่วยจับแพลตฟอร์ม (Shopee / TikTok Shop / Facebook)
- **Approve gate**: ขาด disclosure หรือมีคำโฆษณาเกินจริง = Approve ไม่ได้ (ทั้งชิ้นเดียวและ bulk)
- **สร้างแคปชันใหม่** จากตารางโพสต์ (variant ใหม่) — ยังเป็น draft ต้อง Approve ก่อน
- Evening แนะนำสินค้าที่ควร**พักชั่วคราว**จากผลจริง (ไม่พักอัตโนมัติ)


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
npm run seed:demo   # หรือ npm run seed ถ้าอยากเริ่มว่าง
npm run workflow:morning
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
| `npm run seed:demo` | ใส่สินค้าตัวอย่าง 6 ชิ้นสำหรับทดลองในเครื่อง |
| `npm run workflow:morning` | คัด Top 5 + content pack + ตาราง draft วันนี้ |
| `npm run workflow:evening` | วิเคราะห์ผลที่กรอก + แนะนำวันถัดไป |
| `npm run workflow:day` | รัน morning แล้วตามด้วย evening (ทดลองครบวัน) |
| `npm run test:unit` | เทสต์ scoring / content / schedule / filming |
| `npm run build` | build production |

## หน้าเว็บ

- `/` ออฟฟิศ Workflow (แผนผังการ์ตูน)
- `/affiliate` แดชบอร์ด Affiliate + แผง Login ตอนไหน/สถานะบัญชี + workflow + Top สินค้า
- `/automation` ศูนย์อัตโนมัติ (Daily Action Digest, Approve Priority Queue, Tomorrow Plan, Winner Playbook, Weekly Review, login status, morning/evening, import CSV/JSON, bulk approve, logs)
- `/products` เพิ่มสินค้า / สร้าง content pack
- `/calendar` ตารางโพสต์วันนี้ + คิว Approve + Approve / ข้าม
- `/results` กรอก views/clicks/orders/ค่าคอม + Winner Playbook + Weekly Review + ดูวิเคราะห์
- `/guide` คู่มือการใช้งาน

### Export

- JSON: `/api/export?format=json`
- CSV สินค้า: `/api/export?format=csv&scope=products`
- CSV ตาราง: `/api/export?format=csv&scope=schedule`
- CSV briefs เช้า/เย็น: `/api/export?format=csv&scope=briefs`
- CSV สรุปสัปดาห์: `/api/export?format=csv&scope=weekly`
- Markdown content packs: `/api/export?format=md&scope=packs`
- Markdown ตารางวันนี้: `/api/export?format=md&scope=today`
- Markdown checklist ที่อนุมัติแล้ว: `/api/export?format=md&scope=approved`
- Markdown แผนทดลอง: `/api/export?format=md&scope=experiments`
- Markdown คิวถ่ายวิดีโอ: `/api/export?format=md&scope=filming`
- Markdown Posting Packs: `/api/export?format=md&scope=posting`
- Markdown Daily Action Digest: `/api/export?format=md&scope=digest`
- Markdown Tomorrow Plan: `/api/export?format=md&scope=tomorrow`
- Markdown Approve Priority Queue: `/api/export?format=md&scope=approve-queue`
- Markdown Winner Playbook: `/api/export?format=md&scope=playbook`
- Markdown Weekly Review: `/api/export?format=md&scope=weekly-review`

## Workflow แนะนำ

**เช้า**

1. `npm run workflow:morning` (หรือกดปุ่มในแดชบอร์ด)
2. เปิด `/calendar` ตรวจ draft
3. Approve ชิ้นที่คุณภาพโอเค หรือกดข้ามถ้าไม่ผ่าน → โพสต์ด้วยมือบน TikTok/Facebook
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
- หลีกเลี่ยงคู่สินค้า+ช่องทางที่เพิ่งใช้ในช่วง cooldown (ค่าเริ่มต้น 3 วัน ปรับได้ 2–7)  
- Morning ข้าม draft ค้างอัตโนมัติ (ค่าเริ่มต้น 5 วัน ไม่แตะ approved/posted)  
- กระจายช่องทางในวันเดียวกัน (ไม่ยัดช่องเดียว)  
- ตรวจ fingerprint caption ไม่ให้ซ้ำในวันเดียวกัน  
- กด “ข้าม (ไม่โพสต์)” ได้ถ้า draft ไม่ผ่าน — สถานะ `skipped` ไม่นับเป็นคิวซ้ำ  
- วันคู่สลับช่องเย็นเป็น Facebook Group (น้ำเสียงแชร์ในกลุ่ม ไม่ขายแข็ง)
- Soft-sanitize คำโฆษณาเกินจริง / เคลมรายได้แน่นอน ก่อนใส่ caption
- คะแนนฤดูกาลอิงปฏิทินไทย (เช่น สงกรานต์, วันแม่/สิงหาคม, 11.11, ปีใหม่) แบบ soft boost
- Morning/Evening แบบ **idempotent** — รันซ้ำวันเดียวกันจะไม่สร้าง brief ซ้ำ (ใช้ `--force` หรือปุ่ม “รันใหม่”)
- Top สินค้ากระจายแพลตฟอร์มแบบอ่อน ๆ (ไม่ให้ Shopee กินโควต้าทั้งหมดเมื่อมี TikTok Shop คะแนนใกล้เคียง)
- Content pack มี **filming checklist** สำหรับวิดีโอ 15–30 วิ
- Export Markdown สำหรับถ่ายวิดีโอ + สรุปผลทดลองรายสัปดาห์ (7 วัน) + CSV ที่ `/results`

## ข้อจำกัด MVP

- ยังไม่มี key API ภายนอก — ใช้ manual เท่านั้น
- การโพสต์จริงทำด้วยมือหลัง Approve
- ตัวเลข ROI มาจากการกรอกของผู้ใช้ ไม่ได้ดึงจากแพลตฟอร์มอัตโนมัติ
