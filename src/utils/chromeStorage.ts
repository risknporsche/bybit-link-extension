type ChromeStorageArea = chrome.storage.StorageArea;

const getStorageArea = (): ChromeStorageArea | null => {
  if (typeof chrome === 'undefined') return null;
  if (!chrome.storage?.local) return null;
  return chrome.storage.local;
};

const getLastError = (): Error | null => {
  const err = chrome.runtime?.lastError;
  return err ? new Error(err.message) : null;
};

export async function storageGet<T>(key: string): Promise<T | undefined> {
  const area = getStorageArea();
  if (!area) return undefined;

  return new Promise<T | undefined>((resolve, reject) => {
    area.get([key], (result) => {
      const error = getLastError();
      if (error) {
        reject(error);
        return;
      }

      resolve(result[key] as T | undefined);
    });
  });
}

export async function storageGetMany(
  keys: string[],
): Promise<Record<string, unknown>> {
  const area = getStorageArea();
  if (!area) return {};

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    area.get(keys, (result) => {
      const error = getLastError();
      if (error) {
        reject(error);
        return;
      }

      resolve(result as Record<string, unknown>);
    });
  });
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  const area = getStorageArea();
  if (!area) return;

  return new Promise<void>((resolve, reject) => {
    area.set({ [key]: value }, () => {
      const error = getLastError();
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function storageRemove(keys: string | string[]): Promise<void> {
  const area = getStorageArea();
  if (!area) return;

  return new Promise<void>((resolve, reject) => {
    area.remove(keys, () => {
      const error = getLastError();
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

