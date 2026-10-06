// Mobile menu
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("nav");
toggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
});

// FAQ: keep one answer open at a time, like the original site
document.querySelectorAll(".faq details").forEach((d, _, all) => {
  d.addEventListener("toggle", () => {
    if (d.open) all.forEach((o) => o !== d && (o.open = false));
  });
});

// Gallery lightbox
const box = document.querySelector(".lightbox");
if (box) {
  const img = box.querySelector("img");
  document.querySelectorAll("[data-lightbox]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      img.src = a.href;
      img.alt = a.querySelector("img")?.alt || "";
      box.showModal();
    })
  );
  box.addEventListener("click", () => box.close());
}

// Contact forms: send through Web3Forms when a key is set, otherwise open the visitor's mail app
document.querySelectorAll(".contact-form").forEach((form) => {
  const status = form.querySelector(".form-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (data.get("botcheck")) return;
    if (!data.get("access_key")) {
      const body = ["name", "email", "phone", "usluga", "message"]
        .map((k) => `${k}: ${data.get(k) || ""}`)
        .join("\n");
      location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent(data.get("subject"))}&body=${encodeURIComponent(body)}`;
      return;
    }
    status.className = "form-status";
    status.textContent = "Šaljem…";
    try {
      const res = await fetch(form.action, { method: "POST", body: data, headers: { Accept: "application/json" } });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      form.reset();
      status.classList.add("ok");
      status.textContent = form.dataset.success;
    } catch {
      status.classList.add("err");
      status.textContent = `Slanje nije uspjelo. Pišite nam na ${form.dataset.mailto}.`;
    }
  });
});
