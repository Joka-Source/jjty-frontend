const database = new Promise((resolve, reject) => {
  const req = indexedDB.open("jett-notebooks", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("workspace");
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
export async function loadWorkspace() {
  const db = await database;
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("workspace")
      .objectStore("workspace")
      .get("current");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveWorkspace(data) {
  const owned = structuredClone(data),
    db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").put(owned, "current");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("Storage write aborted"));
  });
}
