export const byId = (id) => document.getElementById(id);
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
}[char]));

export async function readResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const detail = body.trim().replace(/\s+/g, " ").slice(0, 180);
    throw new Error("Máy chủ trả phản hồi không phải JSON (HTTP " + response.status + "). " + detail);
  }
}
