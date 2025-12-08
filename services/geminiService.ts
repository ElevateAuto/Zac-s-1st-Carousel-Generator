
import { GoogleGenAI, Type } from "@google/genai";
import { SlideData, ImageSettings, VisualStyle } from "../types";

// NOTE: We do not initialize 'ai' globally anymore.
// We initialize it inside each function to ensure it picks up the latest API_KEY
// selected by the user via window.aistudio.openSelectKey().

/**
 * Utility to retry async operations with exponential backoff.
 * Helps prevent failures due to rate limits (429) or transient server errors (503).
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (retries <= 0) throw error;
    
    // Check for specific error codes that are worth retrying
    // 429: Too Many Requests, 503: Service Unavailable, 500: Internal Server Error
    const status = error?.status || error?.response?.status;
    const isRetryable = status === 429 || status === 503 || status === 500 || !status; // !status usually implies network/timeout

    if (isRetryable) {
      console.warn(`Operation failed, retrying in ${delay}ms... (${retries} attempts left). Error:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    }
    
    throw error;
  }
}

/**
 * Parses raw text input into structured slide data.
 */
export const parseSlidesFromText = async (text: string): Promise<Omit<SlideData, 'id' | 'isGeneratingImage'>[]> => {
  return retryWithBackoff(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Extract ALL slide information from the following text into a structured JSON format. 
        The text describes a series of slides for a carousel. 
        There may be up to 20 slides. It is critical that you extract EVERY single slide found in the text into the array.
        
        Each slide typically has a 'Headline', 'Subtext' (or content/CTA), and a 'Visual Directive' (description of the image).
        
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
                subtext: { type: Type.STRING, description: "The supporting text, body copy, or call to action" },
                visualDirective: { type: Type.STRING, description: "The description of the visual or image for the slide" },
              },
              required: ["headline", "subtext", "visualDirective"],
            },
          },
        },
      });

      if (!response.text) {
        throw new Error("No response text from model");
      }

      const parsedData = JSON.parse(response.text);
      return parsedData;
    } catch (error) {
      console.error("Error parsing slides:", error);
      throw new Error("Failed to parse slide content. Please ensure the format is clear.");
    }
  });
};

/**
 * Generates a full carousel script from a simple topic.
 */
export const generateScriptFromTopic = async (topic: string): Promise<string> => {
  return retryWithBackoff(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Write a compelling 7-10 slide social media carousel script about: "${topic}".
        
        Format it exactly like this for each slide:
        SLIDE X
        Headline: [Punchy Headline]
        Subtext: [Engaging body text, keep it concise]
        Visual Directive: [Detailed description of the image background, metaphor, or scene]
        
        Make sure the first slide is a strong hook, and the last slide is a clear Call to Action.
        Make the Visual Directives creative and metaphorical, not just "text on screen".`,
      });
      return response.text || "";
    } catch (error) {
      console.error("Error generating script:", error);
      throw error;
    }
  });
};

/**
 * Refines the input text using Gemini to make it more engaging and suitable for social media carousels.
 */
export const refineText = async (text: string): Promise<string> => {
  return retryWithBackoff(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `You are an expert social media strategist. 
        Analyze the following draft script for a carousel and improve it.
        
        1. Make headlines punchier and more "hooky".
        2. Ensure subtext is concise and impactful.
        3. Improve visual directives to be more descriptive and cinematic.
        4. Maintain the original meaning and structure (Slide 1, Slide 2, etc.).
        
        Return ONLY the rewritten text, formatted clearly so it can be parsed later.
        
        Draft Script:
        ${text}`,
      });
      return response.text || text;
    } catch (error) {
      console.error("Error refining text:", error);
      return text;
    }
  });
};

/**
 * Generates an image for a single slide based on its visual directive and settings.
 * Uses gemini-3-pro-image-preview with 2K resolution to ensure >1080p quality.
 */
export const generateSlideImage = async (visualDirective: string, settings: ImageSettings): Promise<string> => {
  return retryWithBackoff(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Use Pro model for high resolution support (2K)
      const model = 'gemini-3-pro-image-preview';

      const config: any = {};
      
      if (!config.imageConfig) config.imageConfig = {};
      
      // Handle Aspect Ratios
      let targetRatio: string = settings.aspectRatio;
      if (settings.aspectRatio === '4:5') {
        targetRatio = '3:4'; 
      }
      
      config.imageConfig.aspectRatio = targetRatio;
      config.imageConfig.imageSize = '2K';

      // Style Modifiers
      const stylePrompts: Record<VisualStyle, string> = {
        'cinematic': 'Cinematic lighting, photorealistic, depth of field, high contrast, movie scene aesthetic.',
        'minimalist': 'Minimalist style, clean lines, plenty of negative space, soft pastel colors, flat lay or simple composition, high key lighting.',
        'cyberpunk': 'Cyberpunk style, neon lights, dark background, futuristic, vibrant magenta and cyan tones, digital art.',
        'watercolor': 'Watercolor painting style, artistic, soft edges, paper texture, dreamy, pastel colors.',
        'corporate': 'Corporate 3D Memphis style, clean, professional, isometric, soft clay 3D render, solid background.',
        'noir': 'Film noir style, black and white photography, dramatic shadows, high contrast, silhouette, vintage.',
        'anime': 'Anime art style, Studio Ghibli inspired, vibrant colors, detailed background, cell shaded.'
      };

      const stylePrompt = stylePrompts[settings.style] || stylePrompts['cinematic'];
      const finalPrompt = `${stylePrompt} ${visualDirective}`;

      console.log(`Generating with ${model}, Ratio: ${targetRatio}, Style: ${settings.style}`);

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { text: finalPrompt }
          ]
        },
        config: config
      });

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
             return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          }
        }
      }

      throw new Error("No image data found in response");
    } catch (error) {
      // Re-throw to trigger retry
      console.error("Error inside generateSlideImage:", error);
      throw error;
    }
  });
};

/**
 * Edits an existing image using a text prompt.
 * Uses gemini-3-pro-image-preview for high resolution editing.
 */
export const editSlideImage = async (originalImageBase64: string, editPrompt: string, aspectRatio: string): Promise<string> => {
  return retryWithBackoff(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = originalImageBase64.split(',')[1] || originalImageBase64;
      
      let targetRatio: string = aspectRatio;
      if (aspectRatio === '4:5') {
        targetRatio = '3:4'; 
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png', 
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
            imageSize: '2K' 
          }
        }
      });

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
             return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          }
        }
      }
      
      throw new Error("No image data found in edit response");
    } catch (error) {
      console.error("Error editing image:", error);
      throw error;
    }
  });
}

/**
 * Generates a video for a slide using Veo.
 */
export const generateSlideVideo = async (prompt: string, aspectRatio: string): Promise<string> => {
  return retryWithBackoff(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Veo only supports 16:9 or 9:16
      // Map App ratios to Veo ratios
      let videoRatio = '16:9';
      if (['9:16', '3:4', '4:5'].includes(aspectRatio)) {
        videoRatio = '9:16';
      }

      console.log(`Generating video with veo-3.1-fast-generate-preview, Ratio: ${videoRatio}`);

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '1080p',
          aspectRatio: videoRatio
        }
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      
      if (!downloadLink) {
        throw new Error("No video URI in response");
      }

      // Fetch the video content using the API key
      const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error("Error generating video:", error);
      throw error;
    }
  }, 1, 1000); // Fewer retries for video as it is expensive/long
};
