
export interface SlideData {
  id: number;
  headline: string;
  subtext: string; // The short text on the slide (Max 10 words)
  caption: string; // The detailed description/context for the post
  visualDirective: string;
  imageUrl?: string; // Base64 or URL
  videoUrl?: string; // Blob URL for generated video
  isGeneratingImage: boolean;
  isGeneratingVideo?: boolean;
}

export interface GenerationStatus {
  step: 'idle' | 'parsing' | 'generating_images' | 'generating_videos' | 'complete' | 'error';
  message?: string;
  progress?: number; // 0 to 100
}

export type AspectRatio = '1:1' | '3:4' | '4:5' | '4:3' | '9:16' | '16:9';
export type ImageResolution = '1K';
export type TextDensity = 'brief' | 'standard' | 'detailed'; // Applies to Caption detail now

export type VisualStyle = 
  | 'cinematic' 
  | 'minimalist' 
  | 'cyberpunk' 
  | 'watercolor' 
  | 'corporate' 
  | 'noir' 
  | 'anime';

export interface ImageSettings {
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  style: VisualStyle;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
