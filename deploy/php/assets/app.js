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
