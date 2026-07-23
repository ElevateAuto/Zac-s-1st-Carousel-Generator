import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, GenerateVideosOperation } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Helper to ensure Gemini client is available
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // API Routes
  
  // 1. Parse slides from text using gemini-3.6-flash
  app.post("/api/parse-slides", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Extract ALL slide information from the following text into a structured JSON format. 
The text describes a series of slides for a carousel. 
There may be up to 20 slides. It is critical that you extract EVERY single slide found in the text into the array.

Each slide typically has:
- 'headline' (Title)
- 'subtext' (Short text ON the slide)
- 'caption' (Detailed description/context provided for the post)
- 'visualDirective' (Image description)

If 'caption' is missing in the text, imply it from the context or leave it empty string.

Input Text:
${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                headline: { type: Type.STRING, description: "The main headline of the slide" },
                subtext: { type: Type.STRING, description: "The SHORT text on the slide itself" },
                caption: { type: Type.STRING, description: "The detailed explanation or context for the caption/post" },
                visualDirective: { type: Type.STRING, description: "The description of the visual or image for the slide" },
              },
              required: ["headline", "subtext", "visualDirective"],
            },
          },
        },
      });

      if (!response.text) {
        return res.status(500).json({ error: "No response text received from model" });
      }

      const parsedData = JSON.parse(response.text);
      const slides = parsedData.map((s: any) => ({
        ...s,
        caption: s.caption || "",
      }));

      res.json({ slides });
    } catch (error: any) {
      console.error("Error in /api/parse-slides:", error);
      res.status(500).json({ error: error.message || "Failed to parse slides" });
    }
  });

  // 2. Generate script from topic using gemini-3.6-flash
  app.post("/api/generate-script", async (req, res) => {
    try {
      const { topic, captionDensity } = req.body;
      if (!topic) {
        return res.status(400).json({ error: "Topic is required" });
      }

      const ai = getGeminiClient();

      const captionConstraints: Record<string, string> = {
        brief: "Caption: A brief, punchy sentence explaining the concept.",
        standard: "Caption: A standard paragraph (2-3 sentences) providing good context.",
        detailed: "Caption: A detailed, value-packed explanation (3-5 sentences) that educates the reader.",
      };

      const captionInstruction = captionConstraints[captionDensity] || captionConstraints.standard;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `Write a compelling 7-10 slide social media carousel script about: "${topic}".

STRUCTURE REQUIREMENTS:
1. HEADLINE: Punchy, hooky title (Max 5-6 words).
2. SUBTEXT (ON SLIDE): EXTREMELY SHORT. STRICTLY MAX 10 WORDS. This is for the visual slide design.
3. CAPTION (DESCRIPTION): ${captionInstruction} This is for the post text.
4. VISUAL DIRECTIVE: Creative, cinematic image description.

Format it exactly like this for each slide:
SLIDE X
Headline: [Headline]
Subtext: [Short sentence < 10 words]
Caption: [Detailed context]
Visual Directive: [Image prompt]

Make sure the first slide is a strong hook, and the last slide is a clear Call to Action.`,
      });

      res.json({ script: response.text || "" });
    } catch (error: any) {
      console.error("Error in /api/generate-script:", error);
      res.status(500).json({ error: error.message || "Failed to generate script" });
    }
  });

  // 3. Refine script text using gemini-3.6-flash
  app.post("/api/refine-text", async (req, res) => {
    try {
      const { text, captionDensity } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const ai = getGeminiClient();

      const captionConstraints: Record<string, string> = {
        brief: "Rewrite CAPTION to be brief (1 sentence).",
        standard: "Rewrite CAPTION to be standard (2-3 sentences).",
        detailed: "Rewrite CAPTION to be detailed and educational (3-5 sentences).",
      };
      const captionInstruction = captionConstraints[captionDensity] || captionConstraints.standard;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `You are an expert social media strategist. 
Analyze the following draft script for a carousel and improve it.

RULES:
1. HEADLINES: Make them punchier.
2. SUBTEXT (ON SLIDE): REWRITE TO BE UNDER 10 WORDS. STRICT LIMIT.
3. CAPTION: ${captionInstruction} Ensure it adds value beyond the slide text.
4. VISUALS: Make them more descriptive/cinematic.
5. Structure: Keep "SLIDE X", "Headline:", "Subtext:", "Caption:", "Visual Directive:" format.

Draft Script:
${text}`,
      });

      res.json({ text: response.text || text });
    } catch (error: any) {
      console.error("Error in /api/refine-text:", error);
      res.status(500).json({ error: error.message || "Failed to refine text" });
    }
  });

  // 4. Generate image using gemini-3.1-flash-image
  app.post("/api/generate-image", async (req, res) => {
    try {
      const { visualDirective, settings } = req.body;
      if (!visualDirective) {
        return res.status(400).json({ error: "Visual directive is required" });
      }

      const ai = getGeminiClient();
      const model = "gemini-3.1-flash-image";

      let targetRatio = settings?.aspectRatio || "1:1";
      if (targetRatio === "4:5") {
        targetRatio = "3:4";
      }

      const stylePrompts: Record<string, string> = {
        cinematic: "Cinematic lighting, photorealistic, depth of field, high contrast, movie scene aesthetic.",
        minimalist: "Minimalist style, clean lines, plenty of negative space, soft pastel colors, flat lay or simple composition, high key lighting.",
        cyberpunk: "Cyberpunk style, neon lights, dark background, futuristic, vibrant magenta and cyan tones, digital art.",
        watercolor: "Watercolor painting style, artistic, soft edges, paper texture, dreamy, pastel colors.",
        corporate: "Corporate 3D Memphis style, clean, professional, isometric, soft clay 3D render, solid background.",
        noir: "Film noir style, black and white photography, dramatic shadows, high contrast, silhouette, vintage.",
        anime: "Anime art style, Studio Ghibli inspired, vibrant colors, detailed background, cell shaded.",
      };

      const stylePrompt = stylePrompts[settings?.style] || stylePrompts.cinematic;
      const finalPrompt = `${stylePrompt} ${visualDirective}`;

      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [{ text: finalPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: targetRatio,
            imageSize: "2K",
          },
        },
      });

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
            return res.json({ imageUrl });
          }
        }
      }

      throw new Error("No image data found in response from model");
    } catch (error: any) {
      console.error("Error in /api/generate-image:", error);
      res.status(500).json({ error: error.message || "Failed to generate image" });
    }
  });

  // 5. Edit image using gemini-3.1-flash-image
  app.post("/api/edit-image", async (req, res) => {
    try {
      const { originalImageBase64, editPrompt, aspectRatio } = req.body;
      if (!originalImageBase64 || !editPrompt) {
        return res.status(400).json({ error: "Original image and edit prompt are required" });
      }

      const ai = getGeminiClient();
      const base64Data = originalImageBase64.split(",")[1] || originalImageBase64;

      let targetRatio = aspectRatio || "1:1";
      if (targetRatio === "4:5") {
        targetRatio = "3:4";
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/png",
              },
            },
            {
              text: editPrompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: targetRatio,
            imageSize: "2K",
          },
        },
      });

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
            return res.json({ imageUrl });
          }
        }
      }

      throw new Error("No image data found in response");
    } catch (error: any) {
      console.error("Error in /api/edit-image:", error);
      res.status(500).json({ error: error.message || "Failed to edit image" });
    }
  });

  // 6. Veo 3.1 Video Endpoints (Start, Status, Download)
  app.post("/api/generate-video", async (req, res) => {
    try {
      const { prompt, aspectRatio, style } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const ai = getGeminiClient();

      let videoRatio = "16:9";
      if (["9:16", "3:4", "4:5"].includes(aspectRatio)) {
        videoRatio = "9:16";
      }

      const stylePrompts: Record<string, string> = {
        cinematic: "Cinematic shot, high production value, steady cam movement.",
        minimalist: "Clean, minimal, soft lighting, slow subtle movement.",
        cyberpunk: "Cyberpunk city, neon lights, futuristic, dynamic camera.",
        watercolor: "Watercolor animation, fluid motion, artistic.",
        corporate: "Clean 3D animation, professional, smooth transitions.",
        noir: "Black and white film noir, shadows, dramatic lighting, mystery.",
        anime: "Anime style animation, high quality, vibrant.",
      };

      const stylePrefix = stylePrompts[style] || "Cinematic shot";
      const finalPrompt = `${stylePrefix} ${prompt}`;

      const operation = await ai.models.generateVideos({
        model: "veo-3.1-lite-generate-preview",
        prompt: finalPrompt,
        config: {
          numberOfVideos: 1,
          resolution: "1080p",
          aspectRatio: videoRatio,
        },
      });

      res.json({ operationName: operation.name });
    } catch (error: any) {
      console.error("Error in /api/generate-video:", error);
      res.status(500).json({ error: error.message || "Failed to start video generation" });
    }
  });

  app.post("/api/video-status", async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: "operationName is required" });
      }

      const ai = getGeminiClient();
      const op = new GenerateVideosOperation();
      op.name = operationName;

      const updated = await ai.operations.getVideosOperation({ operation: op });
      res.json({ done: updated.done });
    } catch (error: any) {
      console.error("Error in /api/video-status:", error);
      res.status(500).json({ error: error.message || "Failed to check video status" });
    }
  });

  app.post("/api/video-download", async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: "operationName is required" });
      }

      const ai = getGeminiClient();
      const op = new GenerateVideosOperation();
      op.name = operationName;

      const updated = await ai.operations.getVideosOperation({ operation: op });
      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

      if (!uri) {
        return res.status(404).json({ error: "Video URI not available" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      const videoRes = await fetch(`${uri}&key=${apiKey}`);

      if (!videoRes.ok) {
        return res.status(videoRes.status).json({ error: `Failed to download video: ${videoRes.statusText}` });
      }

      const arrayBuffer = await videoRes.arrayBuffer();
      res.setHeader("Content-Type", "video/mp4");
      res.send(Buffer.from(arrayBuffer));
    } catch (error: any) {
      console.error("Error in /api/video-download:", error);
      res.status(500).json({ error: error.message || "Failed to download video" });
    }
  });

  // Vite middleware / Static serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
