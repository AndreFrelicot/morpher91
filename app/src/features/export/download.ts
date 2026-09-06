export type ActiveDownload = {
  url: string;
  dispose: () => void;
};

/** Starts a browser download and revokes its object URL on a later task. */
export function startBlobDownload(
  blob: Blob,
  filename: string,
  revokeDelayMs = 1_000,
): ActiveDownload {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  let revoked = false;
  window.setTimeout(() => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
  }, revokeDelayMs);
  return {
    url,
    dispose: () => {
      anchor.remove();
    },
  };
}
