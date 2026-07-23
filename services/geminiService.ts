import { SlideData, ImageSettings, VisualStyle, TextDensity } from "../types";

/**
 * Utility helper to handle HTTP errors consistently from API responses
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `Server error: ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // ignore JSON parse error
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

/**
 * Parses raw text input into structured slide data via backend Gemini 3.6 Flash.
 */
export const parseSlidesFromText = async (text: string): Promise<Omit<SlideData, "id" | "isGeneratingImage">[]> => {
  const res = await fetch("/api/parse-slides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await handleResponse<{ slides: Omit<SlideData, "id" | "isGeneratingImage">[] }>(res);
  return data.slides;
};

/**
 * Generates a full carousel script from a simple topic via backend Gemini 3.6 Flash.
 */
export const generateScriptFromTopic = async (topic: string, captionDensity: TextDensity): Promise<string> => {
  const res = await fetch("/api/generate-script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, captionDensity }),
  });
  const data = await handleResponse<{ script: string }>(res);
  return data.script;
};

/**
 * Refines the input text using Gemini 3.6 Flash on the server.
 */
export const refineText = async (text: string, captionDensity: TextDensity): Promise<string> => {
  const res = await fetch("/api/refine-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, captionDensity }),
  });
  const data = await handleResponse<{ text: string }>(res);
  return data.text;
};

/**
 * Generates an image for a slide using Gemini 3.1 Flash Image on the server.
 */
export const generateSlideImage = async (visualDirective: string, settings: ImageSettings): Promise<string> => {
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visualDirective, settings }),
  });
  const data = await handleResponse<{ imageUrl: string }>(res);
  return data.imageUrl;
};

/**
 * Edits an existing image using Gemini 3.1 Flash Image on the server.
 */
export const editSlideImage = async (originalImageBase64: string, editPrompt: string, aspectRatio: string): Promise<string> => {
  const res = await fetch("/api/edit-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originalImageBase64, editPrompt, aspectRatio }),
  });
  const data = await handleResponse<{ imageUrl: string }>(res);
  return data.imageUrl;
};

/**
 * Generates a video for a slide using Veo 3.1 via server 3-step operation pattern.
 */
export const generateSlideVideo = async (prompt: string, aspectRatio: string, style: VisualStyle): Promise<string> => {
  // 1. Start operation
  const startRes = await fetch("/api/generate-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, aspectRatio, style }),
  });
  const { operationName } = await handleResponse<{ operationName: string }>(startRes);

  // 2. Poll until done
  let isDone = false;
  while (!isDone) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const statusRes = await fetch("/api/video-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationName }),
    });
    const statusData = await handleResponse<{ done: boolean }>(statusRes);
    isDone = statusData.done;
  }

  // 3. Download generated MP4 blob from server
  const downloadRes = await fetch("/api/video-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationName }),
  });

  if (!downloadRes.ok) {
    throw new Error(`Video download failed: ${downloadRes.statusText}`);
  }

  const blob = await downloadRes.blob();
  return URL.createObjectURL(blob);
};
