export function openPreviewByCategoryId(categoryId) {
  if (!categoryId) {
    alert("Category ID missing");
    return;
  }

  const envKey = `REACT_APP_PREVIEW_${categoryId}`;
  const baseUrl = process.env[envKey];

  if (!baseUrl) {
    alert(`No preview project for category ${categoryId}`);
    return;
  }

  window.open(`${baseUrl}/preview/${categoryId}`, "_blank");
}
