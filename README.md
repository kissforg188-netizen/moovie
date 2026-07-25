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

## เริ่มใช้งาน

```bash
npm install
npm run seed
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

### คำสั่งที่มีประโยชน์

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run seed` | ใส่สินค้าตัวอย่าง 6 รายการ |
| `npm run workflow:morning` | คัด Top 5 + content pack + ตาราง draft วันนี้ |
| `npm run workflow:evening` | วิเคราะห์ผลที่กรอก + แนะนำวันถัดไป |
| `npm run test:unit` | เทสต์ scoring / content / schedule |
| `npm run build` | 빌ด์ production |

## หน้าเว็บ

- `/` แดชบอร์ด + รัน workflow + Top สินค้า
- `/products` เพิ่มสินค้า / สร้าง content pack
- `/calendar` ตารางโพสต์วันนี้ + Approve
- `/results` กรอก views/clicks/orders/ค่าคอม + ดูวิเคราะห์

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

## ข้อจำกัด MVP

- ยังไม่มี key API ภายนอก — ใช้ manual เท่านั้น
- การโพสต์จริงทำด้วยมือหลัง Approve
- ตัวเลข ROI มาจากการกรอกของผู้ใช้ ไม่ได้ดึงจากแพลตฟอร์มอัตโนมัติ
