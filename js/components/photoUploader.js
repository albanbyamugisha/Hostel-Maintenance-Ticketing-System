import { icon } from "../icons.js";
import { escapeHtml, formatBytes, uid } from "../utils.js";
import { toast } from "../toast.js";

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> decoding */
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be read. Try a different file."));
    };
    image.src = url;
  });
}

/**
 * Compress a photo in the browser: longest edge 1280px, JPEG at 0.8 quality.
 * Returns a Blob suitable for local browser photo storage.
 */
export async function compressImage(file) {
  const image = await decodeImage(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) throw new Error("This image has no readable dimensions.");

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not process this image.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  image.close?.();

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });
  if (!blob) throw new Error("Your browser could not compress this image.");
  return blob;
}

export class PhotoUploader {
  constructor(container, { max = MAX_PHOTOS, onChange = null, label = "Add photos" } = {}) {
    this.container = container;
    this.max = max;
    this.onChange = onChange;
    this.label = label;
    this.items = [];
    this.processing = false;
    this.disabled = false;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="uploader" data-uploader>
        <label class="uploader__drop">
          <input type="file" accept="image/*" capture="environment" multiple
            data-photo-input aria-describedby="photo-help" />
          ${icon("camera")}
          <strong>${escapeHtml(this.label)}</strong>
          <span>Take a photo or choose from your gallery</span>
          <span>Up to ${this.max} photos · JPEG, PNG or WebP · max ${formatBytes(
            MAX_PHOTO_BYTES
          )} each</span>
        </label>
        <p class="uploader__status" id="photo-help" data-uploader-status role="status">
          Photos are compressed on your device before upload.
        </p>
        <div class="uploader__previews" data-uploader-previews></div>
      </div>
    `;

    this.input = this.container.querySelector("[data-photo-input]");
    this.status = this.container.querySelector("[data-uploader-status]");
    this.previews = this.container.querySelector("[data-uploader-previews]");

    this.input.addEventListener("change", () => {
      const files = [...(this.input.files ?? [])];
      this.input.value = "";
      void this.addFiles(files);
    });

    this.container.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove]");
      if (remove) {
        event.preventDefault();
        this.remove(remove.dataset.remove);
      }
    });

    const drop = this.container.querySelector(".uploader__drop");
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!this.disabled) drop.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("is-dragover");
      if (this.disabled) return;
      const files = [...(event.dataTransfer?.files ?? [])];
      void this.addFiles(files);
    });

    this.renderPreviews();
    this.updateStatus();
  }

  async addFiles(files) {
    if (this.disabled || this.processing) return;

    const remaining = this.max - this.items.length;
    if (remaining <= 0) {
      toast(`You can attach up to ${this.max} photos.`, "warning");
      return;
    }

    const accepted = files.slice(0, remaining);
    if (files.length > remaining) {
      toast(`Only ${remaining} more photo${remaining === 1 ? "" : "s"} can be added.`, "warning");
    }

    this.processing = true;
    this.setStatus("Preparing photos…");
    this.input.disabled = true;

    for (const file of accepted) {
      try {
        if (!file.type.startsWith("image/")) {
          throw new Error(`${file.name} is not an image.`);
        }
        if (file.size > MAX_PHOTO_BYTES) {
          throw new Error(`${file.name} is larger than ${formatBytes(MAX_PHOTO_BYTES)}.`);
        }
        const blob = await compressImage(file);
        this.items.push({
          id: uid(),
          blob,
          url: URL.createObjectURL(blob),
          name: file.name,
        });
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not process that photo.", "error");
      }
    }

    this.processing = false;
    this.input.disabled = this.disabled;
    this.renderPreviews();
    this.updateStatus();
    this.onChange?.(this.items);
  }

  setStatus(message) {
    if (this.status) this.status.textContent = message;
  }

  updateStatus() {
    if (this.processing) return;
    if (!this.items.length) {
      this.setStatus("Photos are compressed on your device before upload.");
      return;
    }
    this.setStatus(
      `${this.items.length} of ${this.max} photos attached. They will be compressed and uploaded when you submit.`
    );
  }

  renderPreviews() {
    if (!this.previews) return;
    this.previews.innerHTML = this.items
      .map(
        (item, index) => `
          <div class="photo-thumb">
            <img src="${escapeHtml(item.url)}" alt="Selected photo ${index + 1}" />
            <button type="button" class="photo-thumb__remove" data-remove="${escapeHtml(
              item.id
            )}" aria-label="Remove photo ${index + 1}" ${this.disabled ? "disabled" : ""}>
              ${icon("x")}
            </button>
          </div>
        `
      )
      .join("");
  }

  remove(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return;
    URL.revokeObjectURL(this.items[index].url);
    this.items.splice(index, 1);
    this.renderPreviews();
    this.updateStatus();
    this.onChange?.(this.items);
  }

  getBlobs() {
    return this.items.map((item) => item.blob);
  }

  getCount() {
    return this.items.length;
  }

  clear() {
    this.items.forEach((item) => URL.revokeObjectURL(item.url));
    this.items = [];
    this.renderPreviews();
    this.updateStatus();
    this.onChange?.(this.items);
  }

  setDisabled(disabled) {
    this.disabled = disabled;
    if (this.input) this.input.disabled = disabled;
    this.previews?.querySelectorAll("[data-remove]").forEach((button) => {
      button.disabled = disabled;
    });
  }

  destroy() {
    this.items.forEach((item) => URL.revokeObjectURL(item.url));
    this.items = [];
  }
}
