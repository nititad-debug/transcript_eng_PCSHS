# TranscriptEN

อัปโหลด ปพ.1 (ภาษาไทย) แล้วสร้าง **Transcript of Record** หรือ **Certificate Letter** ภาษาอังกฤษตามแบบของโรงเรียน
พร้อม **คลังรหัสวิชา/ชื่อวิชาอังกฤษ** ที่ทุกคนในโรงเรียนใช้ร่วมกัน

## โครงสร้าง
- `public/index.html` – หน้าเว็บ (ตัวแอป)
- `public/shim.js` – เชื่อมหน้าเว็บกับเซิร์ฟเวอร์ (`/api/*`)
- `server.js` – เซิร์ฟเวอร์ Node (ไม่ต้องติดตั้ง package เพิ่ม): เก็บคีย์ Anthropic ไว้ฝั่งเซิร์ฟเวอร์, อ่าน ปพ.1, เก็บคลังรายวิชากลาง
- `seed-catalog.json` – รายวิชาตั้งต้น 83 วิชา (ใส่ให้อัตโนมัติเมื่อเริ่มระบบครั้งแรก)

## รันบนเครื่อง
```bash
# เลือกอย่างใดอย่างหนึ่ง
export ANTHROPIC_API_KEY=sk-ant-...        # ใช้ Claude
# export LLM_PROVIDER=gemini GEMINI_API_KEY=...   # หรือใช้ Gemini
export APP_PASSWORD=รหัสที่ใช้เข้าระบบ
node server.js        # ต้องใช้ Node 18 ขึ้นไป
```
เปิด http://localhost:3000

## ตัวแปรสภาพแวดล้อม
| ชื่อ | ความหมาย |
|---|---|
| `LLM_PROVIDER` | `anthropic` (Claude) หรือ `gemini` ถ้าไม่ตั้ง จะเลือกตามคีย์ที่มี (มี Anthropic ก่อน) |
| `ANTHROPIC_API_KEY` | คีย์ Claude (ใช้เมื่อ provider = anthropic) |
| `GEMINI_API_KEY` | คีย์ Gemini จาก Google AI Studio (ใช้เมื่อ provider = gemini) |
| `GEMINI_MODEL` | ชื่อโมเดล Gemini (ค่าเริ่มต้น `gemini-2.5-flash` ควรตรวจชื่อรุ่นปัจจุบันที่เอกสาร Google AI) |
| `APP_PASSWORD` | รหัสเข้าใช้งาน ถ้าไม่ตั้ง ใครก็เปิดและเรียกใช้ API ได้ **ควรตั้งเสมอเมื่อเปิดออกอินเทอร์เน็ต** |
| `ANTHROPIC_MODEL` | โมเดลที่ใช้ (ค่าเริ่มต้น `claude-sonnet-5-5`) |
| `EXTRACT_PER_HOUR` | จำกัดจำนวนครั้งอ่านเอกสารต่อ IP ต่อชั่วโมง (ค่าเริ่มต้น 30) |
| `DATA_DIR` | โฟลเดอร์เก็บคลังรายวิชา (`catalog.json`) ค่าเริ่มต้น `./data` |
| `PORT` | พอร์ต (ค่าเริ่มต้น 3000) |

## นำขึ้นออนไลน์ (ตัวอย่าง Render / Railway / Fly.io)
1. push โค้ดนี้ขึ้น GitHub (ดูด้านล่าง)
2. สร้าง Web Service จาก repo นี้ (เลือก Docker หรือ Node: Start command `node server.js`)
3. ตั้งค่า `APP_PASSWORD` และคีย์ของผู้ให้บริการที่เลือก (`ANTHROPIC_API_KEY` หรือ `GEMINI_API_KEY` + `LLM_PROVIDER=gemini`)
4. **ต่อ Persistent Disk/Volume** แล้วตั้ง `DATA_DIR` ไปที่โฟลเดอร์นั้น (Docker image ใช้ `/data`)
   ถ้าไม่ต่อ ดิสก์จะถูกล้างทุกครั้งที่ deploy และคลังจะกลับเป็นค่าตั้งต้น
5. แจกลิงก์และรหัสเข้าใช้งานให้ครู

## Push ขึ้น GitHub
```bash
git init -b main && git add . && git commit -m "TranscriptEN"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
(`.env` และ `data/` ถูกใส่ไว้ใน `.gitignore` แล้ว อย่า commit คีย์ API)

## หมายเหตุ
- คลังกลางซิงก์ทุก ~6 วินาที ทุกคนที่มีรหัสเข้าใช้งานเพิ่ม/แก้/ลบรายวิชาได้
- ไฟล์ ปพ.1 ถูกส่งไปยังผู้ให้บริการ AI ที่เลือก (Anthropic หรือ Google) เพื่ออ่านข้อมูล และไม่ถูกบันทึกบนเซิร์ฟเวอร์นี้
  ข้อมูลนักเรียนเป็นข้อมูลส่วนบุคคล ควรตรวจสอบนโยบายของโรงเรียนก่อนใช้งานจริง
- ตรวจชื่อ เกรด และรหัสวิชาในเอกสารที่สร้างทุกครั้งก่อนใช้จริง

- ถ้าใช้ Gemini ควรตรวจเงื่อนไขการใช้ข้อมูลของแพ็กเกจที่ใช้ (แพ็กเกจฟรีกับแบบชำระเงินอาจต่างกัน) ก่อนส่งข้อมูลนักเรียน และทดสอบความแม่นยำการอ่านภาษาไทยกับเอกสารจริงก่อนใช้งาน
