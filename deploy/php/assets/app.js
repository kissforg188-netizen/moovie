async function api(action, payload) {
  const opts = payload
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    : { method: "POST" };
  const res = await fetch(`api.php?action=${encodeURIComponent(action)}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "request failed");
  return data;
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return alert(msg);
  el.hidden = false;
  el.textContent = msg;
  setTimeout(() => { el.hidden = true; }, 2800);
}

document.querySelectorAll("[data-action]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const data = await api(btn.dataset.action);
      toast(data.brief?.summary || "สำเร็จ");
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      toast(e.message);
      btn.disabled = false;
    }
  });
});

const form = document.getElementById("productForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    try {
      await api("product_create", body);
      toast("บันทึกสินค้าแล้ว");
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      toast(err.message);
    }
  });
}

document.querySelectorAll("[data-generate]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const data = await api("content_generate", { productId: btn.dataset.generate });
      const out = document.getElementById(`pack-${btn.dataset.generate}`);
      if (out) {
        out.hidden = false;
        const p = data.pack;
        out.textContent = [
          p.videoPriorityNote,
          "",
          "Hooks:\n" + p.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n"),
          "",
          "CTA:\n" + p.ctas.map((c, i) => `${i + 1}. ${c}`).join("\n"),
          "",
          "TikTok:\n" + (p.tiktokScript.scenes || []).map((s) => `[${s.time}] ${s.line}`).join("\n"),
          "",
          "Facebook Page:\n" + p.facebookCaption,
          "",
          "Facebook Group:\n" + p.facebookGroupCaption,
          "",
          "Reels:\n" + p.reelsCaption,
        ].join("\n");
      }
      toast("สร้าง Content Pack แล้ว");
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
    }
  });
});

document.querySelectorAll("[data-approve]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    await api("approve", { id: btn.dataset.approve });
    toast("อนุมัติแล้ว — โพสต์ด้วยมือ");
    setTimeout(() => location.reload(), 500);
  });
});

document.querySelectorAll("[data-posting-pack]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const res = await fetch(
        `api.php?action=posting_pack&id=${encodeURIComponent(btn.dataset.postingPack)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "โหลดไม่สำเร็จ");
      await navigator.clipboard.writeText(data.pack?.text || "");
      toast(
        data.pack?.readyToCopy
          ? "คัดลอก Posting Pack แล้ว — ไปโพสต์ด้วยมือได้"
          : "คัดลอกพรีวิวแล้ว (ยังต้อง Approve ก่อนโพสต์จริง)",
      );
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
    }
  });
});

const affiliateUrlInput = document.querySelector('#productForm [name="affiliateUrl"]');
const platformSelect = document.querySelector('#productForm [name="platform"]');
if (affiliateUrlInput && platformSelect) {
  affiliateUrlInput.addEventListener("change", () => {
    const url = (affiliateUrlInput.value || "").toLowerCase();
    let detected = null;
    if (/shopee\.|shp\.ee/.test(url)) detected = "shopee";
    else if (/tiktok/.test(url)) detected = "tiktok_shop";
    else if (/facebook|fb\.com|fb\.me|instagram/.test(url)) detected = "facebook";
    if (detected) {
      platformSelect.value = detected;
      toast("ตรวจจับแพลตฟอร์ม: " + detected);
    }
  });
}

document.querySelectorAll("[data-posted]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    await api("mark_posted", { id: btn.dataset.posted });
    toast("บันทึกว่าโพสต์แล้ว");
    setTimeout(() => location.reload(), 500);
  });
});

document.querySelectorAll(".metrics-form").forEach((formEl) => {
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(formEl);
    const body = Object.fromEntries(fd.entries());
    body.id = formEl.dataset.metrics;
    await api("metrics", body);
    toast("บันทึกผลแล้ว");
    setTimeout(() => location.reload(), 500);
  });
});

const importBtn = document.getElementById("importBtn");
if (importBtn) {
  importBtn.addEventListener("click", async () => {
    const format = document.getElementById("importFormat")?.value || "json";
    const payload = document.getElementById("importPayload")?.value || "";
    importBtn.disabled = true;
    try {
      const data = await api("import_products", { format, payload });
      toast(`Import สำเร็จ ${data.imported} รายการ (ข้าม ${data.skipped})`);
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      toast(e.message);
      importBtn.disabled = false;
    }
  });
}

const approveSelectedBtn = document.getElementById("approveSelectedBtn");
if (approveSelectedBtn) {
  approveSelectedBtn.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".draft-check:checked")].map((el) => el.value);
    if (!ids.length) {
      toast("เลือก draft อย่างน้อย 1 ชิ้น");
      return;
    }
    if (!confirm(`Approve ${ids.length} draft?\nระบบจะไม่โพสต์ให้อัตโนมัติ`)) return;
    approveSelectedBtn.disabled = true;
    try {
      const data = await api("approve_selected", { ids });
      toast(data.message || "อนุมัติแล้ว");
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      toast(e.message);
      approveSelectedBtn.disabled = false;
    }
  });
}
